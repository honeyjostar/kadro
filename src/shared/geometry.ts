// Геометрия размещения клипа на холсте. Одна функция для превью и экспорта.
import type { Transform } from './types';

export interface Placement {
  w: number;   // ширина картинки на холсте, px
  h: number;
  x: number;   // левый верхний угол (до поворота), px
  y: number;
  cx: number;  // центр
  cy: number;
  rotation: number; // градусы
}

/** Размер исходника с учётом поворота из метаданных (телефонные видео). */
export function orientedSize(w: number, h: number, rotation: number): { w: number; h: number } {
  const r = ((rotation % 360) + 360) % 360;
  return r === 90 || r === 270 ? { w: h, h: w } : { w, h };
}

export function placeOnCanvas(
  canvasW: number, canvasH: number, srcW: number, srcH: number, fit: 'contain' | 'cover', t: Transform,
): Placement {
  const sw = Math.max(1, srcW);
  const sh = Math.max(1, srcH);
  const base = fit === 'cover' ? Math.max(canvasW / sw, canvasH / sh) : Math.min(canvasW / sw, canvasH / sh);
  const w = sw * base * t.scale;
  const h = sh * base * t.scale;
  const cx = canvasW / 2 + t.x * canvasW;
  const cy = canvasH / 2 + t.y * canvasH;
  return { w, h, x: cx - w / 2, y: cy - h / 2, cx, cy, rotation: t.rotation };
}

/** Чётное целое ≥ 2 (кодекам yuv420 нужны чётные размеры). */
export function even(n: number): number {
  return Math.max(2, 2 * Math.round(n / 2));
}

/** Размер экспорта по короткой стороне с сохранением пропорций проекта. */
export function exportSize(projectW: number, projectH: number, shortSide: number): { w: number; h: number } {
  const k = shortSide / Math.min(projectW, projectH);
  return { w: even(projectW * k), h: even(projectH * k) };
}

/** Сколько «пикселей 1080» в одном пикселе холста (для текста, обводок, размытия). */
export function unitScale(canvasW: number, canvasH: number): number {
  return Math.min(canvasW, canvasH) / 1080;
}

export const BLUR_SIGMA_1080 = 40; // сила размытия фона в «пикселях 1080»
