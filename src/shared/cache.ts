// Кэш Kadro (%USERPROFILE%\.kadro\cache): что в нём лежит, сколько места занимает и что можно удалить.
// Здесь — чистые функции (план очистки); удаление файлов — в главном процессе (main/cache.ts).

/** Папки кэша по смыслу. */
export const CACHE_GROUPS = {
  /** Лёгкие копии для плеера, миниатюры, волны, превью библиотеки, временные файлы — пересоздаются сами. */
  preview: ['proxy', 'thumbs', 'covers', 'peaks', 'library', 'tmp', 'export'],
  /** Служебные копии, на которые ссылаются проекты: реверс и замедление, ИИ, группы, 3D, озвучка, извлечённый звук. */
  derived: ['ai', 'clips', 'groups', 'models', 'audio', 'tts'],
  /** Никогда не удаляются: записи голоса и журналы ошибок. */
  kept: ['recordings', 'logs'],
} as const;
export type CacheGroup = keyof typeof CACHE_GROUPS;

export interface CacheFile { path: string; size: number; mtime: number; dir: string }
export interface CacheInfo { preview: number; derived: number; kept: number; total: number }

const MIN = 60_000;
/** Сколько файл должен «отлежаться», прежде чем его можно удалить (в работе — прокси, экспорт, ИИ). */
const MIN_AGE: Record<string, number> = { tmp: 60 * MIN, export: 60 * MIN };
const DEFAULT_PREVIEW_AGE = 10 * MIN;
const DERIVED_AGE = 24 * 60 * MIN;

export function groupOf(dir: string): CacheGroup | null {
  for (const g of Object.keys(CACHE_GROUPS) as CacheGroup[]) if ((CACHE_GROUPS[g] as readonly string[]).includes(dir)) return g;
  return null;
}

export function summarize(files: CacheFile[]): CacheInfo {
  const r: CacheInfo = { preview: 0, derived: 0, kept: 0, total: 0 };
  for (const f of files) {
    const g = groupOf(f.dir);
    if (g) r[g] += f.size;
    r.total += f.size;
  }
  return r;
}

/** Путь для сравнения: разделители и регистр как в Windows не важны. */
export const normPath = (p: string): string => p.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();

/** Все строки-пути внутри проекта (или нескольких): файлы, на которые он ссылается. */
export function collectPaths(json: unknown, out: Set<string> = new Set()): Set<string> {
  const walk = (v: unknown, depth: number): void => {
    if (depth > 40 || v == null) return;
    if (typeof v === 'string') { if (/[\\/]/.test(v) && v.length < 1024) out.add(normPath(v)); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (typeof v === 'object') for (const x of Object.values(v as Record<string, unknown>)) walk(x, depth + 1);
  };
  walk(json, 0);
  return out;
}

/**
 * Что удалить. what = 'preview' — лёгкие копии (кроме нужных открытому проекту); 'derived' — служебные копии,
 * на которые не ссылается ни один известный проект (открытый, недавние, черновики, автосохранение).
 * Свежие файлы не трогаем: они могут быть ещё в работе.
 */
export function planCleanup(files: CacheFile[], keep: Set<string>, what: CacheGroup, now: number): CacheFile[] {
  if (what === 'kept') return [];
  return files.filter((f) => {
    if (groupOf(f.dir) !== what) return false;
    if (keep.has(normPath(f.path))) return false;
    const age = now - f.mtime;
    const min = what === 'derived' ? DERIVED_AGE : (MIN_AGE[f.dir] ?? DEFAULT_PREVIEW_AGE);
    return age >= min;
  });
}

export function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  if (n < 1024 ** 3) return `${Math.round(n / 1024 / 1024)} МБ`;
  return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} ГБ`;
}
