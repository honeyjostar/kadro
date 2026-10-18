// Стабилизация: vidstab в два прохода (поиск тряски → сглаживание), результат — H.264 фрагмента без звука.
import fs from 'node:fs';
import path from 'node:path';
import { cacheDir } from '../bins';
import { runFfmpeg } from '../ffrun';

/** strength 0..1: насколько сильно сглаживать движение камеры. */
export async function stabilize(src: string, ss: number, dur: number, strength: number, out: string, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<void> {
  const work = path.join(cacheDir('tmp'), `stab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(work, { recursive: true });
  const smoothing = Math.round(8 + strength * 40);
  try {
    // путь к файлу движения — относительный (рабочая папка), без экранирования «C:»
    await runFfmpeg(['-hide_banner', '-y', '-ss', String(ss), '-t', String(dur), '-i', src, '-an',
      '-vf', 'vidstabdetect=shakiness=8:accuracy=15:result=motion.trf', '-f', 'null', '-progress', 'pipe:1', '-nostats', '-'],
    { cwd: work, duration: dur, onProgress: (p) => onProgress?.(p * 0.5), signal });
    await runFfmpeg(['-hide_banner', '-y', '-ss', String(ss), '-t', String(dur), '-i', src, '-an',
      '-vf', `vidstabtransform=input=motion.trf:smoothing=${smoothing}:optzoom=1:interpol=bicubic,unsharp=5:5:0.6:3:3:0.3,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-g', '15', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', out],
    { cwd: work, duration: dur, onProgress: (p) => onProgress?.(0.5 + p * 0.5), signal });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
