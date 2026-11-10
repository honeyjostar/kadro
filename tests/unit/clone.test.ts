import { describe, expect, it } from 'vitest';
import { addClone, offsetRange, takeRange } from '../../src/shared/clone';
import { addToMain, addAsset } from '../../src/shared/timeline';
import { newProject } from '../../src/shared/defaults';
import type { MediaAsset, MediaClip } from '../../src/shared/types';

const video = (id: string, duration: number): MediaAsset => ({ id, kind: 'video', path: `/v/${id}.mp4`, name: `${id}.mp4`, duration, width: 1920, height: 1080, fps: 30, hasAudio: true } as MediaAsset);

describe('клон себя', () => {
  it('из того же файла — позже, а не хватает — раньше', () => {
    expect(offsetRange({ in: 0, out: 5 }, 20, 4)).toEqual({ in: 4, out: 9 });
    expect(offsetRange({ in: 1, out: 18 }, 20, 4)).toEqual({ in: 5, out: 20 }); // позже длиннее, чем раньше (раньше — нельзя)
    expect(offsetRange({ in: 10, out: 20 }, 20, 4)).toEqual({ in: 6, out: 16 });   // позже нет — раньше
    expect(offsetRange({ in: 0, out: 6 }, 6, 5)).toBeNull(); // остаётся 1 с — не клон
  });
  it('второй дубль — тот же кусок, а если дубль короче — с начала', () => {
    expect(takeRange({ in: 3, out: 8 }, 30)).toEqual({ in: 3, out: 8 });
    expect(takeRange({ in: 3, out: 8 }, 6)).toEqual({ in: 1, out: 6 });
  });
  it('клон ложится над клипом с тем же кадром, без звука и без обработок', () => {
    let p = addAsset(newProject(), video('a', 30));
    const r = addToMain(p, 'a', 0, { in: 2, out: 10 });
    p = r.project;
    const base = p.tracks[0].clips[0] as MediaClip;
    p = { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, transform: { ...(c as MediaClip).transform, scale: 1.2 }, removeBg: { enabled: true, status: 'ready', path: '/x.webm' } })) })) } as typeof p;
    const out = addClone(p, base.id, { kind: 'offset', seconds: 4 });
    if ('error' in out) throw new Error(out.error);
    const clone = out.project.tracks.flatMap((t) => t.clips).find((c) => c.id === out.cloneId) as MediaClip;
    const track = out.project.tracks.find((t) => t.clips.some((c) => c.id === out.cloneId))!;
    expect(track.kind).toBe('video');
    expect(clone).toMatchObject({ start: base.start, in: 6, out: 14, muted: true, assetId: 'a' });
    expect(clone.transform.scale).toBe(1.2);
    expect(clone.removeBg.enabled).toBe(false);
  });
  it('второй дубль — со своим звуком; тот же файл — ошибка', () => {
    let p = addAsset(addAsset(newProject(), video('a', 30)), video('b', 12));
    p = addToMain(p, 'a', 0, { in: 0, out: 8 }).project;
    const id = p.tracks[0].clips[0].id;
    const ok = addClone(p, id, { kind: 'take', assetId: 'b' });
    if ('error' in ok) throw new Error(ok.error);
    const clone = ok.project.tracks.flatMap((t) => t.clips).find((c) => c.id === ok.cloneId) as MediaClip;
    expect(clone).toMatchObject({ assetId: 'b', in: 0, out: 8, muted: false });
    expect('error' in addClone(p, id, { kind: 'take', assetId: 'a' })).toBe(true);
  });
  it('короткое видео — понятная ошибка', () => {
    let p = addAsset(newProject(), video('a', 5));
    p = addToMain(p, 'a', 0).project;
    const r = addClone(p, p.tracks[0].clips[0].id, { kind: 'offset', seconds: 4 });
    expect('error' in r ? r.error : '').toMatch(/короткое/);
  });
});
