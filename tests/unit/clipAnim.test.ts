import { describe, expect, it } from 'vitest';
import { CLIP_ANIMS, animDur, bounceOut, clipAnimAt } from '../../src/shared/clipAnim';

describe('анимации клипа', () => {
  it('в середине клипа анимации не действуют, на краях клип спрятан или на месте', () => {
    for (const a of CLIP_ANIMS) {
      const c = { anim: { in: { type: a.type, dur: 0.5 }, out: { type: a.type, dur: 0.5 } } };
      const mid = clipAnimAt(c, 1.5, 3);
      expect(mid, a.type).toEqual({ dx: 0, dy: 0, drot: 0, scale: 1, opacity: 1 });
      const after = clipAnimAt(c, 0.5, 3); // ровно конец появления
      expect(after.dx + after.dy + after.drot, a.type).toBeCloseTo(0, 6);
      expect(after.scale, a.type).toBeCloseTo(1, 6);
      const start = clipAnimAt(c, 0, 3);
      const hidden = start.opacity < 0.01 || Math.abs(start.dx) >= 0.99 || Math.abs(start.dy) >= 0.99 || start.scale < 0.6 || start.scale > 1.4;
      expect(hidden, `${a.type}: в начале клип должен быть спрятан или далеко`).toBe(true);
    }
  });
  it('длительность не больше половины клипа', () => {
    expect(animDur({ type: 'fade', dur: 2 }, 1)).toBe(0.5);
    expect(animDur({ type: 'fade', dur: 0.3 }, 10)).toBe(0.3);
  });
  it('отскок: от 0 до 1 без разрывов', () => {
    expect(bounceOut(0)).toBe(0);
    expect(bounceOut(1)).toBeCloseTo(1, 9);
    for (let p = 0; p < 1; p += 0.001) expect(Math.abs(bounceOut(p + 0.001) - bounceOut(p))).toBeLessThan(0.02);
  });
});
