// Улучшение качества. «Быстро» — FFmpeg здесь же; «Нейросеть» — Real-ESRGAN в процессе «vision» (upscale.ts).
import { fastEnhanceFilter } from '../../shared/enhance';
import { runFfmpeg } from '../ffrun';

export async function fastEnhance(src: string, ss: number, dur: number, w: number, h: number, tgt: { w: number; h: number }, out: string,
  onProgress?: (p: number) => void, signal?: AbortSignal): Promise<void> {
  await runFfmpeg(['-hide_banner', '-y', '-ss', String(ss), '-t', String(dur), '-i', src, '-an',
    '-filter_complex', fastEnhanceFilter(w, h, tgt.w, tgt.h), '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-g', '15', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', out],
  { duration: dur, onProgress, signal });
}
