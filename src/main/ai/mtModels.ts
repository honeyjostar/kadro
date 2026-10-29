// Модели перевода OPUS-MT: список направлений, скачивание с проверкой SHA-256 (без onnxruntime — можно
// звать из главного процесса). Модели лежат в релизе translate-models репозитория Kadro.
import { tx } from '../../shared/i18n';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { modelsDir } from '../bins';

export const MT_BASE = 'https://github.com/honeyjostar/kadro/releases/download/translate-models';
const mtBase = () => process.env.KADRO_MT_BASE || MT_BASE;
const FILES = ['encoder.onnx', 'decoder.onnx', 'decoder_with_past.onnx', 'tokenizer.json', 'config.json'] as const;
/** Без этих файлов модель не работает (decoder_with_past только ускоряет). */
const REQUIRED = ['encoder.onnx', 'decoder.onnx', 'tokenizer.json', 'config.json'] as const;

export interface MtManifestEntry { file: string; size: number; sha256: string }
export const mtDir = (pair: string): string => path.join(modelsDir(), 'mt', pair);
export const mtReady = (pair: string): boolean => REQUIRED.every((f) => fs.existsSync(path.join(mtDir(pair), f)));

async function getManifest(signal?: AbortSignal): Promise<MtManifestEntry[]> {
  const url = `${mtBase()}/manifest.json`;
  const text = url.startsWith('file:') ? fs.readFileSync(new URL(url), 'utf8') : await (async () => {
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(tx('Список моделей перевода недоступен ({0})', r.status));
    return r.text();
  })();
  const list = JSON.parse(text) as MtManifestEntry[];
  if (!Array.isArray(list)) throw new Error(tx('Список моделей перевода повреждён'));
  return list;
}

/** Какие направления перевода есть (по списку моделей в релизе); без интернета — только скачанные. */
export async function mtPairs(signal?: AbortSignal): Promise<{ pairs: string[]; sizes: Record<string, number>; ready: string[] }> {
  const ready = fs.existsSync(path.join(modelsDir(), 'mt')) ? fs.readdirSync(path.join(modelsDir(), 'mt')).filter(mtReady) : [];
  try {
    const list = await getManifest(signal);
    const sizes: Record<string, number> = {};
    for (const e of list) {
      const m = /^([a-z]{2}-[a-z]{2})\.(encoder\.onnx|decoder\.onnx|decoder_with_past\.onnx|tokenizer\.json|config\.json)$/.exec(e.file);
      if (m) sizes[m[1]] = (sizes[m[1]] ?? 0) + e.size;
    }
    const pairs = Object.keys(sizes).filter((p) => REQUIRED.every((f) => list.some((e) => e.file === `${p}.${f}`)));
    return { pairs: [...new Set([...pairs, ...ready])], sizes, ready };
  } catch {
    return { pairs: ready, sizes: {}, ready };
  }
}

/** Скачать модели для направлений (с проверкой SHA-256). */
export async function downloadMt(pairs: string[], onProgress: (p: number) => void, signal?: AbortSignal): Promise<void> {
  const need = pairs.filter((p) => !mtReady(p));
  if (!need.length) return;
  const list = await getManifest(signal);
  const items = need.flatMap((p) => FILES.flatMap((f) => {
    const e = list.find((x) => x.file === `${p}.${f}`);
    if (!e && (REQUIRED as readonly string[]).includes(f)) throw new Error(tx('Нет модели перевода {0}', p));
    return e ? [{ pair: p, name: f, entry: e }] : [];
  }));
  const total = items.reduce((n, x) => n + x.entry.size, 0);
  let done = 0;
  for (const it of items) {
    const dir = mtDir(it.pair);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, it.name);
    const part = `${dest}.part`;
    const hash = createHash('sha256');
    const url = `${mtBase()}/${it.entry.file}`;
    const body: Readable = url.startsWith('file:')
      ? fs.createReadStream(new URL(url))
      : await (async () => {
        const r = await fetch(url, { signal });
        if (!r.ok || !r.body) throw new Error(tx('Модель перевода не скачалась ({0})', r.status));
        return Readable.fromWeb(r.body as never);
      })();
    let got = 0;
    body.on('data', (c: Buffer) => { hash.update(c); got += c.length; onProgress(Math.min(0.999, (done + got) / total)); });
    try {
      await pipeline(body, fs.createWriteStream(part), { signal });
    } catch (e) { fs.rmSync(part, { force: true }); throw e; }
    if (hash.digest('hex') !== it.entry.sha256) { fs.rmSync(part, { force: true }); throw new Error(tx('Модель перевода скачалась с ошибкой — попробуй ещё раз')); }
    fs.renameSync(part, dest);
    done += it.entry.size;
  }
  onProgress(1);
}
