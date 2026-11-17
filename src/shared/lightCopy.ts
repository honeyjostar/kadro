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

/**
 * Слабый компьютер (старый или офисный ноутбук): до 4 потоков, меньше 8 ГБ памяти или встроенная графика
 * при не больше 8 потоках. Для него Kadro сам включает «Режим для слабого ПК» и делает лёгкие копии чаще.
 */
export function weakPc(hw: (Pick<HwInfo, 'threads' | 'gpus'> & { ramGb?: number }) | null | undefined): boolean {
  if (!hw) return false;
  const discrete = hw.gpus.some((g) => g.vendor === 'nvidia' || g.vendor === 'amd');
  return hw.threads <= 4 || (!!hw.ramGb && hw.ramGb < 7.5) || (!discrete && hw.threads <= 8);
}

/** Кодеки, которые процессор слабого компьютера декодирует с трудом (телефоны снимают в HEVC). */
const HEAVY = ['hevc', 'h265', 'vp9', 'av1', 'prores', 'dnxhd'];

/**
 * Нужна ли лёгкая копия видео w×h с частотой fps. Видео до 1080p (до 60 к/с) плеер играет как есть —
 * кроме слабого компьютера: ему и 1080p в HEVC, 50–60 к/с или с большим битрейтом (больше 30 Мбит/с) тяжело.
 */
export function needsLightCopy(pref: LightCopyPref, w: number, h: number, fps: number, hw: (Pick<HwInfo, 'threads' | 'gpus'> & { ramGb?: number }) | null | undefined,
  src?: { codec?: string; mbps?: number }): boolean {
  const short = Math.min(w, h);
  if (pref === 'off') return false;
  if (short <= 1080 && fps <= 61) {
    if (short < 1000 || !weakPc(hw)) return false;
    return HEAVY.includes((src?.codec ?? '').toLowerCase()) || fps > 31 || (src?.mbps ?? 0) > 30;
  }
  if (pref === 'on') return true;
  return !strongPc(hw);
}
