import { describe, expect, it } from 'vitest';
import { groupCues, guessLang, routeFor, splitTranslation, targetsFrom } from '../../src/shared/translate';

const have = new Set(['ru-en', 'en-ru', 'en-de', 'de-en', 'en-uk']);

describe('перевод субтитров: языки и фразы', () => {
  it('путь перевода: прямо или через английский', () => {
    expect(routeFor('ru', 'en', have)).toEqual(['ru-en']);
    expect(routeFor('ru', 'de', have)).toEqual(['ru-en', 'en-de']);
    expect(routeFor('de', 'uk', have)).toEqual(['de-en', 'en-uk']);
    expect(routeFor('uk', 'ru', have)).toBeNull();
    expect(routeFor('ru', 'ru', have)).toEqual([]);
    expect(targetsFrom('ru', have)).toEqual(['en', 'uk', 'de']);
  });

  it('язык по буквам', () => {
    expect(guessLang('Привет, как дела?')).toBe('ru');
    expect(guessLang('Привіт, як справи? Їжак і ґанок')).toBe('uk');
    expect(guessLang('Hello there, how are you?')).toBe('en');
    expect(guessLang('Schöne Grüße aus München, wir fahren über die Brücke')).toBe('de');
    expect(guessLang('你好，今天天气很好')).toBe('zh');
    expect(guessLang('こんにちは、元気ですか')).toBe('ja');
    expect(guessLang('')).toBe('en');
  });

  it('обрывки фраз склеиваются, точка или долгая пауза — граница', () => {
    const c = (text: string, start: number, end: number) => ({ text, start, end });
    expect(groupCues([
      c('Сегодня мы поедем', 0, 1), c('на море и будем', 1.1, 2), c('купаться весь день.', 2.1, 3),
      c('Потом обед.', 3.2, 4), c('А это', 4.1, 4.5), c('после паузы', 7, 8),
    ])).toEqual([[0, 1, 2], [3], [4], [5]]);
    // не больше 4 субтитров в фразе
    const many = Array.from({ length: 6 }, (_, i) => c(`слово ${i}`, i, i + 0.9));
    expect(groupCues(many)).toEqual([[0, 1, 2, 3], [4, 5]]);
  });

  it('перевод раскладывается по субтитрам пропорционально длине, лучше после запятой', () => {
    expect(splitTranslation('Today we will go to the sea and swim all day.', [18, 15, 19]))
      .toEqual(['Today we will go', 'to the sea', 'and swim all day.']);
    expect(splitTranslation('Well, then we go home', [6, 15])).toEqual(['Well,', 'then we go home']);
    expect(splitTranslation('Hi', [5, 5])).toEqual(['Hi', '']);
    expect(splitTranslation('今天天气很好我们去海边', [5, 5])).toEqual(['今天天气很', '好我们去海边']);
    expect(splitTranslation('  one   line ', [3])).toEqual(['one line']);
  });
});
