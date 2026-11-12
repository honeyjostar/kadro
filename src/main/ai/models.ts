// Реестр моделей ИИ: что качать, откуда и как проверить, что модель на месте.
import { tx } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { downloadModelArchive, netFetch, unpackArchive, type ArchiveSource } from './download';
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
    label: tx('Parakeet v3 — русский, английский и ещё 23 языка'),
    note: tx('Лучшее качество: сам ставит знаки препинания и заглавные буквы. Скачивается один раз (~490 МБ).'),
    sizeMb: 487,
    url: `${GH}/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2`,
    dir: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
    encoder: 'encoder.int8.onnx', decoder: 'decoder.int8.onnx', joiner: 'joiner.int8.onnx', tokens: 'tokens.txt',
    featureDim: 128,
  },
  ru: {
    id: 'ru',
    label: tx('GigaAM v2 — только русский, лёгкая'),
    note: tx('Отличное качество для русского, быстрая. Без знаков препинания. Скачивается один раз (~170 МБ).'),
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
/** Поиск лиц: YuNet 2023mar (OpenCV Zoo, MIT). */
export const FACE_MODEL = () => bundledModel('face_detection_yunet_2023mar.onnx');
export const RNNOISE_MODEL = () => bundledModel('std.rnnn');
/** Улучшение качества: Real-ESRGAN realesr-general-x4v3 (BSD-3-Clause), переведена в ONNX. */
export const UPSCALE_MODEL = () => bundledModel('realesr_general_x4v3.onnx');

// ---------- откуда качать ----------
// Сначала копия в релизе ai-models репозитория Kadro (простой .tar с контрольной суммой — распаковывается быстро),
// потом оригинал у k2-fsa (.tar.bz2). KADRO_AI_MIRROR — подменить адрес копии (автотесты).
export const AI_MIRROR = 'https://github.com/honeyjostar/kadro/releases/download/ai-models';
const mirrorBase = () => process.env.KADRO_AI_MIRROR || AI_MIRROR;
interface MirrorEntry { file: string; size: number; sha256: string }
let manifest: Promise<MirrorEntry[]> | null = null;
function mirrorManifest(signal?: AbortSignal): Promise<MirrorEntry[]> {
  manifest ??= (async () => {
    const r = await netFetch()(`${mirrorBase()}/manifest.json`, { signal, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const list = JSON.parse(await r.text()) as MirrorEntry[];
    return Array.isArray(list) ? list : [];
  })().catch(() => { manifest = null; return []; });
  return manifest;
}

/** Источники архива: копия Kadro (если она есть в списке) и оригинал. */
async function sourcesFor(dirName: string, upstream: string, signal?: AbortSignal): Promise<ArchiveSource[]> {
  const list = await mirrorManifest(signal);
  const e = list.find((x) => x.file === `${dirName}.tar`);
  const out: ArchiveSource[] = [];
  if (e) out.push({ url: `${mirrorBase()}/${e.file}`, size: e.size, sha256: e.sha256, label: tx('копия Kadro на GitHub') });
  if (!process.env.KADRO_AI_MIRROR_ONLY) out.push({ url: upstream, label: tx('сайт авторов модели (GitHub k2-fsa)') });
  return out;
}

/** Ссылки для скачивания вручную (в браузере): копия Kadro и оригинал. */
export function manualUrls(dirName: string, upstream: string): string[] {
  return [`${AI_MIRROR}/${dirName}.tar`, upstream];
}

async function downloadArchive(url: string, dirName: string, _sizeMb: number, ready: () => boolean,
  onProgress: (p: number, stage: 'download' | 'unpack') => void, signal?: AbortSignal): Promise<void> {
  if (ready()) return;
  await downloadModelArchive(await sourcesFor(dirName, url, signal), modelsDir(), dirName, ready, onProgress, signal);
}

/** Поставить модель из архива, скачанного вручную (.tar или .tar.bz2). */
export async function installFromArchive(file: string, dirName: string, ready: () => boolean, onProgress: (p: number) => void): Promise<void> {
  if (!fs.existsSync(file)) throw new Error(tx('Файл не найден'));
  try {
    await unpackArchive(file, modelsDir(), dirName, onProgress);
  } catch (e) {
    throw new Error(tx('Не получилось распаковать архив: {0}', e instanceof Error ? e.message : String(e)));
  }
  if (!ready()) {
    fs.rmSync(path.join(modelsDir(), dirName), { recursive: true, force: true });
    throw new Error(tx('Это не та модель: в архиве нет нужных файлов'));
  }
}

/** Скачивает и распаковывает модель распознавания. */
export async function downloadAsrModel(id: AsrModelId, onProgress: (p: number, stage: 'download' | 'unpack') => void, signal?: AbortSignal): Promise<void> {
  const m = ASR_MODELS[id];
  await downloadArchive(m.url, m.dir, m.sizeMb, () => asrModelReady(id), onProgress, signal);
}
export const asrManualUrls = (id: AsrModelId): string[] => manualUrls(ASR_MODELS[id].dir, ASR_MODELS[id].url);
export const installAsrFromFile = (id: AsrModelId, file: string, onProgress: (p: number) => void): Promise<void> =>
  installFromArchive(file, ASR_MODELS[id].dir, () => asrModelReady(id), onProgress);

// ---------- голоса для озвучки текста (Piper) ----------
export type TtsVoiceId = 'irina' | 'dmitri' | 'denis' | 'ruslan' | 'amy' | 'ryan';
export interface TtsVoice { id: TtsVoiceId; label: string; name: string; sizeMb: number }
export const TTS_VOICES: Record<TtsVoiceId, TtsVoice> = {
  irina: { id: 'irina', label: tx('Ирина — русский, женский'), name: 'ru_RU-irina-medium', sizeMb: 64 },
  dmitri: { id: 'dmitri', label: tx('Дмитрий — русский, мужской'), name: 'ru_RU-dmitri-medium', sizeMb: 64 },
  denis: { id: 'denis', label: tx('Денис — русский, мужской'), name: 'ru_RU-denis-medium', sizeMb: 64 },
  ruslan: { id: 'ruslan', label: tx('Руслан — русский, мужской'), name: 'ru_RU-ruslan-medium', sizeMb: 64 },
  amy: { id: 'amy', label: tx('Amy — английский, женский'), name: 'en_US-amy-low', sizeMb: 64 },
  ryan: { id: 'ryan', label: tx('Ryan — английский, мужской'), name: 'en_US-ryan-medium', sizeMb: 64 },
};
const TTS_GH = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models';
export function ttsVoiceDir(id: TtsVoiceId): string {
  return path.join(modelsDir(), `vits-piper-${TTS_VOICES[id].name}`);
}
export function ttsVoiceReady(id: TtsVoiceId): boolean {
  const d = ttsVoiceDir(id);
  return fs.existsSync(path.join(d, `${TTS_VOICES[id].name}.onnx`)) && fs.existsSync(path.join(d, 'tokens.txt')) && fs.existsSync(path.join(d, 'espeak-ng-data'));
}
export async function downloadTtsVoice(id: TtsVoiceId, onProgress: (p: number, stage: 'download' | 'unpack') => void, signal?: AbortSignal): Promise<void> {
  const v = TTS_VOICES[id];
  await downloadArchive(`${TTS_GH}/vits-piper-${v.name}.tar.bz2`, `vits-piper-${v.name}`, v.sizeMb, () => ttsVoiceReady(id), onProgress, signal);
}
export const ttsManualUrls = (id: TtsVoiceId): string[] => manualUrls(`vits-piper-${TTS_VOICES[id].name}`, `${TTS_GH}/vits-piper-${TTS_VOICES[id].name}.tar.bz2`);
export const installTtsFromFile = (id: TtsVoiceId, file: string, onProgress: (p: number) => void): Promise<void> =>
  installFromArchive(file, `vits-piper-${TTS_VOICES[id].name}`, () => ttsVoiceReady(id), onProgress);
