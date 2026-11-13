// Знакомство при первом запуске: уровень, что монтирует, откуда узнал о Kadro.
// Ответы хранятся только на компьютере. Отправка (анонимно, без cookies) — только с согласия и только если
// задан счётчик SURVEY_COUNTER (GoatCounter); пока он пустой, галочки согласия нет вовсе.
import type { Level } from './uiMode';

export const SURVEY_COUNTER = ''; // например 'kadro' → https://kadro.goatcounter.com

export type EditKind = 'shorts' | 'youtube' | 'games' | 'family' | 'work' | 'study' | 'other';
export type Source = 'tiktok' | 'youtube' | 'telegram' | 'vk' | 'friends' | 'search' | 'github' | 'other';
export interface About { level?: Level; edit: EditKind[]; source?: Source; consent?: boolean; from?: 'installer' }

/** Формат по умолчанию из того, что человек монтирует: только шортсы — 9:16, только YouTube — 16:9. */
export function formatFor(edit: EditKind[]): '9:16' | '16:9' | null {
  const s = edit.includes('shorts'), y = edit.includes('youtube');
  if (s && !y) return '9:16';
  if (y && !s) return '16:9';
  return null;
}

/** Адреса для счётчика: по одному событию на ответ, без личных данных. */
export function surveyHits(a: About, counter = SURVEY_COUNTER): string[] {
  if (!counter || !a.consent) return [];
  const ev = [a.level && `level/${a.level}`, ...a.edit.map((e) => `edit/${e}`), a.source && `source/${a.source}`].filter(Boolean) as string[];
  return ev.map((e) => `https://${counter}.goatcounter.com/count?p=${encodeURIComponent(`/kadro/hello/${e}`)}&e=true`);
}

const LEVELS: Level[] = ['new', 'some', 'pro'];
const EDITS: EditKind[] = ['shorts', 'youtube', 'games', 'family', 'work', 'study', 'other'];
const SOURCES: Source[] = ['tiktok', 'youtube', 'telegram', 'vk', 'friends', 'search', 'github', 'other'];
/** Ответы из файла настроек (их пишет установщик) → только известные значения; нет ответов — null. */
export function cleanAbout(raw: unknown): About | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: About = { edit: Array.isArray(r.edit) ? [...new Set(r.edit.filter((x): x is EditKind => EDITS.includes(x as EditKind)))] : [] };
  if (LEVELS.includes(r.level as Level)) out.level = r.level as Level;
  if (SOURCES.includes(r.source as Source)) out.source = r.source as Source;
  if (r.from === 'installer') out.from = 'installer';
  return out;
}
