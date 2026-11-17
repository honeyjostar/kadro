// Подкаст: камера сама переключается на говорящего — кто громче в своём микрофоне, не чаще раза в 2 с,
// вместе говорят — общий план; оставить ракурс только в его кусках.
import { describe, expect, it } from 'vitest';
import { newMediaClip, newProject, newTrack } from '../../src/shared/defaults';
import { keepOnly, rangesOf, speakers, switchPlan, SWITCH_DEFAULTS } from '../../src/shared/multicam';
import type { MediaAsset } from '../../src/shared/types';

/** Громкость двух микрофонов по 0,1 с: кто говорит — громко в своём и тише в чужом. */
function talk(script: { who: 0 | 1 | 'both' | 'none'; sec: number }[], gainB = 1): number[][] {
  const a: number[] = [], b: number[] = [];
  for (const s of script) {
    for (let i = 0; i < Math.round(s.sec * 10); i++) {
      const near = 0.2 + 0.02 * Math.sin(i), far = 0.06;
      a.push(s.who === 0 || s.who === 'both' ? near : s.who === 1 ? far : 0.002);
      b.push((s.who === 1 || s.who === 'both' ? near : s.who === 0 ? far : 0.002) * gainB);
    }
  }
  return [a, b];
}

describe('кто говорит', () => {
  it('у каждого свой микрофон и своя громкость (вторая камера пишет вдвое тише) — всё равно различаются', () => {
    const w = speakers(talk([{ who: 0, sec: 3 }, { who: 1, sec: 3 }, { who: 'none', sec: 2 }, { who: 'both', sec: 2 }], 0.5));
    expect(w[15]).toBe(0);
    expect(w[45]).toBe(1);
    expect(w[70]).toBe(-1);
    expect(w[90]).toBe(-2);
  });
});

describe('план переключений', () => {
  it('А 4 с → Б 5 с → А 3 с: две склейки чуть раньше первых слов', () => {
    const shots = switchPlan(talk([{ who: 0, sec: 4 }, { who: 1, sec: 5 }, { who: 0, sec: 3 }]));
    expect(shots.map((s) => s.angle)).toEqual([0, 1, 0]);
    expect(shots[1].t0).toBeGreaterThan(3.5);
    expect(shots[1].t0).toBeLessThan(4.2);
    expect(shots[shots.length - 1].t1).toBe(12);
  });
  it('короткие «ага» собеседника не переключают; кадр не короче 2 с', () => {
    const shots = switchPlan(talk([{ who: 0, sec: 3 }, { who: 1, sec: 0.5 }, { who: 0, sec: 2 }, { who: 1, sec: 0.4 }, { who: 0, sec: 3 }, { who: 1, sec: 4 }]));
    expect(shots.map((s) => s.angle)).toEqual([0, 1]);
    const busy = switchPlan(talk([{ who: 0, sec: 3 }, { who: 1, sec: 1.2 }, { who: 0, sec: 1.2 }, { who: 1, sec: 1.2 }, { who: 0, sec: 4 }]));
    for (let i = 0; i < busy.length - 1; i++) expect(busy[i].t1 - busy[i].t0).toBeGreaterThanOrEqual(SWITCH_DEFAULTS.minShot - 1e-9);
  });
  it('говорят вместе — общий план (ракурс 0); пауза — кадр не меняется', () => {
    const shots = switchPlan(talk([{ who: 0, sec: 4 }, { who: 1, sec: 4 }, { who: 'both', sec: 4 }, { who: 0, sec: 4 }]));
    expect(shots.map((s) => s.angle)).toEqual([0, 1, 0]);
    const keep = switchPlan(talk([{ who: 0, sec: 4 }, { who: 1, sec: 4 }, { who: 'none', sec: 3 }, { who: 1, sec: 3 }]));
    expect(keep.map((s) => s.angle)).toEqual([0, 1]);
  });
});

describe('оставить ракурс только в его кусках', () => {
  it('клип наложения режется на границах, лишние куски убираются', () => {
    const p = newProject('t', '16:9');
    const a: MediaAsset = { id: 'b', kind: 'video', path: '/b', previewPath: '/b', name: 'b', duration: 20, width: 1920, height: 1080, fps: 30, hasVideo: true, hasAudio: true, size: 1, rotation: 0, proxy: 'none' };
    p.assets.push(a);
    const ov = newTrack('video');
    const c = newMediaClip(a, 0);
    ov.clips.push(c);
    p.tracks.push(ov);
    const shots = [{ t0: 0, t1: 4, angle: 0 }, { t0: 4, t1: 9, angle: 1 }, { t0: 9, t1: 15, angle: 0 }, { t0: 15, t1: 20, angle: 1 }];
    const q = keepOnly(p, c.id, rangesOf(shots, 1, 0));
    const left = q.tracks.find((t) => t.id === ov.id)!.clips.map((x) => [x.start, x.start + ((x as any).out - (x as any).in)]);
    expect(left).toEqual([[4, 9], [15, 20]]);
  });
});
