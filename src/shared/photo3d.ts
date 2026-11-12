// 3D-фото: обычное фото оживает с объёмом. По карте глубины ближнее двигается сильнее дальнего:
// «Наезд» — ближнее приближается, «Облёт» — камера ходит по кругу, «Проплыть» — камера плывёт слева направо.
// Сдвиг каждой точки считается одной функцией и в превью, и в экспорте (там — карты сдвига для фильтра displace).

export type Photo3dMotion = 'dolly' | 'orbit' | 'swing';
export interface Photo3d { depth: string; rel?: string; w: number; h: number; motion: Photo3dMotion; amount: number }

/** Рабочий размер (карта глубины, сдвиг в экспорте): длинная сторона до 1280, чётные стороны. */
export function photo3dWork(w: number, h: number, long = 1280): { w: number; h: number } {
  const k = Math.min(1, long / Math.max(w, h));
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  return { w: even(w * k), h: even(h * k) };
}

/** Ответ модели (больше — ближе) → 0..255 по 2-му и 98-му процентилю (выбросы не съедают диапазон). */
export function normalizeDepth(d: Float32Array): Uint8Array {
  const step = Math.max(1, Math.floor(d.length / 20000));
  const s: number[] = [];
  for (let i = 0; i < d.length; i += step) s.push(d[i]);
  s.sort((a, b) => a - b);
  const lo = s[Math.floor(s.length * 0.02)], hi = s[Math.min(s.length - 1, Math.floor(s.length * 0.98))];
  const k = hi - lo > 1e-9 ? 255 / (hi - lo) : 0;
  const out = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) out[i] = Math.max(0, Math.min(255, Math.round((d[i] - lo) * k)));
  return out;
}

const ease = (u: number) => { const x = Math.min(1, Math.max(0, u)); return x * x * (3 - 2 * x); };

/** Камера в момент u (0..1 клипа): z — приближение ближнего, e — общий наезд (прячет края), px/py — параллакс (доли кадра). */
export function motionAt(m: Photo3dMotion, amount: number, u: number): { z: number; e: number; px: number; py: number } {
  const a = Math.min(1, Math.max(0, amount));
  if (m === 'dolly') { const k = ease(u); return { z: 0.14 * a * k, e: 0.04 * a * k, px: 0, py: 0 }; }
  if (m === 'orbit') { const t = 2 * Math.PI * u; return { z: 0, e: 0.05 * a, px: 0.045 * a * Math.sin(t), py: 0.02 * a * Math.cos(t) }; }
  return { z: 0, e: 0.05 * a, px: 0.05 * a * (2 * ease(u) - 1), py: 0 };
}

/** Наибольший сдвиг в экспорте (фильтр displace: значение карты 0..255 — сдвиг −128..127 точек). */
export const MAX_SHIFT = 127;

/**
 * Карты сдвига: точка (x, y) берётся из (x + sx, y + sy). Карты — 128 + сдвиг в точках W × H.
 * depth — 0..255 того же размера. cap — предел сдвига в точках этого размера.
 */
export function displaceMaps(depth: Uint8Array, W: number, H: number, cam: { z: number; e: number; px: number; py: number },
  outX: Uint8Array | Int16Array, outY: Uint8Array | Int16Array, cap = MAX_SHIFT, bias = 128): void {
  const cx = W / 2, cy = H / 2;
  const s = 1 / (1 + cam.e);
  const PX = cam.px * W, PY = cam.py * H;
  for (let y = 0; y < H; y++) {
    const dyc = y + 0.5 - cy;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = depth[i] / 255;
      const k = s / (1 + cam.z * d);
      const sx = (x + 0.5 - cx) * (k - 1) + PX * (d - 0.5);
      const sy = dyc * (k - 1) + PY * (d - 0.5);
      outX[i] = bias + Math.max(-cap, Math.min(cap, Math.round(sx)));
      outY[i] = bias + Math.max(-cap, Math.min(cap, Math.round(sy)));
    }
  }
}

/** Сдвинуть картинку RGBA (src → dst) по глубине: то же, что displace с краем «smear». */
export function displaceRgba(src: Uint8ClampedArray, dst: Uint8ClampedArray, depth: Uint8Array, W: number, H: number, cam: { z: number; e: number; px: number; py: number }, cap: number): void {
  const cx = W / 2, cy = H / 2;
  const s = 1 / (1 + cam.e);
  const PX = cam.px * W, PY = cam.py * H;
  for (let y = 0; y < H; y++) {
    const dyc = y + 0.5 - cy;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = depth[i] / 255;
      const k = s / (1 + cam.z * d);
      const sx = Math.max(-cap, Math.min(cap, (x + 0.5 - cx) * (k - 1) + PX * (d - 0.5)));
      const sy = Math.max(-cap, Math.min(cap, dyc * (k - 1) + PY * (d - 0.5)));
      const xs = Math.min(W - 1, Math.max(0, Math.round(x + sx))), ys = Math.min(H - 1, Math.max(0, Math.round(y + sy)));
      const j = (ys * W + xs) * 4, o = i * 4;
      dst[o] = src[j]; dst[o + 1] = src[j + 1]; dst[o + 2] = src[j + 2]; dst[o + 3] = src[j + 3];
    }
  }
}

export const PHOTO3D_MOTIONS: Photo3dMotion[] = ['dolly', 'orbit', 'swing'];
