// Эффекты голоса: обработанный звук фрагмента (FLAC 48 кГц), одинаково звучит в превью и в экспорте.
import path from 'node:path';
import type { VoiceEffect } from '../../shared/types';
import { runFfmpeg } from '../ffrun';
import { RNNOISE_MODEL } from './models';

export const VOICE_FILTERS: Record<Exclude<VoiceEffect, 'none'>, string> = {
  chipmunk: 'rubberband=pitch=1.6:formant=shifted',
  deep: 'rubberband=pitch=0.68:formant=shifted',
  robot: "afftfilt=real='hypot(re\\,im)*sin(0)':imag='hypot(re\\,im)*cos(0)':win_size=512:overlap=0.75,volume=7,alimiter=limit=0.95:level=0",
  echo: 'aecho=0.8:0.85:120|240:0.35|0.2',
  hall: 'aecho=0.8:0.9:40|70|110|170:0.4|0.32|0.25|0.18',
  radio: 'highpass=f=300,lowpass=f=3200,acompressor=threshold=0.1:ratio=6:attack=5:release=60,acrusher=bits=8:mix=0.15,volume=1.4',
  phone: 'highpass=f=400,lowpass=f=3400,volume=1.3',
  megaphone: 'highpass=f=600,lowpass=f=4500,acrusher=bits=6:mix=0.25,volume=1.6',
};

/** Голос с эффектом (и, при желании, с чисткой шума) для фрагмента исходника [ss, ss+dur]. */
export async function processVoice(src: string, ss: number, dur: number, effect: VoiceEffect, withDenoise: boolean, out: string,
  onProgress?: (p: number) => void, signal?: AbortSignal): Promise<void> {
  const model = RNNOISE_MODEL();
  const chain: string[] = [];
  if (withDenoise) chain.push('highpass=f=70', `arnndn=m=${path.basename(model)}:mix=0.95`);
  if (effect !== 'none') chain.push(VOICE_FILTERS[effect]);
  chain.push('aresample=48000');
  await runFfmpeg([
    '-hide_banner', '-y', '-ss', String(ss), '-t', String(dur), '-i', src, '-vn',
    '-af', chain.join(','), '-ar', '48000', '-ac', '2', '-c:a', 'flac', '-progress', 'pipe:1', '-nostats', out,
  ], { cwd: path.dirname(model), duration: dur, onProgress, signal });
}
