// Качество авто-монтажа: брак (стоит, не в фокусе, тряска) оценивается ниже хорошего, куски разных файлов —
// вперемешку, вспышки не чаще раза в 3 с, однообразное видео даёт меньше кусков.
import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import {
  HL_FINE_H, HL_FINE_W, HL_H, HL_W, SIG_N, autoEdit, cameraShift, frameStat, scoreFrames, variety, weaveOwners, type FrameStat, type Highlights,
} from '../../src/shared/autoEdit';
import { mainTrack } from '../../src/shared/timeline';
import type { MediaAsset, MediaClip } from '../../src/shared/types';

/** Текстура с мелкими деталями: сдвиг (dx, dy), размытие (радиус). Кадр 160×90 и он же 80×45. */
function frame(dx: number, dy: number, blur = 0, seed = 1): { fine: Float32Array; g: Float32Array } {
  const W = HL_FINE_W; const H = HL_FINE_H;
  const tex = (x: number, y: number) => {
    const h = Math.sin((x * 12.9898 + y * 78.233 + seed * 3.1) * 0.37) * 43758.5453;
    return 128 + 60 * Math.sin(x * 0.35) * Math.cos(y * 0.27) + 50 * (h - Math.floor(h) - 0.5);
  };
  let fine = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fine[y * W + x] = tex(x - 2 * dx, y - 2 * dy);
  for (let r = 0; r < blur; r++) {
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0; let c = 0;
      for (let k = -1; k <= 1; k++) for (let m = -1; m <= 1; m++) { const xx = x + m; const yy = y + k; if (xx >= 0 && xx < W && yy >= 0 && yy < H) { s += fine[yy * W + xx]; c++; } }
      out[y * W + x] = s / c;
    }
    fine = out;
  }
  const g = new Float32Array(HL_W * HL_H);
  for (let y = 0; y < HL_H; y++) for (let x = 0; x < HL_W; x++) {
    const k = 2 * y * W + 2 * x;
    g[y * HL_W + x] = (fine[k] + fine[k + 1] + fine[k + W] + fine[k + W + 1]) / 4;
  }
  return { fine, g };
}
function run(shift: (i: number) => [number, number], blur = 0, n = 16): FrameStat[] {
  const out: FrameStat[] = [];
  let prev: Float32Array | null = null;
  for (let i = 0; i < n; i++) {
    const [dx, dy] = shift(i);
    const f = frame(dx, dy, blur);
    out.push(frameStat(f.g, prev, HL_W, HL_H, f.fine));
    prev = f.g;
  }
  return out;
}
const mid = (hl: Highlights) => { const s = hl.score.slice(3, -3); return s.reduce((a, b) => a + b, 0) / s.length; };

describe('оценка кадров', () => {
  it('сдвиг камеры находится', () => {
    const a = frame(0, 0); const b = frame(3, -2);
    expect(cameraShift(b.g, a.g)).toMatchObject({ vx: 3, vy: -2 });
  });

  it('стоит, не в фокусе, трясётся — хуже, чем ровное движение', () => {
    const good = mid(scoreFrames(run((i) => [i * 2, 0]), 0.25));
    const frozen = mid(scoreFrames(run(() => [0, 0]), 0.25));
    const blurry = mid(scoreFrames(run((i) => [i * 0.25, 0], 3), 0.25));
    const shaky = mid(scoreFrames(run((i) => [i % 2 ? 6 : -6, i % 3 ? 4 : -4]), 0.25));
    expect(frozen).toBeLessThan(good * 0.75);
    expect(blurry).toBeLessThan(good * 0.75);
    expect(shaky).toBeLessThan(good * 0.75);
  });
});

describe('порядок и разнообразие', () => {
  it('куски разных файлов — вперемешку, первым — самый удачный', () => {
    const seq = weaveOwners([4, 2, 2, 1], 9, [0.5, 0.9, 0.4, 0.3]);
    expect(seq).toHaveLength(9);
    expect(seq[0]).toBe(1);
    for (let i = 1; i < seq.length; i++) expect(seq[i], seq.join(',')).not.toBe(seq[i - 1]);
    expect([0, 1, 2, 3].map((f) => seq.filter((x) => x === f).length)).toEqual([4, 2, 2, 1]);
  });

  it('одинаковое по виду видео даёт меньше кусков, чем меняющееся', () => {
    const sig = (fn: (t: number) => number) => Array.from({ length: 80 }, (_, i) => Array.from({ length: SIG_N }, (_, k) => fn(i * 0.25) + k)).flat();
    const same: Highlights = { step: 0.25, score: new Array(80).fill(0.7), cuts: [], sig: sig(() => 100) };
    const changing: Highlights = { step: 0.25, score: new Array(80).fill(0.7), cuts: [], sig: sig((t) => 40 + 10 * t) };
    expect(variety(same, 0, 20)).toBeLessThan(0.2);
    expect(variety(changing, 0, 20)).toBeGreaterThan(0.7);
    const v = (id: string, hl: Highlights): { asset: MediaAsset; hl: Highlights } => ({
      asset: { id, kind: 'video', path: `/m/${id}`, previewPath: `/m/${id}`, name: id, duration: 20, width: 1920, height: 1080, fps: 30, hasVideo: true, hasAudio: false, size: 1, rotation: 0, proxy: 'none' }, hl,
    });
    const r = autoEdit(newProject('x'), { media: [v('same', same), v('changing', changing)], style: 'energy', aspect: '9:16', length: 'auto', title: '', videoSound: 'off', seed: 1 });
    const cl = mainTrack(r.project).clips as MediaClip[];
    const n = (id: string) => cl.filter((c) => c.assetId === id).length;
    expect(n('same')).toBeLessThan(n('changing'));
  });

  it('вспышки — не чаще раза в 3 секунды', () => {
    const beats = Array.from({ length: 120 }, (_, i) => Math.round((0.5 + i * 0.5) * 1000) / 1000);
    const music = { id: 'm', kind: 'audio' as const, path: '/m/m', previewPath: '/m/m', name: 'm', duration: 62, width: 0, height: 0, fps: 0, hasVideo: false, hasAudio: true, size: 1, rotation: 0, proxy: 'none' as const, beats, bpm: 120 };
    const media = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ asset: { ...music, id, kind: 'video' as const, path: `/m/${id}`, duration: 30, width: 1920, height: 1080, fps: 30, hasVideo: true, hasAudio: false, beats: undefined, bpm: undefined } }));
    for (const style of ['energy', 'flash', 'velocity', 'glitch'] as const) {
      const r = autoEdit(newProject('x'), { media, music, style, aspect: '9:16', length: 40, title: '', videoSound: 'off', seed: 2 });
      const cl = mainTrack(r.project).clips as MediaClip[];
      const at = cl.filter((c, i) => i > 0 && (c.effects ?? []).some((e) => ['flash', 'bwflash', 'glitch', 'lightleak'].includes(e.type))).map((c) => c.start);
      for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1], `${style}: ${at.join(', ')}`).toBeGreaterThanOrEqual(2.99);
      expect(at.length, style).toBeLessThanOrEqual(Math.ceil(40 / 3));
    }
  });
});
