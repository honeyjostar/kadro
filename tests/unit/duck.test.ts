import { describe, expect, it } from 'vitest';
import { duckExpr, duckGain, isMusic, speechIntervals } from '../../src/shared/duck';
import { addAsset, addFree, addToMain } from '../../src/shared/timeline';
import { newProject } from '../../src/shared/defaults';
import type { MediaAsset, MediaClip } from '../../src/shared/types';

// 40 пиков в секунду: речь 1–3 с и 5–6 с, остальное тихо
const speechPeaks = (dur: number) => Array.from({ length: dur * 40 }, (_, i) => { const t = i / 40; return (t >= 1 && t < 3) || (t >= 5 && t < 6) ? 0.4 : 0.01; });
const talk = { id: 'v', kind: 'video', path: '/v.mp4', name: 'v', duration: 8, width: 1280, height: 720, fps: 30, hasAudio: true, peaks: speechPeaks(8) } as unknown as MediaAsset;
const music = { id: 'm', kind: 'audio', path: '/m.mp3', name: 'm', duration: 60, width: 0, height: 0, fps: 0, hasAudio: true } as unknown as MediaAsset;
const boom = { ...music, id: 'b', duration: 1.1 } as MediaAsset;

const setup = () => {
  let p = addAsset(addAsset(addAsset(newProject(), talk), music), boom);
  p = addToMain(p, 'v', 0).project;
  p = addFree(p, 'm', 0).project;
  p = addFree(p, 'b', 2).project;
  return p;
};

describe('музыка тише под голос', () => {
  it('где говорят — по пикам голоса; паузы короче полсекунды сливаются', () => {
    const iv = speechIntervals(setup());
    expect(iv).toHaveLength(2);
    expect(iv[0][0]).toBeCloseTo(0.9, 1);
    expect(iv[0][1]).toBeCloseTo(3.1, 1);
    expect(iv[1][0]).toBeCloseTo(4.9, 1);
  });
  it('музыка — длинный звук на дорожке звука; короткий «бум» и звук видео — нет', () => {
    const p = setup();
    const audio = p.tracks.filter((t) => t.kind === 'audio');
    const m = audio.flatMap((t) => t.clips).find((c) => (c as MediaClip).assetId === 'm') as MediaClip;
    const b = audio.flatMap((t) => t.clips).find((c) => (c as MediaClip).assetId === 'b') as MediaClip;
    expect(isMusic(audio.find((t) => t.clips.includes(m))!, m, music)).toBe(true);
    expect(isMusic(audio.find((t) => t.clips.includes(b))!, b, boom)).toBe(false);
    expect(isMusic(p.tracks[0], p.tracks[0].clips[0] as MediaClip, talk)).toBe(false);
  });
  it('огибающая: под голосом тише, вне — как было, края плавные', () => {
    const iv: [number, number][] = [[1, 3]];
    expect(duckGain(iv, 2, 0.35)).toBeCloseTo(0.35);
    expect(duckGain(iv, 0.2, 0.35)).toBe(1);
    expect(duckGain(iv, 4, 0.35)).toBe(1);
    const mid = duckGain(iv, 0.875, 0.35);
    expect(mid).toBeGreaterThan(0.35);
    expect(mid).toBeLessThan(1);
  });
  it('то же для FFmpeg: выражение громкости от начала клипа; голоса нет — без фильтра', () => {
    const c = { start: 10, in: 0, out: 20, speed: 1 } as MediaClip;
    expect(duckExpr([[1, 3]], c, 0.35)).toBeNull();
    const e = duckExpr([[12, 14]], c, 0.35)!;
    expect(e).toMatch(/^volume='1-0\.65\*min\(1\\,/);
    expect(e).toContain('(t-1.75)');
    expect(e).toContain(':eval=frame');
  });
});
