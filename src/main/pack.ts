// «Собрать проект в папку»: проект, видео, фото, музыка, обработанные ИИ копии, шрифты, плагины и LUT — в одну
// папку, чтобы открыть на другом компьютере (флешка, облако, архив). У каждого файла в проекте — и полный путь,
// и путь от файла проекта; при открытии пропавший файл ищется рядом. Шрифты и плагины из такой папки ставятся сами.
import fs from 'node:fs';
import path from 'node:path';
import { tx } from '../shared/i18n';
import type { PackResult, ProjectExtras } from '../shared/ipc';
import type { AiResult, MediaClip, Project } from '../shared/types';
import { dataDir } from './bins';
import { FONT_EXT, filesForFamilies, installPackageFonts, loadableFace } from './fonts';
import { pluginsDir } from './plugins';

const AI_KEYS = ['removeBg', 'denoise', 'stab', 'beauty', 'voice'] as const;
const PLUGIN_DIRS = { t: 'transitions', e: 'effects' } as const;

const safeName = (s: string) => s.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80);
const baseOf = (p: string) => p.split(/[\\/]/).pop() || p;
const toRel = (r: string) => r.split(path.sep).join('/');

/** Шрифты текстов проекта. */
export function usedFamilies(p: Project): string[] {
  const out = new Set<string>();
  for (const t of p.tracks) for (const c of t.clips) if (c.type === 'text' && c.style?.font) out.add(c.style.font);
  return [...out];
}

/** Плагины (переходы и эффекты пользователя), которые есть в проекте: plug:t/<имя файла>, plug:e/<имя файла>. */
export function usedPlugins(p: Project): { kind: 't' | 'e'; stem: string }[] {
  const out = new Map<string, { kind: 't' | 'e'; stem: string }>();
  for (const m of JSON.stringify(p.tracks).matchAll(/"plug:([te])\/([^"\\/]+)"/g)) out.set(`${m[1]}/${m[2]}`, { kind: m[1] as 't' | 'e', stem: m[2] });
  return [...out.values()];
}

export async function packProject(project: Project, parent: string): Promise<PackResult> {
  const name = safeName(project.name || '') || tx('Проект');
  let dir = path.join(parent, name);
  for (let n = 2; fs.existsSync(dir) && fs.readdirSync(dir).length; n++) dir = path.join(parent, `${name} (${n})`);
  fs.mkdirSync(dir, { recursive: true });
  const p = JSON.parse(JSON.stringify(project)) as Project;
  const copied = new Map<string, string>(); // исходный путь → путь от папки проекта
  const taken = new Set<string>();
  let size = 0;
  const copy = async (src: string, sub: string, wanted = baseOf(src)): Promise<string> => {
    const key = process.platform === 'win32' ? path.resolve(src).toLowerCase() : path.resolve(src);
    const had = copied.get(key);
    if (had) return had;
    const ext = path.extname(wanted);
    const stem = safeName(path.basename(wanted, ext)) || 'file';
    let rel = path.join(sub, `${stem}${ext}`);
    for (let n = 2; taken.has(rel.toLowerCase()); n++) rel = path.join(sub, `${stem} (${n})${ext}`);
    taken.add(rel.toLowerCase());
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
    await fs.promises.copyFile(src, path.join(dir, rel));
    size += fs.statSync(src).size;
    copied.set(key, rel);
    return rel;
  };
  const res: PackResult = { ok: true, dir, media: 0, fonts: 0, plugins: 0, luts: 0, missing: [] };

  for (const a of p.assets) {
    if (!a.path || !fs.existsSync(a.path)) { res.missing!.push(a.name || baseOf(a.path)); continue; }
    const wasPreview = a.previewPath === a.path;
    const rel = await copy(a.path, 'media');
    a.path = path.join(dir, rel);
    a.rel = toRel(rel);
    if (wasPreview) a.previewPath = a.path;
    res.media!++;
  }
  for (const t of p.tracks) for (const c of t.clips) {
    if (c.type !== 'media') continue;
    const m = c as MediaClip;
    for (const k of AI_KEYS) {
      const r = m[k] as AiResult | undefined;
      if (!r || r.status !== 'ready' || !r.path || !fs.existsSync(r.path)) continue;
      const rel = await copy(r.path, 'processed');
      r.path = path.join(dir, rel);
      r.rel = toRel(rel);
    }
    const paint = m.chroma?.paint;
    if (paint?.path && fs.existsSync(paint.path)) {
      const rel = await copy(paint.path, 'masks');
      paint.path = path.join(dir, rel);
      paint.rel = toRel(rel);
    }
    const lut = m.grade?.lut;
    if (lut?.path && fs.existsSync(lut.path)) {
      const rel = await copy(lut.path, 'luts');
      lut.path = path.join(dir, rel);
      lut.rel = toRel(rel);
      res.luts!++;
    }
  }
  for (const pl of usedPlugins(p)) {
    const d = path.join(pluginsDir(), PLUGIN_DIRS[pl.kind]);
    let name: string | undefined;
    try { name = fs.readdirSync(d).find((n) => /\.(glsl|frag)$/i.test(n) && n.replace(/\.(glsl|frag)$/i, '') === pl.stem); } catch { /* нет папки */ }
    if (!name) continue;
    await copy(path.join(d, name), path.join('plugins', PLUGIN_DIRS[pl.kind]));
    res.plugins!++;
  }
  const fonts = await filesForFamilies(usedFamilies(p));
  for (const f of fonts.files) {
    try {
      const src = loadableFace(f.file, f.index);
      const wanted = /\.(ttc|otc)$/i.test(f.file) ? `${f.family} ${f.sub}.ttf` : baseOf(f.file);
      await copy(src, 'fonts', wanted);
      res.fonts!++;
    } catch { /* шрифт не читается — проект соберётся без него */ }
  }
  for (const fam of fonts.missing) res.missing!.push(tx('шрифт «{0}»', fam));

  const file = path.join(dir, `${name}.kadro`);
  fs.writeFileSync(file, JSON.stringify(p, null, 1));
  fs.writeFileSync(path.join(dir, tx('Как открыть.txt')), tx('Проект Kadro, собранный в папку.\r\n\r\nОткрой файл «{0}» в Kadro (двойной щелчок или «Открыть»). Видео, музыка и картинки лежат в папке media — путь к ним Kadro найдёт сам, даже если папку перенесли на другой диск или компьютер. Шрифты из папки fonts и плагины из папки plugins установятся при открытии.\r\n\r\nСкачать Kadro: https://github.com/honeyjostar/kadro/releases\r\n', path.basename(file)));
  res.file = file;
  res.size = size;
  return res;
}

/** Файлы, пропавшие с прежнего места, — ищем рядом с проектом: по пути от проекта, в media, в той же папке. */
export function relinkProject(p: Project, projectFile: string): number {
  const dir = path.dirname(projectFile);
  let n = 0;
  const find = (abs: string | undefined, rel: string | undefined, subs: string[]): string | null => {
    if (abs && fs.existsSync(abs)) return null;
    const cands = [rel && path.join(dir, ...rel.split('/')), ...(abs ? subs.map((s) => path.join(dir, s, baseOf(abs))) : [])].filter(Boolean) as string[];
    return cands.find((c) => fs.existsSync(c)) ?? null;
  };
  for (const a of p.assets) {
    const hit = find(a.path, a.rel, ['media', '']);
    if (!hit) continue;
    if (a.previewPath === a.path || !a.previewPath || !fs.existsSync(a.previewPath)) a.previewPath = hit;
    a.path = hit;
    n++;
  }
  for (const t of p.tracks) for (const c of t.clips) {
    if (c.type !== 'media') continue;
    const m = c as MediaClip;
    for (const k of AI_KEYS) {
      const r = m[k] as AiResult | undefined;
      if (!r?.path) continue;
      const hit = find(r.path, r.rel, ['processed']);
      if (hit) r.path = hit;
    }
    const lut = m.grade?.lut;
    if (lut?.path) { const hit = find(lut.path, lut.rel, ['luts']); if (hit) lut.path = hit; }
    const paint = m.chroma?.paint;
    if (paint?.path) { const hit = find(paint.path, paint.rel, ['masks']); if (hit) paint.path = hit; }
  }
  return n;
}

/** Проект из собранной папки: ставим шрифты (которых нет) и плагины (которых нет). Папка данных Kadro — не такая папка. */
export async function packageExtras(projectFile: string): Promise<ProjectExtras> {
  const dir = path.dirname(path.resolve(projectFile));
  const out: ProjectExtras = { fonts: [], plugins: [], relinked: 0 };
  const data = path.resolve(dataDir());
  if (dir === data || dir.startsWith(data + path.sep)) return out;
  const fontsDir = path.join(dir, 'fonts');
  if (fs.existsSync(fontsDir) && fs.readdirSync(fontsDir).some((n) => FONT_EXT.test(n))) out.fonts = await installPackageFonts(fontsDir);
  for (const sub of Object.values(PLUGIN_DIRS)) {
    const from = path.join(dir, 'plugins', sub);
    let names: string[] = [];
    try { names = fs.readdirSync(from).filter((n) => /\.(glsl|frag)$/i.test(n)); } catch { continue; }
    for (const n of names) {
      const to = path.join(pluginsDir(), sub, n);
      if (fs.existsSync(to)) continue;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(from, n), to);
      out.plugins.push(n.replace(/\.(glsl|frag)$/i, ''));
    }
  }
  return out;
}
