// Разбор видео для авто-ролика: ffmpeg отдаёт маленькие серые кадры (несколько в секунду),
// по ним считаем резкость, фокус, свет, контраст, движение и тряску камеры → оценку каждого момента и склейки внутри видео.
// Результат помним, пока программа открыта: «Ещё вариант» не разбирает видео заново.
import { tx } from '../shared/i18n';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { ffmpegPath } from './bins';
import { FfmpegError } from './ffrun';
import { HL_FINE_H, HL_FINE_W, HL_H, HL_W, frameStat, scoreFrames, type FrameStat, type Highlights } from '../shared/autoEdit';

const cache = new Map<string, Highlights>();

/** Сколько кадров в секунду смотреть: длинные видео — реже, чтобы разбор шёл быстро. */
export function hlFps(duration: number): number {
  return duration > 600 ? 1 : duration > 120 ? 2 : 4;
}

export function highlights(file: string, duration: number, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Highlights> {
  let key = file;
  try { const s = fs.statSync(file); key = `${file}|${s.size}|${s.mtimeMs}`; } catch { /* нет файла — ffmpeg скажет */ }
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const fps = hlFps(duration);
  const size = HL_FINE_W * HL_FINE_H; // кадр 160×90: из него — 80×45 для движения и резкости, сам он — для фокуса
  const expected = Math.max(1, Math.ceil(duration * fps));
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), [
      '-hide_banner', '-nostdin', '-v', 'error', '-i', file, '-map', '0:v:0', '-an', '-sn', '-dn',
      '-vf', `fps=${fps},scale=${HL_FINE_W}:${HL_FINE_H}:flags=area,format=gray`, '-f', 'rawvideo', 'pipe:1',
    ], { windowsHide: true });
    const stats: FrameStat[] = [];
    let prev: Float32Array | null = null;
    let pending: Buffer = Buffer.alloc(0);
    let err = '';
    let lastP = 0;
    proc.stdout.on('data', (d: Buffer) => {
      pending = pending.length ? Buffer.concat([pending, d]) : d;
      while (pending.length >= size) {
        const fine = Buffer.from(pending.subarray(0, size));
        pending = pending.subarray(size);
        const g = new Float32Array(HL_W * HL_H);
        for (let y = 0; y < HL_H; y++) for (let x = 0; x < HL_W; x++) {
          const k = 2 * y * HL_FINE_W + 2 * x;
          g[y * HL_W + x] = (fine[k] + fine[k + 1] + fine[k + HL_FINE_W] + fine[k + HL_FINE_W + 1]) / 4;
        }
        stats.push(frameStat(g, prev, HL_W, HL_H, fine));
        prev = g;
      }
      const p = Math.min(0.99, stats.length / expected);
      if (onProgress && p - lastP >= 0.02) { lastP = p; onProgress(p); }
    });
    proc.stderr.on('data', (d: Buffer) => { err += d.toString(); if (err.length > 50_000) err = err.slice(-20_000); });
    const onAbort = () => { try { proc.kill('SIGKILL'); } catch { /* уже всё */ } };
    signal?.addEventListener('abort', onAbort, { once: true });
    proc.on('error', (e) => reject(new FfmpegError(tx('Не удалось запустить ffmpeg: {0}', e.message), err)));
    proc.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) { reject(new FfmpegError(tx('Отменено'), err)); return; }
      if (code !== 0 && !stats.length) { reject(new FfmpegError(err.trim().split(/\r?\n/).slice(-2).join('\n') || tx('ffmpeg: код {0}', code), err)); return; }
      const hl = scoreFrames(stats, 1 / fps);
      cache.set(key, hl);
      onProgress?.(1);
      resolve(hl);
    });
  });
}
