import { describe, expect, it } from 'vitest';
import { capitalizeSegments, speechToKeepRanges, tokensToWords, wordsToCues } from '../../src/shared/captions';

describe('субтитры', () => {
  it('символы GigaAM → слова с таймкодами', () => {
    const tokens = ['п', 'р', 'и', 'в', 'е', 'т', ' ', 'м', 'и', 'р'];
    const ts = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5, 0.55, 0.6];
    const w = tokensToWords(tokens, ts, 10, 11);
    expect(w.map((x) => x.text)).toEqual(['привет', 'мир']);
    expect(w[0].start).toBe(10);
    expect(w[1].start).toBe(10.5);
    expect(w[0].end).toBeLessThanOrEqual(10.5);
    expect(w[1].end).toBeLessThanOrEqual(11);
  });

  it('BPE-кусочки Parakeet → слова', () => {
    const tokens = [' Hel', 'lo', ' wor', 'ld', '.'];
    const ts = [0, 0.1, 0.4, 0.5, 0.6];
    const w = tokensToWords(tokens, ts, 0, 1);
    expect(w.map((x) => x.text)).toEqual(['Hello', 'world.']);
    expect(w[1].end).toBeLessThan(0.9); // точка (0.6) не растягивает слово: 0.5 + 0.35
  });

  it('строки субтитров: ограничение длины, паузы, точки', () => {
    const words = 'раз два три четыре пять шесть семь восемь'.split(' ').map((t, i) => ({ text: t, start: i * 0.3, end: i * 0.3 + 0.25 }));
    const cues = wordsToCues(words, { maxChars: 100, maxWords: 3, maxDuration: 10, pauseSplit: 1 });
    expect(cues).toHaveLength(3);
    expect(cues.every((c) => c.text.split(' ').length <= 3)).toBe(true);
    expect(cues.map((c) => c.text).join(' ')).toBe('раз два три четыре пять шесть семь восемь');
    for (let i = 0; i < cues.length - 1; i++) expect(cues[i].end).toBeLessThanOrEqual(cues[i + 1].start + 1e-9);

    // длинная фраза делится ровно, без «висячего» одного слова
    const w3 = 'Привет это тестовый ролик для видеоредактора'.split(' ').map((t, i) => ({ text: t, start: i * 0.4, end: i * 0.4 + 0.35 }));
    const c3 = wordsToCues(w3).map((c) => c.text);
    expect(c3).toEqual(['Привет это тестовый', 'ролик для видеоредактора']);

    const w2 = [{ text: 'Привет.', start: 0, end: 0.4 }, { text: 'Как', start: 0.5, end: 0.6 }, { text: 'дела', start: 2, end: 2.3 }];
    expect(wordsToCues(w2).map((c) => c.text)).toEqual(['Привет.', 'Как', 'дела']);
  });

  it('заглавные буквы в начале фраз, если модель пишет строчными', () => {
    const w = [{ text: 'привет', start: 0, end: 1 }, { text: 'мир', start: 1, end: 2 }, { text: 'пока', start: 3, end: 4 }];
    expect(capitalizeSegments(w, new Set([0, 2])).map((x) => x.text)).toEqual(['Привет', 'мир', 'Пока']);
    const w2 = [{ text: 'Hello', start: 0, end: 1 }, { text: 'there', start: 1, end: 2 }];
    expect(capitalizeSegments(w2, new Set([1])).map((x) => x.text)).toEqual(['Hello', 'there']);
  });

  it('речь → отрезки для «убрать паузы»: запас и склейка близких', () => {
    const r = speechToKeepRanges([[1, 2], [2.3, 3], [5, 6]], 0, 10, 0.1, 0.35);
    expect(r).toEqual([[0.9, 3.1], [4.9, 6.1]]);
    expect(speechToKeepRanges([[0, 1]], 0.5, 10)).toEqual([[0.5, 1.15]]);
  });
});
