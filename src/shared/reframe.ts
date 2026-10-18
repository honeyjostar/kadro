// Автокадрирование: из положения человека в кадре (по времени) — ключи сдвига, чтобы он оставался в центре.
import type { Keyframe } from './types';

export interface SubjectPoint { t: number; x: number; y: number; found: boolean }

/**
 * points — центр человека в долях кадра исходника по времени исходника.
 * Клип вписывается «заполнить» (cover) с масштабом scale; ключи — для transform.x / transform.y.
 */
export function reframeKeyframes(points: SubjectPoint[], aw: number, ah: number, W: number, H: number, scale = 1): { x: Keyframe[]; y: Keyframe[] } {
  if (!points.length) return { x: [], y: [] };
  // пропуски (человек не найден) — держим последнее известное положение
  let lastX = points.find((p) => p.found)?.x ?? 0.5;
  let lastY = points.find((p) => p.found)?.y ?? 0.5;
  const filled = points.map((p) => {
    if (p.found) { lastX = p.x; lastY = p.y; }
    return { t: p.t, x: lastX, y: lastY };
  });
  // сглаживание — без дёрганий камеры (окно ≈ 1 с)
  const R = 2;
  const sm = filled.map((p, i) => {
    let sx = 0; let sy = 0; let n = 0;
    for (let j = Math.max(0, i - R); j <= Math.min(filled.length - 1, i + R); j++) { sx += filled[j].x; sy += filled[j].y; n++; }
    return { t: p.t, x: sx / n, y: sy / n };
  });
  const base = Math.max(W / aw, H / ah) * scale;
  const w = aw * base;
  const h = ah * base;
  const limX = Math.max(0, (w - W) / (2 * W));
  const limY = Math.max(0, (h - H) / (2 * H));
  const clamp = (v: number, l: number) => Math.min(l, Math.max(-l, v));
  const raw = sm.map((p) => ({ t: p.t, x: clamp(-(p.x - 0.5) * w / W, limX), y: clamp(-(p.y - 0.5) * h / H, limY) }));
  // прореживаем: ключ раз в ~0.4 с и только если сдвиг заметен
  const thin = (prop: 'x' | 'y'): Keyframe[] => {
    const out: Keyframe[] = [];
    raw.forEach((p, i) => {
      const last = out[out.length - 1];
      const isEnd = i === 0 || i === raw.length - 1;
      if (isEnd || (p.t - (last?.t ?? -1) >= 0.39 && Math.abs(p[prop] - (last?.v ?? 0)) > 0.002)) {
        out.push({ t: Math.round(p.t * 1000) / 1000, v: Math.round(p[prop] * 10000) / 10000, ease: 'smooth' });
      }
    });
    return out;
  };
  return { x: limX > 0 ? thin('x') : [], y: limY > 0 ? thin('y') : [] };
}
