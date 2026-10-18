// Звук: чистка голоса (RNNoise в FFmpeg) и поиск пауз (Silero VAD).
import path from 'node:path';
import { speechToKeepRanges } from '../../shared/captions';
import { runFfmpeg } from '../ffrun';
import { RNNOISE_MODEL } from './models';
import { detectSpeech, readPcm16k } from './speech';

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

/** Отрезки исходника, где есть речь (для «убрать паузы»). */
export async function findSpeechRanges(src: string, clipIn: number, clipOut: number, signal?: AbortSignal): Promise<[number, number][]> {
  const pcm = await readPcm16k(src, clipIn, clipOut - clipIn, signal);
  // границы детектора речи + запас; по громкости не подрезаем — тихие окончания слов звучат на уровне шума
  const segs = detectSpeech(pcm, { minSilence: 0.3, maxSpeech: 60 });
  const speech = segs.map((s) => [clipIn + s.start, clipIn + s.end] as [number, number]);
  return speechToKeepRanges(speech, clipIn, clipOut, 0.15, 0.35, 0.2);
}
