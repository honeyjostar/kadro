// Разбор видео для авто-ролика: ffmpeg отдаёт маленькие серые кадры (несколько в секунду),
// по ним считаем резкость, свет, контраст и движение → оценку каждого момента и склейки внутри видео.
// Результат помним, пока программа открыта: «Ещё вариант» не разбирает видео заново.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { ffmpegPath } from './bins';
import { FfmpegError } from './ffrun';
import { HL_H, HL_W, frameStat, scoreFrames, type FrameStat, type Highlights } from '../shared/autoEdit';

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
  const size = HL_W * HL_H;
  const expected = Math.max(1, Math.ceil(duration * fps));
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), [
      '-hide_banner', '-nostdin', '-v', 'error', '-i', file, '-map', '0:v:0', '-an', '-sn', '-dn',
      '-vf', `fps=${fps},scale=${HL_W}:${HL_H}:flags=area,format=gray`, '-f', 'rawvideo', 'pipe:1',
    ], { windowsHide: true });
    const stats: FrameStat[] = [];
    let prev: Buffer | null = null;
    let pending: Buffer = Buffer.alloc(0);
    let err = '';
    let lastP = 0;
    proc.stdout.on('data', (d: Buffer) => {
      pending = pending.length ? Buffer.concat([pending, d]) : d;
      while (pending.length >= size) {
        const g = Buffer.from(pending.subarray(0, size));
        pending = pending.subarray(size);
        stats.push(frameStat(g, prev));
        prev = g;
      }
      const p = Math.min(0.99, stats.length / expected);
      if (onProgress && p - lastP >= 0.02) { lastP = p; onProgress(p); }
    });
    proc.stderr.on('data', (d: Buffer) => { err += d.toString(); if (err.length > 50_000) err = err.slice(-20_000); });
    const onAbort = () => { try { proc.kill('SIGKILL'); } catch { /* уже всё */ } };
    signal?.addEventListener('abort', onAbort, { once: true });
    proc.on('error', (e) => reject(new FfmpegError(`Не удалось запустить ffmpeg: ${e.message}`, err)));
    proc.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) { reject(new FfmpegError('Отменено', err)); return; }
      if (code !== 0 && !stats.length) { reject(new FfmpegError(err.trim().split(/\r?\n/).slice(-2).join('\n') || `ffmpeg: код ${code}`, err)); return; }
      const hl = scoreFrames(stats, 1 / fps);
      cache.set(key, hl);
      onProgress?.(1);
      resolve(hl);
    });
  });
}
