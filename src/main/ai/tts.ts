// Озвучка текста: голоса Piper (VITS) и Kokoro через sherpa-onnx, без интернета после скачивания голоса.
import os from 'node:os';
import path from 'node:path';
import { TTS_VOICES, ttsModelFile, ttsVoiceDir, type TtsVoiceId } from './models';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sherpa = require('sherpa-onnx-node');

type Engine = { generate: (o: unknown) => { samples: Float32Array; sampleRate: number } };
// у Kokoro одна модель на все голоса (и своя — на британское произношение: другой словарь)
const engines = new Map<string, Engine>();

function engine(id: TtsVoiceId): Engine {
  const v = TTS_VOICES[id];
  const key = v.engine === 'kokoro' ? `${v.pack}/${v.gb ? 'gb' : 'us'}` : v.pack;
  let e = engines.get(key);
  if (!e) {
    const d = ttsVoiceDir(id);
    const f = (name: string) => path.join(d, name);
    const numThreads = Math.max(1, Math.min(v.engine === 'kokoro' ? 6 : 4, os.cpus().length - 1));
    const model = v.engine === 'kokoro'
      ? { kokoro: { model: f(ttsModelFile(v)), voices: f('voices.bin'), tokens: f('tokens.txt'), dataDir: f('espeak-ng-data'), lexicon: `${f(v.gb ? 'lexicon-gb-en.txt' : 'lexicon-us-en.txt')},${f('lexicon-zh.txt')}` }, numThreads, provider: 'cpu' }
      : { vits: { model: f(ttsModelFile(v)), tokens: f('tokens.txt'), dataDir: f('espeak-ng-data') }, numThreads, provider: 'cpu' };
    e = new sherpa.OfflineTts({ model, maxNumSentences: 1 }) as Engine;
    engines.set(key, e);
  }
  return e;
}

/** Синтез речи в WAV. speed: 0.5..2 (1 — обычно). Возвращает длительность, сек. */
export function synthesize(text: string, voice: TtsVoiceId, speed: number, out: string): number {
  const a = engine(voice).generate({ text, sid: TTS_VOICES[voice].sid, speed, enableExternalBuffer: false }); // false: в Electron внешние буферы запрещены
  sherpa.writeWave(out, { samples: a.samples, sampleRate: a.sampleRate });
  return a.samples.length / a.sampleRate;
}
