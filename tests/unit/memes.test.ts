import { describe, expect, it } from 'vitest';
import { bassBoost, DRAMA_STEPS, dramaZoom, slowMo, SLOWMO_SPEED, toBeContinued } from '../../src/shared/memes';
import { addAsset, addToMain, clipDuration } from '../../src/shared/timeline';
import { newProject } from '../../src/shared/defaults';
import { TBC_DUR } from '../../src/shared/tbc';
import type { MediaAsset, MediaClip, TextClip } from '../../src/shared/types';

const video = (id: string, duration: number): MediaAsset => ({ id, kind: 'video', path: `/v/${id}.mp4`, name: `${id}.mp4`, duration, width: 1920, height: 1080, fps: 30, hasAudio: true } as MediaAsset);
const img = { id: 'fz', kind: 'image', path: '/v/fz.png', name: 'fz', duration: 0, width: 1920, height: 1080, fps: 0, hasAudio: false } as unknown as MediaAsset;
const setup = () => {
  const p = addToMain(addAsset(newProject(), video('a', 10)), 'a', 0).project;
  return { p, id: p.tracks[0].clips[0].id };
};
const main = (p: ReturnType<typeof newProject>) => p.tracks[0].clips as MediaClip[];

describe('мем-кнопки', () => {
  it('драматический зум: три рывка крупнее и обратно — ключевые кадры масштаба от курсора', () => {
    const { p, id } = setup();
    const r = dramaZoom(p, id, 2);
    if ('error' in r) throw new Error(r.error);
    const k = main(r.project)[0].keyframes!.scale!;
    expect(k.map((x) => x.t)).toEqual(DRAMA_STEPS.map(([dt]) => 2 + dt));
    expect(k.map((x) => x.v)).toEqual(DRAMA_STEPS.map(([, f]) => f));
    expect(Math.max(...k.map((x) => x.v))).toBeCloseTo(2.1);
  });
  it('курсор не на клипе — понятная ошибка', () => {
    const { p, id } = setup();
    expect('error' in dramaZoom(p, id, 30)).toBe(true);
  });
  it('басс-буст: кусок 1,6 с отдельным клипом с тряской и «ударом», громче', () => {
    const { p, id } = setup();
    const r = bassBoost(p, id, 3);
    if ('error' in r) throw new Error(r.error);
    const clips = main(r.project);
    expect(clips).toHaveLength(3);
    const mid = clips.find((c) => c.id === r.clipId)!;
    expect(mid.start).toBeCloseTo(3);
    expect(clipDuration(mid)).toBeCloseTo(1.6, 1);
    expect(mid.effects?.map((e) => e.type)).toEqual(['shake', 'pulse']);
    expect(mid.volume).toBeGreaterThan(1);
  });
  it('замедление: 0,8 с записи в 0,3 раза — ролик длиннее, остальное на месте', () => {
    const { p, id } = setup();
    const r = slowMo(p, id, 4);
    if ('error' in r) throw new Error(r.error);
    const clips = main(r.project);
    const mid = clips.find((c) => c.id === r.clipId)!;
    expect(mid.speed).toBe(SLOWMO_SPEED);
    expect(mid.out - mid.in).toBeCloseTo(0.8, 1);
    expect(clipDuration(mid)).toBeCloseTo(0.8 / SLOWMO_SPEED, 1);
    expect(clips.reduce((s, c) => s + clipDuration(c), 0)).toBeCloseTo(10 - 0.8 + 0.8 / SLOWMO_SPEED, 1);
  });
  it('«Продолжение следует…»: стоп-кадр в сепии и плашка-стрелка на то же время', () => {
    const { p, id } = setup();
    const r = toBeContinued(addAsset(p, img), id, 5, 'fz', true);
    if ('error' in r) throw new Error(r.error);
    const clips = main(r.project);
    const fz = clips.find((c) => c.id === r.clipId)!;
    expect(fz).toMatchObject({ assetId: 'fz', start: 5 });
    expect(clipDuration(fz)).toBeCloseTo(TBC_DUR);
    expect(fz.color.preset).toBe('sepia');
    const txt = r.project.tracks.flatMap((t) => t.clips).find((c) => c.id === r.textId) as TextClip;
    expect(txt).toMatchObject({ widget: 'tbc', start: 5, duration: TBC_DUR });
  });
});
