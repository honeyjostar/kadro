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

/** Барабаны как в песне: бочка на 1 и 3, малый на 2 и 4, хэт на восьмые, аккорд меняется с каждым тактом. */
function song44(pickup: number, sr = 22050, bpm = 120, bars = 10): { pcm: Float32Array; beats: number[] } {
  const period = 60 / bpm;
  const n = (bars * 4 - pickup) * period + 1;
  const pcm = new Float32Array(Math.round(n * sr));
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const chords = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [165, 208, 247]];
  const beats: number[] = [];
  for (let k = pickup; k < bars * 4; k++) {
    const t = 0.25 + (k - pickup) * period;
    beats.push(t);
    const s0 = Math.round(t * sr);
    const inBar = k % 4;
    for (let i = 0; i < 0.14 * sr && s0 + i < pcm.length; i++) {
      const e = Math.exp(-i / (0.03 * sr));
      if (inBar === 0 || inBar === 2) pcm[s0 + i] += 0.9 * e * Math.sin((2 * Math.PI * (55 + 60 * e) * i) / sr); // бочка
      else pcm[s0 + i] += 0.7 * e * rnd() + 0.2 * e * Math.sin((2 * Math.PI * 190 * i) / sr); // малый
    }
    for (const h of [0, 0.5]) { const hs = Math.round((t + h * period) * sr); for (let i = 0; i < 0.03 * sr && hs + i < pcm.length; i++) pcm[hs + i] += 0.12 * Math.exp(-i / (0.006 * sr)) * rnd(); }
    // аккорд — весь такт
    if (inBar === 0 || k === pickup) {
      const ch = chords[Math.floor(k / 4) % 4];
      for (let i = 0; i < (4 - inBar) * period * sr && s0 + i < pcm.length; i++) for (const f of ch) pcm[s0 + i] += 0.05 * Math.sin((2 * Math.PI * f * i) / sr);
    }
  }
  return { pcm, beats };
}

describe('сильная доля такта', () => {
  for (const pickup of [0, 1, 2, 3]) {
    it(`песня начинается с ${pickup + 1}-й доли такта — «раз» найден`, async () => {
      const { downbeatPhase } = await import('../../src/shared/beats');
      const { pcm, beats } = song44(pickup);
      // «раз» — первая доля среди beats, у которой номер в такте 0
      expect(downbeatPhase(pcm, 22050, beats)).toBe((4 - pickup) % 4);
    });
  }
});
