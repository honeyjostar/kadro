// Удаление фона с видео: RobustVideoMatting (учитывает предыдущие кадры — без мерцания).
// Результат — WebM VP9 с прозрачностью; в нём время 0 = начало обработанного фрагмента.
import { tx } from '../../shared/i18n';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { ffmpegPath } from '../bins';
import { MATTING_MODEL } from './models';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ort = require('onnxruntime-node');

let session: any;
let sessionProvider = '';

async function getSession(): Promise<any> {
  if (session) return session;
  const tries: string[][] = process.platform === 'win32' ? [['dml'], ['cpu']] : [['cpu']];
  let lastErr: unknown;
  for (const eps of tries) {
    try {
      session = await ort.InferenceSession.create(MATTING_MODEL(), {
        executionProviders: eps,
        intraOpNumThreads: Math.max(1, os.cpus().length - 1),
        graphOptimizationLevel: 'all',
      });
      sessionProvider = eps[0];
      return session;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export function mattingProvider(): string { return sessionProvider; }

/** Размер обработки: не больше 1280 по длинной стороне, чётный. */
export function processSize(w: number, h: number): { w: number; h: number } {
  const k = Math.min(1, 1280 / Math.max(w, h));
  return { w: Math.max(2, Math.round((w * k) / 2) * 2), h: Math.max(2, Math.round((h * k) / 2) * 2) };
}

export interface MatteJob {
  src: string; ss: number; dur: number; fps: number; width: number; height: number; out: string;
  onProgress?: (p: number) => void; signal?: AbortSignal;
}

export async function removeBackground(j: MatteJob): Promise<void> {
  const sess = await getSession();
  const { w: W, h: H } = processSize(j.width, j.height);
  const fps = Math.max(1, Math.min(60, Math.round(j.fps * 1000) / 1000));
  const totalFrames = Math.max(1, Math.round(j.dur * fps));
  const ratio = Math.min(1, Math.max(0.15, 512 / Math.max(W, H)));

  const dec = spawn(ffmpegPath(), ['-v', 'error', '-ss', String(j.ss), '-t', String(j.dur), '-i', j.src,
    '-vf', `fps=${fps},scale=${W}:${H}:flags=bicubic`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { windowsHide: true });
  const enc = spawn(ffmpegPath(), ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-',
    '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '28', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1',
    '-auto-alt-ref', '0', '-metadata:s:v:0', 'alpha_mode=1', j.out], { windowsHide: true });
  let encErr = '';
  enc.stderr.on('data', (d: Buffer) => { encErr += d.toString(); });
  const encDone = new Promise<void>((res, rej) => enc.on('close', (c) => (c === 0 ? res() : rej(new Error(tx('Кодирование прозрачного видео не удалось: {0}', encErr.slice(-500)))))));
  enc.stdin.on('error', () => { /* закрыли раньше — ошибка придёт в encDone */ });

  const abort = () => { dec.kill('SIGKILL'); enc.kill('SIGKILL'); };
  j.signal?.addEventListener('abort', abort, { once: true });

  const frameBytes = W * H * 3;
  const N = W * H;
  let pending: Buffer = Buffer.alloc(0);
  let rec = [0, 1, 2, 3].map(() => new ort.Tensor('float32', new Float32Array([0]), [1, 1, 1, 1]));
  const ratioT = new ort.Tensor('float32', new Float32Array([ratio]), [1]);
  const src = new Float32Array(3 * N);
  let n = 0;

  const processFrame = async (fr: Buffer) => {
    for (let i = 0; i < N; i++) {
      src[i] = fr[i * 3] / 255;
      src[N + i] = fr[i * 3 + 1] / 255;
      src[2 * N + i] = fr[i * 3 + 2] / 255;
    }
    const out = await sess.run({ src: new ort.Tensor('float32', src, [1, 3, H, W]), r1i: rec[0], r2i: rec[1], r3i: rec[2], r4i: rec[3], downsample_ratio: ratioT });
    rec = [out.r1o, out.r2o, out.r3o, out.r4o];
    const fgr = out.fgr.data as Float32Array;
    const pha = out.pha.data as Float32Array;
    const rgba = Buffer.allocUnsafe(N * 4);
    for (let i = 0; i < N; i++) {
      const a = pha[i];
      rgba[i * 4] = Math.round(Math.min(1, Math.max(0, fgr[i])) * 255);
      rgba[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, fgr[N + i])) * 255);
      rgba[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, fgr[2 * N + i])) * 255);
      rgba[i * 4 + 3] = a < 0.02 ? 0 : a > 0.98 ? 255 : Math.round(a * 255);
    }
    if (!enc.stdin.write(rgba)) await new Promise<void>((r) => enc.stdin.once('drain', () => r()));
    n++;
    j.onProgress?.(Math.min(0.999, n / totalFrames));
  };

  // читаем кадры последовательно, с обратным давлением (декодер ждёт, пока мы обработаем)
  await new Promise<void>((resolve, reject) => {
    let busy = Promise.resolve();
    dec.stdout.on('data', (d: Buffer) => {
      pending = pending.length ? Buffer.concat([pending, d]) : d;
      const frames: Buffer[] = [];
      while (pending.length >= frameBytes) {
        frames.push(Buffer.from(pending.subarray(0, frameBytes)));
        pending = pending.subarray(frameBytes);
      }
      if (!frames.length) return;
      dec.stdout.pause();
      busy = busy.then(async () => {
        for (const f of frames) await processFrame(f);
      }).then(() => { dec.stdout.resume(); }, (e) => { abort(); reject(e); });
    });
    dec.on('close', (code) => {
      busy.then(() => {
        if (j.signal?.aborted) reject(new Error(tx('Отменено')));
        else if (code !== 0 && n === 0) reject(new Error(tx('Не удалось прочитать видео')));
        else resolve();
      }, reject);
    });
    dec.on('error', reject);
  });
  enc.stdin.end();
  await encDone;
  j.signal?.removeEventListener('abort', abort);
  if (j.signal?.aborted) throw new Error(tx('Отменено'));
}

export interface TrackPoint { t: number; x: number; y: number; found: boolean }

/**
 * Где в кадре человек (для автокадрирования): центр масс маски RVM, 5 раз в секунду.
 * t — время исходника; x, y — доли ширины/высоты кадра.
 */
export async function trackPerson(j: { src: string; ss: number; dur: number; width: number; height: number; onProgress?: (p: number) => void; signal?: AbortSignal }): Promise<TrackPoint[]> {
  const sess = await getSession();
  const k = Math.min(1, 384 / Math.max(j.width, j.height));
  const W = Math.max(2, Math.round((j.width * k) / 2) * 2);
  const H = Math.max(2, Math.round((j.height * k) / 2) * 2);
  const fps = 5;
  const total = Math.max(1, Math.ceil(j.dur * fps));
  const dec = spawn(ffmpegPath(), ['-v', 'error', '-ss', String(j.ss), '-t', String(j.dur), '-i', j.src,
    '-vf', `fps=${fps},scale=${W}:${H}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { windowsHide: true });
  const abort = () => dec.kill('SIGKILL');
  j.signal?.addEventListener('abort', abort, { once: true });
  const N = W * H;
  const frameBytes = N * 3;
  let rec = [0, 1, 2, 3].map(() => new ort.Tensor('float32', new Float32Array([0]), [1, 1, 1, 1]));
  const ratioT = new ort.Tensor('float32', new Float32Array([1]), [1]);
  const src = new Float32Array(3 * N);
  const pts: TrackPoint[] = [];
  let pending: Buffer = Buffer.alloc(0);
  const processFrame = async (fr: Buffer) => {
    for (let i = 0; i < N; i++) {
      src[i] = fr[i * 3] / 255; src[N + i] = fr[i * 3 + 1] / 255; src[2 * N + i] = fr[i * 3 + 2] / 255;
    }
    const out = await sess.run({ src: new ort.Tensor('float32', src, [1, 3, H, W]), r1i: rec[0], r2i: rec[1], r3i: rec[2], r4i: rec[3], downsample_ratio: ratioT });
    rec = [out.r1o, out.r2o, out.r3o, out.r4o];
    const pha = out.pha.data as Float32Array;
    let m = 0; let sx = 0; let sy = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = pha[y * W + x];
      if (a < 0.5) continue;
      m += a; sx += a * (x + 0.5); sy += a * (y + 0.5);
    }
    const t = j.ss + pts.length / fps;
    const found = m > N * 0.004;
    pts.push({ t, x: found ? sx / m / W : 0.5, y: found ? sy / m / H : 0.5, found });
    j.onProgress?.(Math.min(0.999, pts.length / total));
  };
  await new Promise<void>((resolve, reject) => {
    let busy = Promise.resolve();
    dec.stdout.on('data', (d: Buffer) => {
      pending = pending.length ? Buffer.concat([pending, d]) : d;
      const frames: Buffer[] = [];
      while (pending.length >= frameBytes) { frames.push(Buffer.from(pending.subarray(0, frameBytes))); pending = pending.subarray(frameBytes); }
      if (!frames.length) return;
      dec.stdout.pause();
      busy = busy.then(async () => { for (const f of frames) await processFrame(f); }).then(() => { dec.stdout.resume(); }, (e) => { abort(); reject(e); });
    });
    dec.on('close', () => busy.then(() => (j.signal?.aborted ? reject(new Error(tx('Отменено'))) : resolve()), reject));
    dec.on('error', reject);
  });
  j.signal?.removeEventListener('abort', abort);
  return pts;
}
