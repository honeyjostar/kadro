// Обложка: оценка кадров (резкость, яркость, цвет), выбор разных кадров, выделенное слово, раскладка заголовка.
import { describe, expect, it } from 'vitest';
import { accentWord, frameScore, frameStats, layoutTitle, pickFrames } from '../../src/shared/cover';

const W = 64, H = 36;
function img(fn: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const a = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = fn(x, y); a.set([r, g, b, 255], (y * W + x) * 4); }
  return a;
}
const sharp = img((x, y) => ((x >> 2) + (y >> 2)) % 2 ? [230, 180, 40] : [30, 60, 160]);
const blurry = img((x) => { const v = 90 + x; return [v, v, v]; });
const black = img(() => [4, 4, 4]);

describe('обложка', () => {
  it('резкий цветной кадр лучше размытого серого, чёрный — хуже всех', () => {
    const s = frameScore(frameStats(sharp, W, H)), b = frameScore(frameStats(blurry, W, H)), k = frameScore(frameStats(black, W, H));
    expect(s).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(k);
    expect(frameStats(sharp, W, H).color).toBeGreaterThan(frameStats(blurry, W, H).color);
  });

  it('из почти одинаковых кадров берётся один, дальше — непохожий', () => {
    const fr = [
      { id: 'a', stats: frameStats(sharp, W, H) },
      { id: 'a2', stats: frameStats(sharp, W, H) },
      { id: 'b', stats: frameStats(blurry, W, H) },
    ];
    expect(pickFrames(fr, 2).map((x) => x.id)).toEqual(['a', 'b']);
    expect(pickFrames(fr, 3)).toHaveLength(3);
  });

  it('выделенное слово: *отмеченное* или самое длинное', () => {
    expect(accentWord('Как я *смонтировал* ролик')).toEqual({ words: ['Как', 'я', 'смонтировал', 'ролик'], accent: 2 });
    expect(accentWord('Бесплатный монтаж без подписки').accent).toBe(0);
    expect(accentWord('Да, это я').accent).toBe(-1);
  });

  it('заголовок — в заданные строки и высоту, шрифт как можно крупнее', () => {
    const measure = (t: string, size: number) => t.length * size * 0.6;
    const words = 'Kadro бесплатный видеоредактор для всех'.split(' ');
    const r = layoutTitle(words, 1000, 500, 3, measure);
    expect(r.lines.length).toBeLessThanOrEqual(3);
    expect(r.lines.flat()).toEqual([0, 1, 2, 3, 4]);
    for (const l of r.lines) expect(measure(l.map((i) => words[i]).join(' '), r.size)).toBeLessThanOrEqual(1000);
    expect(r.lines.length * r.size * 1.08).toBeLessThanOrEqual(500);
    // строкой выше — шрифт уже не помещается
    expect(layoutTitle(words, 1000, 500, 3, measure).size).toBeGreaterThan(layoutTitle(words, 1000, 500, 1, measure).size);
  });
});
