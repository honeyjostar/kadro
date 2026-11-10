// «Скоро в Kadro»: разбор docs/next.json — лишнее отбрасывается, кривой файл — виджета нет.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { nextText, parseNext } from '../../src/shared/next';

describe('скоро в Kadro', () => {
  it('файл в репозитории — правильный', () => {
    const n = parseNext(JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/next.json'), 'utf8')));
    expect(n).not.toBeNull();
    expect(n!.ru.items.length).toBeGreaterThan(0);
    expect(n!.en?.items.length).toBe(n!.ru.items.length);
  });
  it('без заголовка, пунктов или id — не показываем; show: false — тоже', () => {
    expect(parseNext(null)).toBeNull();
    expect(parseNext({ id: 'x', ru: { title: 'Т', items: [] } })).toBeNull();
    expect(parseNext({ ru: { title: 'Т', items: ['а'] } })).toBeNull();
    expect(parseNext({ id: 'x', show: false, ru: { title: 'Т', items: ['а'] } })).toBeNull();
  });
  it('не больше 6 пунктов, длинное обрезается, мусор отбрасывается', () => {
    const n = parseNext({ id: 'x', ru: { title: 'Т'.repeat(200), when: 'скоро', items: ['а', 5, '', ...Array(10).fill('б'.repeat(300))] } })!;
    expect(n.ru.title.length).toBe(80);
    expect(n.ru.items.length).toBe(6);
    expect(n.ru.items[0]).toBe('а');
    expect(n.ru.items[1].length).toBe(140);
    expect(n.en).toBeUndefined();
  });
  it('язык: английский есть — английский, нет — русский', () => {
    const n = parseNext({ id: 'x', ru: { title: 'Р', items: ['р'] }, en: { title: 'E', items: ['e'] } })!;
    expect(nextText(n, 'en').title).toBe('E');
    expect(nextText(n, 'ru').title).toBe('Р');
    expect(nextText({ ...n, en: undefined }, 'en').title).toBe('Р');
  });
});
