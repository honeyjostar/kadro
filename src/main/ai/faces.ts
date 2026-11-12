// Поиск лиц в клипе: YuNet (OpenCV Zoo, MIT, 230 КБ) — быстро даже на процессоре.
// Кадр вписывается в 640×640 (поля снизу и справа), находки — в долях кадра исходника.
import os from 'node:os';
import { decodeYunet, YUNET_SIZE, type DetFrame } from '../../shared/blur';
import { FACE_MODEL } from './models';
import { eachFrame } from './frames';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ort = require('onnxruntime-node');

let session: any;
async function getSession(): Promise<any> {
  session ??= await ort.InferenceSession.create(FACE_MODEL(), {
    executionProviders: ['cpu'],
    intraOpNumThreads: Math.max(1, Math.min(4, os.cpus().length - 1)),
    graphOptimizationLevel: 'all',
  });
  return session;
}

/** Как часто искать лица: короткий ролик — 8 раз в секунду, длинный — реже. */
export function faceFps(dur: number): number {
  return dur > 600 ? 3 : dur > 150 ? 5 : 8;
}

export interface FaceJob { src: string; ss: number; dur: number; width: number; height: number; image?: boolean; onProgress?: (p: number) => void; signal?: AbortSignal }

/** Лица по кадрам: t — время исходника. */
export async function detectFaces(j: FaceJob): Promise<DetFrame[]> {
  const sess = await getSession();
  const S = YUNET_SIZE;
  const k = S / Math.max(j.width, j.height);
  const w = Math.max(2, Math.round(j.width * k)), h = Math.max(2, Math.round(j.height * k));
  const fps = faceFps(j.dur);
  const total = j.image ? 1 : Math.max(1, Math.ceil(j.dur * fps));
  const N = S * S;
  const input = new Float32Array(3 * N);
  const frames: DetFrame[] = [];
  await eachFrame({ src: j.src, ss: j.ss, dur: j.dur, fps, vf: `scale=${w}:${h}:flags=area,pad=${S}:${S}:0:0:black`, w: S, h: S, pix: 'rgb24', image: j.image, signal: j.signal }, async (fr, i) => {
    // BGR, 0..255, по плоскостям — как blobFromImage в OpenCV
    for (let p = 0; p < N; p++) { input[p] = fr[p * 3 + 2]; input[N + p] = fr[p * 3 + 1]; input[2 * N + p] = fr[p * 3]; }
    const out = await sess.run({ input: new ort.Tensor('float32', input, [1, 3, S, S]) });
    const arrs: Record<string, Float32Array> = {};
    for (const key of Object.keys(out)) arrs[key] = out[key].data as Float32Array;
    const dets = decodeYunet(arrs, S)
      .map((d) => ({ x: d.x / w, y: d.y / h, w: d.w / w, h: d.h / h, score: Math.round(d.score * 1000) / 1000 }))
      .filter((d) => d.x > -0.05 && d.x < 1.05 && d.y > -0.05 && d.y < 1.05 && d.w > 0.004);
    frames.push({ t: Math.round((j.ss + i / fps) * 1000) / 1000, dets });
    j.onProgress?.(Math.min(0.999, frames.length / total));
  });
  return frames;
}
