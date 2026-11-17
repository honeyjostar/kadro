// Поправки «Проверки охватов» в проекте: знак — размытием в кадре исходника, начало и конец, рамка, 9:16, 1080p.
import { describe, expect, it } from 'vitest';
import { newMediaClip, newProject, newTrack } from '../../src/shared/defaults';
import { fillFrame, hideMark, make1080, makeVertical, trimEnd, trimStart } from '../../src/shared/reachFix';
import { mainTrack, projectDuration } from '../../src/shared/timeline';
import type { MediaAsset, MediaClip, Project } from '../../src/shared/types';

function asset(id: string, w: number, h: number, duration: number, kind: MediaAsset['kind'] = 'video'): MediaAsset {
  return { id, kind, path: `/m/${id}`, previewPath: `/m/${id}`, name: id, duration, width: w, height: h, fps: 30, hasVideo: kind !== 'audio', hasAudio: true, size: 1e7, rotation: 0, proxy: 'none' };
}
function project(): Project {
  const p = newProject('t', '9:16');
  const a = asset('a', 1080, 1920, 10), b = asset('b', 1080, 1920, 10), m = asset('m', 0, 0, 18, 'audio');
  p.assets.push(a, b, m);
  const c1 = newMediaClip(a, 0); const c2 = newMediaClip(b, 10);
  c2.in = 2; c2.out = 10; c2.start = 10;
  mainTrack(p).clips.push(c1, c2);
  const mus = newTrack('audio'); mus.clips.push(newMediaClip(m, 0)); p.tracks.push(mus);
  return p;
}

describe('поправки из проверки охватов', () => {
  it('знак сверху справа 4–14 с: размытие в обоих клипах, рамка — в долях исходника, время — исходника', () => {
    const box = { x: 0.7, y: 0.03, w: 0.25, h: 0.06 };
    let n = 0;
    const r = hideMark(project(), box, 4, 14, () => `r${n++}`);
    expect(r.clips).toBe(2);
    const [c1, c2] = mainTrack(r.project).clips as MediaClip[];
    const b1 = c1.blurs![0];
    expect(b1.kind).toBe('object');
    expect(b1.boxes.map((x) => x.t)).toEqual([4, 10]);
    expect(b1.boxes[0].x).toBeCloseTo(0.825, 3);
    expect(b1.boxes[0].y).toBeCloseTo(0.06, 3);
    expect(b1.boxes[0].w).toBeCloseTo(0.25, 3);
    // второй клип начинается с 2 с исходника: 10–14 на таймлайне = 2–6 исходника
    expect(c2.blurs![0].boxes.map((x) => x.t)).toEqual([2, 6]);
  });
  it('обрезать начало и конец', () => {
    const p = project();
    const st = trimStart(p, 1.5);
    expect(projectDuration(st)).toBeCloseTo(16.5, 3); // и музыка не играет после картинки
    const e = trimEnd(p, 12);
    expect(projectDuration(e)).toBeCloseTo(12, 3);
    const mus = e.tracks.find((t) => t.kind === 'audio')!.clips[0] as MediaClip;
    expect(mus.out - mus.in).toBeCloseTo(12, 3); // музыка не тянется за конец
  });
  it('рамка: «вписать» → «заполнить»; поля в самом видео — увеличить', () => {
    const p = project();
    (mainTrack(p).clips[0] as MediaClip).fit = 'contain';
    p.assets[0] = { ...p.assets[0], width: 1920, height: 1080 }; // горизонтальное в вертикальном кадре
    expect((mainTrack(fillFrame(p, 0.3)).clips[0] as MediaClip).fit).toBe('cover');
    const q = fillFrame(project(), 0.25);
    expect((mainTrack(q).clips[1] as MediaClip).transform.scale).toBeCloseTo(1.3333, 3);
  });
  it('9:16 и 1080p', () => {
    const p = newProject('t', '16:9');
    expect(makeVertical(p).settings.aspect).toBe('9:16');
    const small = { ...p, settings: { ...p.settings, width: 1280, height: 720 } };
    expect(Math.min(make1080(small).settings.width, make1080(small).settings.height)).toBe(1080);
  });
});
