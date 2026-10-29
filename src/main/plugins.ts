// Плагины-шейдеры пользователя: %USERPROFILE%\.kadro\plugins\transitions\*.glsl и …\effects\*.glsl.
// Файлы читаются как текст и уходят в окно — там они разбираются и собираются (WebGL). Папка
// отслеживается: сохранил файл — Kadro подхватил его сразу.
import { tx } from '../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './bins';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { net, shell } from 'electron';
import {
  CATALOG_URL, MAX_PLUGIN_BYTES, kindOfSource, pluginDirName, safePluginFile, validEntry,
  type CatalogEntry, type CatalogItem, type CatalogResult, type InstallResult, type PluginKind,
} from '../shared/pluginCatalog';
import { parseGlsl } from '../shared/gl/glsl';

export interface PluginFile { kind: 'transition' | 'effect'; file: string; src: string }

const MAX_BYTES = 256 * 1024;
const DIRS = { transition: 'transitions', effect: 'effects' } as const;

export const pluginsDir = (): string => path.join(dataDir(), 'plugins');

const README = `Плагины Kadro
=============

Здесь лежат ваши переходы и эффекты на GLSL (язык шейдеров видеокарты):

  transitions\\  — переходы: файл .glsl с функцией  vec4 transition(vec2 uv)
  effects\\      — эффекты:  файл .glsl с функцией  vec4 effect(vec2 uv)

Сохранили файл — он сразу появится в Kadro (раздел «Переходы» или «Эффекты» → «Плагины»).
Ошибка в шейдере показывается в «Настройках» → «Плагины», остальное продолжает работать.

Переходы — в формате gl-transitions (https://gl-transitions.com): любой оттуда можно просто
скопировать в файл. Примеры эффектов — в папке examples\\ (перенесите файл в effects\\, чтобы включить).

Подробная инструкция: https://github.com/honeyjostar/kadro/blob/master/docs/PLUGINS.md
`;

const EXAMPLE_EFFECT = `// Name: Пример — сепия с виньеткой
// Author: Kadro
// License: MIT
// Description: Тёплый старый снимок с затемнёнными углами
// Tags: color, retro
// @range(0, 1) Виньетка
uniform float vignette; // = 0.6

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 sepia = vec3(g * 1.07, g * 0.87, g * 0.68);
  float d = distance(uv, vec2(0.5));
  float v = 1.0 - vignette * smoothstep(0.35, 0.75, d);
  return vec4(mix(c.rgb, sepia * v, amount), c.a);
}
`;

const EXAMPLE_TRANSITION = `// Name: Пример — диагональная шторка
// Author: Kadro
// License: MIT
// Description: Мягкая шторка из левого верхнего угла
// Tags: wipe
// @range(0.01, 0.5) Мягкость края
uniform float softness; // = 0.1

vec4 transition(vec2 uv) {
  float d = (uv.x + (1.0 - uv.y)) * 0.5;
  float m = smoothstep(progress * (1.0 + softness) - softness, progress * (1.0 + softness), d);
  return mix(getToColor(uv), getFromColor(uv), m);
}
`;

/** Создать папки плагинов с памяткой и примерами (примеры не подключаются, пока их не перенесут). */
export function ensurePluginDirs(): string {
  const root = pluginsDir();
  for (const d of [...Object.values(DIRS), 'examples']) fs.mkdirSync(path.join(root, d), { recursive: true });
  const put = (f: string, text: string) => { const p = path.join(root, f); if (!fs.existsSync(p)) fs.writeFileSync(p, text); };
  put('README.txt', README);
  put(path.join('examples', 'sepia-vignette.glsl'), EXAMPLE_EFFECT);
  put(path.join('examples', 'diagonal-wipe.glsl'), EXAMPLE_TRANSITION);
  return root;
}

export function listPlugins(): PluginFile[] {
  const out: PluginFile[] = [];
  for (const [kind, dir] of Object.entries(DIRS) as [PluginFile['kind'], string][]) {
    const d = path.join(pluginsDir(), dir);
    let names: string[] = [];
    try { names = fs.readdirSync(d); } catch { continue; }
    for (const n of names.sort((a, b) => a.localeCompare(b))) {
      if (!/\.(glsl|frag)$/i.test(n)) continue;
      const file = path.join(d, n);
      try {
        const st = fs.statSync(file);
        if (!st.isFile() || st.size > MAX_BYTES) continue;
        out.push({ kind, file, src: fs.readFileSync(file, 'utf8') });
      } catch { /* файл занят редактором — подхватим при следующем сохранении */ }
    }
  }
  return out;
}

/** Следить за папками плагинов; onChange — не чаще раза в 300 мс. */
export function watchPlugins(onChange: (list: PluginFile[]) => void): () => void {
  const watchers: fs.FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; onChange(listPlugins()); }, 300);
  };
  for (const dir of Object.values(DIRS)) {
    try { watchers.push(fs.watch(path.join(pluginsDir(), dir), fire)); } catch { /* папки нет — создадим при открытии */ }
  }
  return () => { watchers.forEach((w) => w.close()); if (timer) clearTimeout(timer); };
}

// ---------- каталог и установка ----------

const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const catalogUrl = () => process.env.KADRO_PLUGINS_URL || CATALOG_URL;

/** Текст по адресу: https — через сеть Electron (прокси Windows учитываются), file:// — с диска (тесты). */
async function fetchText(url: string, limit: number, timeoutMs = 15_000): Promise<string> {
  if (url.startsWith('file:')) {
    const p = fileURLToPath(url);
    if (fs.statSync(p).size > limit) throw new Error(tx('Слишком большой файл'));
    return fs.readFileSync(p, 'utf8');
  }
  if (!url.startsWith('https://')) throw new Error(tx('Только https'));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await net.fetch(url, { signal: ctl.signal, headers: { 'Cache-Control': 'no-cache' } });
    if (!r.ok) throw new Error(tx('Сервер ответил {0}', r.status));
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > limit) throw new Error(tx('Слишком большой файл'));
    return buf.toString('utf8');
  } finally { clearTimeout(timer); }
}

let cache: { url: string; items: CatalogItem[] } | null = null;

function localState(e: CatalogEntry): CatalogItem['state'] {
  const f = path.join(pluginsDir(), pluginDirName(e.kind), e.file.split('/')[1]);
  try { return sha256(fs.readFileSync(f)) === e.sha256 ? 'installed' : 'update'; } catch { return 'new'; }
}

/** Скачать каталог и тексты всех шейдеров (они маленькие) — для живых превью. */
export async function loadCatalog(): Promise<CatalogResult> {
  const url = catalogUrl();
  try {
    const index = JSON.parse(await fetchText(url, 1024 * 1024)) as { version?: number; plugins?: unknown[] };
    if (index.version !== 1 || !Array.isArray(index.plugins)) throw new Error(tx('Каталог в непонятном формате — обнови Kadro'));
    const entries = index.plugins.filter(validEntry).slice(0, 300);
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    const items: CatalogItem[] = [];
    const queue = [...entries];
    const worker = async () => {
      for (let e = queue.shift(); e; e = queue.shift()) {
        try {
          const src = await fetchText(base + e.file, MAX_PLUGIN_BYTES);
          if (sha256(Buffer.from(src, 'utf8')) !== e.sha256) continue; // файл не совпал со списком — пропускаем
          items.push({ ...e, src, state: localState(e) });
        } catch { /* один файл не скачался — остальные покажем */ }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    const order = new Map(entries.map((e, i) => [e.id, i]));
    items.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    if (entries.length && !items.length) throw new Error(tx('Не удалось скачать ни одного плагина'));
    cache = { url, items };
    return { ok: true, items };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? tx('Сервер не ответил вовремя') : e.message) : String(e);
    return { ok: false, items: [], error: msg };
  }
}

/** Записать шейдер в папку плагинов (поверх старой версии с тем же именем). */
function writePlugin(kind: PluginKind, fileName: string, src: string): string {
  ensurePluginDirs();
  const f = path.join(pluginsDir(), pluginDirName(kind), fileName);
  fs.writeFileSync(f, src);
  return f;
}

/** Поставить плагины из каталога по id (из уже скачанного каталога — с проверкой SHA-256). */
export async function installFromCatalog(ids: string[]): Promise<InstallResult> {
  const res: InstallResult = { ok: true, installed: [], errors: [] };
  if (!cache || cache.url !== catalogUrl()) await loadCatalog();
  for (const id of ids) {
    const it = cache?.items.find((x) => x.id === id);
    if (!it) { res.errors.push(tx('{0}: нет в каталоге', id)); continue; }
    if (sha256(Buffer.from(it.src, 'utf8')) !== it.sha256) { res.errors.push(tx('{0}: файл повреждён', it.name)); continue; }
    try {
      writePlugin(it.kind, it.file.split('/')[1], it.src);
      it.state = 'installed';
      res.installed.push({ kind: it.kind, file: it.file.split('/')[1], name: it.name });
    } catch (e) { res.errors.push(`${it.name}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  res.ok = res.errors.length === 0;
  return res;
}

/** Поставить файлы .glsl с диска (перетащили в окно или выбрали): переход или эффект — по тексту. */
export function installFiles(paths: string[]): InstallResult {
  const res: InstallResult = { ok: true, installed: [], errors: [] };
  for (const p of paths) {
    const base = path.basename(p);
    try {
      if (!/\.(glsl|frag)$/i.test(base)) { res.errors.push(tx('{0}: это не шейдер .glsl', base)); continue; }
      if (fs.statSync(p).size > MAX_PLUGIN_BYTES) { res.errors.push(tx('{0}: файл больше 256 КБ', base)); continue; }
      const src = fs.readFileSync(p, 'utf8');
      const kind = kindOfSource(src);
      if (!kind) { res.errors.push(tx('{0}: нет функции vec4 transition(vec2 uv) или vec4 effect(vec2 uv)', base)); continue; }
      const name = safePluginFile(base);
      if (!name) { res.errors.push(tx('{0}: неподходящее имя файла', base)); continue; }
      writePlugin(kind, name, src);
      res.installed.push({ kind, file: name, name: parseGlsl(src).name ?? name.replace(/\.glsl$/, '') });
    } catch (e) { res.errors.push(`${base}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  res.ok = res.errors.length === 0;
  return res;
}

/** Удалить плагин: только файл внутри папки плагинов; в Корзину, если получится. */
export async function removePlugin(file: string): Promise<boolean> {
  const root = path.resolve(pluginsDir());
  const f = path.resolve(file);
  const rel = path.relative(root, f);
  if (rel.startsWith('..') || path.isAbsolute(rel) || !/^(transitions|effects)[\\/][^\\/]+\.(glsl|frag)$/i.test(rel)) return false;
  if (!fs.existsSync(f)) return false;
  try { await shell.trashItem(f); } catch { fs.rmSync(f, { force: true }); }
  return !fs.existsSync(f);
}
