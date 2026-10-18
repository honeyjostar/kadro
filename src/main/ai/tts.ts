// Озвучка текста: голоса Piper (VITS) через sherpa-onnx, без интернета после скачивания голоса.
import os from 'node:os';
import path from 'node:path';
import { TTS_VOICES, ttsVoiceDir, type TtsVoiceId } from './models';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sherpa = require('sherpa-onnx-node');

const engines = new Map<TtsVoiceId, { generate: (o: unknown) => { samples: Float32Array; sampleRate: number } }>();

function engine(id: TtsVoiceId) {
  let e = engines.get(id);
  if (!e) {
    const d = ttsVoiceDir(id);
    e = new sherpa.OfflineTts({
      model: { vits: { model: path.join(d, `${TTS_VOICES[id].name}.onnx`), tokens: path.join(d, 'tokens.txt'), dataDir: path.join(d, 'espeak-ng-data') }, numThreads: Math.max(1, Math.min(4, os.cpus().length - 1)) },
      maxNumSentences: 1,
    });
    engines.set(id, e!);
  }
  return e!;
}

/** Синтез речи в WAV. speed: 0.5..2 (1 — обычно). Возвращает длительность, сек. */
export function synthesize(text: string, voice: TtsVoiceId, speed: number, out: string): number {
  const a = engine(voice).generate({ text, sid: 0, speed, enableExternalBuffer: false }); // false: в Electron внешние буферы запрещены
  sherpa.writeWave(out, { samples: a.samples, sampleRate: a.sampleRate });
  return a.samples.length / a.sampleRate;
}
