// Общие части проекта после правки: неизменённые клипы, дорожки и файлы остаются теми же объектами.
import { describe, expect, it } from 'vitest';
import { shareEqual } from '../../src/shared/share';

const proj = () => ({
  name: 'p', updatedAt: 1,
  assets: [{ id: 'a1', peaks: [0.1, 0.2, 0.3] }, { id: 'a2', peaks: [0.5] }],
  tracks: [
    { id: 't1', clips: [{ id: 'c1', start: 0, color: { preset: 'none', v: 1 } }, { id: 'c2', start: 2, color: { preset: 'none', v: 1 } }] },
    { id: 't2', clips: [{ id: 'c3', start: 1, color: { preset: 'warm', v: 2 } }] },
  ],
});

describe('shareEqual', () => {
  it('ничего не поменялось — тот же объект', () => {
    const a = proj();
    expect(shareEqual(a, structuredClone(a))).toBe(a);
  });

  it('правка одного клипа: новые только он, его дорожка и корень', () => {
    const a = proj();
    const b = structuredClone(a);
    b.tracks[0].clips[1].color.v = 5;
    b.updatedAt = 2;
    const r = shareEqual(a, b);
    expect(r).toEqual(b);
    expect(r).not.toBe(a);
    expect(r.assets).toBe(a.assets);
    expect(r.tracks[1]).toBe(a.tracks[1]);
    expect(r.tracks[0]).not.toBe(a.tracks[0]);
    expect(r.tracks[0].clips[0]).toBe(a.tracks[0].clips[0]);
    expect(r.tracks[0].clips[1]).not.toBe(a.tracks[0].clips[1]);
    expect(r.tracks[0].clips[1].color.v).toBe(5);
  });

  it('вставка и удаление: остальные находятся по id', () => {
    const a = proj();
    const b = structuredClone(a);
    b.tracks[0].clips.unshift({ id: 'c0', start: -1, color: { preset: 'none', v: 0 } });
    b.assets.shift();
    const r = shareEqual(a, b);
    expect(r).toEqual(b);
    expect(r.tracks[0].clips[1]).toBe(a.tracks[0].clips[0]);
    expect(r.tracks[0].clips[2]).toBe(a.tracks[0].clips[1]);
    expect(r.assets[0]).toBe(a.assets[1]);
    expect(r.assets).not.toBe(a.assets);
  });

  it('старое и новое не меняются на месте', () => {
    const a = proj();
    const b = structuredClone(a);
    b.tracks[1].clips[0].start = 9;
    const a0 = structuredClone(a), b0 = structuredClone(b);
    shareEqual(a, b);
    expect(a).toEqual(a0);
    expect(b).toEqual(b0);
  });

  it('ключ пропал или появился, массив стал объектом, null', () => {
    expect(shareEqual({ x: 1, y: 2 } as Record<string, number>, { x: 1 })).toEqual({ x: 1 });
    expect(shareEqual({ x: 1 } as Record<string, number>, { x: 1, y: undefined as unknown as number })).toHaveProperty('y');
    expect(shareEqual([1] as unknown, { 0: 1 } as unknown)).toEqual({ 0: 1 });
    expect(shareEqual({ m: null as unknown }, { m: { a: 1 } })).toEqual({ m: { a: 1 } });
    const same = { list: [1, 2, 3] };
    expect(shareEqual(same, { list: [1, 2, 3] })).toBe(same);
    expect(shareEqual(same, { list: [1, 2] })).toEqual({ list: [1, 2] });
  });
});
