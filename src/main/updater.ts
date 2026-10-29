// Автообновление: раз в несколько часов при запуске (и по кнопке в настройках) спрашиваем GitHub, нет ли
// версии новее. Есть — окно показывает «Вышла X — Обновить». Установленный Kadro скачивает установщик,
// сверяет SHA-256 из SHA256SUMS.txt релиза и запускает его с /UPDATE (без лишних вопросов: только полоска
// установки), сам закрывается — установщик заменяет файлы и открывает новый Kadro. Переносная версия (zip)
// сама себя не меняет — открываем страницу релиза.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, net, shell } from 'electron';
import { RELEASES_API, compareVersions, parseRelease, parseSums, type ReleaseInfo, type UpdateState } from '../shared/update';
import { cacheDir, dataDir } from './bins';

interface Saved { autoCheck?: boolean; lastCheck?: number; lastVersion?: string }
const CHECK_EVERY = 6 * 3600 * 1000;
const file = () => path.join(dataDir(), 'update.json');
const read = (): Saved => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')) as Saved; } catch { return {}; } };
const save = (patch: Saved) => { try { fs.writeFileSync(file(), JSON.stringify({ ...read(), ...patch }, null, 2)); } catch { /* не критично */ } };

const testMode = () => !!process.env.KADRO_UPDATE_URL;
const apiUrl = () => process.env.KADRO_UPDATE_URL || RELEASES_API;
/** Установлен через установщик (рядом лежит деинсталлятор) — значит, умеем обновиться сами. */
const installed = () => process.env.KADRO_UPDATE_INSTALLED === '1'
  || (process.platform === 'win32' && fs.existsSync(path.join(path.dirname(process.execPath), 'Uninstall Kadro.exe')));

let state: UpdateState;
let release: ReleaseInfo | null = null;
let abort: AbortController | null = null;
let ready: string | null = null;
let emit: (s: UpdateState) => void = () => undefined;
let log: (...a: unknown[]) => void = () => undefined;

function set(patch: Partial<UpdateState>): UpdateState {
  state = { ...state, ...patch };
  emit(state);
  return state;
}
export const updateState = (): UpdateState => state;

export function initUpdater(opts: { emit: (s: UpdateState) => void; log: (...a: unknown[]) => void }): UpdateState {
  emit = opts.emit;
  log = opts.log;
  const saved = read();
  const current = app.getVersion();
  const updatedFrom = saved.lastVersion && compareVersions(current, saved.lastVersion) > 0 ? saved.lastVersion : undefined;
  if (saved.lastVersion !== current) save({ lastVersion: current });
  state = { phase: 'idle', current, portable: !installed(), autoCheck: saved.autoCheck ?? true, checkedAt: saved.lastCheck, updatedFrom };
  // старые скачанные установщики больше не нужны
  try { for (const f of fs.readdirSync(cacheDir('update'))) fs.rmSync(path.join(cacheDir('update'), f), { force: true }); } catch { /* нет папки */ }
  // сами проверяем только в собранной программе (в разработке и автотестах — если задан адрес)
  const due = Date.now() - (saved.lastCheck ?? 0) > CHECK_EVERY;
  if (state.autoCheck && ((app.isPackaged && due) || testMode())) setTimeout(() => void check(false), testMode() ? 300 : 8000);
  return state;
}

async function getText(url: string, signal?: AbortSignal): Promise<string> {
  if (url.startsWith('file:')) {
    if (!testMode()) throw new Error('Только https');
    return fs.readFileSync(fileURLToPath(url), 'utf8');
  }
  const r = await net.fetch(url, { signal, headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Kadro/${app.getVersion()}` } });
  if (r.status === 403 || r.status === 429) throw new Error('GitHub просит подождать — попробуй через час');
  if (!r.ok) throw new Error(`GitHub ответил ${r.status}`);
  return r.text();
}

/** Есть ли версия новее. manual — нажали «Проверить»: ошибку показываем; при запуске — молча в журнал. */
export async function check(manual: boolean): Promise<UpdateState> {
  if (state.phase === 'downloading') return state;
  set({ phase: 'checking', error: undefined });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const rel = parseRelease(JSON.parse(await getText(apiUrl(), ctl.signal)), testMode());
    if (!rel) throw new Error('Не удалось понять ответ GitHub');
    release = rel;
    const now = Date.now();
    save({ lastCheck: now });
    if (compareVersions(rel.version, state.current) > 0) {
      log('update: available', rel.version);
      return set({ phase: 'available', version: rel.version, notes: rel.notes, page: rel.page, size: rel.setup?.size, checkedAt: now, portable: !installed() || !rel.setup });
    }
    return set({ phase: 'latest', version: rel.version, notes: rel.notes, page: rel.page, checkedAt: now });
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? 'GitHub не ответил — проверь интернет' : e.message) : String(e);
    log('update: check failed', msg);
    return set(manual ? { phase: 'error', error: msg } : { phase: 'idle' });
  } finally { clearTimeout(timer); }
}

/** Скачать установщик новой версии с проверкой SHA-256; переносная версия — открыть страницу релиза. */
export async function download(): Promise<UpdateState> {
  if (!release || state.phase === 'downloading') return state;
  const setup = release.setup;
  if (state.portable || !setup) {
    if (!process.env.KADRO_NO_OPEN) await shell.openExternal(release.page);
    return state;
  }
  abort = new AbortController();
  set({ phase: 'downloading', progress: 0, error: undefined });
  const dir = cacheDir('update');
  const part = path.join(dir, `${setup.name}.part`);
  try {
    const sums = release.sums ? parseSums(await getText(release.sums.url, abort.signal)) : null;
    const expected = sums?.get(setup.name);
    const hash = createHash('sha256');
    const out = fs.createWriteStream(part);
    let got = 0;
    let last = 0;
    const onChunk = (chunk: Uint8Array, total: number) => {
      hash.update(chunk);
      out.write(chunk);
      got += chunk.length;
      const now = Date.now();
      if (now - last > 120) { last = now; set({ progress: total ? Math.min(0.999, got / total) : 0 }); }
    };
    if (setup.url.startsWith('file:')) {
      if (!testMode()) throw new Error('Только https');
      const p = fileURLToPath(setup.url);
      const total = fs.statSync(p).size;
      for await (const chunk of fs.createReadStream(p, { highWaterMark: 64 * 1024 })) {
        if (abort.signal.aborted) throw Object.assign(new Error('cancel'), { name: 'AbortError' });
        onChunk(chunk as Buffer, total);
        if (process.env.KADRO_UPDATE_SLOW) await new Promise((r) => setTimeout(r, 30));
      }
    } else {
      const r = await net.fetch(setup.url, { signal: abort.signal });
      if (!r.ok || !r.body) throw new Error(`GitHub ответил ${r.status}`);
      const total = Number(r.headers.get('content-length')) || setup.size;
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        onChunk(value, total);
      }
    }
    await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
    const sha = hash.digest('hex');
    if (expected ? sha !== expected : got !== setup.size) throw new Error('Файл скачался с ошибкой — попробуй ещё раз');
    const final = path.join(dir, setup.name);
    fs.renameSync(part, final);
    ready = final;
    log('update: downloaded', setup.name, sha);
    return set({ phase: 'ready', progress: 1 });
  } catch (e) {
    fs.rmSync(part, { force: true });
    const cancelled = e instanceof Error && e.name === 'AbortError';
    log('update: download failed', e);
    return set(cancelled ? { phase: 'available', progress: undefined } : { phase: 'error', error: e instanceof Error ? e.message : String(e) });
  } finally { abort = null; }
}

export function cancelDownload(): void { abort?.abort(); }

/** Запустить установщик и закрыть Kadro (черновик сохраняется при закрытии окна). */
export function install(): UpdateState {
  if (!ready || !fs.existsSync(ready)) return set({ phase: 'error', error: 'Установщик не найден — скачай заново' });
  set({ phase: 'installing' });
  log('update: run installer', ready);
  if (process.env.KADRO_UPDATE_NO_RUN) return state;
  const child = spawn(ready, ['/UPDATE'], { detached: true, stdio: 'ignore' });
  // установщик запустился — закрываемся (он ждёт, пока файлы Kadro освободятся); не запустился — говорим
  child.once('spawn', () => { child.unref(); setTimeout(() => app.quit(), 400); });
  child.once('error', (e) => { log('update: installer failed', e); set({ phase: 'error', error: `Установщик не запустился: ${e.message}` }); });
  return state;
}

export function setAutoCheck(on: boolean): UpdateState {
  save({ autoCheck: on });
  return set({ autoCheck: on });
}

/** «Что нового» показали — больше не показываем. */
export function clearUpdated(): UpdateState { return set({ updatedFrom: undefined }); }
