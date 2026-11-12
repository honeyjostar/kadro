// Глубина кадра для 3D-фото: Depth Anything V2 Small (Apache-2.0, ~100 МБ — скачивается один раз).
// Вход 518×518 (фото растягивается), выход — «близость» (больше — ближе). Карта нормируется и
// сохраняется серой PNG в размере фото (длинная сторона до 1280) со слабым размытием — меньше рваных краёв.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { tx } from '../../shared/i18n';
import { normalizeDepth, photo3dWork } from '../../shared/photo3d';
import { ffmpegPath, modelsDir } from '../bins';
import { fetchToFile, netReason, sha256File } from './download';

export const DEPTH = {
  file: 'depth_anything_v2_vits.onnx',
  url: 'https://github.com/fabio-sim/Depth-Anything-ONNX/releases/download/v2.0.0/depth_anything_v2_vits.onnx',
  size: 99373606,
  sha256: 'd2b11a11c1d4a12b47608fa65a17ee9a4c605b55ee1730c8e3b526304f2562be',
};
export const depthPath = (): string => path.join(modelsDir(), DEPTH.file);
export const depthReady = (): boolean => { try { return fs.statSync(depthPath()).size === DEPTH.size; } catch { return false; } };

export async function downloadDepth(onProgress: (p: number) => void, signal?: AbortSignal): Promise<void> {
  if (depthReady()) return;
  const tmp = `${depthPath()}.dl`;
  try {
    await fetchToFile(DEPTH.url, tmp, { size: DEPTH.size, signal, onBytes: (got) => onProgress(Math.min(0.999, got / DEPTH.size)) });
  } catch (e) {
    if (signal?.aborted) throw new Error(tx('Отменено'));
    throw new Error(tx('Модель глубины не скачалась: {0}', netReason(e)));
  }
  if ((await sha256File(tmp)) !== DEPTH.sha256) { fs.rmSync(tmp, { force: true }); throw new Error(tx('Модель глубины скачалась с ошибкой — попробуй ещё раз')); }
  fs.renameSync(tmp, depthPath());
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ort = require('onnxruntime-node');
let session: any;
async function getSession(): Promise<any> {
  if (session) return session;
  const tries: string[][] = process.platform === 'win32' ? [['dml'], ['cpu']] : [['cpu']];
  let last: unknown;
  for (const eps of tries) {
    try { session = await ort.InferenceSession.create(depthPath(), { executionProviders: eps, intraOpNumThreads: Math.max(1, os.cpus().length - 1), graphOptimizationLevel: 'all' }); return session; } catch (e) { last = e; }
  }
  throw last;
}

function ffBytes(args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), ['-v', 'error', ...args], { windowsHide: true });
    const out: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (d: Buffer) => out.push(d));
    p.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err.trim() || `ffmpeg ${code}`))));
    p.stdin.on('error', () => undefined);
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}

const N = 518;
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

/** Карта глубины фото (или кадра видео в момент at) → серая PNG. Возвращает путь и размер карты. */
export async function estimateDepth(src: string, width: number, height: number, out: string, at = 0): Promise<{ path: string; w: number; h: number }> {
  const sess = await getSession();
  const seek = at > 0 ? ['-ss', String(at)] : [];
  const rgb = await ffBytes([...seek, '-i', src, '-frames:v', '1', '-vf', `scale=${N}:${N}:flags=bicubic`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const x = new Float32Array(3 * N * N);
  for (let i = 0; i < N * N; i++) for (let c = 0; c < 3; c++) x[c * N * N + i] = (rgb[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  const res = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, N, N]) });
  const d = res[sess.outputNames[0]].data as Float32Array;
  const g = normalizeDepth(d);
  const ws = photo3dWork(width, height);
  await ffBytes(['-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${N}x${N}`, '-i', '-', '-vf', `scale=${ws.w}:${ws.h}:flags=bicubic,gblur=sigma=${Math.max(1, ws.w / 700).toFixed(2)}`, '-frames:v', '1', '-update', '1', out], Buffer.from(g));
  return { path: out, w: ws.w, h: ws.h };
}
