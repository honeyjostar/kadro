// Человек отдельным слоем: раскладка клипа на фон и вырезанного человека, неон под бит, экспорт.
import { describe, expect, it } from 'vitest';
import { CAPTION_STYLE, newProject } from '../../src/shared/defaults';
import { addAsset, addText, addToMain, setCaptions, updateClip } from '../../src/shared/timeline';
import { expandPerson, neonPulse, personActive, personWanted } from '../../src/shared/person';
import { buildGraph } from '../../src/shared/exportGraph';
import type { MediaAsset, MediaClip, PersonFx, Project } from '../../src/shared/types';

const video: MediaAsset = { id: 'v', kind: 'video', path: '/m/v.mp4', previewPath: '/m/v.mp4', name: 'v', duration: 6, width: 1920, height: 1080, fps: 30, hasVideo: true, hasAudio: true, size: 1, rotation: 0, proxy: 'none' };
function proj(person: PersonFx | undefined, cut = true): { p: Project; id: string } {
  let p = addAsset(newProject('t', '9:16'), video);
  const r = addToMain(p, 'v', 0);
  p = updateClip(r.project, r.clipId, { person, removeBg: cut ? { enabled: true, status: 'ready', path: '/c/bg.webm', range: [0, 6] } : { enabled: false, status: 'none' } });
  return { p, id: r.clipId };
}
const clip = (p: Project, id: string) => p.tracks.flatMap((t) => t.clips).find((c) => c.id === id) as MediaClip;

describe('человек отдельным слоем', () => {
  it('без фишек или без вырезанного человека — проект тот же', () => {
    const a = proj(undefined).p;
    expect(expandPerson(a)).toBe(a);
    const b = proj({ blur: 0.6 }, false);
    expect(personWanted(clip(b.p, b.id).person)).toBe(true);
    expect(personActive(clip(b.p, b.id))).toBe(false);
    expect(expandPerson(b.p)).toBe(b.p);
  });
  it('портрет: фон — исходник с размытием, человек — сразу над ним, без звука', () => {
    const { p, id } = proj({ blur: 0.6 });
    const e = expandPerson(p);
    const base = clip(e, id);
    expect(base.removeBg.enabled).toBe(false);
    expect(base.effects).toEqual([{ type: 'blur', amount: 0.6 }]);
    expect(e.tracks[1].kind).toBe('video');
    const layer = e.tracks[1].clips[0] as MediaClip;
    expect(layer.id).toBe(`${id}~p`);
    expect(layer.person).toEqual({ layer: true, neon: undefined });
    expect(layer.removeBg.enabled).toBe(true);
    expect(layer.muted).toBe(true);
    expect(layer.effects ?? []).toEqual([]);
    expect(layer.start).toBe(base.start);
    // исходный проект не тронут
    expect(clip(p, id).removeBg.enabled).toBe(true);
  });
  it('текст за человеком: человек над надписями, но под субтитрами', () => {
    let { p, id } = proj({ front: true });
    p = addText(p, 0, 'ГОРЫ').project;
    p = setCaptions(p, [{ start: 0, end: 2, text: 'привет' }], CAPTION_STYLE);
    const e = expandPerson(p);
    const order = e.tracks.map((t) => (t.clips.some((c) => c.id === `${id}~p`) ? 'person' : t.clips.some((c) => c.type === 'text' && c.role === 'caption') ? 'captions' : t.kind));
    expect(order).toEqual(['main', 'text', 'person', 'captions']);
  });
  it('неон пульсирует под бит: вспышка сразу после доли и спад', () => {
    expect(neonPulse(3, [1, 2, 3], false)).toBe(1);
    expect(neonPulse(2.01, [1, 2, 3], true)).toBeGreaterThan(1.4);
    expect(neonPulse(2.45, [1, 2, 3], true)).toBeLessThan(0.8);
    expect(neonPulse(0.5, [1, 2], true)).toBe(0.7); // до первой доли
    expect(neonPulse(1.01, [], true)).toBeGreaterThan(1.4); // без ритма — 2 раза в секунду
  });
  it('экспорт: под человеком — неоновый силуэт, под бит — вспышки', () => {
    const { p } = proj({ neon: { color: '#3df5ff', width: 14, pulse: true } });
    const g = buildGraph(expandPerson(p), { width: 1080, height: 1920, fps: 30, textLayers: [] });
    expect(g.filter).toContain('lutrgb=r=61:g=245:b=255');
    expect(g.filter).toContain('gblur=sigma=');
    expect(g.filter).toMatch(/lt\(mod\(t\\,0\.5\)\\,0\.16\)/);
    expect(g.inputs.some((i) => i.includes('/c/bg.webm'))).toBe(true);
    expect(g.inputs.some((i) => i.includes('/m/v.mp4'))).toBe(true);
  });
});
