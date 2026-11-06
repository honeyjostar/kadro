// Речь: детектор речи (Silero VAD) и распознавание (Parakeet v3 / GigaAM v2) через sherpa-onnx.
import { tx } from '../../shared/i18n';
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
    return sherpa.readWave(wav, false).samples as Float32Array; // false: в Electron внешние буферы запрещены
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

/** На чём считать: процессор или видеокарта через DirectML (только в сборке sherpa-onnx с DirectML, иначе — процессор). */
export type AsrProvider = 'cpu' | 'directml';

const recognizers = new Map<string, unknown>();
function recognizer(id: AsrModelId, provider: AsrProvider = 'cpu'): any {
  const key = `${id}:${provider}`;
  let r = recognizers.get(key);
  if (!r) {
    if (!asrModelReady(id)) throw new Error(tx('Модель распознавания ещё не скачана'));
    const m = ASR_MODELS[id];
    r = new sherpa.OfflineRecognizer({
      featConfig: { sampleRate: SR, featureDim: m.featureDim },
      modelConfig: {
        transducer: { encoder: asrModelPath(m, m.encoder), decoder: asrModelPath(m, m.decoder), joiner: asrModelPath(m, m.joiner) },
        tokens: asrModelPath(m, m.tokens),
        // и на видеокарте — все потоки: то, что DirectML не умеет, считает процессор
        numThreads: threads(),
        // автотест «видеокарта есть»: без сборки с DirectML считаем на процессоре молча
        provider: provider === 'directml' && process.env.KADRO_TEST_ASR_DML === 'quiet' ? 'cpu' : provider,
        modelType: 'nemo_transducer',
      },
    });
    recognizers.set(key, r);
  }
  return r;
}
/** Освободить модель на другом устройстве (после сравнения нужна только одна). */
function dropRecognizer(id: AsrModelId, provider: AsrProvider): void { recognizers.delete(`${id}:${provider}`); }

export interface TranscribeResult {
  words: Word[]; cues: Cue[]; text: string;
  /** на чём распознавали, сколько секунд речи и сколько секунд ушло на распознавание */
  provider: AsrProvider; speechSec: number; decodeSec: number;
}
export interface BenchResult { gpuSec: number; cpuSec: number; speechSec: number }
export interface TranscribeOpts {
  provider?: AsrProvider;
  /** сначала сравнить видеокарту и процессор на первых фразах этой записи и распознавать на том, что быстрее */
  bench?: boolean;
  /** итог сравнения (вызывается до распознавания) */
  onBench?: (b: BenchResult) => void;
  /** видеокарта — только если она хотя бы во столько раз быстрее (как в «Авто») */
  minGain?: number;
  /** видеокарта не запустилась — распознавание всё равно идёт, на процессоре */
  onGpuError?: (message: string) => void;
}

interface Chunk { lo: number; hi: number; samples: Float32Array; speech: number }
/** Фразы с запасом по краям, чтобы не обрезать первые и последние звуки. */
function chunksOf(samples: Float32Array, segs: Segment[]): Chunk[] {
  const PAD = 0.2;
  return segs.map((s, k) => {
    const lo = Math.max(0, k > 0 ? (segs[k - 1].end + s.start) / 2 : 0, s.start - PAD);
    const hi = Math.min(samples.length / SR, k < segs.length - 1 ? (s.end + segs[k + 1].start) / 2 : Infinity, s.end + PAD);
    return { lo, hi, samples: samples.subarray(Math.floor(lo * SR), Math.ceil(hi * SR)), speech: s.end - s.start };
  });
}
function decodeChunk(rec: any, c: Chunk): { tokens: string[]; timestamps: number[] } {
  const st = rec.createStream();
  st.acceptWaveform({ samples: c.samples, sampleRate: SR });
  rec.decode(st);
  return rec.getResult(st);
}
const now = () => performance.now() / 1000;

/**
 * Сравнение на самой записи: первые фразы (до ~20 с речи) по одному разу вхолостую на каждом устройстве —
 * видеокарта в первый раз готовит вычисления, — потом те же фразы с секундомером. null — речи слишком мало.
 */
export function benchProviders(model: AsrModelId, chunks: Chunk[]): BenchResult | null {
  const pick: Chunk[] = [];
  let speech = 0;
  for (const c of chunks) { if (speech >= 20 || pick.length >= 12) break; pick.push(c); speech += c.speech; }
  if (speech < 4) return null;
  const gpu = recognizer(model, 'directml');
  const cpu = recognizer(model, 'cpu');
  const time = (rec: unknown) => { const t = now(); for (const c of pick) decodeChunk(rec, c); return now() - t; };
  decodeChunk(gpu, pick[0]); decodeChunk(cpu, pick[0]);
  const gpuSec = time(gpu);
  const cpuSec = time(cpu);
  return { gpuSec, cpuSec, speechSec: speech };
}

/** Полное распознавание: VAD → куски речи → слова с таймкодами → строки субтитров. */
export function transcribe(samples: Float32Array, model: AsrModelId, onProgress?: (p: number) => void, cueOpts: CueOptions = CUE_DEFAULTS, shouldStop?: () => boolean, opts: TranscribeOpts = {}): TranscribeResult {
  let provider: AsrProvider = opts.provider ?? 'cpu';
  if (!asrModelReady(model)) throw new Error(tx('Модель распознавания ещё не скачана'));
  const segs = detectSpeech(samples, { maxSpeech: 18 });
  const chunks = chunksOf(samples, segs);
  const gpuFailed = (e: unknown) => { dropRecognizer(model, 'directml'); provider = 'cpu'; opts.onGpuError?.(e instanceof Error ? e.message : String(e)); };
  if (opts.bench) {
    try {
      const b = benchProviders(model, chunks);
      if (b) {
        opts.onBench?.(b);
        provider = b.gpuSec < b.cpuSec * (opts.minGain ?? 1) ? 'directml' : 'cpu';
        dropRecognizer(model, provider === 'cpu' ? 'directml' : 'cpu');
      } else provider = 'cpu';
    } catch (e) { gpuFailed(e); }
  }
  let rec: any;
  try { rec = recognizer(model, provider); } catch (e) { if (provider === 'cpu') throw e; gpuFailed(e); rec = recognizer(model, 'cpu'); }
  const speechSec = segs.reduce((n, s) => n + (s.end - s.start), 0);
  const total = speechSec || 1;
  let done = 0;
  const words: Word[] = [];
  const starts = new Set<number>();
  const t0 = now();
  for (const c of chunks) {
    if (shouldStop?.()) throw new Error(tx('Отменено'));
    const r = decodeChunk(rec, c);
    const w = tokensToWords(r.tokens ?? [], r.timestamps ?? [], c.lo, c.hi);
    if (w.length) starts.add(words.length);
    words.push(...w);
    done += c.speech;
    onProgress?.(done / total);
  }
  const decodeSec = now() - t0;
  const fixed = capitalizeSegments(words, starts);
  return { words: fixed, cues: wordsToCues(fixed, cueOpts), text: fixed.map((w) => w.text).join(' '), provider, speechSec, decodeSec };
}
