// Реестр моделей ИИ: что качать, откуда и как проверить, что модель на месте.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import bz2 from 'unbzip2-stream';
import * as tar from 'tar';
import { bundledModel, modelsDir } from '../bins';

export type AsrModelId = 'multi' | 'ru';

export interface AsrModel {
  id: AsrModelId;
  label: string;
  note: string;
  sizeMb: number;
  url: string;
  dir: string;               // папка после распаковки
  encoder: string;
  decoder: string;
  joiner: string;
  tokens: string;
  featureDim: number;
}

const GH = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models';

export const ASR_MODELS: Record<AsrModelId, AsrModel> = {
  multi: {
    id: 'multi',
    label: 'Parakeet v3 — русский, английский и ещё 23 языка',
    note: 'Лучшее качество: сам ставит знаки препинания и заглавные буквы. Скачивается один раз (~490 МБ).',
    sizeMb: 487,
    url: `${GH}/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2`,
    dir: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
    encoder: 'encoder.int8.onnx', decoder: 'decoder.int8.onnx', joiner: 'joiner.int8.onnx', tokens: 'tokens.txt',
    featureDim: 128,
  },
  ru: {
    id: 'ru',
    label: 'GigaAM v2 — только русский, лёгкая',
    note: 'Отличное качество для русского, быстрая. Без знаков препинания. Скачивается один раз (~170 МБ).',
    sizeMb: 172,
    url: `${GH}/sherpa-onnx-nemo-transducer-giga-am-v2-russian-2025-04-19.tar.bz2`,
    dir: 'sherpa-onnx-nemo-transducer-giga-am-v2-russian-2025-04-19',
    encoder: 'encoder.int8.onnx', decoder: 'decoder.onnx', joiner: 'joiner.onnx', tokens: 'tokens.txt',
    featureDim: 64,
  },
};

export function asrModelPath(m: AsrModel, file: string): string {
  return path.join(modelsDir(), m.dir, file);
}

export function asrModelReady(id: AsrModelId): boolean {
  const m = ASR_MODELS[id];
  return [m.encoder, m.decoder, m.joiner, m.tokens].every((f) => fs.existsSync(asrModelPath(m, f)));
}

/** Небольшие модели, которые идут вместе с программой. */
export const VAD_MODEL = () => bundledModel('silero_vad.onnx');
export const MATTING_MODEL = () => bundledModel('rvm_mobilenetv3_fp32.onnx');
export const RNNOISE_MODEL = () => bundledModel('std.rnnn');

/** Скачивает и распаковывает модель распознавания. onProgress: 0..1 (скачивание), затем распаковка. */
export async function downloadAsrModel(id: AsrModelId, onProgress: (p: number, stage: 'download' | 'unpack') => void, signal?: AbortSignal): Promise<void> {
  if (asrModelReady(id)) return;
  const m = ASR_MODELS[id];
  const dir = modelsDir();
  const tmp = path.join(dir, `${m.dir}.tar.bz2.part`);
  const res = await fetch(m.url, { signal, redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Не удалось скачать модель (HTTP ${res.status}). Проверь интернет или VPN.`);
  const total = Number(res.headers.get('content-length') || m.sizeMb * 1e6);
  let got = 0;
  const out = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
      onProgress(Math.min(0.999, got / total), 'download');
    }
  } finally {
    await new Promise<void>((r) => out.end(() => r()));
  }
  if (signal?.aborted) throw new Error('Отменено');
  onProgress(0, 'unpack');
  const extractTo = path.join(dir, `${m.dir}.unpack`);
  fs.rmSync(extractTo, { recursive: true, force: true });
  fs.mkdirSync(extractTo, { recursive: true });
  const size = fs.statSync(tmp).size;
  let read = 0;
  const src = fs.createReadStream(tmp);
  src.on('data', (d) => { read += (d as Buffer).length; onProgress(Math.min(0.999, read / size), 'unpack'); });
  await pipeline(src, bz2(), tar.x({ cwd: extractTo }) as unknown as NodeJS.WritableStream);
  const inner = path.join(extractTo, m.dir);
  const finalDir = path.join(dir, m.dir);
  fs.rmSync(finalDir, { recursive: true, force: true });
  fs.renameSync(fs.existsSync(inner) ? inner : extractTo, finalDir);
  fs.rmSync(extractTo, { recursive: true, force: true });
  fs.rmSync(tmp, { force: true });
  if (!asrModelReady(id)) throw new Error('Модель скачалась не полностью. Попробуй ещё раз.');
  onProgress(1, 'unpack');
  void Readable;
}
