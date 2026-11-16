// Клипы из игр: моменты по экшену (громко + движение), окна не пересекаются, проект 9:16 с нужной раскладкой.
import { describe, expect, it } from 'vitest';
import { findGameMoments, gameSeries, gameShortProject } from '../../src/shared/gameClips';
import { mainTrack } from '../../src/shared/timeline';
import type { MediaAsset, MediaClip } from '../../src/shared/types';

const DUR = 300; // 5 минут геймплея
const step = 0.5;
const n = DUR / step;
// тихий фон, три всплеска: 60 с (громко и движение), 150 с (только громко), 240 с (только движение)
const peaks = Array.from({ length: 2000 }, (_, i) => {
  const t = (i / 2000) * DUR;
  return 0.1 + (Math.abs(t - 60) < 4 ? 0.8 : 0) + (Math.abs(t - 150) < 3 ? 0.6 : 0) + 0.01 * Math.sin(i);
});
const act = Array.from({ length: n }, (_, i) => {
  const t = i * step;
  return 0.1 + (Math.abs(t - 60) < 4 ? 0.7 : 0) + (Math.abs(t - 240) < 4 ? 0.8 : 0);
});
const asset: MediaAsset = { id: 'g', kind: 'video', path: '/g.mp4', previewPath: '/g.mp4', name: 'gta.mp4', duration: DUR, width: 1920, height: 1080, fps: 60, hasVideo: true, hasAudio: true, proxy: 'none' } as MediaAsset;

describe('клипы из игр', () => {
  const g = gameSeries({ step, act, cuts: [] }, peaks, DUR);
  it('самый сильный момент — где и громко, и движение; окна нужной длины и не пересекаются', () => {
    const ms = findGameMoments(g, DUR, { min: 15, max: 35, count: 3 });
    expect(ms.length).toBe(3);
    const peak = (m: { start: number; end: number }) => m.start + (m.end - m.start) * 0.65;
    expect(Math.abs(peak(ms[0]) - 60)).toBeLessThan(4);
    expect(ms[0].reasons).toEqual(expect.arrayContaining(['loud', 'action']));
    for (const m of ms) expect(m.end - m.start).toBeCloseTo(25, 0);
    const sorted = [...ms].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end);
    const centers = ms.map(peak).sort((a, b) => a - b);
    expect(centers.some((c) => Math.abs(c - 150) < 6)).toBe(true);
    expect(centers.some((c) => Math.abs(c - 240) < 6)).toBe(true);
  });
  it('видео короче шортса — моментов нет; у начала окно не уходит в минус', () => {
    expect(findGameMoments(g, 10, { min: 15, max: 35, count: 3 })).toEqual([]);
    const early = gameSeries({ step, act: [1, 1, 1, ...new Array(200).fill(0.1)], cuts: [] }, undefined, 100);
    const [m] = findGameMoments(early, 100, { min: 15, max: 35, count: 1 });
    expect(m.start).toBe(0);
    expect(m.end).toBe(25);
  });
  it('проект: 9:16, «с размытым фоном» — игра целиком, «во весь экран» — обрезка по бокам', () => {
    const m = findGameMoments(g, DUR, { min: 15, max: 35, count: 1 })[0];
    const blur = gameShortProject(asset, m, 1, 'blur');
    expect(blur.settings.aspect).toBe('9:16');
    expect(blur.settings.background).toBe('blur');
    const c = mainTrack(blur).clips[0] as MediaClip;
    expect(c.fit).toBe('contain');
    expect(c.in).toBeCloseTo(m.start, 2);
    expect(c.out).toBeCloseTo(m.end, 2);
    const fill = gameShortProject(asset, m, 1, 'fill');
    expect((mainTrack(fill).clips[0] as MediaClip).fit).toBe('cover');
    expect(blur.tracks.some((t) => t.clips.some((x) => x.type === 'text' && x.text === m.title))).toBe(true);
  });
});
