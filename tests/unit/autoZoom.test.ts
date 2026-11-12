// Автозум на важных словах: выбор слов, ключи масштаба по времени исходника, удаление только своих ключей.
import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { addAsset, addToMain, mainTrack, updateClip } from '../../src/shared/timeline';
import { applyAutoZoom, clearAutoZoom, zoomMoments, ZOOM } from '../../src/shared/autoZoom';
import type { MediaAsset, MediaClip } from '../../src/shared/types';

const asset = (id: string, d: number): MediaAsset => ({ id, kind: 'video', path: `/m/${id}`, previewPath: `/m/${id}`, name: id, duration: d, width: 1920, height: 1080, fps: 30, hasVideo: true, hasAudio: true, size: 1, rotation: 0, proxy: 'none' });
const W = (text: string, start: number, key = false) => ({ text, start, end: start + 0.4, clipId: 'c', ...(key ? { key } : {}) });

describe('автозум', () => {
  const words = [W('Сегодня', 0.5), W('я', 1), W('покажу', 1.3), W('Kadro!', 2, true), W('и', 3), W('бесплатный', 3.4), W('монтаж', 4.2), W('видео', 7), W('невероятно', 7.6, true)];
  it('наезды — на весомых словах и не чаще заданного', () => {
    const m = zoomMoments(words, ZOOM.mid.gap);
    expect(m).toContain(2);
    expect(m).toContain(7.6);
    for (let i = 1; i < m.length; i++) expect(m[i] - m[i - 1]).toBeGreaterThanOrEqual(ZOOM.mid.gap);
    expect(zoomMoments(words, ZOOM.soft.gap).length).toBeLessThanOrEqual(m.length);
  });
  it('ключи — по времени исходника; убрать — только свои, ручные остаются', () => {
    let p = addAsset(newProject('t'), asset('v', 20));
    p = addToMain(p, 'v', 0, { in: 5, out: 15 }).project;
    const id = mainTrack(p).clips[0].id;
    p = updateClip(p, id, { keyframes: { scale: [{ t: 14, v: 1.5 }] } });
    const r = applyAutoZoom(p, [2], 1.2);
    expect(r.count).toBe(1);
    const c = mainTrack(r.project).clips[0] as MediaClip;
    expect(c.keyframes!.scale!.map((k) => k.v)).toEqual([1, 1.2, 1.2, 1, 1.5]);
    expect(c.keyframes!.scale![1].t).toBeCloseTo(7.14, 3); // 5 с исходника + 2,14 с
    const back = mainTrack(clearAutoZoom(r.project)).clips[0] as MediaClip;
    expect(back.keyframes!.scale).toEqual([{ t: 14, v: 1.5 }]);
    expect(back.autoZoom).toBeUndefined();
    // повторный автозум не копит ключи
    const twice = applyAutoZoom(r.project, [2], 1.2).project;
    expect((mainTrack(twice).clips[0] as MediaClip).keyframes!.scale).toHaveLength(5);
  });
});
