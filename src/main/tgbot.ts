// Свой Telegram-бот человека: Kadro слушает его (getUpdates), принимает видео только от хозяина (привязка кодом из
// настроек), качает их, по кнопке собирает авто-ролик или субтитры (это делает окно Kadro) и присылает готовый ролик
// обратно. Токен хранится зашифрованным средствами системы (safeStorage) и никуда, кроме api.telegram.org, не уходит.
import fs from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import { tx } from '../shared/i18n';
import { isPairing, makeCode, taskKeyboard, tgHelp, TG_DOWNLOAD_MAX, TG_UPLOAD_MAX, videoOf, type TgResult, type TgState, type TgTask, type TgTaskKind } from '../shared/tgbot';

export interface TgConf { token?: string; on?: boolean; owner?: number; ownerName?: string; code?: string; bot?: string }
export interface TgDeps {
  read(): TgConf;
  write(c: TgConf): void;
  emit(s: TgState): void;
  /** собрать ролик в окне Kadro */
  task(t: TgTask): void;
  /** проверка охватов файла → текст для чата */
  reach(file: string): Promise<string>;
  outDir(): string;
  log(...a: unknown[]): void;
}

const API = () => process.env.KADRO_TG_API ?? 'https://api.telegram.org';

class TgError extends Error { constructor(public code: number, msg: string) { super(msg); } }

let deps: TgDeps | null = null;
let token: string | null = null;
let ac: AbortController | null = null;
let status: TgState['status'] = 'off';
let lastError: string | null = null;
let offset = 0;
/** присланные видео, ждущие выбора (по чату) */
let batch: { files: string[]; at: number } = { files: [], at: 0 };
let kbTimer: ReturnType<typeof setTimeout> | null = null;
const pending = new Map<string, number>(); // задача → чат
const strangers = new Map<number, number>(); // чат → когда последний раз отвечали чужому

// ---------- токен ----------
function seal(t: string): string {
  try { if (safeStorage.isEncryptionAvailable()) return `enc:${safeStorage.encryptString(t).toString('base64')}`; } catch { /* нет шифрования */ }
  return `raw:${t}`;
}
function unseal(s: string | undefined): string | null {
  if (!s) return null;
  try {
    if (s.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(s.slice(4), 'base64'));
    if (s.startsWith('raw:')) return s.slice(4);
  } catch { return null; }
  return null;
}

// ---------- состояние ----------
export function tgState(): TgState {
  const c = deps?.read() ?? {};
  return {
    on: !!c.on, hasToken: !!c.token, bot: c.bot ?? null, paired: !!c.owner, ownerName: c.ownerName ?? null,
    code: c.owner ? null : c.code ?? null, status: c.on ? status : lastError ? 'error' : 'off', error: lastError,
  };
}
const emit = () => deps?.emit(tgState());
const save = (patch: Partial<TgConf>) => { if (!deps) return; deps.write({ ...deps.read(), ...patch }); emit(); };

// ---------- Bot API ----------
async function call<T>(method: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  if (!token) throw new TgError(401, 'no token');
  const r = await fetch(`${API()}/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params), signal });
  const j = await r.json().catch(() => ({ ok: false, error_code: r.status, description: r.statusText })) as { ok: boolean; result?: T; error_code?: number; description?: string };
  if (!j.ok) throw new TgError(j.error_code ?? r.status, j.description ?? 'Telegram error');
  return j.result as T;
}
const send = (chat: number, text: string, extra: Record<string, unknown> = {}) => call('sendMessage', { chat_id: chat, text, ...extra }).catch((e) => deps?.log('tg send', String(e)));

async function download(fileId: string, to: string): Promise<void> {
  const f = await call<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId });
  if (!f.file_path) throw new Error(tx('Telegram не отдал файл'));
  const r = await fetch(`${API()}/file/bot${token}/${f.file_path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, Buffer.from(await r.arrayBuffer()));
}

async function sendVideo(chat: number, file: string, caption: string): Promise<void> {
  const fd = new FormData();
  fd.append('chat_id', String(chat));
  fd.append('caption', caption);
  fd.append('supports_streaming', 'true');
  fd.append('video', new Blob([fs.readFileSync(file)], { type: 'video/mp4' }), path.basename(file));
  const r = await fetch(`${API()}/bot${token}/sendVideo`, { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({ ok: false })) as { ok: boolean; description?: string };
  if (!j.ok) throw new Error(j.description ?? `HTTP ${r.status}`);
}

// ---------- сообщения ----------
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);

async function onMessage(m: Record<string, unknown>): Promise<void> {
  const chat = m.chat as { id: number; type: string } | undefined;
  const from = m.from as { first_name?: string; username?: string } | undefined;
  if (!chat || !deps) return;
  const c = deps.read();
  const text = typeof m.text === 'string' ? m.text.trim() : undefined;
  if (!c.owner) {
    if (chat.type === 'private' && isPairing(text, c.code ?? null)) {
      save({ owner: chat.id, ownerName: from?.username ? `@${from.username}` : from?.first_name, code: undefined });
      await send(chat.id, `${tx('Готово! Бот подключён к Kadro на твоём компьютере.')}\n\n${tgHelp()}`);
      return;
    }
    if (text) await send(chat.id, tx('Это бот Kadro. Чтобы подключить его, отправь код из Kadro: Настройки → «Монтаж с телефона».'));
    return;
  }
  if (chat.id !== c.owner) {
    // чужим — один короткий ответ в час, видео не принимаем
    const last = strangers.get(chat.id) ?? 0;
    if (Date.now() - last > 3600_000) { strangers.set(chat.id, Date.now()); await send(chat.id, tx('Это личный бот — он слушается только хозяина.')); }
    return;
  }
  const v = videoOf(m);
  if (!v) {
    if (text) await send(chat.id, tgHelp());
    return;
  }
  if (v.size > TG_DOWNLOAD_MAX) {
    await send(chat.id, tx('Видео больше 20 МБ — Telegram не даёт ботам скачивать такие файлы. Пришли его обычным сообщением (не файлом): Telegram сожмёт его. Или пришли видео покороче.'));
    return;
  }
  const to = path.join(deps.outDir(), 'in', `${stamp()}_${v.name}`);
  try { await download(v.id, to); } catch (e) {
    await send(chat.id, tx('Не получилось скачать видео: {0}', e instanceof Error ? e.message : String(e)));
    return;
  }
  if (Date.now() - batch.at > 15 * 60_000) batch = { files: [], at: 0 };
  batch.files.push(to);
  batch.at = Date.now();
  // несколько видео подряд (альбом) — одни кнопки после последнего
  if (kbTimer) clearTimeout(kbTimer);
  kbTimer = setTimeout(() => {
    kbTimer = null;
    const n = batch.files.length;
    void send(chat.id, n > 1 ? tx('Получил видео: {0}. Что сделать?', n) : tx('Видео получено. Что сделать?'), { reply_markup: taskKeyboard(n) });
  }, Number(process.env.KADRO_TG_DEBOUNCE ?? 1500));
}

async function onCallback(q: Record<string, unknown>): Promise<void> {
  const from = q.from as { id: number } | undefined;
  const msg = q.message as { chat?: { id: number } } | undefined;
  const chat = msg?.chat?.id;
  const c = deps?.read();
  await call('answerCallbackQuery', { callback_query_id: q.id }).catch(() => undefined);
  if (!deps || !c?.owner || from?.id !== c.owner || chat !== c.owner) return;
  const kind = String(q.data) as TgTaskKind;
  const files = batch.files.filter((f) => fs.existsSync(f));
  if (!files.length) { await send(chat, tx('Сначала пришли видео.')); return; }
  if (kind === 'reach') {
    for (const f of files.slice(0, 3)) {
      try { await send(chat, await deps.reach(f)); } catch (e) { await send(chat, tx('Не получилось проверить: {0}', e instanceof Error ? e.message : String(e))); }
    }
    return;
  }
  if (kind !== 'auto' && kind !== 'subs' && kind !== 'shorts') return;
  const id = `tg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const out = path.join(deps.outDir(), `${kind}_${stamp()}.mp4`);
  pending.set(id, chat);
  batch = { files: [], at: 0 };
  // шортсы — из самого длинного (последнего) видео
  deps.task({ id, kind, files: kind === 'shorts' ? files.slice(-1) : files, out });
  await send(chat, kind === 'auto'
    ? tx('Принял! Собираю авто-ролик на компьютере — пришлю сюда, как будет готов.')
    : kind === 'shorts'
      ? tx('Принял! Ищу лучшие моменты и режу шортсы на компьютере — пришлю их сюда.')
      : tx('Принял! Делаю субтитры на компьютере — пришлю сюда, как будет готово.'));
}

/** Окно Kadro доделало задачу: прислать ролик (или объяснить, что не так). */
export async function tgResult(id: string, r: TgResult): Promise<void> {
  const chat = pending.get(id);
  if (chat === undefined) return;
  pending.delete(id);
  const files = r.files?.length ? r.files : r.file ? [r.file] : [];
  if (r.error || !files.length) { await send(chat, tx('Не получилось: {0}', r.error ?? tx('неизвестная ошибка'))); return; }
  for (const [i, file] of files.entries()) {
    const size = fs.statSync(file).size;
    if (size > TG_UPLOAD_MAX) {
      await send(chat, tx('Ролик готов, но он больше 50 МБ — Telegram не даёт ботам отправлять такие файлы. Он на компьютере: {0}', file));
      continue;
    }
    const caption = files.length > 1 ? tx('✅ Шортс {0} из {1}', i + 1, files.length) : r.note ? `✅ ${r.note}` : tx('✅ Готово — смонтировано в Kadro');
    try {
      await call('sendChatAction', { chat_id: chat, action: 'upload_video' }).catch(() => undefined);
      await sendVideo(chat, file, caption);
    } catch (e) {
      await send(chat, tx('Ролик готов, но отправить не получилось ({0}). Он на компьютере: {1}', e instanceof Error ? e.message : String(e), file));
    }
  }
  if (files.length > 1 && r.note) await send(chat, r.note);
}

// ---------- слушать бота ----------
async function loop(signal: AbortSignal): Promise<void> {
  let wait = 3000;
  try {
    const me = await call<{ username?: string }>('getMe', {}, signal);
    save({ bot: me.username });
    status = 'ready'; lastError = null; emit();
  } catch (e) {
    if (signal.aborted) return;
    status = 'error';
    lastError = e instanceof TgError && (e.code === 401 || e.code === 404) ? tx('Токен не подходит — проверь, что скопировал его из @BotFather целиком.') : tx('Нет связи с Telegram: {0}', e instanceof Error ? e.message : String(e));
    emit();
    if (e instanceof TgError && (e.code === 401 || e.code === 404)) return;
    setTimeout(() => { if (!signal.aborted) void loop(signal); }, 30_000);
    return;
  }
  while (!signal.aborted) {
    try {
      const ups = await call<{ update_id: number; message?: Record<string, unknown>; callback_query?: Record<string, unknown> }[]>('getUpdates', {
        offset, timeout: Number(process.env.KADRO_TG_POLL ?? 50), allowed_updates: ['message', 'callback_query'],
      }, signal);
      for (const u of ups) {
        offset = u.update_id + 1;
        try {
          if (u.message) await onMessage(u.message);
          else if (u.callback_query) await onCallback(u.callback_query);
        } catch (e) { deps?.log('tg update', String(e)); }
      }
      if (status !== 'ready') { status = 'ready'; lastError = null; emit(); }
      wait = 3000;
    } catch (e) {
      if (signal.aborted) return;
      if (e instanceof TgError && e.code === 409) {
        status = 'error'; lastError = tx('Этого бота уже слушает другая программа или другой Kadro. Закрой её или создай отдельного бота.'); emit();
        wait = 30_000;
      } else if (e instanceof TgError && (e.code === 401 || e.code === 404)) {
        status = 'error'; lastError = tx('Токен не подходит — проверь, что скопировал его из @BotFather целиком.'); emit();
        return;
      } else {
        status = 'connecting'; lastError = null; emit();
        wait = Math.min(60_000, wait * 2);
      }
      await new Promise((res) => setTimeout(res, wait));
    }
  }
}

function restart(): void {
  ac?.abort();
  ac = null;
  const c = deps?.read() ?? {};
  token = unseal(c.token);
  if (!c.on || !token) { status = 'off'; lastError = null; emit(); return; }
  status = 'connecting'; lastError = null; emit();
  ac = new AbortController();
  void loop(ac.signal);
}

export function tgInit(d: TgDeps): void {
  deps = d;
  restart();
}

/** Новый токен (null — удалить) и/или включить-выключить. */
export function tgSet(patch: { token?: string | null; on?: boolean }): TgState {
  if (!deps) return tgState();
  const c = deps.read();
  const next: TgConf = { ...c };
  if (patch.token !== undefined) {
    const t = patch.token?.trim() ?? '';
    if (t && !/^\d+:[\w-]{20,}$/.test(t)) { lastError = tx('Это не похоже на токен бота. Он выглядит так: 123456789:AAH…'); status = 'error'; emit(); return tgState(); }
    // другой бот — привязка заново
    next.token = t ? seal(t) : undefined;
    next.bot = undefined; next.owner = undefined; next.ownerName = undefined;
    next.code = t ? makeCode() : undefined;
    if (t && patch.on === undefined) next.on = true;
  }
  if (patch.on !== undefined) next.on = patch.on;
  if (next.on && !next.owner && !next.code) next.code = makeCode();
  deps.write(next);
  restart();
  return tgState();
}

/** Отвязать хозяина (новый код привязки). */
export function tgUnpair(): TgState {
  save({ owner: undefined, ownerName: undefined, code: makeCode() });
  return tgState();
}

export function tgStop(): void { ac?.abort(); ac = null; }
