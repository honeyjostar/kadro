// Лёгкие копии для монтажа 2K и 4K: плеер играет уменьшенную копию (720p, H.264), а экспорт берёт оригинал —
// качество готового видео не страдает. «Авто» — только на компьютерах, которым большое видео тяжело.
import type { HwInfo } from './hw';

export type LightCopyPref = 'auto' | 'on' | 'off';

/** Сильный компьютер: 4K и 2K в плеере тянет сам (видеокарта от 8 ГБ и процессор от 12 потоков). */
export function strongPc(hw: Pick<HwInfo, 'threads' | 'gpus'> | null | undefined): boolean {
  if (!hw) return false;
  const gpu = hw.gpus.find((g) => g.vendor === 'nvidia' || g.vendor === 'amd');
  return !!gpu && (gpu.vramGb ?? 0) >= 8 && hw.threads >= 12;
}

/** Нужна ли лёгкая копия видео w×h с частотой fps. Видео до 1080p (до 60 к/с) плеер играет как есть. */
export function needsLightCopy(pref: LightCopyPref, w: number, h: number, fps: number, hw: Pick<HwInfo, 'threads' | 'gpus'> | null | undefined): boolean {
  const short = Math.min(w, h);
  if (pref === 'off' || (short <= 1080 && fps <= 61)) return false;
  if (pref === 'on') return true;
  return !strongPc(hw);
}
