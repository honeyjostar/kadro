// Чистка голоса: RNNoise прямо в FFmpeg (48 кГц, без потери верхних частот).
import path from 'node:path';
import { runFfmpeg } from '../ffrun';
import { RNNOISE_MODEL } from './models';

/** Чистит голос во фрагменте исходника [ss, ss+dur]. Результат — FLAC 48 кГц стерео. */
export async function denoise(src: string, ss: number, dur: number, out: string, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<void> {
  const model = RNNOISE_MODEL();
  // путь к модели задаём относительно рабочей папки — так не нужно экранировать «C:» в фильтре
  await runFfmpeg([
    '-hide_banner', '-y', '-ss', String(ss), '-t', String(dur), '-i', src, '-vn',
    '-af', `highpass=f=70,arnndn=m=${path.basename(model)}:mix=0.95`,
    '-ar', '48000', '-ac', '2', '-c:a', 'flac', '-progress', 'pipe:1', '-nostats', out,
  ], { cwd: path.dirname(model), duration: dur, onProgress, signal });
}

