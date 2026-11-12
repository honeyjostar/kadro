// Кадры видео сырыми байтами через FFmpeg — по одному, с паузой декодера, пока кадр обрабатывается.
import { tx } from '../../shared/i18n';
import { spawn } from 'node:child_process';
import { ffmpegPath } from '../bins';

export interface FrameJob {
  src: string; ss: number; dur: number; fps: number;
  /** фильтр после fps (масштаб, поля); размер на выходе — w × h */
  vf: string; w: number; h: number;
  pix: 'rgb24' | 'gray';
  image?: boolean;               // фото: один кадр
  signal?: AbortSignal;
}

/** Прочитать кадры и отдать каждый в onFrame(кадр, номер). Возвращает число кадров. */
export async function eachFrame(j: FrameJob, onFrame: (fr: Buffer, i: number) => Promise<void> | void): Promise<number> {
  const bpp = j.pix === 'rgb24' ? 3 : 1;
  const frameBytes = j.w * j.h * bpp;
  const input = j.image ? ['-i', j.src, '-frames:v', '1'] : ['-ss', String(Math.max(0, j.ss)), '-t', String(j.dur), '-i', j.src];
  const vf = j.image ? j.vf : `fps=${j.fps},${j.vf}`;
  const dec = spawn(ffmpegPath(), ['-v', 'error', ...input, '-vf', vf, '-f', 'rawvideo', '-pix_fmt', j.pix, '-'], { windowsHide: true });
  const abort = () => dec.kill('SIGKILL');
  j.signal?.addEventListener('abort', abort, { once: true });
  let n = 0;
  let pending: Buffer = Buffer.alloc(0);
  let err = '';
  dec.stderr.on('data', (d: Buffer) => { err = (err + d.toString()).slice(-2000); });
  await new Promise<void>((resolve, reject) => {
    let busy = Promise.resolve();
    dec.stdout.on('data', (d: Buffer) => {
      pending = pending.length ? Buffer.concat([pending, d]) : d;
      const frames: Buffer[] = [];
      while (pending.length >= frameBytes) { frames.push(Buffer.from(pending.subarray(0, frameBytes))); pending = pending.subarray(frameBytes); }
      if (!frames.length) return;
      dec.stdout.pause();
      busy = busy.then(async () => { for (const f of frames) await onFrame(f, n++); }).then(() => { dec.stdout.resume(); }, (e) => { abort(); reject(e); });
    });
    dec.on('close', (code) => busy.then(() => {
      if (j.signal?.aborted) reject(new Error(tx('Отменено')));
      else if (code && !n) reject(new Error(err.trim() || `ffmpeg ${code}`));
      else resolve();
    }, reject));
    dec.on('error', reject);
  });
  j.signal?.removeEventListener('abort', abort);
  return n;
}

/** Все кадры куска разом (для трекера в обратную сторону — куски по несколько секунд). */
export async function grabFrames(j: FrameJob): Promise<Buffer[]> {
  const out: Buffer[] = [];
  await eachFrame(j, (f) => { out.push(f); });
  return out;
}
