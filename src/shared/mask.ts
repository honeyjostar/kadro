// Маска клипа: прозрачность каждой точки рамки клипа. Чистая функция — по ней рисуется и маска в превью,
// и PNG-маска для экспорта, поэтому края совпадают пиксель в пиксель.
import type { Mask } from './types';

export const DEFAULT_MASK: Mask = { shape: 'circle', x: 0, y: 0, w: 0.6, h: 0.6, rotation: 0, feather: 0.05, invert: false };

const ramp = (d: number, F: number) => {
  if (F < 0.75) return Math.min(1, Math.max(0, d + 0.5)); // без растушёвки — сглаживание в 1 пиксель
  const p = Math.min(1, Math.max(0, (d + F / 2) / F));
  return p * p * (3 - 2 * p);
};

/** Непрозрачность маски (0..1) в точке (px, py) рамки размером bw × bh пикселей. */
export function maskAlpha(m: Mask, px: number, py: number, bw: number, bh: number): number {
  const cx = bw / 2 + m.x * bw;
  const cy = bh / 2 + m.y * bh;
  const r = (-m.rotation * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  const F = m.feather * Math.min(bw, bh);
  let d: number;
  switch (m.shape) {
    case 'linear': d = ly; break;                                   // ниже линии — видно
    case 'mirror': d = (Math.max(1, m.h * bh) / 2) - Math.abs(ly); break; // полоса вдоль линии
    case 'rect': d = Math.min(Math.max(0.5, m.w * bw / 2) - Math.abs(lx), Math.max(0.5, m.h * bh / 2) - Math.abs(ly)); break;
    default: {
      const rx = Math.max(0.5, (m.w * bw) / 2);
      const ry = Math.max(0.5, (m.h * bh) / 2);
      d = (1 - Math.hypot(lx / rx, ly / ry)) * Math.min(rx, ry);
    }
  }
  const a = ramp(d, F);
  return m.invert ? 1 - a : a;
}

/** Маска как массив байт 0..255 (по строкам), w × h. */
export function maskBytes(m: Mask, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[y * w + x] = Math.round(maskAlpha(m, x + 0.5, y + 0.5, w, h) * 255);
  }
  return out;
}
