import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { copyAttrs, pasteAttrs, pasteTargets } from '../../src/shared/attrs';
import { addAsset, addFree, addText, addToMain, findClip, setTransition, updateClip } from '../../src/shared/timeline';
import type { MediaClip } from '../../src/shared/types';

const video = (id: string, d: number) => ({ id, kind: 'video', path: `/v/${id}.mp4`, name: `${id}.mp4`, duration: d, width: 640, height: 360, hasAudio: true, hasVideo: true, fps: 30 }) as any;
const proj = () => {
  let p = newProject('t', '16:9');
  for (const a of [video('a', 4), video('b', 4), video('c', 4)]) p = addAsset(p, a);
  p = addToMain(p, 'a', 0).project;
  p = addToMain(p, 'b', 99).project;
  p = addToMain(p, 'c', 99).project;
  return p;
};
const media = (p: any, id: string) => findClip(p, id)!.clip as MediaClip;

describe('копировать и вставить параметры клипа', () => {
  it('копия — независимая; группы по умолчанию отмечены как «простые»', () => {
    let p = proj();
    const [a] = p.tracks[0].clips;
    p = updateClip(p, a.id, { transform: { scale: 1.3, x: 0.1, y: -0.05, rotation: 12 }, color: { brightness: 1.2, contrast: 1.1, saturation: 1, warmth: 0.2, preset: 'none', presetAmount: 1 }, effects: [{ type: 'glitch', amount: 0.6 }], volume: 0.5 });
    const at = copyAttrs(media(p, a.id), 'a.mp4');
    expect(at.kind).toBe('media');
    expect(at.plain.sort()).toEqual(['anim', 'keys', 'mask', 'speed', 'transition']);
    // правка исходного клипа после копирования не меняет скопированное
    p = updateClip(p, a.id, { volume: 1 });
    expect(at.values.audio).toMatchObject({ volume: 0.5 });
  });

  it('вставка выбранных групп во все выделенные клипы, остальное не трогается', () => {
    let p = proj();
    const [a, b, c] = p.tracks[0].clips;
    p = updateClip(p, a.id, { transform: { scale: 1.5, x: 0, y: 0, rotation: 0 }, effects: [{ type: 'vhs', amount: 0.5 }], volume: 0.3, chroma: { color: '#00ff00', similarity: 0.2, smoothness: 0.1 } });
    p = updateClip(p, c.id, { volume: 0.9 });
    const at = copyAttrs(media(p, a.id), 'a.mp4');
    const r = pasteAttrs(p, [b.id, c.id], at, ['frame', 'fx', 'mask']);
    expect(r.count).toBe(2);
    for (const id of [b.id, c.id]) {
      expect(media(r.project, id).transform.scale).toBe(1.5);
      expect(media(r.project, id).effects).toEqual([{ type: 'vhs', amount: 0.5 }]);
      expect(media(r.project, id).chroma?.color).toBe('#00ff00');
    }
    expect(media(r.project, c.id).volume).toBe(0.9); // звук не выбран
    // у вставленных — свои копии массивов
    expect(media(r.project, b.id).effects).not.toBe(media(r.project, c.id).effects);
  });

  it('переход — только на основной дорожке и не у последнего клипа; текст — только в текст', () => {
    let p = proj();
    const [a, b, c] = p.tracks[0].clips;
    p = setTransition(p, a.id, { type: 'wipeleft', duration: 0.5 });
    const free = addFree(p, 'c', 1);
    p = free.project;
    const t = addText(p, 0.5, 'Привет');
    p = t.project;
    const at = copyAttrs(media(p, a.id), 'a.mp4');
    expect(pasteTargets(p, [b.id, c.id, free.clipId, t.clipId], at)).toEqual([b.id, c.id, free.clipId]);
    const r = pasteAttrs(p, [b.id, c.id, free.clipId], at, ['transition']);
    expect(media(r.project, b.id).transitionOut?.type).toBe('wipeleft');
    expect(media(r.project, c.id).transitionOut).toBeUndefined(); // последний на основной
    expect(media(r.project, free.clipId).transitionOut).toBeUndefined(); // наложение
    expect(r.count).toBe(1);
  });

  it('оформление текста переносится между надписями', () => {
    let p = proj();
    const t1 = addText(p, 0, 'Один'); p = t1.project;
    const t2 = addText(p, 2, 'Два'); p = t2.project;
    p = updateClip(p, t1.clipId, { style: { ...(findClip(p, t1.clipId)!.clip as any).style, color: '#ff0000', size: 90 } } as any);
    const at = copyAttrs(findClip(p, t1.clipId)!.clip, 'Один');
    expect(at.kind).toBe('text');
    const r = pasteAttrs(p, [t2.clipId], at, ['style']);
    const c2 = findClip(r.project, t2.clipId)!.clip as any;
    expect([c2.style.color, c2.style.size, c2.text]).toEqual(['#ff0000', 90, 'Два']);
  });
});
