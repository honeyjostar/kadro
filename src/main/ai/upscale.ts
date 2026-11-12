// «Нейросеть»: Real-ESRGAN (общая модель x4 v3, BSD-3-Clause) по кускам кадра → кадр в 4 раза больше →
// FFmpeg уменьшает до 1080p и кодирует. На Windows — на видеокарте (DirectML), иначе на процессоре (медленно).
import { spawn } from 'node:child_process';
import os from 'node:os';
import { tx } from '../../shared/i18n';
import { etaMinutes, tilesFor } from '../../shared/enhance';
import { ffmpegPath } from '../bins';
import { eachFrame } from './frames';
import { UPSCALE_MODEL } from './models';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ort = require('onnxruntime-node');

let session: any;
let provider: 'gpu' | 'cpu' = 'cpu';
async function getSession(): Promise<any> {
  if (session) return session;
  const tries: string[][] = process.platform === 'win32' && !process.env.KADRO_TEST_CPU_ONLY ? [['dml'], ['cpu']] : [['cpu']];
  let last: unknown;
  for (const eps of tries) {
    try {
      session = await ort.InferenceSession.create(UPSCALE_MODEL(), { executionProviders: eps, intraOpNumThreads: Math.max(1, os.cpus().length - 1), graphOptimizationLevel: 'all' });
      provider = eps[0] === 'dml' ? 'gpu' : 'cpu';
      return session;
    } catch (e) { last = e; }
  }
  throw last;
}

export interface UpscaleJob {
  src: string; ss: number; dur: number; fps: number; width: number; height: number;
  tw: number; th: number; out: string;
  onProgress?: (p: number, stage?: string) => void; signal?: AbortSignal;
}

const S = 4;

export async function aiEnhance(j: UpscaleJob): Promise<'gpu' | 'cpu'> {
  const sess = await getSession();
  const W = Math.max(2, Math.round(j.width / 2) * 2), H = Math.max(2, Math.round(j.height / 2) * 2);
  const OW = W * S, OH = H * S;
  const tiles = tilesFor(W, H);
  const total = Math.max(1, Math.ceil(j.dur * j.fps));
  const enc = spawn(ffmpegPath(), ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${OW}x${OH}`, '-framerate', String(j.fps), '-i', '-',
    '-vf', `scale=${j.tw}:${j.th}:flags=area,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-g', '15', '-movflags', '+faststart', j.out], { windowsHide: true });
  let encErr = '';
  enc.stderr.on('data', (d: Buffer) => { encErr = (encErr + d.toString()).slice(-1500); });
  const encDone = new Promise<void>((resolve, reject) => {
    enc.on('error', reject);
    enc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(encErr.trim() || `ffmpeg ${code}`))));
  });
  enc.stdin.on('error', () => undefined);
  const abort = () => enc.kill('SIGKILL');
  j.signal?.addEventListener('abort', abort, { once: true });
  const big = Buffer.alloc(OW * OH * 3);
  const t0 = Date.now();
  const where = provider === 'gpu' ? tx('на видеокарте') : tx('на процессоре');
  try {
    await eachFrame({ src: j.src, ss: j.ss, dur: j.dur, fps: j.fps, vf: `scale=${W}:${H}`, w: W, h: H, pix: 'rgb24', signal: j.signal }, async (fr, i) => {
      for (const t of tiles) {
        const n = t.pw * t.ph;
        const x = new Float32Array(3 * n);
        for (let yy = 0; yy < t.ph; yy++) {
          let s = ((t.py + yy) * W + t.px) * 3;
          for (let xx = 0; xx < t.pw; xx++, s += 3) {
            const d = yy * t.pw + xx;
            x[d] = fr[s] / 255; x[n + d] = fr[s + 1] / 255; x[2 * n + d] = fr[s + 2] / 255;
          }
        }
        const out = await sess.run({ input: new ort.Tensor('float32', x, [1, 3, t.ph, t.pw]) });
        const y = out.output.data as Float32Array;
        const ow = t.pw * S, on = ow * t.ph * S;
        // внутренняя часть куска (без запаса) → в большой кадр
        const ox = (t.x - t.px) * S, oy = (t.y - t.py) * S;
        for (let yy = 0; yy < t.h * S; yy++) {
          const srcRow = (oy + yy) * ow + ox;
          let d = ((t.y * S + yy) * OW + t.x * S) * 3;
          for (let xx = 0; xx < t.w * S; xx++, d += 3) {
            const q = srcRow + xx;
            big[d] = Math.max(0, Math.min(255, Math.round(y[q] * 255)));
            big[d + 1] = Math.max(0, Math.min(255, Math.round(y[on + q] * 255)));
            big[d + 2] = Math.max(0, Math.min(255, Math.round(y[2 * on + q] * 255)));
          }
        }
      }
      if (!enc.stdin.write(big)) await new Promise((r) => enc.stdin.once('drain', r));
      const spf = (Date.now() - t0) / 1000 / (i + 1);
      const left = etaMinutes(spf, total - i - 1);
      j.onProgress?.(Math.min(0.99, (i + 1) / total), tx('Нейросеть {0}: кадр {1} из {2}, осталось ~{3} мин', where, i + 1, total, left));
    });
  } catch (e) {
    abort();
    throw e;
  }
  enc.stdin.end();
  await encDone;
  j.signal?.removeEventListener('abort', abort);
  return provider;
}
