import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import {
  activeClipsAt, addAsset, addFree, addText, addToMain, clipDuration, clipEnd, deleteClips, duplicateClip,
  findClip, keepSourceRanges, mainTrack, moveClip, projectDuration, reorderMain, setCaptions, setTransition,
  splitClip, trimClip, updateClip, mainToOverlay, styleAllCaptions, sourceTimeAt,
} from '../../src/shared/timeline';
import { CAPTION_STYLE } from '../../src/shared/defaults';
import type { MediaAsset, MediaClip, Project } from '../../src/shared/types';

function asset(id: string, kind: MediaAsset['kind'], duration: number): MediaAsset {
  return {
    id, kind, path: `/m/${id}`, previewPath: `/m/${id}`, name: id, duration, width: 1920, height: 1080, fps: 30,
    hasVideo: kind !== 'audio', hasAudio: kind !== 'image', size: 1, rotation: 0, proxy: 'none',
  };
}

function base(): Project {
  let p = newProject('t');
  p = addAsset(p, asset('v10', 'video', 10));
  p = addAsset(p, asset('v6', 'video', 6));
  p = addAsset(p, asset('img', 'image', 0));
  p = addAsset(p, asset('mus', 'audio', 30));
  return p;
}

const mainClips = (p: Project) => mainTrack(p).clips as MediaClip[];

describe('основная дорожка (магнитная)', () => {
  it('добавляет клипы подряд без дыр', () => {
    let p = base();
    p = addToMain(p, 'v10', 0).project;
    p = addToMain(p, 'v6', 100).project;
    p = addToMain(p, 'img', 100).project;
    const c = mainClips(p);
    expect(c.map((x) => x.start)).toEqual([0, 10, 16]);
    expect(clipDuration(c[2])).toBe(3);
    expect(projectDuration(p)).toBe(19);
  });

  it('вставляет после клипа под плейхедом', () => {
    let p = base();
    p = addToMain(p, 'v10', 0).project;
    p = addToMain(p, 'v6', 0).project; // плейхед в 0 → перед первым
    expect(mainClips(p).map((c) => c.assetId)).toEqual(['v6', 'v10']);
    p = addToMain(p, 'img', 7).project; // внутри v10 (6..16) → после него
    expect(mainClips(p).map((c) => c.assetId)).toEqual(['v6', 'v10', 'img']);
  });

  it('разрезание сохраняет общую длину и продолжает исходник', () => {
    let p = addToMain(base(), 'v10', 0).project;
    const id = mainClips(p)[0].id;
    const r = splitClip(p, id, 4);
    p = r.project;
    const [a, b] = mainClips(p);
    expect(a.out).toBe(4);
    expect(b.in).toBe(4);
    expect(b.start).toBe(4);
    expect(projectDuration(p)).toBe(10);
    expect(r.clipId).toBe(b.id);
  });

  it('разрез привязан к сетке кадров (30 fps)', () => {
    let p = addToMain(base(), 'v10', 0).project;
    p = splitClip(p, mainClips(p)[0].id, 4.0123).project;
    expect(Math.round(mainClips(p)[0].out * 30)).toBeCloseTo(mainClips(p)[0].out * 30, 6);
  });

  it('удаление из середины схлопывает дыру', () => {
    let p = base();
    p = addToMain(p, 'v10', 0).project;
    p = addToMain(p, 'v6', 100).project;
    p = addToMain(p, 'img', 100).project;
    p = deleteClips(p, [mainClips(p)[1].id]);
    expect(mainClips(p).map((c) => c.start)).toEqual([0, 10]);
    expect(projectDuration(p)).toBe(13);
  });

  it('скорость меняет длительность и сдвигает следующие', () => {
    let p = base();
    p = addToMain(p, 'v10', 0).project;
    p = addToMain(p, 'v6', 100).project;
    p = updateClip(p, mainClips(p)[0].id, { speed: 2 });
    expect(clipDuration(mainClips(p)[0])).toBe(5);
    expect(mainClips(p)[1].start).toBe(5);
    p = updateClip(p, mainClips(p)[0].id, { speed: 10 });
    expect(mainClips(p)[0].speed).toBe(4); // ограничение
  });

  it('обрезка краёв: правый, левый, пределы исходника', () => {
    let p = base();
    p = addToMain(p, 'v10', 0).project;
    p = addToMain(p, 'v6', 100).project;
    const id = mainClips(p)[0].id;
    p = trimClip(p, id, 'end', 7);
    expect(mainClips(p)[0].out).toBe(7);
    expect(mainClips(p)[1].start).toBe(7);
    p = trimClip(p, id, 'start', 2);
    expect(mainClips(p)[0].in).toBe(2);
    expect(mainClips(p)[0].start).toBe(0);
    expect(clipDuration(mainClips(p)[0])).toBe(5);
    p = trimClip(p, id, 'end', 999);
    expect(mainClips(p)[0].out).toBe(10); // не длиннее исходника
    p = trimClip(p, id, 'start', -50);
    expect(mainClips(p)[0].in).toBe(0);
  });

  it('картинку можно растянуть сколько угодно', () => {
    let p = addToMain(base(), 'img', 0).project;
    p = trimClip(p, mainClips(p)[0].id, 'end', 42);
    expect(clipDuration(mainClips(p)[0])).toBe(42);
  });

  it('переход: перекрытие и ограничение длины', () => {
    let p = base();
    p = addToMain(p, 'v10', 0).project;
    p = addToMain(p, 'v6', 100).project;
    p = setTransition(p, mainClips(p)[0].id, { type: 'fade', duration: 1 });
    expect(mainClips(p)[1].start).toBe(9);
    expect(projectDuration(p)).toBe(15);
    p = setTransition(p, mainClips(p)[0].id, { type: 'fade', duration: 50 });
    expect(mainClips(p)[0].transitionOut!.duration).toBeCloseTo(6 * 0.45, 6);
    // у последнего клипа перехода быть не может
    p = setTransition(p, mainClips(p)[1].id, { type: 'fade', duration: 1 });
    expect(mainClips(p)[1].transitionOut).toBeUndefined();
  });

  it('переупорядочивание', () => {
    let p = base();
    p = addToMain(p, 'v10', 0).project;
    p = addToMain(p, 'v6', 100).project;
    p = reorderMain(p, mainClips(p)[1].id, 0);
    expect(mainClips(p).map((c) => c.assetId)).toEqual(['v6', 'v10']);
    expect(mainClips(p)[1].start).toBe(6);
  });

  it('дублирование вставляет копию сразу после', () => {
    let p = addToMain(base(), 'v6', 0).project;
    p = duplicateClip(p, mainClips(p)[0].id).project;
    expect(mainClips(p).length).toBe(2);
    expect(mainClips(p)[1].start).toBe(6);
    expect(mainClips(p)[0].id).not.toBe(mainClips(p)[1].id);
  });
});

describe('свободные дорожки', () => {
  it('аудио кладётся на свою дорожку, при пересечении создаётся новая', () => {
    let p = base();
    p = addFree(p, 'mus', 0).project;
    p = addFree(p, 'mus', 5).project;
    const audio = p.tracks.filter((t) => t.kind === 'audio');
    expect(audio.length).toBe(2);
    expect(p.tracks[p.tracks.length - 1].kind).toBe('audio');
  });

  it('текст: добавление, перемещение, обрезка', () => {
    let p = base();
    const r = addText(p, 2, 'Привет');
    p = r.project;
    p = moveClip(p, r.clipId, 5);
    const f = findClip(p, r.clipId)!;
    expect(f.clip.start).toBe(5);
    p = trimClip(p, r.clipId, 'end', 10);
    expect(clipEnd(findClip(p, r.clipId)!.clip)).toBe(10);
    p = trimClip(p, r.clipId, 'start', 7);
    expect(findClip(p, r.clipId)!.clip.start).toBe(7);
    expect(clipDuration(findClip(p, r.clipId)!.clip)).toBe(3);
  });

  it('визуальные дорожки идут выше основной и ниже аудио', () => {
    let p = base();
    p = addFree(p, 'mus', 0).project;
    p = addText(p, 0, 'a').project;
    p = addFree(p, 'img', 0).project;
    const kinds = p.tracks.map((t) => t.kind);
    expect(kinds[0]).toBe('main');
    expect(kinds.indexOf('audio')).toBe(kinds.length - 1);
  });

  it('с основной дорожки на наложение и обратно', () => {
    let p = base();
    p = addToMain(p, 'v10', 0).project;
    p = addToMain(p, 'v6', 100).project;
    const id = mainClips(p)[1].id;
    p = mainToOverlay(p, id, 2);
    expect(mainClips(p).length).toBe(1);
    const ov = p.tracks.find((t) => t.kind === 'video')!;
    expect(ov.clips[0].start).toBe(2);
    p = moveClip(p, id, 20, mainTrack(p).id);
    expect(mainClips(p).length).toBe(2);
    expect(p.tracks.some((t) => t.kind === 'video')).toBe(false); // пустая дорожка удалена
  });

  it('пустые дорожки удаляются, основная остаётся', () => {
    let p = base();
    const r = addText(p, 0, 'x');
    p = deleteClips(r.project, [r.clipId]);
    expect(p.tracks.length).toBe(1);
    expect(p.tracks[0].kind).toBe('main');
  });
});

describe('ИИ-операции', () => {
  it('вырезание пауз: оставляет только речь, без дыр', () => {
    let p = base();
    p = addToMain(p, 'v10', 0).project;
    p = addToMain(p, 'v6', 100).project;
    const id = mainClips(p)[0].id;
    p = keepSourceRanges(p, id, [[0.5, 2], [3, 3.05], [4, 7.5]]); // 3..3.05 короче минимума — выкинется
    const c = mainClips(p);
    expect(c.length).toBe(3);
    expect(c[0].in).toBe(0.5);
    expect(c[1].in).toBe(4);
    expect(c[1].start).toBeCloseTo(1.5, 6);
    expect(c[2].assetId).toBe('v6');
    expect(c[2].start).toBeCloseTo(5, 6);
  });

  it('субтитры: создание, замена, общий стиль', () => {
    let p = base();
    p = setCaptions(p, [{ start: 0, end: 1.5, text: 'раз' }, { start: 1.5, end: 3, text: 'два' }], CAPTION_STYLE);
    let caps = p.tracks.filter((t) => t.kind === 'text');
    expect(caps.length).toBe(1);
    expect(caps[0].clips.length).toBe(2);
    p = setCaptions(p, [{ start: 0, end: 1, text: 'новые' }], CAPTION_STYLE);
    caps = p.tracks.filter((t) => t.kind === 'text');
    expect(caps.length).toBe(1);
    expect((caps[0].clips[0] as any).text).toBe('новые');
    p = styleAllCaptions(p, { color: '#ffe14d' }, 0.5);
    const c0 = p.tracks.find((t) => t.kind === 'text')!.clips[0] as any;
    expect(c0.style.color).toBe('#ffe14d');
    expect(c0.y).toBe(0.5);
  });

  it('activeClipsAt и sourceTimeAt', () => {
    let p = base();
    p = addToMain(p, 'v10', 0).project;
    p = updateClip(p, mainClips(p)[0].id, { in: 2, speed: 2 });
    const act = activeClipsAt(p, 1);
    expect(act.length).toBe(1);
    expect(sourceTimeAt(act[0].clip as MediaClip, 1)).toBe(4);
  });

  it('операции не мутируют исходный проект', () => {
    const p = addToMain(base(), 'v10', 0).project;
    const snapshot = JSON.stringify(p);
    splitClip(p, mainClips(p)[0].id, 3);
    trimClip(p, mainClips(p)[0].id, 'end', 3);
    deleteClips(p, [mainClips(p)[0].id]);
    expect(JSON.stringify(p)).toBe(snapshot);
  });
});

describe('анимации появления и исчезновения клипа', () => {
  it('при разрезании появление остаётся слева, исчезновение — справа', async () => {
    const { newProject } = await import('../../src/shared/defaults');
    const tl = await import('../../src/shared/timeline');
    let p = newProject('a', '16:9');
    p = tl.addAsset(p, { id: 'v', kind: 'video', path: '/v.mp4', previewPath: '/v.mp4', name: 'v', duration: 10, width: 1920, height: 1080, fps: 30, hasVideo: true, hasAudio: false, size: 1, rotation: 0, proxy: 'none' });
    p = tl.addToMain(p, 'v', 0).project;
    const id = tl.mainTrack(p).clips[0].id;
    p = tl.updateClip(p, id, { anim: { in: { type: 'pop', dur: 0.5 }, out: { type: 'fade', dur: 0.5 } } });
    const r = tl.splitClip(p, id, 4);
    const [a, b] = tl.mainTrack(r.project).clips as import('../../src/shared/types').MediaClip[];
    expect(a.anim).toEqual({ in: { type: 'pop', dur: 0.5 } });
    expect(b.anim).toEqual({ out: { type: 'fade', dur: 0.5 } });
  });
});
