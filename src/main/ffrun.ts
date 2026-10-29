// Запуск ffmpeg с прогрессом и отменой.
import { tx } from '../shared/i18n';
import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import { ffmpegPath } from './bins';

export interface RunOpts {
  duration?: number;                       // для расчёта процентов
  onProgress?: (p: number) => void;        // 0..1
  signal?: AbortSignal;
  cwd?: string;
  low?: boolean;                           // фоновая задача: пониженный приоритет, чтобы не тормозить монтаж
}

export class FfmpegError extends Error {
  constructor(message: string, public stderr: string) { super(message); }
}

/** Запускает ffmpeg. Аргументы должны включать '-progress pipe:1', если нужен прогресс. */
export function runFfmpeg(args: string[], o: RunOpts = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    let proc: ChildProcess;
    try {
      proc = spawn(ffmpegPath(), args, { windowsHide: true, cwd: o.cwd });
      if (o.low) lowerPriority(proc.pid);
    } catch (e) {
      reject(e);
      return;
    }
    let err = '';
    let outBuf = '';
    proc.stderr?.on('data', (d: Buffer) => {
      err += d.toString();
      if (err.length > 200_000) err = err.slice(-100_000);
    });
    proc.stdout?.on('data', (d: Buffer) => {
      if (!o.onProgress || !o.duration) return;
      outBuf += d.toString();
      const lines = outBuf.split(/\r?\n/);
      outBuf = lines.pop() ?? '';
      for (const line of lines) {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
        if (m) o.onProgress(Math.min(1, Number(m[1]) / 1e6 / o.duration));
      }
    });
    const onAbort = () => { try { proc.kill('SIGKILL'); } catch { /* уже завершён */ } };
    o.signal?.addEventListener('abort', onAbort, { once: true });
    proc.on('error', (e) => reject(new FfmpegError(tx('Не удалось запустить ffmpeg: {0}', e.message), err)));
    proc.on('close', (code) => {
      o.signal?.removeEventListener('abort', onAbort);
      if (o.signal?.aborted) reject(new FfmpegError(tx('Отменено'), err));
      else if (code === 0) resolve();
      else reject(new FfmpegError(lastErrorLine(err) || tx('ffmpeg завершился с кодом {0}', code), err));
    });
  });
}

function lastErrorLine(stderr: string): string {
  const lines = stderr.trim().split(/\r?\n/).filter((l) => l.trim() && !/^\s*(frame|size|time|bitrate|speed)=/.test(l));
  return lines.slice(-3).join('\n');
}

/** Процесс — с приоритетом «ниже среднего» (Windows) / nice 10: окно и плеер остаются отзывчивыми. */
export function lowerPriority(pid: number | undefined): void {
  if (!pid) return;
  try { os.setPriority(pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* нет прав — не страшно */ }
}

/** Потоков кодирования для фоновых прокси: половина ядер — вторая половина остаётся окну и плееру. */
export function backgroundThreads(): string {
  return String(Math.max(2, Math.floor(os.cpus().length / 2)));
}

/** Читает весь stdout ffmpeg как Buffer (для PCM, сырых кадров). */
export function ffmpegToBuffer(args: string[], signal?: AbortSignal, low = false): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), args, { windowsHide: true });
    if (low) lowerPriority(proc.pid);
    const chunks: Buffer[] = [];
    let err = '';
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d: Buffer) => { err += d.toString(); if (err.length > 100_000) err = err.slice(-50_000); });
    const onAbort = () => proc.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });
    proc.on('error', (e) => reject(e));
    proc.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new FfmpegError(lastErrorLine(err) || tx('ffmpeg: код {0}', code), err));
    });
  });
}
