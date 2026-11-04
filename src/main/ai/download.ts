// Надёжное скачивание моделей: сетевой стек Chromium (системный прокси и VPN, сертификаты Windows — антивирусы
// с проверкой HTTPS не ломают скачивание), докачка с места обрыва, повторы, запасные источники, сверка SHA-256.
import { tx } from '../../shared/i18n';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import bz2 from 'unbzip2-stream';
import * as tar from 'tar';

type FetchFn = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal; redirect?: 'follow' }) => Promise<Response>;

let fetchImpl: FetchFn | null = null;
/** net.fetch Electron (в главном и служебном процессе), без Electron — обычный fetch (тесты). */
export function netFetch(): FetchFn {
  if (fetchImpl) return fetchImpl;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const e = require('electron') as { net?: { fetch?: FetchFn } } | string;
    if (typeof e === 'object' && e?.net?.fetch) { console.log('download: net.fetch (Chromium)'); return (fetchImpl = e.net.fetch.bind(e.net)); }
  } catch { /* не Electron */ }
  console.log('download: fetch (Node)');
  return (fetchImpl = globalThis.fetch as unknown as FetchFn);
}
/** Для тестов: подменить сеть. */
export function setFetchForTests(f: FetchFn | null): void { fetchImpl = f; }

export class HttpError extends Error {
  constructor(public status: number) { super(`HTTP ${status}`); }
}

/** Причина сетевой ошибки — по-человечески (коды Chromium net::ERR_* и Node). */
export function netReason(e: unknown): string {
  const raw = `${e instanceof Error ? e.message : String(e)} ${(e as { cause?: { code?: string; message?: string } })?.cause?.code ?? ''} ${(e as { cause?: { message?: string } })?.cause?.message ?? ''}`;
  if (e instanceof HttpError) {
    if (e.status === 404) return tx('файла нет на сервере (HTTP 404)');
    if (e.status === 403 || e.status === 451) return tx('сервер не отдаёт файл (HTTP {0}) — возможно, блокировка; попробуй VPN', e.status);
    if (e.status === 429) return tx('сервер просит подождать (HTTP 429)');
    return tx('ошибка сервера (HTTP {0})', e.status);
  }
  if (/CERT|SSL|certificate|UNABLE_TO_VERIFY|SELF_SIGNED/i.test(raw)) return tx('не прошла проверка сертификата — антивирус или прокси подменяет HTTPS');
  if (/PROXY|TUNNEL/i.test(raw)) return tx('не отвечает прокси — проверь настройки прокси или VPN');
  if (/NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN|INTERNET_DISCONNECTED|NETWORK_CHANGED|ADDRESS_UNREACHABLE/i.test(raw)) return tx('нет интернета или не открывается адрес сервера');
  if (/RESET|ECONNRESET|CONNECTION_CLOSED|EPIPE|CONNECTION_ABORTED|terminated|other side closed/i.test(raw)) return tx('соединение обрывается — возможно, провайдер или VPN');
  if (/TIMED_OUT|ETIMEDOUT|stall|медленно/i.test(raw)) return tx('сервер не отвечает или скачивается слишком медленно');
  if (/REFUSED|ECONNREFUSED|BLOCKED/i.test(raw)) return tx('подключение отклонено — возможно, брандмауэр или блокировка');
  if (/ENOSPC/i.test(raw)) return tx('на диске не хватает места');
  return raw.trim().slice(0, 160) || tx('неизвестная ошибка');
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((r) => { const t = setTimeout(r, ms); signal?.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });

/**
 * Скачать url в dest. Незаконченное лежит в dest.part и докачивается (Range), при обрыве — до 6 попыток.
 * Если данных нет 45 с — соединение рвём и докачиваем заново.
 */
export async function fetchToFile(url: string, dest: string, opts: { size?: number; onBytes?: (got: number, total: number) => void; signal?: AbortSignal; stallMs?: number; tries?: number } = {}): Promise<void> {
  const part = `${dest}.part`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const f = netFetch();
  let lastErr: unknown;
  const tries = opts.tries ?? 6;
  for (let attempt = 0; attempt < tries; attempt++) {
    if (opts.signal?.aborted) throw new Error(tx('Отменено'));
    const have = fs.existsSync(part) ? fs.statSync(part).size : 0;
    if (opts.size && have === opts.size) { fs.renameSync(part, dest); return; }
    if (opts.size && have > opts.size) fs.rmSync(part, { force: true });
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    let stall: ReturnType<typeof setTimeout> | undefined;
    const kick = () => { clearTimeout(stall); stall = setTimeout(() => ctl.abort(new Error('stall')), opts.stallMs ?? 45000); };
    let out: fs.WriteStream | null = null;
    try {
      const start = fs.existsSync(part) ? fs.statSync(part).size : 0;
      kick();
      const res = await f(url, { signal: ctl.signal, redirect: 'follow', headers: start ? { Range: `bytes=${start}-` } : {} });
      if (res.status === 416 && start && (!opts.size || start >= opts.size)) { fs.renameSync(part, dest); return; }
      if (!res.ok || !res.body) throw new HttpError(res.status);
      const append = res.status === 206 && start > 0;
      const len = Number(res.headers.get('content-length') || 0);
      const total = (append ? start : 0) + (len || (opts.size ? opts.size - (append ? start : 0) : 0));
      let got = append ? start : 0;
      out = fs.createWriteStream(part, { flags: append ? 'a' : 'w' });
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        kick();
        got += value.length;
        if (!out.write(value)) await new Promise<void>((r) => out!.once('drain', () => r()));
        opts.onBytes?.(got, total || opts.size || got);
      }
      await new Promise<void>((r, j) => out!.end((err?: Error | null) => (err ? j(err) : r())));
      out = null;
      if (opts.size && got !== opts.size) throw new Error(tx('скачалось {0} из {1} байт', got, opts.size));
      fs.renameSync(part, dest);
      return;
    } catch (e) {
      lastErr = ctl.signal.reason instanceof Error && ctl.signal.reason.message === 'stall' ? new Error('stall') : e;
      if (out) await new Promise<void>((r) => out!.end(() => r()));
      if (opts.signal?.aborted) throw new Error(tx('Отменено'));
      // файла нет или доступ закрыт — повторять бесполезно, сразу к другому источнику
      if (e instanceof HttpError && [400, 401, 403, 404, 410, 451].includes(e.status)) throw e;
      await sleep(Math.min(15000, 1000 * 2 ** attempt), opts.signal);
    } finally {
      clearTimeout(stall);
      opts.signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function sha256File(file: string): Promise<string> {
  const h = createHash('sha256');
  await pipeline(fs.createReadStream(file), h);
  return h.digest('hex');
}

/** Распаковать .tar или .tar.bz2 в modelsDir/dirName (внутри архива — папка dirName или файлы сразу). */
export async function unpackArchive(file: string, root: string, dirName: string, onProgress?: (p: number) => void): Promise<void> {
  const extractTo = path.join(root, `${dirName}.unpack`);
  fs.rmSync(extractTo, { recursive: true, force: true });
  fs.mkdirSync(extractTo, { recursive: true });
  const size = fs.statSync(file).size;
  let read = 0;
  const src = fs.createReadStream(file);
  src.on('data', (d) => { read += (d as Buffer).length; onProgress?.(Math.min(0.999, read / size)); });
  const head = Buffer.alloc(3);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, head, 0, 3, 0); } finally { fs.closeSync(fd); }
  const isBz2 = head[0] === 0x42 && head[1] === 0x5a && head[2] === 0x68; // «BZh»
  if (isBz2) await pipeline(src, bz2(), tar.x({ cwd: extractTo }) as unknown as NodeJS.WritableStream);
  else await pipeline(src, tar.x({ cwd: extractTo }) as unknown as NodeJS.WritableStream);
  const inner = path.join(extractTo, dirName);
  const finalDir = path.join(root, dirName);
  fs.rmSync(finalDir, { recursive: true, force: true });
  fs.renameSync(fs.existsSync(inner) ? inner : extractTo, finalDir);
  fs.rmSync(extractTo, { recursive: true, force: true });
  onProgress?.(1);
}

export interface ArchiveSource { url: string; size?: number; sha256?: string; label: string }

/**
 * Скачать архив модели из первого источника, который отдаст его целиком (и с верной суммой), и распаковать.
 * Ошибки всех источников собираются в одно сообщение.
 */
export async function downloadModelArchive(sources: ArchiveSource[], root: string, dirName: string, ready: () => boolean,
  onProgress: (p: number, stage: 'download' | 'unpack') => void, signal?: AbortSignal): Promise<void> {
  if (ready()) return;
  fs.mkdirSync(root, { recursive: true });
  const fails: string[] = [];
  for (const s of sources) {
    const file = path.join(root, `${dirName}.${s.url.endsWith('.bz2') ? 'tar.bz2' : 'tar'}`);
    try {
      await fetchToFile(s.url, file, { size: s.size, signal, onBytes: (got, total) => onProgress(Math.min(0.999, got / Math.max(1, total)), 'download') });
      if (s.sha256 && (await sha256File(file)) !== s.sha256) {
        fs.rmSync(file, { force: true });
        throw new Error(tx('файл скачался с ошибкой (не совпала контрольная сумма)'));
      }
      onProgress(0, 'unpack');
      await unpackArchive(file, root, dirName, (p) => onProgress(p, 'unpack'));
      fs.rmSync(file, { force: true });
      if (!ready()) throw new Error(tx('в архиве не хватает файлов модели'));
      onProgress(1, 'unpack');
      return;
    } catch (e) {
      if (signal?.aborted) throw new Error(tx('Отменено'));
      fails.push(`${s.label}: ${netReason(e)}`);
    }
  }
  throw new Error(tx('Не удалось скачать модель. {0}. Можно скачать файл в браузере и указать его: Настройки → «Модели ИИ».', fails.join('; ')));
}
