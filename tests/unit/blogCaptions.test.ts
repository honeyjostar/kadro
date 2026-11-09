// Субтитры «как у блогеров»: ключевые слова, эмодзи, по 1–3 слова, готовые стили.
import { describe, expect, it } from 'vitest';
import { newProject, CAPTION_STYLE } from '../../src/shared/defaults';
import { setCaptions, type Cue } from '../../src/shared/timeline';
import { BLOG_STYLES, applyBlogStyle, captionLook, captionWords, emojiFor, keywordScore, markCues, restyleCaptions } from '../../src/shared/blogCaptions';
import { FONTS } from '../../src/shared/defaults';
import type { Project, TextClip, Word } from '../../src/shared/types';

const PHRASE = 'Я заработал 100000 рублей за месяц на своём видеоредакторе и это огонь';
function words(text: string, from = 0, step = 0.4): Word[] {
  return text.split(' ').map((w, i) => ({ text: w, start: from + i * step, end: from + i * step + step * 0.9 }));
}
function withCaptions(): Project {
  const ws = words(PHRASE, 1);
  const cue: Cue = { start: ws[0].start, end: ws[ws.length - 1].end, text: PHRASE, words: ws };
  return setCaptions(newProject('t'), [cue], CAPTION_STYLE, 0.7);
}
const caps = (p: Project) => p.tracks.flatMap((t) => t.clips).filter((c): c is TextClip => c.type === 'text' && c.role === 'caption');

describe('ключевые слова и эмодзи', () => {
  it('служебные слова — не ключевые; числа, длинные и «смысловые» — ключевые', () => {
    for (const w of ['и', 'это', 'на', 'за']) expect(keywordScore(w)).toBe(0);
    expect(keywordScore('100000')).toBeGreaterThanOrEqual(3);
    expect(keywordScore('видеоредакторе')).toBeGreaterThan(keywordScore('месяц'));
    expect(keywordScore('Москве')).toBeGreaterThan(keywordScore('москве')); // имя посреди фразы
    expect(keywordScore('Москве', true)).toBe(keywordScore('москве', true));
  });
  it('эмодзи по началу слова; короткие начала — только целым словом', () => {
    expect(emojiFor('рублей')).toBe('💰');
    expect(emojiFor('Огонь!')).toBe('🔥');
    expect(emojiFor('заработал')).toBe('💰');
    expect(emojiFor('огненный')).toBeUndefined(); // «огн» — короткое начало
    expect(emojiFor('стол')).toBeUndefined();
    expect(emojiFor('на')).toBeUndefined();
  });
  it('в субтитре не больше одного ключевого слова, эмодзи не чаще раза в 2,5 с', () => {
    const cues: Cue[] = [0, 1, 2, 3, 4].map((i) => {
      const ws = words('мои деньги растут', i * 1.2, 0.3);
      return { start: ws[0].start, end: ws[2].end, text: 'мои деньги растут', words: ws };
    });
    const out = markCues(cues, { keywords: true, emoji: true });
    for (const c of out) expect(c.words!.filter((w) => w.key).length).toBeLessThanOrEqual(1);
    const withEmoji = out.filter((c) => c.words!.some((w) => w.emoji)).map((c) => c.start);
    expect(withEmoji.length).toBeGreaterThan(1);
    for (let i = 1; i < withEmoji.length; i++) expect(withEmoji[i] - withEmoji[i - 1]).toBeGreaterThanOrEqual(2.5);
    expect(markCues(cues, { keywords: false, emoji: false }).every((c) => c.words!.every((w) => !w.key && !w.emoji))).toBe(true);
  });
});

describe('пересборка субтитров', () => {
  it('по 1, 2, 3 слова и строкой — слова и их время сохраняются', () => {
    const p = withCaptions();
    const before = captionWords(p).map((w) => [w.text, +w.start.toFixed(2)]);
    for (const g of ['1', '2', '3', 'line'] as const) {
      const q = restyleCaptions(p, { group: g });
      const n = Math.max(...caps(q).map((c) => c.words!.length));
      if (g !== 'line') expect(n).toBeLessThanOrEqual(Number(g));
      expect(captionLook(q)!.group).toBe(g === 'line' ? (n <= 3 ? captionLook(q)!.group : 'line') : g);
      expect(captionWords(q).map((w) => [w.text, +w.start.toFixed(2)])).toEqual(before);
    }
  });
  it('готовые стили: шрифт есть в программе, отметки и высота — как задумано', () => {
    const fonts = new Set(FONTS.map((f) => f.family));
    for (const s of BLOG_STYLES) {
      if (s.style.font) expect(fonts.has(s.style.font), s.style.font).toBe(true);
      const q = applyBlogStyle(withCaptions(), s, true);
      const cs = caps(q);
      expect(cs.length).toBeGreaterThan(0);
      const look = captionLook(q)!;
      expect(look.keywords).toBe(s.keywords && cs.some((c) => c.words!.some((w) => w.key)));
      if (!s.keywords) expect(cs.every((c) => c.words!.every((w) => !w.key))).toBe(true);
      if (!s.emoji) expect(cs.every((c) => c.words!.every((w) => !w.emoji))).toBe(true);
      expect(cs[0].style.font).toBe(s.style.font);
      expect(cs[0].y).toBe(s.group === 'line' ? 0.64 : 0.6);
      if (s.anim) expect(cs[0].anim?.in?.type).toBe(s.anim.type);
    }
    // «Хормози»: число и деньги отмечены, эмодзи у денег
    const h = caps(applyBlogStyle(withCaptions(), BLOG_STYLES.find((s) => s.id === 'hormozi')!, true));
    const all = h.flatMap((c) => c.words!);
    expect(all.find((w) => w.text === '100000')?.key).toBe(true);
    expect(all.some((w) => w.emoji === '💰')).toBe(true);
  });
  it('после другого стиля «Плашка» не оставляет цвет ключевых слов', () => {
    let p = applyBlogStyle(withCaptions(), BLOG_STYLES[0], false);
    expect(caps(p)[0].style.keyColor).toBeTruthy();
    p = applyBlogStyle(p, BLOG_STYLES.find((s) => s.id === 'boxword')!, false);
    expect(caps(p)[0].style.keyColor).toBeUndefined();
    expect(caps(p)[0].y).toBe(0.8);
  });
});
