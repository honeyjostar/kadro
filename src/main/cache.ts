// Кэш на диске: размер по группам и очистка (план — в shared/cache.ts).
import fs from 'node:fs';
import path from 'node:path';
import { collectPaths, planCleanup, summarize, type CacheFile, type CacheGroup, type CacheInfo } from '../shared/cache';
import { dataDir } from './bins';

const root = () => path.join(dataDir(), 'cache');

/** Все файлы кэша: путь, размер, время изменения и папка верхнего уровня (proxy, thumbs, ai…). */
export function listCache(): CacheFile[] {
  const out: CacheFile[] = [];
  const base = root();
  if (!fs.existsSync(base)) return out;
  const walk = (dir: string, top: string, depth: number) => {
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth < 6) walk(p, top, depth + 1); continue; }
      try {
        const st = fs.statSync(p);
        out.push({ path: p, size: st.size, mtime: st.mtimeMs, dir: top });
      } catch { /* пропал между чтением папки и файла */ }
    }
  };
  for (const e of fs.readdirSync(base, { withFileTypes: true })) if (e.isDirectory()) walk(path.join(base, e.name), e.name, 0);
  return out;
}

export function cacheInfo(): CacheInfo { return summarize(listCache()); }

/** Проекты, которые знает Kadro: недавние, черновики, автосохранение — их служебные копии не удаляем. */
export function knownProjectPaths(recent: string[]): Set<string> {
  const refs = new Set<string>();
  const files = [...recent, path.join(dataDir(), 'autosave.kadro')];
  const drafts = path.join(dataDir(), 'drafts');
  try { for (const f of fs.readdirSync(drafts)) if (f.endsWith('.kadro')) files.push(path.join(drafts, f)); } catch { /* черновиков нет */ }
  for (const f of files) {
    try { collectPaths(JSON.parse(fs.readFileSync(f, 'utf8')), refs); } catch { /* файл пропал или битый */ }
  }
  return refs;
}

/** Удалить ненужное из группы. keep — пути, на которые ссылаются проекты. Возвращает, сколько освобождено. */
export function clearCache(what: CacheGroup, keep: Set<string>, now = Date.now()): { freed: number; removed: number } {
  const plan = planCleanup(listCache(), keep, what, now);
  let freed = 0;
  let removed = 0;
  for (const f of plan) {
    try { fs.rmSync(f.path, { force: true }); freed += f.size; removed++; } catch { /* занят — пропускаем */ }
  }
  // пустые папки (миниатюры, задания экспорта) — тоже прочь
  const base = root();
  const prune = (dir: string): boolean => {
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
    let empty = true;
    for (const e of ents) {
      if (e.isDirectory() && prune(path.join(dir, e.name))) { try { fs.rmdirSync(path.join(dir, e.name)); } catch { empty = false; } } else empty = false;
    }
    return empty;
  };
  if (fs.existsSync(base)) for (const e of fs.readdirSync(base, { withFileTypes: true })) if (e.isDirectory()) prune(path.join(base, e.name));
  return { freed, removed };
}

/** При запуске: временные файлы прошлых сеансов (старше часа) — удалить. */
export function cleanTempOnStart(): void {
  try {
    const plan = planCleanup(listCache().filter((f) => f.dir === 'tmp' || f.dir === 'export'), new Set(), 'preview', Date.now());
    for (const f of plan) { try { fs.rmSync(f.path, { force: true }); } catch { /* занят */ } }
  } catch { /* не критично */ }
}
