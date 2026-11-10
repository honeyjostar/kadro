// Видеостикер для Telegram: WebM (VP9) без звука, 512 px по длинной стороне, до 3 секунд, 30 кадров/с,
// не больше 256 КБ; фон может быть прозрачным (вырезанный человек, текст, стикеры). Файл загружается
// в бота @Stickers. Здесь — числа и аргументы FFmpeg, проверяются без окна.
import type { BuiltGraph } from './exportGraph';

export const TG_STICKER = { side: 512, maxSec: 3, fps: 30, maxBytes: 256 * 1024 } as const;
/** Битрейты попыток, кбит/с: не влезло в 256 КБ — следующая, пониже. */
export const TG_KBPS = [650, 450, 300, 190, 120];

const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);

/** Размер стикера: длинная сторона 512, короткая — по пропорциям кадра (чётная). */
export function stickerSize(w: number, h: number): { w: number; h: number } {
  const k = TG_STICKER.side / Math.max(w, h);
  return w >= h ? { w: TG_STICKER.side, h: Math.min(TG_STICKER.side, even(h * k)) } : { w: Math.min(TG_STICKER.side, even(w * k)), h: TG_STICKER.side };
}
/** Короткая сторона стикера — её экспорт принимает как «высоту» (как у видео). */
export const stickerShortSide = (w: number, h: number): number => { const s = stickerSize(w, h); return Math.min(s.w, s.h); };

/** Граф для стикера: звук графа уводится «в никуда» (в стикере его нет). */
export const stickerFilter = (g: BuiltGraph): string => `${g.filter};\n${g.aOut}anullsink`;

/** Аргументы FFmpeg: VP9, прозрачность по желанию, без звука, не длиннее 3 с, заданный битрейт. */
export function stickerArgs(g: BuiltGraph, filterFile: string, ffmpegMajor: number, out: string, kbps: number, alpha: boolean): string[] {
  const filterOpt = ffmpegMajor >= 7 ? ['-/filter_complex', filterFile] : ['-filter_complex_script', filterFile];
  const dur = Math.min(TG_STICKER.maxSec, g.duration);
  return ['-hide_banner', '-y', '-nostdin', ...g.inputs.flat(), ...filterOpt, '-map', g.vOut, '-an',
    '-c:v', 'libvpx-vp9', '-pix_fmt', alpha ? 'yuva420p' : 'yuv420p', '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.25)}k`, '-bufsize', `${kbps * 2}k`,
    '-crf', '32', '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-auto-alt-ref', '0', '-r', String(TG_STICKER.fps),
    '-t', dur.toFixed(3), '-progress', 'pipe:1', '-nostats', out];
}
