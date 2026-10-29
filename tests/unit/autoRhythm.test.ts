// Ритм и динамика авто-ролика: громкость и дропы музыки, сильная доля, «велосити», удары на долях,
// надпись по слову, разные куски вместо одинаковых.
import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { SIG_N, autoEdit, beatGrid, pickWindows, sigSimilarity, windowSig, type AutoInput, type Highlights } from '../../src/shared/autoEdit';
import { musicShape } from '../../src/shared/beats';
import { clipDuration, mainTrack } from '../../src/shared/timeline';
import type { MediaAsset, MediaClip, TextClip } from '../../src/shared/types';

function asset(id: string, kind: MediaAsset['kind'], duration: number, extra: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id, kind, path: `/m/${id}`, previewPath: `/m/${id}`, name: id, duration, width: 1920, height: 1080, fps: 30,
    hasVideo: kind !== 'audio', hasAudio: kind !== 'image', size: 1, rotation: 0, proxy: 'none', ...extra,
  };
}
const BEATS = Array.from({ length: 80 }, (_, i) => Math.round((0.5 + i * 0.5) * 1000) / 1000);
/** Песня 40 с, 120 ударов: до 16 с тихо, потом громко (дроп на 16.5 с). */
function song(): MediaAsset {
  const step = 0.2;
  const energy = Array.from({ length: 200 }, (_, i) => (i * step < 16.4 ? 0.25 : 0.95));
  return asset('music', 'audio', 40, { beats: BEATS, bpm: 120, shape: { step, energy, drops: [16.5], phase: 0 } });
}
const videos = () => ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ asset: asset(id, 'video', 30) }));
const base = (over: Partial<AutoInput> = {}): AutoInput => ({
  media: videos(), music: song(), style: 'energy', aspect: '9:16', length: 30, title: '', videoSound: 'off', seed: 3, ...over,
});
const clips = (r: ReturnType<typeof autoEdit>) => mainTrack(r.project).clips as MediaClip[];

describe('форма музыки', () => {
  it('громкость, дроп и сильная доля по звуку', () => {
    const sr = 8000;
    const pcm = new Float32Array(sr * 24);
    const beats: number[] = [];
    for (let i = 0; i < 46; i++) beats.push(0.5 + i * 0.5);
    beats.forEach((b, i) => {
      const loud = b >= 12;
      const hit = (i % 4 === 1 ? 1 : 0.45) * (loud ? 0.9 : 0.12); // сильная — вторая доля каждого такта
      for (let k = 0; k < sr * 0.08; k++) pcm[Math.floor(b * sr) + k] += hit * Math.sin(k * 0.06) * Math.exp(-k / (sr * 0.03));
    });
    for (let k = 0; k < pcm.length; k++) pcm[k] += (k / sr >= 12 ? 0.25 : 0.02) * Math.sin(k * 0.3);
    const m = musicShape(pcm, sr, beats);
    const e = (t: number) => m.energy[Math.round(t / m.step)];
    expect(e(6)).toBeLessThan(0.4);
    expect(e(18)).toBeGreaterThan(0.8);
    expect(m.drops).toHaveLength(1);
    expect(Math.abs(m.drops[0] - 12)).toBeLessThanOrEqual(0.5);
    expect(m.phase).toBe(1);
  });
});

describe('ритм монтажа', () => {
  it('в громкой части кадры короче, склейка точно на дропе, на дропе — тряска', () => {
    const r = autoEdit(newProject('x'), base());
    const cl = clips(r);
    const g = beatGrid(song(), 124, 30);
    const drop = 16.5 - g.musicIn;
    const quiet = cl.filter((c) => c.start + clipDuration(c) <= drop - 0.01).map(clipDuration);
    const loud = cl.filter((c) => c.start >= drop - 0.01).map(clipDuration);
    const avg = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
    expect(avg(loud)).toBeLessThan(avg(quiet) * 0.75);
    const atDrop = cl.find((c) => Math.abs(c.start - drop) < 0.002);
    expect(atDrop, 'склейка на дропе').toBeTruthy();
    expect(atDrop!.effects?.map((e) => e.type)).toContain('shake');
    // перед дропом — наезд
    const before = cl[cl.indexOf(atDrop!) - 1];
    const ks = before.keyframes?.scale ?? [];
    expect(ks[ks.length - 1].v).toBeGreaterThan(ks[0].v + 0.1);
  });

  it('«Велосити»: кадр делится на доле — быстро, потом замедленно, исходник без разрыва', () => {
    const cl = clips(autoEdit(newProject('x'), base({ style: 'velocity' })));
    const pairs = cl.map((c, i) => [c, cl[i + 1]] as const).filter(([a, b]) => b && a.assetId === b.assetId && Math.abs(b.in - a.out) < 1e-6 && a.speed > b.speed);
    expect(pairs.length).toBeGreaterThan(3);
    for (const [a, b] of pairs) {
      expect(a.speed).toBeGreaterThan(1.2);
      expect(b.speed).toBeLessThan(0.8);
      expect(a.muted && b.muted).toBe(true);
    }
    for (const c of cl) expect(c.out).toBeLessThanOrEqual(30 + 1e-6);
  });

  it('«Бит-флеш»: удары масштабом на долях внутри кадра, частые склейки', () => {
    const r = autoEdit(newProject('x'), base({ style: 'flash' }));
    const cl = clips(r);
    expect(cl.length).toBeGreaterThan(30);
    const punched = cl.filter((c) => (c.keyframes?.scale?.length ?? 0) >= 4);
    expect(punched.length).toBeGreaterThan(0);
    for (const c of punched) {
      const t = c.keyframes!.scale!.map((k) => k.t);
      for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
      expect(Math.max(...c.keyframes!.scale!.map((k) => k.v))).toBeCloseTo(1.06, 5);
    }
  });

  it('«Текст в ритм»: по слову на долю, в конце — надпись целиком', () => {
    const r = autoEdit(newProject('x'), base({ style: 'kinetic', title: 'Лучшие моменты этого лета' }));
    const texts = r.project.tracks.filter((t) => t.kind === 'text').flatMap((t) => t.clips) as TextClip[];
    expect(texts.slice(0, 4).map((t) => t.text)).toEqual(['Лучшие', 'моменты', 'этого', 'лета']);
    const g = beatGrid(song(), 110, 30).grid;
    for (const t of texts.slice(0, 4)) expect(g.some((x) => Math.abs(x - t.start) < 0.002)).toBe(true);
    expect(texts[texts.length - 1].text).toBe('Лучшие моменты этого лета');
  });

  it('все новые стили собираются без наложений кусков одного видео', () => {
    for (const style of ['velocity', 'flash', 'zoom3d', 'kinetic', 'glitch', 'clean'] as const) {
      const cl = clips(autoEdit(newProject('x'), base({ style, title: 'Привет' })));
      const byAsset = new Map<string, MediaClip[]>();
      for (const c of cl) byAsset.set(c.assetId, [...(byAsset.get(c.assetId) ?? []), c]);
      for (const list of byAsset.values()) for (let i = 1; i < list.length; i++) expect(list[i].in, style).toBeGreaterThanOrEqual(list[i - 1].out - 1e-6);
    }
  });
});

describe('разные куски', () => {
  it('из видео со стоящей камерой берутся непохожие куски', () => {
    // 20 с, оценка везде одинаковая; первые 10 с — один и тот же кадр, дальше картинка меняется
    const step = 0.25;
    const n = 80;
    const sig: number[] = [];
    for (let f = 0; f < n; f++) for (let k = 0; k < SIG_N; k++) sig.push(f < 40 ? 100 : (f * 7 + k * 13) % 255);
    const hl: Highlights = { step, score: new Array(n).fill(0.8), cuts: [], sig };
    const starts = pickWindows(hl, [2, 2, 2], 0.2, 19.8);
    const inStatic = starts.filter((s) => s + 2 <= 10).length;
    expect(inStatic).toBeLessThanOrEqual(1);
    expect(sigSimilarity(windowSig(hl, 1, 2), windowSig(hl, 5, 2))).toBe(1);
    expect(sigSimilarity(windowSig(hl, 1, 2), windowSig(hl, 14, 2))).toBeLessThan(0.5);
  });
});
