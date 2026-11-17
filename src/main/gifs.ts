// Раздел «Гифки»: свои гифки и короткие ролики для монтажа (мемы, реакции, подложки). Загруженные копируются в папку
// Kadro (gifs), а подключённые папки читаются на месте. Ничего не уходит в сеть.
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './bins';

export const GIF_EXT = ['.gif', '.webp', '.apng', '.png', '.webm', '.mp4', '.mov', '.m4v'];
const MAX = 1000;

export const gifsDir = (): string => { const d = path.join(dataDir(), 'gifs'); fs.mkdirSync(d, { recursive: true }); return d; };

export interface GifFile { path: string; name: string; size: number; folder: string; kind: 'image' | 'video' }
export interface GifFolder { path: string; name: string; own: boolean; exists: boolean }

const isGif = (f: string) => GIF_EXT.includes(path.extname(f).toLowerCase());
const kindOf = (f: string): GifFile['kind'] => (['.webm', '.mp4', '.mov', '.m4v'].includes(path.extname(f).toLowerCase()) ? 'video' : 'image');

/** Файлы папки и её подпапок первого уровня — по дате, новые сверху. */
function scan(dir: string, out: GifFile[]): void {
  const items: (GifFile & { t: number })[] = [];
  const take = (p: string, name: string, folder: string) => {
    try { const st = fs.statSync(p); items.push({ path: p, name, size: st.size, folder, kind: kindOf(p), t: st.mtimeMs }); } catch { /* пропал */ }
  };
  let names: string[];
  try { names = fs.readdirSync(dir); } catch { return; }
  for (const n of names) {
    if (out.length + items.length >= MAX) break;
    const p = path.join(dir, n);
    let isDir = false;
    try { isDir = fs.statSync(p).isDirectory(); } catch { continue; }
    if (isDir) {
      try { for (const m of fs.readdirSync(p)) if (isGif(m)) take(path.join(p, m), m, dir); } catch { /* нет доступа */ }
    } else if (isGif(n)) take(p, n, dir);
  }
  items.sort((a, b) => b.t - a.t);
  for (const { t: _t, ...it } of items.slice(0, MAX - out.length)) out.push(it);
}

export function listGifs(folders: string[]): { folders: GifFolder[]; files: GifFile[] } {
  const own = gifsDir();
  const all: GifFolder[] = [{ path: own, name: 'Kadro', own: true, exists: true }, ...folders.map((p) => ({ path: p, name: path.basename(p) || p, own: false, exists: fs.existsSync(p) }))];
  const files: GifFile[] = [];
  for (const f of all) if (f.exists) scan(f.path, files);
  return { folders: all, files };
}

/** Загрузить свои файлы: копии в папку Kadro (имя не перезаписывает уже существующее). */
export function addGifs(paths: string[]): number {
  const dir = gifsDir();
  let n = 0;
  for (const p of paths) {
    if (!isGif(p)) continue;
    try {
      const ext = path.extname(p);
      const base = path.basename(p, ext).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'gif';
      let dst = path.join(dir, `${base}${ext}`);
      for (let i = 1; fs.existsSync(dst); i++) dst = path.join(dir, `${base} (${i})${ext}`);
      fs.copyFileSync(p, dst);
      n++;
    } catch { /* файл пропал — пропускаем */ }
  }
  return n;
}

/** Файл внутри папки Kadro или подключённой папки (только такие показываем и удаляем). */
export function inGifs(p: string, folders: string[]): boolean {
  const r = path.resolve(p).toLowerCase();
  return [gifsDir(), ...folders].some((root) => { const b = path.resolve(root).toLowerCase(); return r.startsWith(b + path.sep); });
}
/** Удалить можно только загруженное в Kadro (подключённые папки — чужие файлы, их не трогаем). */
export function removeGif(p: string): boolean {
  if (!inGifs(p, [])) return false;
  try { fs.rmSync(p, { force: true }); return true; } catch { return false; }
}
