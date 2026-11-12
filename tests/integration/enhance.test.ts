// Улучшение качества на настоящем видео: «Быстро» (FFmpeg) и «Нейросеть» (Real-ESRGAN по кускам кадра).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fastEnhance } from '../../src/main/ai/enhance';
import { aiEnhance } from '../../src/main/ai/upscale';
import { enhanceTarget } from '../../src/shared/enhance';
import { FFMPEG, ff, probe, tmpDir } from '../helpers/media';

const D = tmpDir('enhance');
const f = (n: string) => path.join(D, n);
const FACE = path.resolve('tests/fixtures/astronaut.jpg');

beforeAll(() => {
  // мыльное маленькое видео: фото, уменьшенное до 160×90, чуть едет
  if (!fs.existsSync(f('small.mp4'))) {
    ff(['-loop', '1', '-i', FACE, '-vf', "scale=320:320,crop=320:180:0:'40+10*t',scale=160:90:flags=area,format=yuv420p", '-t', '0.5', '-r', '10', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', f('small.mp4')]);
  }
});

/** Средняя разница соседних точек по яркости (больше — резче). */
function sharpness(file: string, t: number): number {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=640:360:flags=area,format=gray', '-f', 'rawvideo', '-']);
  const d = r.stdout as Buffer;
  let s = 0;
  for (let y = 0; y < 360; y++) for (let x = 1; x < 640; x++) s += Math.abs(d[y * 640 + x] - d[y * 640 + x - 1]);
  return s / (360 * 639);
}

describe('улучшение качества', () => {
  const tgt = enhanceTarget(160, 90);
  it('«Быстро»: 160×90 → 1920×1080, резче простого увеличения', async () => {
    await fastEnhance(f('small.mp4'), 0, 0.5, 160, 90, tgt, f('fast.mp4'));
    const p = probe(f('fast.mp4'));
    expect([p.width, p.height]).toEqual([1920, 1080]);
    expect(p.hasAudio).toBe(false);
    ff(['-i', f('small.mp4'), '-vf', 'scale=1920:1080:flags=bilinear', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', f('plain.mp4')]);
    expect(sharpness(f('fast.mp4'), 0.2)).toBeGreaterThan(sharpness(f('plain.mp4'), 0.2) * 1.05);
  });

  it('«Нейросеть»: все кадры, 1920×1080, детали резче, чем у простого увеличения', async () => {
    const stages: string[] = [];
    const dev = await aiEnhance({ src: f('small.mp4'), ss: 0, dur: 0.5, fps: 10, width: 160, height: 90, tw: tgt.w, th: tgt.h, out: f('ai.mp4'), onProgress: (_p, s) => { if (s) stages.push(s); } });
    expect(dev).toBe('cpu');
    const p = probe(f('ai.mp4'));
    expect([p.width, p.height]).toEqual([1920, 1080]);
    expect(Math.abs(p.duration - 0.5)).toBeLessThan(0.15);
    expect(stages.at(-1)).toMatch(/кадр 5 из 5/);
    expect(sharpness(f('ai.mp4'), 0.2)).toBeGreaterThan(sharpness(f('plain.mp4'), 0.2) * 1.15);
  });
});
