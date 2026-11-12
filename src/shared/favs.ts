// Избранное и недавние: эффекты, переходы и фильтры, которыми человек пользуется чаще, — под рукой.
// Хранится в настройках окна (не в проекте): у каждого свои любимые.

export type FavKind = 'fx' | 'tr' | 'filter';
export const FAV_KINDS: FavKind[] = ['fx', 'tr', 'filter'];
export interface FavState { fav: Record<FavKind, string[]>; recent: Record<FavKind, string[]> }

/** Сколько недавних помним в каждом списке. */
export const RECENT_MAX = 8;
/** Больше избранного не держим — список должен оставаться коротким. */
export const FAV_MAX = 60;

export const emptyFavs = (): FavState => ({ fav: { fx: [], tr: [], filter: [] }, recent: { fx: [], tr: [], filter: [] } });

/** В избранное или из избранного; новое — в начало. */
export function toggleFav(s: FavState, k: FavKind, id: string): FavState {
  const cur = s.fav[k];
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur].slice(0, FAV_MAX);
  return { ...s, fav: { ...s.fav, [k]: next } };
}

/** Отметить, что пользовались: в начало недавних, без повторов, не больше RECENT_MAX. */
export function noteRecent(s: FavState, k: FavKind, id: string): FavState {
  if (!id) return s;
  const next = [id, ...s.recent[k].filter((x) => x !== id)].slice(0, RECENT_MAX);
  if (next.length === s.recent[k].length && next.every((x, i) => x === s.recent[k][i])) return s;
  return { ...s, recent: { ...s.recent, [k]: next } };
}

/** Прочитанное из хранилища — только строки нужных списков; всё лишнее и битое отбрасываем. */
export function cleanFavs(raw: unknown): FavState {
  const out = emptyFavs();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<Record<'fav' | 'recent', Partial<Record<FavKind, unknown>>>>;
  for (const part of ['fav', 'recent'] as const) {
    for (const k of FAV_KINDS) {
      const v = r[part]?.[k];
      if (!Array.isArray(v)) continue;
      const ids = [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 120))];
      out[part][k] = ids.slice(0, part === 'fav' ? FAV_MAX : RECENT_MAX);
    }
  }
  return out;
}

/** Элементы списка в порядке ids (которых нет в списке — пропускаем: плагин удалили и т. п.). */
export function pickInOrder<T>(list: T[], ids: string[], idOf: (x: T) => string): T[] {
  const by = new Map(list.map((x) => [idOf(x), x]));
  return ids.map((id) => by.get(id)).filter((x): x is T => x !== undefined);
}
