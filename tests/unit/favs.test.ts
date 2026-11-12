// Избранное и недавние эффекты, переходы, фильтры: порядок, лимиты, чтение испорченных настроек.
import { describe, expect, it } from 'vitest';
import { cleanFavs, emptyFavs, FAV_MAX, noteRecent, pickInOrder, RECENT_MAX, toggleFav } from '../../src/shared/favs';

describe('избранное и недавние', () => {
  it('звёздочка добавляет в начало и убирает повторным нажатием', () => {
    let s = toggleFav(emptyFavs(), 'fx', 'glitch');
    s = toggleFav(s, 'fx', 'vhs');
    expect(s.fav.fx).toEqual(['vhs', 'glitch']);
    s = toggleFav(s, 'fx', 'glitch');
    expect(s.fav.fx).toEqual(['vhs']);
    expect(s.fav.tr).toEqual([]);
  });

  it('недавние: последнее — первым, без повторов, не больше лимита', () => {
    let s = emptyFavs();
    for (let i = 0; i < RECENT_MAX + 3; i++) s = noteRecent(s, 'tr', `t${i}`);
    expect(s.recent.tr).toHaveLength(RECENT_MAX);
    expect(s.recent.tr[0]).toBe(`t${RECENT_MAX + 2}`);
    s = noteRecent(s, 'tr', 't5');
    expect(s.recent.tr[0]).toBe('t5');
    expect(s.recent.tr.filter((x) => x === 't5')).toHaveLength(1);
  });

  it('то же самое ещё раз — состояние не меняется (без лишних перерисовок)', () => {
    const s = noteRecent(emptyFavs(), 'filter', 'cinema');
    expect(noteRecent(s, 'filter', 'cinema')).toBe(s);
  });

  it('испорченные настройки читаются как пустые, лишнее отбрасывается', () => {
    expect(cleanFavs(null)).toEqual(emptyFavs());
    expect(cleanFavs('мусор')).toEqual(emptyFavs());
    const many = Array.from({ length: FAV_MAX + 10 }, (_, i) => `f${i}`);
    const s = cleanFavs({ fav: { fx: ['a', 'a', 5, '', 'b'], tr: many, x: ['z'] }, recent: { filter: 'не список' } });
    expect(s.fav.fx).toEqual(['a', 'b']);
    expect(s.fav.tr).toHaveLength(FAV_MAX);
    expect(s.recent.filter).toEqual([]);
  });

  it('элементы — в порядке избранного; удалённые (плагин стёрли) пропускаются', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(pickInOrder(list, ['c', 'gone', 'a'], (x) => x.id).map((x) => x.id)).toEqual(['c', 'a']);
  });
});
