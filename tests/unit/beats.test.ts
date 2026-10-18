import { describe, expect, it } from 'vitest';
import { detectBeats } from '../../src/shared/beats';

/** «Музыка»: бочка на каждую долю, хэт на восьмые, немного шума. */
function track(bpm: number, seconds: number, sr = 22050, offset = 0.3): { pcm: Float32Array; beats: number[] } {
  const pcm = new Float32Array(Math.round(seconds * sr));
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let i = 0; i < pcm.length; i++) pcm[i] = rnd() * 0.02 + 0.05 * Math.sin((2 * Math.PI * 110 * i) / sr);
  const period = 60 / bpm;
  const beats: number[] = [];
  for (let t = offset; t < seconds - 0.2; t += period / 2) {
    const onBeat = Math.abs(((t - offset) / period) % 1) < 1e-6 || Math.abs(((t - offset) / period) % 1 - 1) < 1e-6;
    if (onBeat) beats.push(t);
    const s0 = Math.round(t * sr);
    const len = Math.round((onBeat ? 0.12 : 0.04) * sr);
    for (let k = 0; k < len && s0 + k < pcm.length; k++) {
      const env = Math.exp(-k / (len / 5));
      pcm[s0 + k] += onBeat ? 0.8 * env * Math.sin((2 * Math.PI * (60 + 80 * env) * k) / sr) : 0.25 * env * rnd();
    }
  }
  return { pcm, beats };
}

describe('поиск долей такта', () => {
  for (const bpm of [120, 97, 140]) {
    it(`${bpm} ударов в минуту`, () => {
      const { pcm, beats } = track(bpm, 16);
      const r = detectBeats(pcm, 22050);
      expect(Math.abs(r.bpm - bpm) / bpm).toBeLessThan(0.03);
      // каждая найденная доля в середине трека — рядом с настоящей (±35 мс)
      const mid = r.beats.filter((b) => b > 2 && b < 14);
      expect(mid.length).toBeGreaterThan(((12 * bpm) / 60) * 0.85);
      for (const b of mid) expect(Math.min(...beats.map((x) => Math.abs(x - b)))).toBeLessThan(0.035);
    });
  }
});
