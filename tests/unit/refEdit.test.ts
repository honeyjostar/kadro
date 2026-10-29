// Разбор ролика-образца: склейки точно по кадрам, вспышка, проявление из чёрного, наезд; шаблон с теми же окошками.
import { describe, expect, it } from 'vitest';
import { REF_H, REF_W, analyzeRef, aspectOf, refTemplate } from '../../src/shared/refEdit';
import { applyTemplate, templateDuration } from '../../src/shared/templates';
import { newProject } from '../../src/shared/defaults';
import { mainTrack } from '../../src/shared/timeline';
import type { MediaAsset, MediaClip } from '../../src/shared/types';

const frame = (fn: (x: number, y: number) => number) => {
  const g = new Uint8Array(REF_W * REF_H);
  for (let y = 0; y < REF_H; y++) for (let x = 0; x < REF_W; x++) g[y * REF_W + x] = Math.max(0, Math.min(255, Math.round(fn(x, y))));
  return g;
};
/** Узор, который двигается во времени (движение внутри кадра — не склейка). */
const scene = (seed: number) => (t: number) => frame((x, y) => {
  // у каждого кадра своя «композиция» (где светлее, где темнее) и мелкий узор, который движется
  const layout = 60 + 120 * (seed % 2 ? x / REF_W : 1 - y / REF_H) * (0.6 + 0.2 * seed);
  return layout + 25 * Math.sin((x + t * 0.6) * (0.3 + seed * 0.05) + seed) * Math.cos(y * (0.35 + seed * 0.04));
});
/** Наезд на узор: s — во сколько раз увеличено. */
const zoomScene = (s: number) => frame((x, y) => {
  const u = (x - REF_W / 2) / s + REF_W / 2; const v = (y - REF_H / 2) / s + REF_H / 2;
  return 128 + 100 * Math.sin(u * 0.35) * Math.cos(v * 0.4) + (Math.abs(u - REF_W / 2) < 6 && Math.abs(v - REF_H / 2) < 4 ? 80 : 0);
});

describe('разбор образца', () => {
  const fps = 30;
  const frames: Uint8Array[] = [];
  const add = (n: number, f: (i: number) => Uint8Array) => { for (let i = 0; i < n; i++) frames.push(f(i)); };
  add(24, scene(1));                                         // 0..0.8 с
  add(1, () => frame(() => 250)); add(35, scene(2));         // вспышка, потом кадр до 2.0 с
  add(6, () => frame(() => 2)); add(30, (i) => { const g = scene(3)(i); return i < 4 ? g.map((v) => v * (i / 4)) as Uint8Array : g; }); // чёрное → проявление, до 3.2 с
  add(36, (i) => zoomScene(1 + (i / 35) * 0.3));             // наезд 1 → 1.3, до 4.4 с

  const r = analyzeRef(frames, fps);
  it('склейки — на тех же кадрах', () => {
    const starts = r.shots.map((s) => Math.round(s.start * fps));
    expect(starts[0]).toBe(0);
    expect(starts).toContain(24);
    expect(starts).toContain(96);
    expect(starts.some((x) => x === 60 || x === 66)).toBe(true);
    expect(r.duration).toBeCloseTo(132 / 30, 5);
  });
  it('вспышка, проявление из чёрного, наезд', () => {
    const at = (t: number) => r.shots.find((s) => s.start <= t + 1e-6 && s.end > t)!;
    expect(at(0.81).flash).toBe(true);
    expect(at(0.3).flash).toBe(false);
    expect(at(2.5).fadeIn || at(2.05).fadeIn).toBe(true);
    const z = at(4).zoom;
    expect(z).toBeTruthy();
    expect(z![0]).toBe(1);
    expect(z![1]).toBeGreaterThan(1.15);
    expect(at(0.3).zoom).toBeUndefined();
  });
  it('шаблон: окошки той же длины, музыка, формат', () => {
    const t = refTemplate(r, { name: 'clip.mp4', width: 1080, height: 1920, music: '/x/ref.m4a' });
    expect(t.aspect).toBe('9:16');
    expect(t.slots.length).toBe(r.shots.length);
    expect(templateDuration(t)).toBeCloseTo(r.duration, 2);
    expect(t.music?.path).toBe('/x/ref.m4a');
    expect(t.slots.some((s) => s.effects?.some((e) => e.type === 'flash'))).toBe(true);
    expect(aspectOf(1920, 1080)).toBe('16:9');
    // свои файлы — в окошки, музыка на дорожку, длина как у образца
    const a = (id: string, kind: MediaAsset['kind'], duration: number): MediaAsset => ({ id, kind, path: `/m/${id}`, previewPath: `/m/${id}`, name: id, duration, width: 1920, height: 1080, fps: 30, hasVideo: kind !== 'audio', hasAudio: true, size: 1, rotation: 0, proxy: 'none' });
    const p = applyTemplate(newProject('x'), t, [a('v', 'video', 20), a('img', 'image', 0)], { music: a('m', 'audio', 4.4), videoSound: 'off' });
    const cl = mainTrack(p).clips as MediaClip[];
    expect(cl.map((c) => Math.round(c.start * 30))).toEqual(r.shots.map((s) => Math.round(s.start * 30)));
    const audio = p.tracks.find((x) => x.kind === 'audio')!.clips[0] as MediaClip;
    expect(audio.assetId).toBe('m');
    for (const c of cl.filter((x) => x.assetId === 'v')) expect(c.muted).toBe(true);
  });
});
