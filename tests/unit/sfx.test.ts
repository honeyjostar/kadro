// Звуки на стыках: встают ровно на стык (середину перехода), едут вместе с клипами.
import { describe, expect, it, beforeAll } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { addAsset, addToMain, setTransition, updateClip } from '../../src/shared/timeline';
import { SFX, expandSfx, junctionAt, setSfxFiles } from '../../src/shared/sfx';
import { buildGraph } from '../../src/shared/exportGraph';
import type { MediaAsset, MediaClip, Project } from '../../src/shared/types';

const img = (id: string): MediaAsset => ({ id, kind: 'image', path: `/m/${id}.png`, previewPath: `/m/${id}.png`, name: id, duration: 0, width: 640, height: 360, fps: 0, hasVideo: true, hasAudio: false, size: 1, rotation: 0, proxy: 'none' });
function proj(): { p: Project; ids: string[] } {
  let p = newProject('t');
  const ids: string[] = [];
  for (const id of ['a', 'b', 'c']) {
    p = addAsset(p, img(id));
    const r = addToMain(p, id, 100);
    p = updateClip(r.project, r.clipId, { out: 2 });
    ids.push(r.clipId);
  }
  return { p, ids };
}
beforeAll(() => setSfxFiles({ whoosh: '/s/whoosh.m4a', click: '/s/click.m4a', boom: '/s/boom.m4a' }));

describe('звуки на стыках', () => {
  it('стык — конец клипа или середина перехода; у последнего клипа стыка нет', () => {
    let { p, ids } = proj();
    expect(junctionAt(p, ids[0])).toBeCloseTo(2, 3);
    p = setTransition(p, ids[0], { type: 'fade', duration: 0.5 });
    expect(junctionAt(p, ids[0])).toBeCloseTo(1.75, 3);
    expect(junctionAt(p, ids[2])).toBeNull();
  });
  it('звук — на своей дорожке: свуш заранее (пик на стыке), «бум» — ровно на стыке', () => {
    let { p, ids } = proj();
    expect(expandSfx(p)).toBe(p);
    p = updateClip(p, ids[0], { cutSound: 'whoosh' });
    p = updateClip(p, ids[1], { cutSound: 'boom' });
    p = updateClip(p, ids[2], { cutSound: 'click' }); // последний — без стыка
    const e = expandSfx(p);
    const t = e.tracks[e.tracks.length - 1];
    expect(t).toMatchObject({ kind: 'audio', id: 'sfx~track' });
    const cs = t.clips as MediaClip[];
    expect(cs.map((c) => [c.assetId, Math.round(c.start * 100) / 100, c.volume])).toEqual([
      ['sfx~whoosh', Math.round((2 - SFX.whoosh.lead) * 100) / 100, SFX.whoosh.vol],
      ['sfx~boom', Math.round((4 - SFX.boom.lead) * 100) / 100, SFX.boom.vol],
    ]);
    expect(e.assets.find((a) => a.id === 'sfx~boom')).toMatchObject({ kind: 'audio', path: '/s/boom.m4a', duration: SFX.boom.dur });
    // исходный проект не тронут
    expect(p.tracks.some((x) => x.id === 'sfx~track')).toBe(false);
    // экспорт: файл звука на входе, звук в общем миксе
    const g = buildGraph(e, { width: 640, height: 360, fps: 30, textLayers: [] });
    expect(g.inputs.some((i) => i.includes('/s/whoosh.m4a'))).toBe(true);
    expect(g.filter).toContain('amix');
  });
});
