// Где распознавать речь: на видеокарте (DirectML — NVIDIA, AMD, Intel, в Windows 10/11) или на процессоре.
// «Авто» при первом распознавании сравнивает обе на самой записи и запоминает, что быстрее, —
// для этой видеокарты (с её драйвером) и этой модели. Видеокарта выбирается, только если она заметно быстрее.
/** Модели распознавания (как в main/ai/models). */
export type AsrModelId = 'multi' | 'ru';

export type AsrDevicePref = 'auto' | 'gpu' | 'cpu';
export type AsrDevice = 'gpu' | 'cpu';

/** Замер: секунды на одну и ту же речь (speechSec) на видеокарте и на процессоре. */
export interface AsrBench { gpuSec: number; cpuSec: number; speechSec: number; at: number }

/** Видеокарта должна быть хотя бы на 15% быстрее — иначе процессор: он надёжнее и не занимает видеокарту. */
export const GPU_MIN_GAIN = 0.85;

/** Ключ замера: модель и видеокарты с драйверами — новый драйвер или другая видеокарта → сравнить заново. */
export const gpuKey = (gpus: { name: string; driver?: string }[]): string => gpus.map((g) => `${g.name}@${g.driver ?? ''}`).join(',');
export const asrBenchKey = (model: AsrModelId, gpus: { name: string; driver?: string }[]): string => `${model}|${gpuKey(gpus)}`;

/**
 * Что делать на этом распознавании:
 * gpu — видеокарта, cpu — процессор, bench — сначала сравнить (только «Авто», когда замера ещё нет).
 */
export function decideAsrDevice(pref: AsrDevicePref, ctx: { available: boolean; failed: boolean; bench?: AsrBench }): AsrDevice | 'bench' {
  if (pref === 'cpu' || !ctx.available) return 'cpu';
  if (pref === 'gpu') return 'gpu';
  if (ctx.failed) return 'cpu';
  if (!ctx.bench) return 'bench';
  return gpuWins(ctx.bench) ? 'gpu' : 'cpu';
}

export const gpuWins = (b: Pick<AsrBench, 'gpuSec' | 'cpuSec'>): boolean => b.gpuSec > 0 && b.gpuSec < b.cpuSec * GPU_MIN_GAIN;

/** Во сколько раз видеокарта быстрее (меньше 1 — медленнее), с одним знаком после запятой. */
export const gpuSpeedup = (b: Pick<AsrBench, 'gpuSec' | 'cpuSec'>): number => (b.gpuSec > 0 ? Math.round((b.cpuSec / b.gpuSec) * 10) / 10 : 0);

/** sherpa-onnx пишет это, когда DirectML не включился и распознавание пошло на процессоре (причина — на следующих строках). */
export const DML_FALLBACK = /Failed to enable DirectML|DirectML is for Windows only/i;

/** Состояние для окна настроек. */
export interface AsrDeviceInfo {
  pref: AsrDevicePref;
  /** можно ли вообще на видеокарте: Windows, сборка с DirectML на месте, видеокарта определилась */
  available: boolean;
  /** почему нельзя: не Windows, нет сборки, нет видеокарты */
  why?: 'os' | 'build' | 'gpu';
  gpu?: string;
  /** замеры для текущей видеокарты по моделям */
  bench: Partial<Record<AsrModelId, AsrBench>>;
  /** видеокарта не заработала (DirectML не включился или процесс упал) — «Авто» берёт процессор */
  failed?: string;
  /** на чём шло последнее распознавание и как быстро */
  last?: { device: AsrDevice; model: AsrModelId; speechSec: number; decodeSec: number };
}
