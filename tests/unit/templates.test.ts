import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { BUILTIN_TEMPLATES, applyTemplate, isTemplate, projectToTemplate, templateDuration } from '../../src/shared/templates';
import { clipDuration, clipEnd, mainTrack, projectDuration } from '../../src/shared/timeline';
import type { MediaAsset, MediaClip, TextClip } from '../../src/shared/types';

function asset(id: string, kind: MediaAsset['kind'], duration: number): MediaAsset {
  return { id, kind, path: `/m/${id}`, previewPath: `/m/${id}`, name: id, duration, width: 1920, height: 1080, fps: 30, hasVideo: true, hasAudio: kind === 'video', size: 1, rotation: 0, proxy: 'none' };
}
const media = [asset('v1', 'video', 12), asset('v2', 'video', 1.2), asset('img', 'image', 0)];

describe('шаблоны', () => {
  it.each(BUILTIN_TEMPLATES.map((t) => [t.name, t] as const))('%s: собирается из любых файлов', (_n, t) => {
    expect(isTemplate(t)).toBe(true);
    const p = applyTemplate(newProject('x'), t, media);
    expect(p.settings.aspect).toBe(t.aspect);
    const cl = mainTrack(p).clips as MediaClip[];
    expect(cl).toHaveLength(t.slots.length);
    expect(cl[cl.length - 1].transitionOut).toBeUndefined();
    cl.forEach((c, i) => {
      const a = media[i % media.length];
      expect(c.assetId).toBe(a.id);
      expect(c.fit).toBe('cover');
      if (a.kind === 'video') expect(c.out).toBeLessThanOrEqual(a.duration + 1e-9);
      // короткое видео — окошко короче, но не длиннее шаблонного
      expect(clipDuration(c)).toBeLessThanOrEqual(t.slots[i].duration + 1e-9);
    });
    const total = projectDuration(p);
    for (const tx of p.tracks.filter((x) => x.kind === 'text').flatMap((x) => x.clips) as TextClip[]) {
      expect(tx.start).toBeGreaterThanOrEqual(0);
      expect(clipEnd(tx)).toBeLessThanOrEqual(total + 1e-6); // надписи не тянут ролик дальше видео
    }
  });
  it('длина шаблона учитывает переходы', () => {
    const t = BUILTIN_TEMPLATES.find((x) => x.id === 'vlog')!;
    expect(templateDuration(t)).toBeCloseTo(3 + 3 + 3 + 3.5 - 1.5, 6);
    const p = applyTemplate(newProject('x'), t, [asset('long', 'video', 60)]);
    expect(projectDuration(p)).toBeCloseTo(templateDuration(t), 3);
  });
  it('одно и то же видео в разных окошках — разные куски', () => {
    const p = applyTemplate(newProject('x'), BUILTIN_TEMPLATES.find((x) => x.id === 'pulse')!, [asset('long', 'video', 60)]);
    const ins = (mainTrack(p).clips as MediaClip[]).map((c) => c.in);
    expect(new Set(ins).size).toBe(ins.length);
  });
  it('свой шаблон из проекта и обратно', () => {
    const src = BUILTIN_TEMPLATES.find((x) => x.id === 'trip')!;
    const p = applyTemplate(newProject('x'), src, [asset('long', 'video', 60)]);
    const t = projectToTemplate(p, 'Мой');
    expect(isTemplate(t)).toBe(true);
    expect(t.slots.map((s) => s.duration)).toEqual(src.slots.map((s) => s.duration));
    expect(t.slots[0].zoom).toEqual(src.slots[0].zoom);
    expect(t.slots[0].transitionOut).toEqual(src.slots[0].transitionOut);
    expect(t.texts.map((x) => x.text)).toEqual(src.texts.map((x) => x.text));
    const again = applyTemplate(newProject('y'), t, [asset('other', 'image', 0)]);
    expect(projectDuration(again)).toBeCloseTo(projectDuration(p), 3);
    expect(() => projectToTemplate(newProject('empty'), 'x')).toThrow(/нет клипов/);
  });
  it('битый файл шаблона отбрасывается', () => {
    expect(isTemplate({})).toBe(false);
    expect(isTemplate({ id: 'a', name: 'b', aspect: '9:16', slots: [], texts: [] })).toBe(false);
    expect(isTemplate({ id: 'a', name: 'b', aspect: '7:3', slots: [{ duration: 1 }], texts: [] })).toBe(false);
  });
  it('без видео и фото — понятная ошибка', () => {
    expect(() => applyTemplate(newProject('x'), BUILTIN_TEMPLATES[0], [asset('a', 'audio', 3)])).toThrow(/видео или фото/);
  });
});
