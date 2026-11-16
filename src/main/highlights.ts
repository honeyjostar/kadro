// Разбор видео для авто-ролика: ffmpeg отдаёт маленькие серые кадры (несколько в секунду),
// по ним считаем резкость, фокус, свет, контраст, движение и тряску камеры → оценку каждого момента и склейки внутри видео.
// Результат помним, пока программа открыта: «Ещё вариант» не разбирает видео заново.
import { tx } from '../shared/i18n';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cacheDir, ffmpegPath } from './bins';
import { FfmpegError } from './ffrun';
import { HL_FINE_H, HL_FINE_W, HL_H, HL_W, frameStat, scoreFrames, type FrameStat, type Highlights } from '../shared/autoEdit';

const cache = new Map<string, Highlights>();
/** Меняется вместе с оценкой кадров — старые разборы на диске тогда не годятся. */
const HL_VERSION = 3;

/** Разбор живёт и на диске: проект на 30 ГБ второй раз не смотрится заново (даже после перезапуска). */
function diskFile(key: string): string | null {
  try { return path.join(cacheDir('highlights'), `${crypto.createHash('sha1').update(`${HL_VERSION}|${key}`).digest('hex')}.json`); } catch { return null; }
}
function fromDisk(key: string): Highlights | null {
  const f = diskFile(key);
  if (!f) return null;
  try {
    const hl = JSON.parse(fs.readFileSync(f, 'utf8')) as Highlights;
    return Array.isArray(hl.score) && Array.isArray(hl.cuts) && hl.step > 0 ? hl : null;
  } catch { return null; }
}
function toDisk(key: string, hl: Highlights): void {
  const f = diskFile(key);
  if (f) fs.promises.writeFile(f, JSON.stringify(hl)).catch(() => undefined);
}

/** Сколько кадров в секунду смотреть: длинные видео — реже, чтобы разбор шёл быстро. */
export function hlFps(duration: number): number {
  return duration > 600 ? 1 : duration > 120 ? 2 : 4;
}

export async function highlights(file: string, duration: number, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Highlights> {
  let key = file;
  let size = 0;
  try { const s = fs.statSync(file); key = `${file}|${s.size}|${s.mtimeMs}`; size = s.size; } catch { /* нет файла — ffmpeg скажет */ }
  const hit = cache.get(key) ?? fromDisk(key);
  if (hit) { cache.set(key, hit); onProgress?.(1); return hit; }
  // большой файл (4K с телефона, экшн-камера) — декодирует видеокарта; не вышло — ещё раз процессором
  const big = size > 300 * 1024 * 1024 || duration > 180;
  let hl: Highlights;
  try {
    hl = await scan(file, duration, big, onProgress, signal);
  } catch (e) {
    if (!big || signal?.aborted) throw e;
    hl = await scan(file, duration, false, onProgress, signal);
  }
  cache.set(key, hl);
  toDisk(key, hl);
  return hl;
}

function scan(file: string, duration: number, hw: boolean, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Highlights> {
  const fps = hlFps(duration);
  const size = HL_FINE_W * HL_FINE_H; // кадр 160×90: из него — 80×45 для движения и резкости, сам он — для фокуса
  const expected = Math.max(1, Math.ceil(duration * fps));
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), [
      '-hide_banner', '-nostdin', '-v', 'error',
      // кадры, на которые никто не ссылается, не декодируем: при 1–4 кадрах в секунду они не нужны, а это до половины работы
      ...(hw ? ['-hwaccel', 'auto'] : ['-skip_frame', 'nonref']),
      '-i', file, '-map', '0:v:0', '-an', '-sn', '-dn',
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
      onProgress?.(1);
      resolve(hl);
    });
  });
}
