// Избранное и недавние в окне: читаются из настроек окна при запуске, сохраняются при каждом изменении.
import { create } from 'zustand';
import { cleanFavs, noteRecent, toggleFav, type FavKind, type FavState } from '../shared/favs';

const KEY = 'kadro.favs';

function load(): FavState {
  try { return cleanFavs(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return cleanFavs(null); }
}
function save(s: FavState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* хранилище недоступно — помним до закрытия */ }
}

interface FavStore {
  s: FavState;
  toggle: (k: FavKind, id: string) => void;
  used: (k: FavKind, id: string) => void;
}

export const useFavs = create<FavStore>((set, get) => ({
  s: load(),
  toggle: (k, id) => { const s = toggleFav(get().s, k, id); save(s); set({ s }); },
  used: (k, id) => { const prev = get().s; const s = noteRecent(prev, k, id); if (s !== prev) { save(s); set({ s }); } },
}));

/** Отметить эффект / переход / фильтр как недавно использованный. */
export const noteUsed = (k: FavKind, id: string): void => useFavs.getState().used(k, id);
