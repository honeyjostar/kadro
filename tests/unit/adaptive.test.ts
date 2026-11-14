// «Превью: авто»: размер картинки плеера опускается, когда кадры не успевают, и возвращается, когда есть запас.
import { describe, expect, it } from 'vitest';
import { AdaptiveScale } from '../../src/shared/adaptive';

/** Проиграть sec секунд с кадрами по dt мс; вернуть часы. */
function run(a: AdaptiveScale, dt: number, sec: number, now: number): number {
  for (let t = 0; t < sec * 1000; t += dt) { now += dt; a.feed(dt, now); }
  return now;
}

describe('превью: авто', () => {
  it('кадры успевают — размер полный', () => {
    const a = new AdaptiveScale();
    run(a, 16.7, 20, 0);
    expect(a.factor).toBe(1);
  });

  it('тормозит — ступень за ступенью вниз, но не ниже 0.4', () => {
    const a = new AdaptiveScale();
    let now = run(a, 60, 3, 0);
    expect(a.factor).toBe(0.8);
    now = run(a, 60, 3, now);
    expect(a.factor).toBe(0.64);
    run(a, 60, 60, now);
    expect(a.factor).toBe(0.4);
  });

  it('редкие подвисания (меньше четверти кадров) размер не трогают', () => {
    const a = new AdaptiveScale();
    let now = 0;
    for (let i = 0; i < 600; i++) { const dt = i % 10 === 0 ? 70 : 17; now += dt; a.feed(dt, now); }
    expect(a.factor).toBe(1);
  });

  it('появился запас — через несколько секунд размер возвращается', () => {
    const a = new AdaptiveScale();
    let now = run(a, 60, 3, 0);
    expect(a.factor).toBe(0.8);
    now = run(a, 16.7, 2, now);
    expect(a.factor).toBe(0.8);
    run(a, 16.7, 5, now);
    expect(a.factor).toBe(1);
  });

  it('подняли и сразу просело — минуту не пробуем снова (без качелей)', () => {
    const a = new AdaptiveScale();
    let now = run(a, 60, 3, 0);
    now = run(a, 16.7, 6, now);
    expect(a.factor).toBe(1);
    now = run(a, 60, 2.8, now);      // на полном размере снова не успевает
    expect(a.factor).toBe(0.8);
    now = run(a, 16.7, 20, now);     // запас есть, но минута не прошла
    expect(a.factor).toBe(0.8);
    run(a, 16.7, 50, now);
    expect(a.factor).toBe(1);
  });

  it('свернули окно или перемотали (долгая пауза между кадрами) — это не тормоза', () => {
    const a = new AdaptiveScale();
    let now = 0;
    for (let i = 0; i < 200; i++) { const dt = i % 20 === 0 ? 900 : 17; now += dt; a.feed(dt, now); }
    expect(a.factor).toBe(1);
  });
});
