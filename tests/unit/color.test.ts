import { describe, expect, it } from 'vitest';
import { applyColorToPixel, effectiveColor, ffmpegColorFilter, isIdentity } from '../../src/shared/color';
import { DEFAULT_COLOR } from '../../src/shared/defaults';
import { atempoChain } from '../../src/shared/exportGraph';

describe('цвет', () => {
  it('эталон совпадает с тем, что посчитал Chromium (brightness 1.2, contrast 1.3, saturate 1.5)', () => {
    // значение снято в Electron: ctx.filter='brightness(1.2) contrast(1.3) saturate(1.5)' на rgb(100,150,200)
    const px = applyColorToPixel([100, 150, 200], { b: 1.2, c: 1.3, s: 1.5, w: 0 });
    expect(Math.abs(px[0] - 84)).toBeLessThanOrEqual(1);
    expect(Math.abs(px[1] - 201)).toBeLessThanOrEqual(1);
    expect(px[2]).toBe(255);
  });

  it('без коррекции — пустой фильтр', () => {
    expect(isIdentity(effectiveColor(DEFAULT_COLOR))).toBe(true);
    expect(ffmpegColorFilter(effectiveColor(DEFAULT_COLOR))).toBe('');
  });

  it('пресет с силой 0 не меняет картинку', () => {
    expect(isIdentity(effectiveColor({ ...DEFAULT_COLOR, preset: 'drama', presetAmount: 0 }))).toBe(true);
  });

  it('ч/б даёт серый', () => {
    const e = effectiveColor({ ...DEFAULT_COLOR, preset: 'bw' });
    const [r, g, b] = applyColorToPixel([200, 50, 50], e);
    expect(Math.abs(r - g)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - b)).toBeLessThanOrEqual(1);
  });
});

describe('atempo', () => {
  it('раскладывает скорость на звенья 0.5..2', () => {
    expect(atempoChain(1)).toEqual([]);
    expect(atempoChain(2)).toEqual(['atempo=2']);
    expect(atempoChain(4)).toEqual(['atempo=2', 'atempo=2']);
    expect(atempoChain(0.25)).toEqual(['atempo=0.5', 'atempo=0.5']);
    expect(atempoChain(3)).toEqual(['atempo=2', 'atempo=1.5']);
  });
});
