// Поиск по всему (Ctrl+K): регистр, «ё», раскладка, порядок результатов.
import { describe, expect, it } from 'vitest';
import { norm, scoreItem, searchItems, swapLayout, type SearchItem } from '../../src/shared/search';

const items: SearchItem[] = [
  { id: 'fx-glitch', label: 'Глитч', group: 'Эффекты' },
  { id: 'tr-glitch', label: 'Глитч-память', group: 'Переходы' },
  { id: 'cmd-export', label: 'Экспорт видео', group: 'Команды', keywords: ['сохранить mp4'] },
  { id: 'fx-film', label: 'Плёнка', group: 'Эффекты', keywords: ['зерно, царапины'] },
  { id: 'filter-film', label: 'Киноплёнка', group: 'Фильтры' },
  { id: 'cmd-split', label: 'Разрезать у курсора', group: 'Команды' },
];

describe('поиск по всему', () => {
  it('не та раскладка: латиница ⇄ кириллица по клавишам', () => {
    expect(swapLayout('ukbn')).toBe('глит');
    expect(swapLayout('ghjdthrf')).toBe('проверка');
    expect(swapLayout('рщьу')).toBe('home');
  });

  it('регистр, «ё» и знаки не мешают', () => {
    expect(norm('  Плёнка — ЗЕРНО!  ')).toBe('пленка зерно');
    expect(searchItems('пленка', items)[0].id).toBe('fx-film');
  });

  it('начало слова выше середины, точное совпадение — выше всех', () => {
    const r = searchItems('глитч', items).map((x) => x.id);
    expect(r[0]).toBe('fx-glitch');
    expect(r).toContain('tr-glitch');
    expect(searchItems('пленк', items).map((x) => x.id)).toEqual(['fx-film', 'filter-film']);
  });

  it('все слова запроса должны найтись; ищем и по подсказке', () => {
    expect(searchItems('экспорт видео', items).map((x) => x.id)).toEqual(['cmd-export']);
    expect(searchItems('экспорт звук', items)).toEqual([]);
    expect(searchItems('mp4', items).map((x) => x.id)).toEqual(['cmd-export']);
    expect(searchItems('царапины', items).map((x) => x.id)).toEqual(['fx-film']);
  });

  it('запрос в английской раскладке находит русское', () => {
    expect(searchItems('hfphtpfnm', items).map((x) => x.id)).toEqual(['cmd-split']);
  });

  it('избранное поднимается выше при равном совпадении; пустой запрос ничего не находит', () => {
    const fav = items.map((x) => (x.id === 'tr-glitch' ? { ...x, boost: 3 } : x));
    expect(searchItems('глит', fav)[0].id).toBe('tr-glitch');
    expect(scoreItem('', items[0])).toBe(0);
  });
});
