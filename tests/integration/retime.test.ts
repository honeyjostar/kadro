// Реверс, кривая скорости, стоп-кадр: настоящий FFmpeg, проверяем, какой кадр исходника куда попал.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.KADRO_DATA = path.join(os.tmpdir(), 'kadro-tests', 'data');

import { freezeFrame, retime, type RetimeJob } from '../../src/main/retime';
import { RAMP_PRESETS, RampMap } from '../../src/shared/retime';
import { FFMPEG, ff, probe, tmpDir, zeroCrossFreq } from '../helpers/media';

const D = tmpDir('retime');
const f = (n: string) => path.join(D, n);

/** Видео-счётчик: яркость кадра = 2·номер кадра; звук — нарастающий тон 200 → 200+200·t Гц. */
function counter(name: string, dur: number, fps: number): string {
  const file = f(name);
  if (!fs.existsSync(file)) {
    ff(['-f', 'lavfi', '-i', `color=c=black:s=160x96:r=${fps}:d=${dur},format=yuv420p,geq=lum='2*N':cb=128:cr=128`,
      '-f', 'lavfi', '-i', `aevalsrc='0.5*sin(2*PI*(200*t+100*t*t))':s=48000:d=${dur}`,
      '-c:v', 'libx264', '-qp', '0', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', file]);
  }
  return file;
}
/** Номер кадра исходника для каждого кадра файла. */
function indices(file: string): number[] {
  // читаем YUV как есть (без пересчёта диапазона), берём кусок плоскости яркости
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-'], { maxBuffer: 256 << 20 });
  const buf = r.stdout as Buffer;
  const fr = 160 * 96 * 1.5;
  const out: number[] = [];
  for (let o = 0; o + fr <= buf.length; o += fr) {
    let s = 0;
    for (let i = o + 2000; i < o + 3000; i++) s += buf[i];
    out.push(Math.round(s / 1000 / 2));
  }
  return out;
}
const job = (p: string, extra: Partial<RetimeJob>): RetimeJob => ({
  path: p, in: 0, out: 4, reverse: false, hasVideo: true, hasAudio: true, width: 160, height: 96, fps: 30, ...extra,
});

beforeAll(() => { counter('c30.mp4', 4, 30); counter('c12.mp4', 10, 12); });

describe('реверс', () => {
  it('фрагмент задом наперёд: кадры и звук', async () => {
    const r = await retime(job(f('c30.mp4'), { in: 0.5, out: 3.5, reverse: true }));
    expect(r.duration).toBeCloseTo(3, 6);
    const idx = indices(r.path);
    expect(idx.length).toBe(90);
    idx.forEach((k, j) => expect(Math.abs(k - (104 - j)), `кадр ${j}: ${k}`).toBeLessThanOrEqual(1));
    expect(probe(r.path).duration).toBeCloseTo(3, 1);
    // тон в начале — высокий (конец исходника), в конце — низкий
    expect(zeroCrossFreq(r.path, 0.05, 0.2)).toBeGreaterThan(780);
    expect(zeroCrossFreq(r.path, 2.75, 0.2)).toBeLessThan(420);
  });

  it('длинный фрагмент режется на куски без потерянных и лишних кадров', async () => {
    const r = await retime(job(f('c12.mp4'), { in: 0.25, out: 9.75, reverse: true, fps: 12 }));
    const idx = indices(r.path);
    expect(idx.length).toBe(114);
    expect(idx[0]).toBe(116);
    expect(idx[idx.length - 1]).toBe(3);
    for (let j = 1; j < idx.length; j++) expect(idx[j - 1] - idx[j], `стык у кадра ${j}`).toBe(1);
  });
});

describe('кривая скорости', () => {
  it('постоянные 2×: вдвое короче, высота тона сохраняется', async () => {
    const r = await retime(job(f('c30.mp4'), { ramp: [{ x: 0, v: 2 }, { x: 1, v: 2 }] }));
    expect(r.duration).toBeCloseTo(2, 6);
    const idx = indices(r.path);
    expect(idx.length).toBe(60);
    idx.forEach((k, j) => expect(Math.abs(k - 2 * j), `кадр ${j}`).toBeLessThanOrEqual(1));
    const p = probe(r.path);
    expect(Math.abs(p.duration - 2)).toBeLessThan(0.08);
    // в 0.5 с копии звучит 1-я секунда исходника: 200 + 200·1 = 400 Гц (не 800 — тон не повышается)
    expect(Math.abs(zeroCrossFreq(r.path, 0.42, 0.16) - 400)).toBeLessThan(45);
  });

  it('пресет «Герой»: кадры идут по формуле кривой', async () => {
    const pts = RAMP_PRESETS.find((p) => p.id === 'hero')!.points;
    const r = await retime(job(f('c30.mp4'), { ramp: pts }));
    const m = new RampMap(pts, 4);
    expect(r.duration).toBeCloseTo(m.total, 6);
    const idx = indices(r.path);
    expect(Math.abs(idx.length - Math.round(m.total * 30))).toBeLessThanOrEqual(1);
    for (let j = 0; j < idx.length; j += 7) {
      const want = Math.floor(m.inverse(j / 30) * 30 + 1e-6);
      expect(Math.abs(idx[j] - want), `кадр ${j}: ${idx[j]} вместо ${want}`).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(probe(r.path).duration - m.total)).toBeLessThan(0.08);
  });

  it('реверс вместе с кривой', async () => {
    const pts = [{ x: 0, v: 0.5 }, { x: 1, v: 3 }];
    const r = await retime(job(f('c30.mp4'), { in: 1, out: 3, reverse: true, ramp: pts }));
    const m = new RampMap(pts, 2);
    expect(r.duration).toBeCloseTo(m.total, 6);
    const idx = indices(r.path);
    expect(idx[0]).toBeGreaterThanOrEqual(88);
    expect(idx[idx.length - 1]).toBeLessThanOrEqual(32);
    for (let j = 1; j < idx.length; j++) expect(idx[j]).toBeLessThanOrEqual(idx[j - 1]);
  });

  it('только звук', async () => {
    const a = f('chirp.m4a');
    if (!fs.existsSync(a)) ff(['-i', f('c30.mp4'), '-vn', '-c:a', 'copy', a]);
    const r = await retime({ ...job(a, { reverse: true }), hasVideo: false });
    expect(r.path.endsWith('.m4a')).toBe(true);
    expect(Math.abs(probe(r.path).duration - 4)).toBeLessThan(0.1);
    expect(zeroCrossFreq(r.path, 0.1, 0.2)).toBeGreaterThan(900);
  });
});

describe('стоп-кадр', () => {
  it('берёт ближайший кадр', async () => {
    const png = await freezeFrame(f('c30.mp4'), 1.5, 30, false);
    // PNG — RGB; обратно в YUV (ограниченный диапазон, как в исходнике) и смотрим яркость
    const r = spawnSync(FFMPEG, ['-v', 'error', '-i', png, '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-'], { maxBuffer: 1 << 24 });
    const b = r.stdout as Buffer;
    expect(b.length).toBe(160 * 96 * 1.5);
    expect(Math.round(b[5000] / 2)).toBe(45);
  });
});
