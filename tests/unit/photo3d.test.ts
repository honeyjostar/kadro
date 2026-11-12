// 3D-фото: нормировка глубины, движение камеры, карты сдвига и сдвиг картинки — одной формулой.
import { describe, expect, it } from 'vitest';
import { displaceMaps, displaceRgba, MAX_SHIFT, motionAt, normalizeDepth, photo3dWork } from '../../src/shared/photo3d';

describe('3D-фото', () => {
  it('рабочий размер — до 1280 по длинной стороне', () => {
    expect(photo3dWork(4000, 3000)).toEqual({ w: 1280, h: 960 });
    expect(photo3dWork(512, 512)).toEqual({ w: 512, h: 512 });
  });

  it('глубина нормируется по процентилям: выбросы не съедают диапазон', () => {
    const d = new Float32Array(1000).map((_, i) => i / 1000);
    d[0] = -50; d[999] = 1e4;
    const g = normalizeDepth(d);
    expect(g[500]).toBeGreaterThan(110); expect(g[500]).toBeLessThan(145);
    expect(g[0]).toBe(0); expect(g[999]).toBe(255);
  });

  it('движение: наезд растёт к концу, облёт — по кругу, «проплыть» — слева направо', () => {
    expect(motionAt('dolly', 1, 0).z).toBe(0);
    expect(motionAt('dolly', 1, 1).z).toBeCloseTo(0.14);
    const o0 = motionAt('orbit', 1, 0), o25 = motionAt('orbit', 1, 0.25);
    expect(o0.px).toBeCloseTo(0); expect(o25.px).toBeCloseTo(0.045);
    expect(motionAt('swing', 1, 0).px).toBeCloseTo(-0.05);
    expect(motionAt('swing', 1, 1).px).toBeCloseTo(0.05);
  });

  it('ближнее сдвигается сильнее дальнего; карта = 128 + сдвиг; предел сдвига', () => {
    const W = 200, H = 100;
    const depth = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) depth[y * W + x] = x >= 100 ? 255 : 0; // справа — близко
    const mx = new Uint8Array(W * H), my = new Uint8Array(W * H);
    displaceMaps(depth, W, H, { z: 0, e: 0, px: 0.1, py: 0 }, mx, my);
    expect(mx[50 * W + 20] - 128).toBe(-10);  // дальнее: (0 − 0.5)·0.1·200
    expect(mx[50 * W + 150] - 128).toBe(10);  // ближнее
    expect(my[50 * W + 20]).toBe(128);
    // наезд: ближнее у края раздвигается от центра (берётся ближе к центру)
    displaceMaps(depth, W, H, { z: 0.2, e: 0, px: 0, py: 0 }, mx, my);
    expect(mx[50 * W + 190] - 128).toBeLessThan(-10);
    expect(mx[50 * W + 20]).toBe(128);
    // огромный сдвиг упирается в предел
    displaceMaps(depth, W, H, { z: 0, e: 0, px: 5, py: 0 }, mx, my);
    expect(mx[50 * W + 150]).toBe(128 + MAX_SHIFT);
  });

  it('сдвиг картинки в превью — по той же формуле, что карты экспорта', () => {
    const W = 64, H = 32;
    const depth = new Uint8Array(W * H).map((_, i) => ((i % W) * 4) & 255);
    const src = new Uint8ClampedArray(W * H * 4).map((_, i) => (i * 7) & 255);
    const dst = new Uint8ClampedArray(W * H * 4);
    const cam = motionAt('orbit', 0.8, 0.3);
    displaceRgba(src, dst, depth, W, H, cam, MAX_SHIFT);
    const mx = new Int16Array(W * H), my = new Int16Array(W * H);
    displaceMaps(depth, W, H, cam, mx, my, MAX_SHIFT, 0);
    for (const [x, y] of [[3, 3], [40, 20], [63, 31]]) {
      const i = y * W + x;
      const xs = Math.min(W - 1, Math.max(0, x + mx[i])), ys = Math.min(H - 1, Math.max(0, y + my[i]));
      expect(dst[i * 4]).toBe(src[(ys * W + xs) * 4]);
    }
  });
});
