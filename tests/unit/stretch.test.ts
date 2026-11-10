import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { addAsset, addToMain, updateClip } from '../../src/shared/timeline';
import { buildGraph } from '../../src/shared/exportGraph';
import { placeOnCanvas, stretchedSize } from '../../src/shared/geometry';
import type { MediaAsset } from '../../src/shared/types';

const v = { id: 'v', kind: 'video', path: '/v.mp4', name: 'v', duration: 3, width: 1920, height: 1080, fps: 30, hasAudio: false } as unknown as MediaAsset;

describe('растянуть по ширине и высоте', () => {
  it('растягивается исходник, потом вписывание в кадр', () => {
    expect(stretchedSize(1920, 1080)).toEqual({ w: 1920, h: 1080 });
    expect(stretchedSize(1920, 1080, { x: 2, y: 1 })).toEqual({ w: 3840, h: 1080 });
    // 16:9 в кадре 16:9, вдвое шире — вписывается по ширине, по высоте вдвое ниже
    const s = stretchedSize(1920, 1080, { x: 2, y: 1 });
    const pl = placeOnCanvas(1920, 1080, s.w, s.h, 'contain', { x: 0, y: 0, scale: 1, rotation: 0 });
    expect([Math.round(pl.w), Math.round(pl.h)]).toEqual([1920, 540]);
  });
  it('в экспорте — тот же размер слоя, масштаб lanczos', () => {
    let p = addToMain(addAsset(newProject(undefined, '16:9'), v), 'v', 0).project;
    const id = p.tracks[0].clips[0].id;
    expect(buildGraph(p, { width: 1920, height: 1080, fps: 30, textLayers: [] }).filter).toContain('scale=1920:1080:flags=lanczos');
    p = updateClip(p, id, { stretch: { x: 1, y: 0.5 } });
    expect(buildGraph(p, { width: 1920, height: 1080, fps: 30, textLayers: [] }).filter).toContain('scale=1920:540:flags=lanczos');
  });
});
