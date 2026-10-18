// Поиск пауз (Silero VAD).
import { speechToKeepRanges } from '../../shared/captions';
import { detectSpeech, readPcm16k } from './speech';

/** Отрезки исходника, где есть речь (для «убрать паузы»). */
export async function findSpeechRanges(src: string, clipIn: number, clipOut: number, signal?: AbortSignal): Promise<[number, number][]> {
  const pcm = await readPcm16k(src, clipIn, clipOut - clipIn, signal);
  // границы детектора речи + запас; по громкости не подрезаем — тихие окончания слов звучат на уровне шума
  const segs = detectSpeech(pcm, { minSilence: 0.3, maxSpeech: 60 });
  const speech = segs.map((s) => [clipIn + s.start, clipIn + s.end] as [number, number]);
  return speechToKeepRanges(speech, clipIn, clipOut, 0.15, 0.35, 0.2);
}
