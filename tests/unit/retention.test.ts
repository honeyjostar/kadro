// «Где пролистнут»: места, где зритель скорее всего смахнёт ролик.
import { describe, expect, it } from 'vitest';
import { newProject, CAPTION_STYLE } from '../../src/shared/defaults';
import { addAsset, addText, addToMain, setCaptions, updateClip } from '../../src/shared/timeline';
import { retentionIssues, zoomKeys, type RetCtx } from '../../src/shared/retention';
import type { MediaAsset, MediaClip, Project } from '../../src/shared/types';

function video(id: string, duration: number, o: Partial<MediaAsset> = {}): MediaAsset {
  return { id, kind: 'video', path: `/m/${id}.mp4`, previewPath: `/m/${id}.mp4`, name: id, duration, width: 1920, height: 1080, fps: 30,
    hasVideo: true, hasAudio: true, size: 1, rotation: 0, proxy: 'none', peaks: Array(Math.round(duration * 40)).fill(0.6), ...o };
}
const image = (id: string): MediaAsset => ({ ...video(id, 0), kind: 'image', hasAudio: false, peaks: undefined });
const still: RetCtx = { motion: () => 0.02 };
const moving: RetCtx = { motion: () => 0.5 };
function proj(a: MediaAsset, dur?: number): { p: Project; clip: string } {
  let p = addAsset(newProject('t'), a);
  const r = addToMain(p, a.id, 0, dur ? { in: 0, out: dur } : undefined);
  p = r.project;
  if (a.kind === 'image' && dur) p = updateClip(p, r.clipId, { out: dur });
  return { p, clip: r.clipId };
}
const kinds = (p: Project, c: RetCtx) => retentionIssues(p, c).map((i) => i.kind);

describe('где пролистнут', () => {
  it('застывшая картинка без звука и надписей: крючок, длинный план, нет звука', () => {
    const { p } = proj(image('img'), 6);
    const r = retentionIssues(p, still);
    expect(r.map((i) => i.kind)).toEqual(['hook', 'static', 'noSound']);
    expect(r[0]).toMatchObject({ t0: 0, t1: 2, fix: 'hookZoom' });
    expect(r[1].fix).toBe('staticZoom');
    expect(r[2].fix).toBe('music');
  });
  it('заголовок в начале — крючок есть', () => {
    const { p } = proj(image('img'), 6);
    const q = addText(p, 0.2, 'КАК Я ЭТО СДЕЛАЛ').project;
    expect(kinds(q, still)).not.toContain('hook');
  });
  it('видео с движением и звуком — без замечаний', () => {
    const { p } = proj(video('v', 10));
    expect(retentionIssues(p, moving)).toEqual([]);
  });
  it('анимация клипа считается движением', () => {
    const { p, clip } = proj(image('img'), 6);
    const q = updateClip(p, clip, { keyframes: { scale: [{ t: 0, v: 1 }, { t: 6, v: 1.2 }] } });
    expect(kinds(q, still)).toEqual(['noSound']);
  });
  it('речь только на 4-й секунде — обрезать начало', () => {
    const { p, clip } = proj(video('v', 12));
    const q = setCaptions(p, [{ start: 3.4, end: 5, text: 'привет всем', words: [{ text: 'привет', start: 3.4, end: 4 }, { text: 'всем', start: 4.1, end: 5 }] }], CAPTION_STYLE);
    const r = retentionIssues(q, still);
    const late = r.find((i) => i.kind === 'lateSpeech')!;
    expect(late).toMatchObject({ clipId: clip, fix: 'trimStart', t1: 3.4 });
    expect(late.text).toContain('4-й');
    expect(r.map((i) => i.kind)).toContain('hook');
  });
  it('тихий звук и тишина посреди ролика', () => {
    const quiet = proj(video('q', 10, { peaks: Array(400).fill(0.08) })).p;
    expect(kinds(quiet, moving)).toEqual(['quiet']);
    const peaks = Array(400).fill(0.6);
    for (let i = 160; i < 260; i++) peaks[i] = 0; // 4–6,5 с — тишина
    const gap = retentionIssues(proj(video('g', 10, { peaks })).p, moving);
    expect(gap.map((i) => i.kind)).toEqual(['silence']);
    expect(gap[0].t0).toBeCloseTo(4, 0);
    expect(gap[0].t1).toBeCloseTo(6.5, 0);
    expect(gap[0].fix).toBe('pauses');
  });
  it('выключенный звук клипа — как без звука', () => {
    const { p, clip } = proj(video('v', 10));
    expect(kinds(updateClip(p, clip, { muted: true }), moving)).toEqual(['noSound']);
  });
  it('медленный зум — ключи по времени исходника', () => {
    const { p, clip } = proj(video('v', 20));
    const c = p.tracks[0].clips.find((x) => x.id === clip) as MediaClip;
    const moved = { ...c, in: 5, out: 15, start: 2, speed: 2 } as MediaClip;
    expect(zoomKeys(moved, 3, 6)).toEqual([{ t: 7, v: 1, ease: 'smooth' }, { t: 13, v: 1.12, ease: 'smooth' }]);
  });
});
