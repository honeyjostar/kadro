// «Мастерская» (каталог сообщества): community-plugins/ в репозитории Kadro на GitHub — переходы, эффекты и шаблоны. index.json — список с названиями,
// описаниями и SHA-256 файлов; Kadro скачивает список и тексты шейдеров, показывает живые превью и
// ставит выбранное в папку плагинов. Здесь — общий для окна, main и скрипта код (без Node и DOM).
import { checkBody, parseGlsl } from './gl/glsl';

export const CATALOG_URL = 'https://raw.githubusercontent.com/honeyjostar/kadro/master/community-plugins/index.json';
export const MAX_PLUGIN_BYTES = 256 * 1024;

export type PluginKind = 'transition' | 'effect' | 'template';
export interface CatalogEntry {
  id: string;            // e/halftone, t/whip-pan
  kind: PluginKind;
  file: string;          // effects/halftone.glsl — относительно index.json
  name: string;
  author?: string;
  license?: string;
  description?: string;
  tags: string[];
  sha256: string;
  size: number;
}
export interface CatalogIndex { version: 1; plugins: CatalogEntry[] }
/** Что видит окно: запись каталога, текст шейдера и установлен ли он у человека. */
export interface CatalogItem extends CatalogEntry { src: string; state: 'new' | 'installed' | 'update' }
export interface CatalogResult { ok: boolean; items: CatalogItem[]; error?: string }
export interface InstallResult { ok: boolean; installed: { kind: PluginKind; file: string; name: string }[]; errors: string[] }

const DIR_OF: Record<PluginKind, string> = { transition: 'transitions', effect: 'effects', template: 'templates' };
const PREFIX: Record<PluginKind, string> = { transition: 't', effect: 'e', template: 'w' };
const EXT: Record<PluginKind, string> = { transition: 'glsl', effect: 'glsl', template: 'json' };
/** id шаблона из Мастерской у человека в «Моих шаблонах»: ws-<имя файла>. */
export const workshopTemplateId = (file: string): string => `ws-${file.split('/').pop()!.replace(/\.json$/, '')}`;
export const pluginDirName = (k: PluginKind): string => DIR_OF[k];

const RU = 'а:a б:b в:v г:g д:d е:e ё:e ж:zh з:z и:i й:i к:k л:l м:m н:n о:o п:p р:r с:s т:t у:u ф:f х:h ц:ts ч:ch ш:sh щ:sch ъ: ы:y ь: э:e ю:yu я:ya';
const TRANSLIT = new Map(RU.split(' ').map((x) => x.split(':') as [string, string]));
const translit = (s: string) => [...s].map((ch) => {
  const t = TRANSLIT.get(ch.toLowerCase());
  return t === undefined ? ch : ch === ch.toLowerCase() ? t : t.charAt(0).toUpperCase() + t.slice(1);
}).join('');

/** Имя файла плагина: латиница (русские буквы — транслитом), цифры, точка, дефис, подчёркивание; всегда .glsl. */
export function safePluginFile(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? '';
  const stem = translit(base.replace(/\.(glsl|frag)$/i, '')).replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60);
  return stem ? `${stem}.glsl` : null;
}

/** Переход или эффект — по функции в тексте; null — ни того, ни другого. */
export function kindOfSource(src: string): PluginKind | null {
  if (!checkBody('transition', src)) return 'transition';
  if (!checkBody('effect', src)) return 'effect';
  return null;
}

/** Запись каталога пришла из сети — проверяем всё, прежде чем верить. */
export function validEntry(x: unknown): x is CatalogEntry {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  if (e.kind !== 'transition' && e.kind !== 'effect' && e.kind !== 'template') return false;
  const k = e.kind as PluginKind;
  if (typeof e.file !== 'string' || !new RegExp(`^${DIR_OF[k]}/[A-Za-z0-9][\\w.-]{0,59}\\.${EXT[k]}$`).test(e.file)) return false;
  if (typeof e.id !== 'string' || e.id !== `${PREFIX[k]}/${e.file.split('/')[1].replace(/\.(glsl|json)$/, '')}`) return false;
  if (typeof e.name !== 'string' || !e.name.trim() || e.name.length > 80) return false;
  if (typeof e.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(e.sha256)) return false;
  if (typeof e.size !== 'number' || e.size <= 0 || e.size > MAX_PLUGIN_BYTES) return false;
  if (!Array.isArray(e.tags) || !e.tags.every((t) => typeof t === 'string')) return false;
  for (const k of ['author', 'license', 'description'] as const) if (e[k] !== undefined && (typeof e[k] !== 'string' || (e[k] as string).length > 300)) return false;
  return true;
}

/** Список каталога из файлов (для скрипта scripts/plugins-index.ts и проверки в тестах). */
export function buildIndex(files: { file: string; src: string; sha256: string; size: number }[]): CatalogIndex {
  const ORDER: PluginKind[] = ['transition', 'effect', 'template'];
  const plugins = files.map(({ file, src, sha256, size }) => {
    const kind: PluginKind = file.startsWith('transitions/') ? 'transition' : file.startsWith('templates/') ? 'template' : 'effect';
    const stem = file.split('/')[1].replace(/\.(glsl|json)$/, '');
    // шаблон — JSON с name, hint, author, license, tags; шейдер — заголовок в комментариях
    const m = kind === 'template' ? templateMeta(src) : parseGlsl(src);
    const e: CatalogEntry = {
      id: `${PREFIX[kind]}/${stem}`, kind, file, name: m.name ?? stem,
      ...(m.author ? { author: m.author } : {}), ...(m.license ? { license: m.license } : {}), ...(m.description ? { description: m.description } : {}),
      tags: m.tags, sha256, size,
    };
    return e;
  }).sort((a, b) => (a.kind === b.kind ? a.file.localeCompare(b.file) : ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)));
  return { version: 1, plugins };
}

/** Название, описание, автор, лицензия и теги шаблона из Мастерской (JSON). */
export function templateMeta(src: string): { name?: string; author?: string; license?: string; description?: string; tags: string[] } {
  try {
    const j = JSON.parse(src) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    return { name: str(j.name), author: str(j.author), license: str(j.license), description: str(j.hint), tags: Array.isArray(j.tags) ? j.tags.filter((t): t is string => typeof t === 'string') : [] };
  } catch { return { tags: [] }; }
}
