// Корректирующий слой: заглушка без файла, клип на весь кадр, граф экспорта берёт уже собранный кадр.
import { describe, expect, it } from 'vitest';
import { addAdjustLayer, adjustClipForRender } from '../../src/shared/adjust';
import { newProject } from '../../src/shared/defaults';
import { buildGraph } from '../../src/shared/exportGraph';
import { addAsset, addToMain } from '../../src/shared/timeline';
import type { MediaAsset, MediaClip } from '../../src/shared/types';

const video = { id: 'v', kind: 'video', path: '/v.mp4', previewPath: '/v.mp4', name: 'v', duration: 6, width: 1280, height: 720, fps: 30, hasVideo: true, hasAudio: false, size: 1, rotation: 0, proxy: 'none' } as MediaAsset;

describe('корректирующий слой', () => {
  const base = addToMain(addAsset(newProject('t', '16:9'), video), 'v', 0).project;
  const r = addAdjustLayer(base, 'adj1', 1, 3);
  const c = r.project.tracks.flatMap((t) => t.clips).find((x) => x.id === r.clipId) as MediaClip;
  it('своя дорожка поверх, на весь кадр, 3 с с 1 с; файл скрыт и без пути', () => {
    const a = r.project.assets.find((x) => x.id === 'adj1')!;
    expect(a).toMatchObject({ adjust: true, derived: true, path: '' });
    expect(c.start).toBe(1);
    expect(c.out - c.in).toBe(3);
    expect(c.transform).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 });
    expect(r.project.tracks.find((t) => t.clips.includes(c))!.kind).toBe('video');
  });
  it('положение и перспектива слою не нужны — только цвет, эффекты, маска, прозрачность', () => {
    const moved = { ...c, transform: { x: 0.3, y: 0, scale: 2, rotation: 10 }, keyframes: { x: [{ t: 0, v: 0 }], opacity: [{ t: 0, v: 0.5 }] }, tilt: { x: 10, y: 0 } };
    const rc = adjustClipForRender(moved);
    expect(rc.transform).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 });
    expect(rc.keyframes).toEqual({ opacity: [{ t: 0, v: 0.5 }] });
    expect(rc.tilt).toBeUndefined();
  });
  it('экспорт: кусок кадра 1–4 с проходит через цвет слоя и ложится обратно; входа-файла у слоя нет', () => {
    const p = { ...r.project, tracks: r.project.tracks.map((t) => ({ ...t, clips: t.clips.map((x) => (x.id === c.id ? { ...c, color: { ...c.color, saturation: 0 } } : x)) })) };
    const g = buildGraph(p, { width: 1280, height: 720, fps: 30, textLayers: [] });
    expect(g.inputs.some((x) => x.includes(''))).toBe(false);
    expect(g.filter).toMatch(/split=2\[aj\d+\]\[aj\d+\]/);
    expect(g.filter).toMatch(/trim=start=1:duration=3,setpts=PTS-STARTPTS,format=rgba/);
    expect(g.filter).toMatch(/setpts=PTS-STARTPTS\+1\/TB/);
  });
});
