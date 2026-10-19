import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import {
  RAMP_PRESETS, RampMap, normalizeRamp, originalRange, rampSpeedAt, remapKeyframes, retimeBackward, retimeDuration, retimeForward,
} from '../../src/shared/retime';
import { addAsset, addFree, addToMain, clipDuration, clipEnd, findClip, insertFreeze, mainTrack, setRetime, splitClip, updateClip } from '../../src/shared/timeline';
import type { MediaAsset, MediaClip, Project, Retime } from '../../src/shared/types';

function asset(id: string, kind: MediaAsset['kind'], duration: number, derived = false): MediaAsset {
  return {
    id, kind, path: `/m/${id}`, previewPath: `/m/${id}`, name: id, duration, width: 1920, height: 1080, fps: 30,
    hasVideo: kind !== 'audio', hasAudio: kind !== 'image', size: 1, rotation: 0, proxy: 'none', derived,
  };
}

describe('кривая скорости: математика', () => {
  it('постоянная скорость v: длина L/v, туда-обратно сходится', () => {
    const m = new RampMap([{ x: 0, v: 2 }, { x: 1, v: 2 }], 6);
    expect(m.total).toBeCloseTo(3, 9);
    expect(m.forward(4)).toBeCloseTo(2, 9);
    expect(m.inverse(2)).toBeCloseTo(4, 9);
  });

  it('линейная кривая: интеграл совпадает с численным', () => {
    const pts = [{ x: 0, v: 0.5 }, { x: 0.3, v: 4 }, { x: 0.7, v: 0.2 }, { x: 1, v: 1 }];
    const L = 5;
    const m = new RampMap(pts, L);
    let num = 0;
    const N = 200000;
    for (let i = 0; i < N; i++) num += (L / N) / rampSpeedAt(pts, (i + 0.5) / N);
    expect(m.total).toBeCloseTo(num, 4);
    for (const u of [0, 0.4, 1.5, 2.2, 3.49, 4.9, 5]) expect(m.inverse(m.forward(u))).toBeCloseTo(u, 7);
    // за краями — продолжение крайней скоростью
    expect(m.forward(-1)).toBeCloseTo(-2, 9);
    expect(m.inverse(m.forward(6))).toBeCloseTo(6, 7);
  });

  it('пресеты корректны и меняют длину', () => {
    for (const pr of RAMP_PRESETS) {
      const n = normalizeRamp(pr.points);
      expect(n[0].x).toBe(0);
      expect(n[n.length - 1].x).toBe(1);
      expect(new RampMap(n, 4).total).toBeGreaterThan(0.3);
    }
    const hero = new RampMap(RAMP_PRESETS.find((p) => p.id === 'hero')!.points, 4);
    expect(hero.total).toBeGreaterThan(4); // замедление — ролик длиннее
    const bullet = new RampMap(RAMP_PRESETS.find((p) => p.id === 'bullet')!.points, 4);
    // середина «пули» медленная: средняя секунда исходника занимает больше, чем крайняя
    expect(bullet.forward(2.2) - bullet.forward(1.8)).toBeGreaterThan(bullet.forward(0.4) - bullet.forward(0));
  });

  it('нормализация: края, пределы, сортировка', () => {
    const n = normalizeRamp([{ x: 0.5, v: 50 }, { x: 0.2, v: 0.01 }]);
    expect(n).toEqual([{ x: 0, v: 0.1 }, { x: 0.2, v: 0.1 }, { x: 0.5, v: 10 }, { x: 1, v: 10 }]);
  });

  it('реверс + кривая: прямое и обратное отображение', () => {
    const r: Retime = { assetId: 'a', in: 2, out: 6, reverse: true, ramp: [{ x: 0, v: 1 }, { x: 1, v: 3 }] };
    expect(retimeForward(r, 6)).toBeCloseTo(0, 9);
    expect(retimeForward(r, 2)).toBeCloseTo(retimeDuration(r), 9);
    for (const s of [2, 2.5, 4, 5.99]) expect(retimeBackward(r, retimeForward(r, s))).toBeCloseTo(s, 7);
  });
});

describe('реверс и кривая на таймлайне', () => {
  function proj(): Project {
    let p = newProject('t');
    p = addAsset(p, asset('v10', 'video', 10));
    p = addToMain(p, 'v10', 0).project;
    return p;
  }
  const clip = (p: Project) => mainTrack(p).clips[0] as MediaClip;

  it('клип переходит на копию и обратно, ключи переезжают', () => {
    let p = proj();
    const id = clip(p).id;
    p = updateClip(p, id, { in: 2, out: 6, keyframes: { x: [{ t: 2.5, v: -0.2 }, { t: 5, v: 0.3 }] }, removeBg: { enabled: true, status: 'ready', path: '/x.webm', range: [2, 6] } });
    const r: Retime = { assetId: 'v10', in: 2, out: 6, reverse: true };
    p = addAsset(p, asset('rev', 'video', 4, true));
    p = setRetime(p, id, r, 'rev', 0, 4);
    let c = clip(p);
    expect(c.assetId).toBe('rev');
    expect([c.in, c.out]).toEqual([0, 4]);
    // в обратном порядке: ключ 5 с → 1 с копии, 2.5 с → 3.5 с
    expect(c.keyframes!.x!.map((k) => [k.t, k.v])).toEqual([[1, 0.3], [3.5, -0.2]]);
    expect(c.removeBg.status).toBe('none');
    expect(c.removeBg.enabled).toBe(true); // включено — обработка повторится
    expect(originalRange(c)).toEqual({ assetId: 'v10', in: 2, out: 6 });
    // обрезали копию с начала на 1 с — это последняя секунда исходника
    p = updateClip(p, id, { in: 1 });
    expect(originalRange(clip(p))).toEqual({ assetId: 'v10', in: 2, out: 5 });
    // вернули исходник: фрагмент 2..5, ключи на месте, служебная копия удалена из проекта
    const o = originalRange(clip(p));
    p = setRetime(p, id, undefined, o.assetId, o.in, o.out);
    c = clip(p);
    expect([c.assetId, c.in, c.out]).toEqual(['v10', 2, 5]);
    expect(c.retime).toBeUndefined();
    expect(c.keyframes!.x!.map((k) => k.t)).toEqual([2.5, 5]);
    expect(p.assets.find((a) => a.id === 'rev')).toBeUndefined();
  });

  it('кривая сбрасывает постоянную скорость, разрезание сохраняет отображение', () => {
    let p = proj();
    const id = clip(p).id;
    p = updateClip(p, id, { speed: 2 });
    const r: Retime = { assetId: 'v10', in: 0, out: 10, reverse: false, ramp: [{ x: 0, v: 2 }, { x: 1, v: 2 }] };
    p = addAsset(p, asset('rmp', 'video', 5, true));
    p = setRetime(p, id, r, 'rmp', 0, 5);
    expect(clip(p).speed).toBe(1);
    expect(clipDuration(clip(p))).toBe(5);
    const right = splitClip(p, id, 2);
    const q = right.project;
    const a = findClip(q, id)!.clip as MediaClip;
    const b = findClip(q, right.clipId)!.clip as MediaClip;
    expect(originalRange(a)).toEqual({ assetId: 'v10', in: 0, out: 4 });
    expect(originalRange(b)).toEqual({ assetId: 'v10', in: 4, out: 10 });
  });

  it('ключи без кривой не трогаются', () => {
    expect(remapKeyframes({ scale: [{ t: 1, v: 1 }] }, undefined, undefined)).toEqual({ scale: [{ t: 1, v: 1 }] });
  });
});

describe('стоп-кадр', () => {
  it('на основной дорожке: разрез, картинка между частями, хвост сдвигается', () => {
    let p = newProject('t');
    p = addAsset(p, asset('v10', 'video', 10));
    p = addAsset(p, asset('v6', 'video', 6));
    p = addToMain(p, 'v10', 0).project;
    p = addToMain(p, 'v6', 10).project;
    const id = mainTrack(p).clips[0].id;
    p = updateClip(p, id, { transform: { scale: 1.2, x: 0.1, y: 0, rotation: 0 }, keyframes: { x: [{ t: 0, v: 0 }, { t: 8, v: 0.4 }] }, effects: [{ type: 'vignette', amount: 0.5 }] });
    p = addAsset(p, asset('fr', 'image', 0, true));
    const r = insertFreeze(p, id, 4, 'fr', 2);
    const cl = mainTrack(r.project).clips as MediaClip[];
    expect(cl.map((c) => [c.assetId, c.start, clipDuration(c)])).toEqual([['v10', 0, 4], ['fr', 4, 2], ['v10', 6, 6], ['v6', 12, 6]]);
    const img = cl[1];
    expect(img.id).toBe(r.clipId);
    expect(img.transform.x).toBeCloseTo(0.2, 6); // значение ключей в момент стоп-кадра
    expect(img.transform.scale).toBe(1.2);
    expect(img.keyframes).toBeUndefined();
    expect(img.effects).toEqual([{ type: 'vignette', amount: 0.5 }]);
    expect(cl[2].in).toBe(4);
  });

  it('на дорожке наложений: сдвигаются только клипы после курсора', () => {
    let p = newProject('t');
    p = addAsset(p, asset('v10', 'video', 10));
    p = addAsset(p, asset('ov', 'video', 3));
    p = addToMain(p, 'v10', 0).project;
    const a = addFree(p, 'ov', 1);
    p = a.project;
    const b = addFree(p, 'ov', 5);
    p = b.project;
    p = addAsset(p, asset('fr', 'image', 0, true));
    const r = insertFreeze(p, a.clipId, 2, 'fr', 1.5);
    const t = r.project.tracks.find((x) => x.kind === 'video')!;
    expect(t.clips.map((c) => [c.start, clipEnd(c)])).toEqual([[1, 2], [2, 3.5], [3.5, 5.5], [6.5, 9.5]]);
    expect(mainTrack(r.project).clips[0].start).toBe(0);
  });
});

describe('группы', () => {
  async function load() { return import('../../src/shared/timeline'); }
  function proj(): Project {
    let p = newProject('t');
    p = addAsset(p, asset('a', 'video', 4));
    p = addAsset(p, asset('b', 'video', 3));
    p = addAsset(p, asset('c', 'video', 5));
    p = addAsset(p, asset('ov', 'image', 0));
    p = addToMain(p, 'a', 0).project;
    p = addToMain(p, 'b', 4).project;
    p = addToMain(p, 'c', 7).project;
    return p;
  }
  it('проверки выделения', async () => {
    const { planGroup } = await load();
    let p = proj();
    const [a, b, c] = mainTrack(p).clips.map((x) => x.id);
    expect(planGroup(p, [a])).toHaveProperty('error');
    expect((planGroup(p, [a, c]) as { error: string }).error).toMatch(/подряд/);
    const ov = addFree(p, 'ov', 6);
    p = updateClip(ov.project, ov.clipId, { out: 3 }); // 6..9 — выходит за клипы a+b (0..7)
    expect((planGroup(p, [a, b, ov.clipId]) as { error: string }).error).toMatch(/выходить/);
    expect(planGroup(p, [b, c, ov.clipId])).not.toHaveProperty('error');
  });
  it('группа на основной дорожке и разгруппировка', async () => {
    const { planGroup, applyGroup, ungroupClip, setTransition } = await load();
    let p = proj();
    const [a, b, c] = mainTrack(p).clips.map((x) => x.id);
    p = setTransition(p, b, { type: 'fade', duration: 0.5 });
    const ov = addFree(p, 'ov', 5);
    p = updateClip(ov.project, ov.clipId, { out: 1.5 });
    const plan = planGroup(p, [b, a, ov.clipId]);
    if ('error' in plan) throw new Error(plan.error);
    expect(plan.t0).toBe(0);
    expect(plan.data.alpha).toBe(false);
    expect(plan.data.duration).toBe(7);
    expect(plan.data.tracks[0].clips.map((x) => x.start)).toEqual([0, 4]);
    expect((plan.data.tracks[0].clips[1] as MediaClip).transitionOut).toBeUndefined(); // переход к c остаётся у группы
    expect(plan.data.tracks[1].clips[0].start).toBe(5);
    p = addAsset(p, asset('grp', 'video', 7, true));
    const g = applyGroup(p, [a, b, ov.clipId], 'grp', plan.data, plan.t0);
    const cl = mainTrack(g.project).clips as MediaClip[];
    expect(cl.map((x) => [x.assetId, x.start])).toEqual([['grp', 0], ['c', 6.5]]);
    expect(cl[0].transitionOut?.type).toBe('fade');
    expect(g.project.tracks.filter((t) => t.kind === 'video')).toHaveLength(0);
    // разгруппировка возвращает всё на место
    const u = ungroupClip(g.project, g.clipId);
    const back = mainTrack(u.project).clips as MediaClip[];
    expect(back.map((x) => [x.assetId, x.start])).toEqual([['a', 0], ['b', 4], ['c', 6.5]]);
    expect(back[1].transitionOut?.type).toBe('fade');
    const vt = u.project.tracks.find((t) => t.kind === 'video')!;
    expect(vt.clips[0].start).toBe(5);
    expect(u.ids).toHaveLength(3);
    expect(u.project.assets.find((x) => x.id === 'grp')).toBeUndefined();
  });
  it('группа из наложений — прозрачная, встаёт на дорожку наложений', async () => {
    const { planGroup, applyGroup, ungroupClip, addText, moveClip } = await load();
    let p = proj();
    const o1 = addFree(p, 'ov', 2); p = o1.project;
    const t1 = addText(p, 3, 'Привет'); p = t1.project;
    const plan = planGroup(p, [o1.clipId, t1.clipId]);
    if ('error' in plan) throw new Error(plan.error);
    expect(plan.data.alpha).toBe(true);
    expect(plan.t0).toBe(2);
    expect(plan.data.tracks[0].clips).toHaveLength(0);
    p = addAsset(p, asset('grp', 'video', plan.data.duration, true));
    const g = applyGroup(p, [o1.clipId, t1.clipId], 'grp', plan.data, plan.t0);
    const gc = findClip(g.project, g.clipId)!;
    expect(gc.track.kind).toBe('video');
    expect(gc.clip.start).toBe(2);
    expect(g.project.tracks.some((t) => t.kind === 'text')).toBe(false);
    // сдвинули группу на 1 с позже — после разгруппировки клипы тоже позже
    const moved = moveClip(g.project, g.clipId, 3);
    const u = ungroupClip(moved, g.clipId);
    const txt = u.project.tracks.find((t) => t.kind === 'text')!.clips[0];
    expect(txt.start).toBe(4);
  });
});
