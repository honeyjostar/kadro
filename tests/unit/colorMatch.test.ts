import { describe, expect, it } from 'vitest';
import { labStats, labToRgb, matchLut, rgbToLab, transferColor } from '../../src/shared/colorMatch';
import { parseCube } from '../../src/shared/grade';

const fill = (n: number, rgb: [number, number, number], jitter = 0) => {
  const a: number[] = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) a.push(Math.max(0, Math.min(255, rgb[k] + (i % 2 ? jitter : -jitter))));
  return a;
};

describe('цвет как у другого клипа', () => {
  it('Lab туда и обратно — тот же цвет', () => {
    for (const c of [[0.2, 0.5, 0.8], [1, 1, 1], [0, 0, 0], [0.9, 0.3, 0.1]] as [number, number, number][]) {
      const back = labToRgb(...rgbToLab(...c));
      back.forEach((v, i) => expect(v).toBeCloseTo(c[i], 3));
    }
  });
  it('тёплый кадр-образец делает холодный клип теплее, средний цвет переносится', () => {
    const cold = labStats(fill(200, [90, 120, 200], 30));
    const warm = labStats(fill(200, [210, 140, 80], 30));
    const out = transferColor([90 / 255, 120 / 255, 200 / 255], cold, warm);
    expect(out[0]).toBeGreaterThan(out[2]);              // красного больше, чем синего
    const want = [210, 140, 80].map((v) => v / 255);
    out.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThan(0.06));
  });
  it('серый образец не раздувает цвет: разброс ограничен', () => {
    const vivid = labStats(fill(200, [200, 40, 40], 40));
    const grey = labStats(fill(200, [128, 128, 128], 0));
    const out = transferColor([1, 0, 0], vivid, grey);
    expect(Math.max(...out) - Math.min(...out)).toBeLessThan(0.6);
  });
  it('LUT читается как обычный .cube', () => {
    const s = labStats(fill(50, [100, 100, 100], 20));
    const lut = parseCube(matchLut(s, s, 'Как у «Горы»', 9));
    expect(lut.size).toBe(9);
    expect(lut.title).toContain('Горы');
  });
});
