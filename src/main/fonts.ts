// Шрифты на диске: свои — в папке fonts данных Kadro (ставятся перетаскиванием файла или кнопкой), системные —
// из папок Windows (C:\Windows\Fonts и шрифты, поставленные только для пользователя). Названия читаются из самих
// файлов; список системных собирается один раз и хранится в кэше по дате и размеру файлов.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { FONTS } from '../shared/defaults';
import { extractFromCollection, fontInfos, type FontInfo, type Inflate, type ReadAt } from '../shared/fontName';
import { tx } from '../shared/i18n';
import type { FontFile, FontInstallResult } from '../shared/ipc';
import { cacheDir, dataDir } from './bins';

export const FONT_EXT = /\.(ttf|otf|ttc|otc|woff2?)$/i;
const MAX_FONT_BYTES = 60 * 1024 * 1024;
const BUILTIN = new Set(FONTS.map((f) => f.family.toLowerCase()));

export function userFontsDir(): string {
  const d = path.join(dataDir(), 'fonts');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

const inflate: Inflate = (d, kind) => (kind === 'zlib' ? zlib.inflateSync(d) : zlib.brotliDecompressSync(d));

/** Начертания из файла: читаются только нужные таблицы, не весь файл. */
export function readFontFile(file: string): FontInfo[] {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const read: ReadAt = (off, len) => {
      const n = Math.max(0, Math.min(len, size - off));
      const b = Buffer.alloc(n);
      if (n) fs.readSync(fd, b, 0, n, off);
      return b;
    };
    return fontInfos(read, size, inflate);
  } finally { fs.closeSync(fd); }
}

const toFile = (file: string, i: FontInfo, source: FontFile['source']): FontFile => ({
  file, family: i.family, sub: i.sub, full: i.full, weight: i.weight, italic: i.italic, variable: i.variable, index: i.index, source,
});

const seen = new Map<string, { key: string; infos: FontInfo[] | null }>();
function cachedInfos(file: string, st: fs.Stats): FontInfo[] | null {
  const key = `${st.size}:${Math.round(st.mtimeMs)}`;
  const c = seen.get(file);
  if (c && c.key === key) return c.infos;
  let infos: FontInfo[] | null = null;
  try { infos = readFontFile(file); } catch { infos = null; }
  seen.set(file, { key, infos });
  return infos;
}

export function listUserFonts(): FontFile[] {
  const dir = userFontsDir();
  const out: FontFile[] = [];
  let names: string[] = [];
  try { names = fs.readdirSync(dir); } catch { return out; }
  for (const n of names.sort((a, b) => a.localeCompare(b))) {
    if (!FONT_EXT.test(n)) continue;
    const file = path.join(dir, n);
    try {
      const st = fs.statSync(file);
      if (!st.isFile()) continue;
      for (const i of cachedInfos(file, st) ?? []) out.push(toFile(file, i, 'user'));
    } catch { /* файл занят — в следующий раз */ }
  }
  return out;
}

/** Папки системных шрифтов. В автотестах — KADRO_SYSTEM_FONTS (папки через «|», пусто — без системных). */
export function systemFontDirs(): string[] {
  const env = process.env.KADRO_SYSTEM_FONTS;
  if (env !== undefined) return env.split('|').filter(Boolean);
  const home = os.homedir();
  if (process.platform === 'win32') {
    const win = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    return [path.join(win, 'Fonts'), path.join(local, 'Microsoft', 'Windows', 'Fonts')];
  }
  if (process.platform === 'darwin') return ['/System/Library/Fonts', '/Library/Fonts', path.join(home, 'Library', 'Fonts')];
  return ['/usr/share/fonts', '/usr/local/share/fonts', path.join(home, '.fonts'), path.join(home, '.local', 'share', 'fonts')];
}

function walkFonts(dir: string, depth: number, out: string[]): void {
  let ents: fs.Dirent[];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth < 4) walkFonts(p, depth + 1, out); } else if (FONT_EXT.test(e.name)) out.push(p);
  }
}

interface SysCache { v: 1; files: Record<string, { k: string; f: FontInfo[] | null }> }
const sysCacheFile = () => path.join(cacheDir('fonts'), 'system.json');
let systemPromise: Promise<FontFile[]> | null = null;

/** Системные шрифты (один раз за запуск; файлы, которые не менялись, не перечитываются). */
export function systemFonts(): Promise<FontFile[]> {
  systemPromise ??= (async () => {
    const files: string[] = [];
    for (const d of systemFontDirs()) walkFonts(d, 0, files);
    let cache: SysCache = { v: 1, files: {} };
    try { const c = JSON.parse(fs.readFileSync(sysCacheFile(), 'utf8')) as SysCache; if (c?.v === 1 && c.files) cache = c; } catch { /* нет кэша */ }
    const next: SysCache = { v: 1, files: {} };
    const out: FontFile[] = [];
    let changed = false;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (i % 40 === 39) await new Promise((r) => setImmediate(r)); // не держим окно, пока читаем сотни файлов
      let st: fs.Stats;
      try { st = fs.statSync(file); } catch { continue; }
      if (st.size > MAX_FONT_BYTES * 2) continue;
      const k = `${st.size}:${Math.round(st.mtimeMs)}`;
      let f = cache.files[file]?.k === k ? cache.files[file].f : undefined;
      if (f === undefined) { try { f = readFontFile(file); } catch { f = null; } changed = true; }
      next.files[file] = { k, f };
      for (const info of f ?? []) out.push(toFile(file, info, 'system'));
    }
    if (changed || Object.keys(cache.files).length !== files.length) {
      try { fs.writeFileSync(sysCacheFile(), JSON.stringify(next)); } catch { /* кэш не обязателен */ }
    }
    return out.sort((a, b) => a.family.localeCompare(b.family) || a.weight - b.weight);
  })();
  return systemPromise;
}

const safeName = (s: string) => s.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'font';
const hashOf = (b: Uint8Array) => createHash('sha1').update(b).digest('hex');

/** Положить данные шрифта в свою папку: такой же файл уже есть — «уже установлен», имя занято — с номером. */
function putFont(dir: string, wanted: string, data: Uint8Array): { file: string; fresh: boolean } {
  const ext = path.extname(wanted);
  const stem = safeName(path.basename(wanted, ext));
  const h = hashOf(data);
  for (let n = 1; n < 100; n++) {
    const file = path.join(dir, `${stem}${n > 1 ? ` (${n})` : ''}${ext.toLowerCase()}`);
    if (!fs.existsSync(file)) { fs.writeFileSync(file, data); return { file, fresh: true }; }
    try { if (hashOf(fs.readFileSync(file)) === h) return { file, fresh: false }; } catch { /* занят — следующее имя */ }
  }
  throw new Error(tx('слишком много файлов с таким именем'));
}

/** Установить шрифты с диска (перетащили в окно, выбрали, из собранного проекта). Коллекция .ttc — по начертаниям. */
export function installFonts(paths: string[]): FontInstallResult {
  const res: FontInstallResult = { installed: [], already: [], errors: [] };
  const dir = userFontsDir();
  for (const p of paths) {
    const base = path.basename(p);
    try {
      if (!FONT_EXT.test(base)) { res.errors.push(tx('{0}: это не шрифт (подходят .ttf, .otf, .ttc, .woff, .woff2)', base)); continue; }
      const st = fs.statSync(p);
      if (!st.isFile()) continue;
      if (st.size > MAX_FONT_BYTES) { res.errors.push(tx('{0}: файл больше 60 МБ', base)); continue; }
      let infos: FontInfo[];
      try { infos = readFontFile(p); } catch { res.errors.push(tx('{0}: не похоже на шрифт или файл повреждён', base)); continue; }
      const data = fs.readFileSync(p);
      const parts = /\.(ttc|otc)$/i.test(base)
        ? infos.map((i) => ({ info: i, name: `${i.family} ${i.sub}.ttf`, data: extractFromCollection(data, i.index) }))
        : [{ info: infos[0], name: base, data: data as Uint8Array }];
      for (const part of parts) {
        // то же начертание того же семейства уже стоит (например, из .ttc и отдельным файлом) — не дублируем
        const same = `${part.info.family}|${part.info.sub}`.toLowerCase();
        if (listUserFonts().some((u) => `${u.family}|${u.sub}`.toLowerCase() === same)) { res.already.push(part.info.family); continue; }
        const r = putFont(dir, part.name, part.data);
        if (r.fresh) res.installed.push({ family: part.info.family, file: r.file });
        else res.already.push(part.info.family);
      }
    } catch (e) { res.errors.push(`${base}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  res.already = [...new Set(res.already)].filter((f) => !res.installed.some((i) => i.family === f));
  return res;
}

/** Удалить свои шрифты: только файлы в папке шрифтов Kadro. */
export function removeUserFonts(files: string[], trash: (f: string) => Promise<void>): Promise<boolean> {
  const root = path.resolve(userFontsDir());
  return Promise.all(files.map(async (raw) => {
    const f = path.resolve(String(raw));
    if (path.dirname(f) !== root || !FONT_EXT.test(f) || !fs.existsSync(f)) return false;
    try { await trash(f); } catch { fs.rmSync(f, { force: true }); }
    seen.delete(f);
    return !fs.existsSync(f);
  })).then((r) => r.length > 0 && r.every(Boolean));
}

/** Файл для загрузки в окно: обычный шрифт — как есть, начертание коллекции — отдельным .ttf в кэше. */
export function loadableFace(file: string, index: number): string {
  if (!/\.(ttc|otc)$/i.test(file)) return file;
  const st = fs.statSync(file);
  const out = path.join(cacheDir('fonts'), `${createHash('sha1').update(`${file}:${st.size}:${st.mtimeMs}`).digest('hex').slice(0, 16)}-${index}.ttf`);
  if (!fs.existsSync(out)) fs.writeFileSync(out, extractFromCollection(fs.readFileSync(file), index));
  return out;
}

/** Шрифт есть в Kadro или на компьютере. */
export async function familyAvailable(family: string): Promise<boolean> {
  const f = family.toLowerCase();
  if (BUILTIN.has(f)) return true;
  if (listUserFonts().some((x) => x.family.toLowerCase() === f)) return true;
  return (await systemFonts()).some((x) => x.family.toLowerCase() === f);
}

/** Файлы шрифтов для семейств (не встроенных): свои — в приоритете, потом системные. */
export async function filesForFamilies(families: string[]): Promise<{ missing: string[]; files: FontFile[] }> {
  const want = [...new Set(families.filter((f) => f && !BUILTIN.has(f.toLowerCase())))];
  const user = listUserFonts();
  const sys = want.some((f) => !user.some((u) => u.family.toLowerCase() === f.toLowerCase())) ? await systemFonts() : [];
  const files: FontFile[] = [];
  const missing: string[] = [];
  for (const fam of want) {
    const k = fam.toLowerCase();
    const mine = user.filter((u) => u.family.toLowerCase() === k);
    const list = mine.length ? mine : sys.filter((s) => s.family.toLowerCase() === k);
    if (!list.length) missing.push(fam);
    files.push(...list);
  }
  return { missing, files };
}

/** Шрифты из папки fonts собранного проекта: ставим те, которых нет ни в Kadro, ни на компьютере. */
export async function installPackageFonts(dir: string): Promise<string[]> {
  let names: string[];
  try { names = fs.readdirSync(dir).filter((n) => FONT_EXT.test(n)); } catch { return []; }
  const todo: string[] = [];
  for (const n of names) {
    const file = path.join(dir, n);
    let infos: FontInfo[];
    try { infos = readFontFile(file); } catch { continue; }
    let need = false;
    for (const i of infos) if (!(await familyAvailable(i.family))) need = true;
    if (need) todo.push(file);
  }
  if (!todo.length) return [];
  const r = installFonts(todo);
  return [...new Set(r.installed.map((i) => i.family))];
}

/** Для автотестов и «пересканировать»: забыть список системных шрифтов. */
export function forgetSystemFonts(): void { systemPromise = null; }
