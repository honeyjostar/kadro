// Экран проектов (как в CapCut): имена файлов при переименовании и копировании, поиск и порядок.
import { tx } from './i18n';

/** Имя проекта → имя файла без запрещённых в Windows символов. Пустое — «Проект». */
export function safeFileName(name: string): string {
  const s = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80);
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s) ? `${s}_` : s || tx('Проект');
}

/** Имя для копии: «Имя (копия)», «Имя (копия 2)»… — первое, которого ещё нет. */
export function copyName(name: string, taken: (n: string) => boolean): string {
  const base = name.replace(/ \(копия(?: \d+)?\)$/, '');
  for (let i = 1; i < 1000; i++) {
    const n = tx('{0} (копия{1})', base, i > 1 ? ` ${i}` : '');
    if (!taken(n)) return n;
  }
  return tx('{0} (копия {1})', base, Date.now());
}

export type ProjectSort = 'date' | 'name';
export interface ProjectLike { name: string; mtime: number; path: string }

/** Поиск по имени (без учёта регистра и «ё») и порядок: сначала новые или по алфавиту. */
export function filterProjects<T extends ProjectLike>(list: T[], query: string, sort: ProjectSort): T[] {
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
  const q = norm(query.trim());
  const out = q ? list.filter((p) => norm(p.name).includes(q)) : [...list];
  return sort === 'name' ? out.sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true })) : out.sort((a, b) => b.mtime - a.mtime);
}
