import { describe, expect, it } from 'vitest';
import { FONTS, TEXT_PRESETS, TRANSITIONS, newProject } from '../../src/shared/defaults';
import { FILTER_PRESETS } from '../../src/shared/color';
import { EFFECTS } from '../../src/shared/effects';
import { BUILTIN_TEMPLATES, DEMO_BPM, DEMO_SCENES, DEMO_TEMPLATE, TEMPLATE_CATS, applyTemplate, isTemplate, projectToTemplate, templateDuration } from '../../src/shared/templates';
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
  it.each([...BUILTIN_TEMPLATES, DEMO_TEMPLATE].map((t) => [t.name, t] as const))('%s: шрифты, стили, фильтры, эффекты и переходы существуют', (_n, t) => {
    const fonts = new Set(FONTS.map((f) => f.family));
    for (const x of t.texts) {
      if (x.style?.font) expect(fonts.has(x.style.font), `шрифт ${x.style.font}`).toBe(true);
      if (x.preset) expect(TEXT_PRESETS.some((p) => p.id === x.preset), `стиль ${x.preset}`).toBe(true);
    }
    for (const s of t.slots) {
      if (s.color?.preset) expect(FILTER_PRESETS.some((p) => p.id === s.color!.preset), `фильтр ${s.color.preset}`).toBe(true);
      for (const e of s.effects ?? []) expect(EFFECTS.some((x) => x.type === e.type), `эффект ${e.type}`).toBe(true);
      if (s.transitionOut) expect(TRANSITIONS.some((x) => x.type === s.transitionOut!.type), `переход ${s.transitionOut.type}`).toBe(true);
    }
    for (const d of t.demo ?? []) expect(DEMO_SCENES).toContain(d);
  });
  it('у каждого встроенного шаблона есть раздел, демо-ролики и уникальный id', () => {
    const ids = BUILTIN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(18);
    for (const t of BUILTIN_TEMPLATES) {
      expect(TEMPLATE_CATS.map((c) => c.id), t.id).toContain(t.cat);
      expect(t.demo?.length, t.id).toBeGreaterThan(0);
    }
  });
  it('одновременные надписи — на разных дорожках, в одной дорожке они не перекрываются', () => {
    const p = applyTemplate(newProject('x'), DEMO_TEMPLATE, [asset('long', 'video', 60)]);
    const tracks = p.tracks.filter((t) => t.kind === 'text');
    expect(tracks.length).toBeGreaterThanOrEqual(2);
    expect(tracks.flatMap((t) => t.clips)).toHaveLength(DEMO_TEMPLATE.texts.length);
    for (const t of tracks) {
      for (let i = 1; i < t.clips.length; i++) expect(t.clips[i].start).toBeGreaterThanOrEqual(clipEnd(t.clips[i - 1]) - 1e-6);
    }
  });
  it('демо-проект: склейки ровно на долях бита', () => {
    const p = applyTemplate(newProject('x'), DEMO_TEMPLATE, [asset('long', 'video', 60)]);
    const beat = 60 / DEMO_BPM;
    for (const c of mainTrack(p).clips) { const k = c.start / (4 * beat); expect(Math.abs(k - Math.round(k))).toBeLessThan(0.002); }
    expect(templateDuration(DEMO_TEMPLATE)).toBeCloseTo(30 * beat, 2);
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
