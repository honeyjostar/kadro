// Речь: детектор речи (Silero VAD) и распознавание (Parakeet v3 / GigaAM v2) через sherpa-onnx.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { capitalizeSegments, CUE_DEFAULTS, tokensToWords, wordsToCues, type CueOptions, type Word } from '../../shared/captions';
import type { Cue } from '../../shared/timeline';
import { cacheDir } from '../bins';
import { runFfmpeg } from '../ffrun';
import { ASR_MODELS, asrModelPath, asrModelReady, VAD_MODEL, type AsrModelId } from './models';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sherpa = require('sherpa-onnx-node');

const SR = 16000;
const threads = () => Math.max(1, Math.min(8, os.cpus().length - 1));

export interface Segment { start: number; end: number; samples: Float32Array }

/** Достаёт звук в моно 16 кГц float32. */
export async function readPcm16k(file: string, ss?: number, dur?: number, signal?: AbortSignal): Promise<Float32Array> {
  const wav = path.join(cacheDir('tmp'), `pcm_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
  const args = ['-hide_banner', '-y'];
  if (ss !== undefined) args.push('-ss', String(ss));
  if (dur !== undefined) args.push('-t', String(dur));
  args.push('-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-c:a', 'pcm_s16le', wav);
  await runFfmpeg(args, { signal });
  try {
    return sherpa.readWave(wav).samples as Float32Array;
  } finally {
    fs.rmSync(wav, { force: true });
  }
}

/** Отрезки речи (сек от начала samples). */
export function detectSpeech(samples: Float32Array, opts: { minSilence?: number; threshold?: number; maxSpeech?: number } = {}): Segment[] {
  const vad = new sherpa.Vad({
    sileroVad: {
      model: VAD_MODEL(),
      threshold: opts.threshold ?? 0.5,
      minSpeechDuration: 0.2,
      minSilenceDuration: opts.minSilence ?? 0.35,
      windowSize: 512,
      maxSpeechDuration: opts.maxSpeech ?? 20,
    },
    sampleRate: SR,
    numThreads: 1,
    provider: 'cpu',
  }, Math.max(30, samples.length / SR + 5));
  const W = 512;
  const segs: Segment[] = [];
  const drain = () => {
    while (!vad.isEmpty()) {
      const s = vad.front(false);
      segs.push({ start: s.start / SR, end: (s.start + s.samples.length) / SR, samples: Float32Array.from(s.samples) });
      vad.pop();
    }
  };
  for (let i = 0; i + W <= samples.length; i += W) {
    vad.acceptWaveform(samples.subarray(i, i + W));
    drain();
  }
  vad.flush();
  drain();
  return segs;
}

const recognizers = new Map<AsrModelId, unknown>();
function recognizer(id: AsrModelId): any {
  let r = recognizers.get(id);
  if (!r) {
    if (!asrModelReady(id)) throw new Error('Модель распознавания ещё не скачана');
    const m = ASR_MODELS[id];
    r = new sherpa.OfflineRecognizer({
      featConfig: { sampleRate: SR, featureDim: m.featureDim },
      modelConfig: {
        transducer: { encoder: asrModelPath(m, m.encoder), decoder: asrModelPath(m, m.decoder), joiner: asrModelPath(m, m.joiner) },
        tokens: asrModelPath(m, m.tokens),
        numThreads: threads(),
        provider: 'cpu',
        modelType: 'nemo_transducer',
      },
    });
    recognizers.set(id, r);
  }
  return r;
}

export interface TranscribeResult { words: Word[]; cues: Cue[]; text: string }

/** Полное распознавание: VAD → куски речи → слова с таймкодами → строки субтитров. */
export function transcribe(samples: Float32Array, model: AsrModelId, onProgress?: (p: number) => void, cueOpts: CueOptions = CUE_DEFAULTS, shouldStop?: () => boolean): TranscribeResult {
  const rec = recognizer(model);
  const segs = detectSpeech(samples, { maxSpeech: 18 });
  const total = segs.reduce((n, s) => n + (s.end - s.start), 0) || 1;
  let done = 0;
  const words: Word[] = [];
  const starts = new Set<number>();
  const PAD = 0.2;
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k];
    if (shouldStop?.()) throw new Error('Отменено');
    // даём модели фразу с запасом, чтобы не обрезать первые/последние звуки
    const lo = Math.max(0, k > 0 ? (segs[k - 1].end + s.start) / 2 : 0, s.start - PAD);
    const hi = Math.min(samples.length / SR, k < segs.length - 1 ? (s.end + segs[k + 1].start) / 2 : Infinity, s.end + PAD);
    const chunk = samples.subarray(Math.floor(lo * SR), Math.ceil(hi * SR));
    const st = rec.createStream();
    st.acceptWaveform({ samples: chunk, sampleRate: SR });
    rec.decode(st);
    const r = rec.getResult(st);
    const segEnd = hi;
    const w = tokensToWords(r.tokens ?? [], r.timestamps ?? [], lo, segEnd);
    if (w.length) starts.add(words.length);
    words.push(...w);
    done += s.end - s.start;
    onProgress?.(done / total);
  }
  const fixed = capitalizeSegments(words, starts);
  return { words: fixed, cues: wordsToCues(fixed, cueOpts), text: fixed.map((w) => w.text).join(' ') };
}
