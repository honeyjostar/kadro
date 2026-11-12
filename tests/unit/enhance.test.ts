// Улучшение качества: целевой размер, куски кадра для нейросети, цепочка ИИ-копий.
import { describe, expect, it } from 'vitest';
import { aiAllowed, enhanceTarget, etaMinutes, fastEnhanceFilter, tilesFor } from '../../src/shared/enhance';
import { videoInputFor, videoSource } from '../../src/shared/ai';
import type { MediaClip } from '../../src/shared/types';

describe('размер', () => {
  it('короткая сторона → 1080, пропорции те же, стороны чётные', () => {
    expect(enhanceTarget(1280, 720)).toEqual({ w: 1920, h: 1080, up: true });
    expect(enhanceTarget(854, 480)).toEqual({ w: 1922, h: 1080, up: true });
    expect(enhanceTarget(720, 1280)).toEqual({ w: 1080, h: 1920, up: true });
    expect(enhanceTarget(1920, 1080)).toEqual({ w: 1920, h: 1080, up: false });
    expect(enhanceTarget(3840, 2160).up).toBe(false);
  });
  it('нейросеть — только до 720p; оценка времени — минуты, не меньше одной', () => {
    expect(aiAllowed(1280, 720)).toBe(true);
    expect(aiAllowed(1920, 1080)).toBe(false);
    expect(etaMinutes(0.5, 1800)).toBe(15);
    expect(etaMinutes(0.01, 10)).toBe(1);
  });
  it('«Быстро»: чистка шума, Ланцош до нужного размера, резкость', () => {
    const f = fastEnhanceFilter(1280, 720, 1920, 1080);
    expect(f).toMatch(/^\[0:v\]hqdn3d=.*scale=1920:1080:flags=lanczos,cas=strength=0\.\d+.*\[v\]$/);
  });
});

describe('куски кадра', () => {
  for (const [w, h] of [[1280, 720], [854, 480], [300, 170], [96, 64]]) {
    it(`${w}×${h}: каждая точка — ровно в одном куске, окна одного размера и внутри кадра`, () => {
      const t = tilesFor(w, h);
      const cover = new Uint8Array(w * h);
      for (const x of t) {
        expect(x.px).toBeGreaterThanOrEqual(0); expect(x.py).toBeGreaterThanOrEqual(0);
        expect(x.px + x.pw).toBeLessThanOrEqual(w); expect(x.py + x.ph).toBeLessThanOrEqual(h);
        // внутренняя часть — внутри окна
        expect(x.x).toBeGreaterThanOrEqual(x.px); expect(x.x + x.w).toBeLessThanOrEqual(x.px + x.pw);
        expect(x.y).toBeGreaterThanOrEqual(x.py); expect(x.y + x.h).toBeLessThanOrEqual(x.py + x.ph);
        for (let yy = x.y; yy < x.y + x.h; yy++) for (let xx = x.x; xx < x.x + x.w; xx++) cover[yy * w + xx]++;
      }
      expect(cover.every((v) => v === 1)).toBe(true);
      expect(new Set(t.map((x) => `${x.pw}x${x.ph}`)).size).toBe(1);
    });
  }
});

describe('цепочка ИИ-копий', () => {
  const ready = (path: string, a: number, b: number) => ({ enabled: true, status: 'ready' as const, path, range: [a, b] as [number, number] });
  const base = { in: 2, out: 5, removeBg: { enabled: false, status: 'none' }, denoise: { enabled: false, status: 'none' } } as unknown as MediaClip;
  it('улучшенная копия — первое звено: стабилизация берёт её, а показывается последнее звено', () => {
    const c = { ...base, enhance: { ...ready('/en.mp4', 2, 5), mode: 'fast' as const } } as MediaClip;
    expect(videoSource(c)).toEqual({ path: '/en.mp4', offset: 2, alpha: false });
    expect(videoInputFor(c, 'stab')).toEqual({ path: '/en.mp4', offset: 2 });
    expect(videoInputFor(c, 'beauty')).toEqual({ path: '/en.mp4', offset: 2 });
    const c2 = { ...c, stab: ready('/st.mp4', 2, 5) } as MediaClip;
    expect(videoSource(c2)?.path).toBe('/st.mp4');
    expect(videoInputFor(c2, 'stab')?.path).toBe('/en.mp4');
    expect(videoInputFor(c2, 'removeBg')?.path).toBe('/st.mp4');
    // клип обрезали шире, чем обработано — берётся оригинал
    expect(videoSource({ ...c, out: 6 } as MediaClip)).toBeNull();
  });
});
