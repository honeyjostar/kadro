// Переходы «по пикселям» в превью совпадают с FFmpeg xfade: тот же кадр перехода в тот же момент.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { TRANSITIONS } from '../../src/shared/defaults';
import { PIXEL_TRANSITIONS, transitionPixels } from '../../src/shared/transitions';
import { rgbPng } from '../../src/main/png';
import { ff, tmpDir } from '../helpers/media';

const D = tmpDir('transitions');
const f = (n: string) => path.join(D, n);
const W = 96;
const H = 64;

function rgba(rgb: Buffer): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0, j = 0; i < W * H; i++, j += 3) { out[i * 4] = rgb[j]; out[i * 4 + 1] = rgb[j + 1]; out[i * 4 + 2] = rgb[j + 2]; out[i * 4 + 3] = 255; }
  return out;
}
/** Картинка через yuv420p и обратно — как кадр, который видит xfade. */
function roundtrip(name: string): Uint8ClampedArray {
  const raw = f(`${name}.rt.rgb`);
  ff(['-i', f(`${name}.png`), '-vf', 'format=yuv420p,format=rgb24', '-f', 'rawvideo', raw]);
  return rgba(fs.readFileSync(raw));
}

let A: Uint8ClampedArray;
let B: Uint8ClampedArray;
beforeAll(() => {
  // A: тёплый градиент с тёмным квадратом; B: холодный градиент со светлым кругом
  const a = new Uint8Array(W * H * 3);
  const b = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const sq = x > 20 && x < 50 && y > 16 && y < 44;
    a.set(sq ? [40, 30, 60] : [220, 60 + Math.round((x / W) * 150), 40], i);
    const circ = Math.hypot(x - 64, y - 30) < 18;
    b.set(circ ? [235, 240, 210] : [30, 80 + Math.round((y / H) * 120), 200], i);
  }
  fs.writeFileSync(f('a.png'), rgbPng(a, W, H));
  fs.writeFileSync(f('b.png'), rgbPng(b, W, H));
  A = roundtrip('a');
  B = roundtrip('b');
});

/** Кадры xfade: длительность 1 с, 10 кадров/с, начало на 0.5 с — кадр 5+k соответствует progress = 1 − k/10. */
function xfadeFrames(type: string): Buffer[] {
  const out = f(`x_${type}.rgb`);
  ff(['-loop', '1', '-framerate', '10', '-t', '2', '-i', f('a.png'), '-loop', '1', '-framerate', '10', '-t', '2', '-i', f('b.png'),
    '-filter_complex', `[0:v]format=yuv420p,setsar=1[a];[1:v]format=yuv420p,setsar=1[b];[a][b]xfade=transition=${type}:duration=1:offset=0.5,format=rgb24`,
    '-f', 'rawvideo', out]);
  const buf = fs.readFileSync(out);
  const n = W * H * 3;
  return Array.from({ length: Math.floor(buf.length / n) }, (_, i) => buf.subarray(i * n, (i + 1) * n));
}

function compare(got: Uint8ClampedArray, ref: Buffer): { mean: number; p98: number } {
  const diffs: number[] = [];
  for (let i = 0, j = 0; i < W * H; i++, j += 3) {
    diffs.push(Math.max(Math.abs(got[i * 4] - ref[j]), Math.abs(got[i * 4 + 1] - ref[j + 1]), Math.abs(got[i * 4 + 2] - ref[j + 2])));
  }
  diffs.sort((x, y) => x - y);
  return { mean: diffs.reduce((s, v) => s + v, 0) / diffs.length, p98: diffs[Math.floor(diffs.length * 0.98)] };
}

describe('переходы по пикселям = FFmpeg xfade', () => {
  const types = TRANSITIONS.map((t) => t.type).filter((t) => PIXEL_TRANSITIONS.has(t));
  it('все новые переходы есть в списке', () => {
    expect(types.length).toBe(PIXEL_TRANSITIONS.size);
  });
  for (const type of types) {
    it(type, () => {
      const frames = xfadeFrames(type);
      for (const k of [2, 5, 8]) {
        const P = 1 - k / 10;
        const out = new Uint8ClampedArray(W * H * 4);
        transitionPixels(type, P, A, B, out, W, H);
        const r = compare(out, frames[5 + k]);
        if (process.env.KADRO_TR_LOG) console.log(type, P, r.mean.toFixed(2), r.p98);
        expect(r.mean, `${type} P=${P} среднее`).toBeLessThan(4);
        expect(r.p98, `${type} P=${P} 98%`).toBeLessThan(28);
      }
    });
  }
});
