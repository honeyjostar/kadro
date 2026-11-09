// Нарезка в шортсы: поиск лучших моментов по речи и сборка вертикального проекта.
import { describe, expect, it } from 'vitest';
import { findMoments, loudnessFrom, phrasesOf, shortProject, titleOf } from '../../src/shared/shorts';
import { BLOG_STYLES } from '../../src/shared/blogCaptions';
import { mainTrack } from '../../src/shared/timeline';
import type { MediaAsset, MediaClip, TextClip, Word } from '../../src/shared/types';

/** Речь: фразы с заданным темпом (слов в секунду) и паузами между ними. */
function speech(parts: { at: number; text: string; wps?: number }[]): Word[] {
  const out: Word[] = [];
  for (const p of parts) {
    const step = 1 / (p.wps ?? 2.5);
    p.text.split(' ').forEach((w, i) => out.push({ text: w, start: p.at + i * step, end: p.at + i * step + step * 0.85 }));
  }
  return out;
}
const boring = (at: number, n = 6) => Array.from({ length: n }, (_, i) => ({ at: at + i * 6, text: 'ну вот так мы тут сидим.', wps: 1.1 }));

describe('фразы', () => {
  it('граница — пауза или знак конца предложения', () => {
    const ph = phrasesOf(speech([{ at: 0, text: 'Привет всем. Сегодня важный день' }, { at: 5, text: 'начнём' }]));
    expect(ph.map((p) => p.text)).toEqual(['Привет всем.', 'Сегодня важный день', 'начнём']);
    expect(ph[0].ends).toBe(true);
    expect(ph[1].ends).toBe(true); // пауза больше 0,8 с
  });
  it('заголовок — заглавными, до 40 знаков, без хвостовой запятой', () => {
    expect(titleOf('Почему никто не говорит про это,')).toBe('ПОЧЕМУ НИКТО НЕ ГОВОРИТ ПРО ЭТО');
    expect(titleOf('один два три четыре пять шесть семь восемь девять десять').length).toBeLessThanOrEqual(40);
  });
});

describe('лучшие моменты', () => {
  const good = [
    { at: 120, text: 'Почему никто не говорит что монтаж занимает 5 минут?' },
    { at: 124, text: 'Я покажу секрет который сэкономил мне 100 часов!' },
    { at: 128, text: 'Это реально работает и это просто огонь!' },
    { at: 132, text: 'Смотри как это делается за три шага.' },
    { at: 136, text: 'Первый шаг кидаешь клипы в программу.' },
    { at: 140, text: 'Второй шаг выбираешь музыку и стиль.' },
    { at: 144, text: 'Третий шаг жмёшь собрать и всё готово!' },
  ];
  const words = speech([...boring(0, 18), ...good, ...boring(160, 18)]);

  it('крючок, плотная речь и эмоции — выше скучного куска', () => {
    const ms = findMoments(words, { min: 15, max: 35, count: 3 });
    expect(ms.length).toBeGreaterThan(0);
    const best = ms[0];
    expect(best.start).toBeGreaterThanOrEqual(119.9);
    expect(best.start).toBeLessThan(121);
    expect(best.hook.startsWith('Почему никто')).toBe(true);
    expect(best.reasons).toEqual(expect.arrayContaining(['question', 'dense']));
    expect(best.title).toBe(titleOf(best.hook));
  });
  it('длина в заданных пределах, моменты не пересекаются', () => {
    for (const len of [{ min: 15, max: 35 }, { min: 30, max: 60 }]) {
      const ms = findMoments(words, { ...len, count: 5 });
      for (const m of ms) {
        expect(m.end - m.start).toBeGreaterThanOrEqual(len.min);
        expect(m.end - m.start).toBeLessThanOrEqual(len.max);
      }
      for (const a of ms) for (const b of ms) if (a !== b) expect(a.end <= b.start || b.end <= a.start).toBe(true);
    }
  });
  it('не начинает посреди фразы', () => {
    const ms = findMoments(words, { min: 15, max: 35, count: 5 });
    const ph = phrasesOf(words);
    for (const m of ms) expect(ph.some((p) => Math.abs(p.start - m.start) < 1e-6)).toBe(true);
  });
  it('громкость поднимает момент', () => {
    const flat = speech(boring(0, 40));
    const peaks = Array.from({ length: 240 }, (_, i) => (i >= 120 && i < 150 ? 0.9 : 0.3)); // 240 с, громко на 120–150 с
    const loud = loudnessFrom(peaks, 240)!;
    expect(loud(120, 150)).toBeGreaterThan(2);
    const ms = findMoments(flat, { min: 15, max: 35, count: 1, loud });
    expect(ms[0].start).toBeGreaterThanOrEqual(100);
    expect(ms[0].reasons).toContain('loud');
    expect(loudnessFrom([], 10)).toBeUndefined();
  });
  it('без речи — пусто', () => {
    expect(findMoments([], { min: 15, max: 35, count: 3 })).toEqual([]);
  });
});

describe('проект шортса', () => {
  const asset: MediaAsset = {
    id: 'a1', kind: 'video', path: '/v/stream.mp4', previewPath: '/v/stream.mp4', name: 'stream.mp4', duration: 3600, width: 1920, height: 1080,
    fps: 30, hasVideo: true, hasAudio: true, size: 1, rotation: 0, proxy: 'none',
  };
  it('9:16, кусок видео на весь кадр, субтитры от начала куска, крючок сверху', () => {
    const words = speech([{ at: 600, text: 'Почему никто не говорит про это? Сейчас расскажу всё по порядку!' }]);
    const m = findMoments(words, { min: 3, max: 35, count: 1 })[0];
    const p = shortProject(asset, m, 2, BLOG_STYLES[1]);
    expect(p.name.startsWith('Шортс 2 — Почему никто')).toBe(true);
    expect(p.settings.aspect).toBe('9:16');
    const main = mainTrack(p).clips[0] as MediaClip;
    expect(main.in).toBeCloseTo(m.start - 0.25, 3);
    expect(main.out).toBeCloseTo(m.end + 0.25, 3);
    expect(main.fit).toBe('cover');
    const texts = p.tracks.flatMap((t) => t.clips).filter((c): c is TextClip => c.type === 'text');
    const caps = texts.filter((c) => c.role === 'caption');
    expect(caps.length).toBeGreaterThan(1);
    expect(Math.abs(caps[0].start - 0.25)).toBeLessThan(0.1);
    expect(caps[0].style.font).toBe(BLOG_STYLES[1].style.font);
    const title = texts.find((c) => c.role !== 'caption')!;
    expect(title.text).toBe(m.title);
    expect(title.y).toBe(0.2);
    expect(title.start).toBe(0);
  });
});
