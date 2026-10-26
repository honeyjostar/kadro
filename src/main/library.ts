// Библиотека: папки с видео, фото и звуком, которые пользователь добавил один раз — они видны в любом проекте.
// Файлы не копируются: Kadro только смотрит в папку, делает маленькие превью и берёт файл в проект, когда его выбрали.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LibDir, LibFile, LibKind, LibListing, LibMeta } from '../shared/ipc';
import { cacheDir } from './bins';
import { runFfmpeg } from './ffrun';
import { AUDIO_EXT, IMAGE_EXT, VIDEO_EXT, probe } from './media';

export function kindByExt(file: string): LibKind | null {
  const ext = path.extname(file).toLowerCase();
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (AUDIO_EXT.includes(ext)) return 'audio';
  return null;
}

// служебное и скрытое не показываем
const SKIP = new Set(['$recycle.bin', 'system volume information', 'node_modules', '.git', '__macosx', 'thumbs.db']);
const skip = (name: string) => name.startsWith('.') || name.startsWith('~$') || SKIP.has(name.toLowerCase());
const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

function fileOf(full: string, name: string, kind: LibKind): LibFile | null {
  try {
    const st = fs.statSync(full);
    return { path: full, name, kind, size: st.size, mtime: st.mtimeMs };
  } catch { return null; }
}

/** Сколько медиафайлов прямо в папке (без вложенных) — для подписи у подпапки. */
function countMedia(dir: string): number {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile() && !skip(d.name) && kindByExt(d.name)).length; } catch { return 0; }
}

/** Содержимое одной папки: подпапки и медиафайлы. */
export function listDir(dir: string): LibListing {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) {
    return { dir, dirs: [], files: [], error: (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'Папки больше нет на этом месте' : 'Нет доступа к папке' };
  }
  const dirs: LibDir[] = [];
  const files: LibFile[] = [];
  for (const d of entries) {
    if (skip(d.name)) continue;
    const full = path.join(dir, d.name);
    if (d.isDirectory()) dirs.push({ path: full, name: d.name, count: countMedia(full) });
    else if (d.isFile()) {
      const kind = kindByExt(d.name);
      const f = kind ? fileOf(full, d.name, kind) : null;
      if (f) files.push(f);
    }
  }
  dirs.sort((a, b) => collator.compare(a.name, b.name));
  files.sort((a, b) => collator.compare(a.name, b.name));
  return { dir, dirs, files };
}

/** Поиск по имени во всей папке и вложенных (до 400 находок, не глубже 8 уровней). */
export function searchDir(root: string, query: string): LibFile[] {
  const q = query.trim().toLowerCase();
  const out: LibFile[] = [];
  let seen = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 8 || out.length >= 400 || seen > 30_000) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of entries) {
      if (out.length >= 400) return;
      seen++;
      if (skip(d.name)) continue;
      const full = path.join(dir, d.name);
      if (d.isDirectory()) walk(full, depth + 1);
      else if (d.isFile() && (!q || d.name.toLowerCase().includes(q))) {
        const kind = kindByExt(d.name);
        const f = kind ? fileOf(full, d.name, kind) : null;
        if (f) out.push(f);
      }
    }
  };
  walk(root, 0);
  return out.sort((a, b) => collator.compare(a.name, b.name));
}

/** Сводка по папке: сколько всего медиафайлов внутри (с вложенными), до 5000. */
export function countDeep(root: string): number {
  let n = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 8 || n >= 5000) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of entries) {
      if (skip(d.name)) continue;
      if (d.isDirectory()) walk(path.join(dir, d.name), depth + 1);
      else if (d.isFile() && kindByExt(d.name)) n++;
    }
  };
  walk(root, 0);
  return n;
}

// ---------- превью: кадр + длительность, с кэшем на диске ----------
const metaCache = new Map<string, Promise<LibMeta>>();
/** После очистки кэша — забыть превью библиотеки в памяти (файлы пересоздадутся). */
export function forgetLibMeta(): void { metaCache.clear(); }
let running = 0;
const queue: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 3) await new Promise<void>((r) => queue.push(r));
  running++;
  try { return await fn(); } finally { running--; queue.shift()?.(); }
}

export function libMeta(file: string): Promise<LibMeta> {
  let st: fs.Stats;
  try { st = fs.statSync(file); } catch { return Promise.resolve({ missing: true }); }
  const key = crypto.createHash('sha1').update(`${file}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 20);
  const hit = metaCache.get(key);
  if (hit) return hit;
  const p = slot(() => makeMeta(file, key));
  metaCache.set(key, p);
  p.catch(() => metaCache.delete(key));
  return p;
}

async function makeMeta(file: string, key: string): Promise<LibMeta> {
  const dir = cacheDir('library');
  const jsonPath = path.join(dir, `${key}.json`);
  try { return JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as LibMeta; } catch { /* ещё нет */ }
  const kind = kindByExt(file);
  const meta: LibMeta = {};
  try {
    const pr = await probe(file);
    meta.duration = pr.duration || undefined;
    if (pr.video?.width && pr.video?.height) { meta.width = pr.video.width; meta.height = pr.video.height; }
    if (kind === 'video' && pr.video && pr.duration <= 0.1) meta.duration = undefined;
    if (kind !== 'audio' && pr.video) {
      const thumb = path.join(dir, `${key}.jpg`);
      const at = kind === 'video' && pr.duration > 1 ? Math.min(1, pr.duration * 0.25) : 0;
      // кадр 240 px по ширине; повёрнутое видео с телефона FFmpeg развернёт сам
      await runFfmpeg(['-hide_banner', '-y', ...(at > 0 ? ['-ss', at.toFixed(2)] : []), '-i', file, '-frames:v', '1',
        '-vf', 'scale=240:-2:flags=bicubic', '-q:v', '5', thumb], { low: true });
      if (fs.existsSync(thumb)) meta.thumb = thumb;
    }
  } catch {
    meta.broken = true;
  }
  try { fs.writeFileSync(jsonPath, JSON.stringify(meta)); } catch { /* кэш не обязателен */ }
  return meta;
}
