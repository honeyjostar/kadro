// Синхронизация камер по звуку: сдвиг между двумя записями одного события находится точнее кадра,
// чужие записи не «синхронизируются»; размещение клипа с обрезкой начала.
import { describe, expect, it } from 'vitest';
import { findLag, onsetEnvelope, SYNC_MIN_CONFIDENCE, syncedPlacement } from '../../src/shared/audioSync';

const SR = 16000;
function rng(seed: number) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** «Событие»: щелчки и слоги в случайные моменты на фоне шума. */
function scene(sec: number, seed: number): { t: number; amp: number; len: number }[] {
  const r = rng(seed);
  const ev = [];
  for (let t = 0.3; t < sec - 0.5; t += 0.15 + r() * 0.6) ev.push({ t, amp: 0.2 + r() * 0.8, len: 0.02 + r() * 0.15 });
  return ev;
}
function record(ev: { t: number; amp: number; len: number }[], sec: number, delay: number, gain: number, noiseSeed: number): Float32Array {
  const r = rng(noiseSeed);
  const x = new Float32Array(Math.round(sec * SR));
  for (let i = 0; i < x.length; i++) x[i] = (r() - 0.5) * 0.02;
  for (const e of ev) {
    const i0 = Math.round((e.t + delay) * SR);
    for (let k = 0; k < e.len * SR; k++) {
      const i = i0 + k;
      if (i < 0 || i >= x.length) continue;
      x[i] += gain * e.amp * Math.sin(k * 0.3 + e.t) * Math.exp(-k / (e.len * SR * 0.4));
    }
  }
  return x;
}

describe('синхронизация по звуку', () => {
  const ev = scene(30, 7);
  it('камера включена позже: находит сдвиг точнее 10 мс', () => {
    const a = onsetEnvelope(record(ev, 30, 0, 1, 1), SR);
    const b = onsetEnvelope(record(ev, 30, -2.437, 0.4, 2), SR); // во второй записи всё на 2,437 с раньше
    const r = findLag(a, b)!;
    expect(r.lag).toBeCloseTo(-2.437, 2);
    expect(Math.abs(r.lag + 2.437)).toBeLessThan(0.01);
    expect(r.confidence).toBeGreaterThan(SYNC_MIN_CONFIDENCE * 1.5);
    expect(r.corr).toBeGreaterThan(0.5);
  });

  it('и в другую сторону, и при разной громкости', () => {
    const a = onsetEnvelope(record(ev, 30, 0, 0.3, 3), SR);
    const b = onsetEnvelope(record(ev, 30, 1.25, 1.5, 4), SR);
    expect(Math.abs(findLag(a, b)!.lag - 1.25)).toBeLessThan(0.01);
  });

  it('разные события — уверенности нет', () => {
    const a = onsetEnvelope(record(scene(20, 11), 20, 0, 1, 5), SR);
    const b = onsetEnvelope(record(scene(20, 99), 20, 0, 1, 6), SR);
    expect(findLag(a, b)!.confidence).toBeLessThan(SYNC_MIN_CONFIDENCE);
  });

  it('слишком короткая запись — не сравниваем', () => {
    expect(findLag(new Float32Array(50), new Float32Array(5000))).toBeNull();
  });

  it('размещение: клип встаёт так, чтобы звук совпал; раньше нуля — обрезается начало', () => {
    // основной клип с 10 с исходника стоит на 0; во второй записи то же звучит на 3 с позже
    expect(syncedPlacement({ start: 0, in: 10 }, { in: 0, out: 60 }, 3)).toEqual({ start: 0, in: 13 });
    expect(syncedPlacement({ start: 5, in: 0 }, { in: 0, out: 60 }, -2)).toEqual({ start: 7, in: 0 });
    expect(syncedPlacement({ start: 0, in: 0 }, { in: 0, out: 2 }, 5)).toBeNull();
  });
});
