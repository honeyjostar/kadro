// Перспектива: 3D-наклон слоя (вперёд-назад и влево-вправо) и «Углы» — картинка натягивается на 4 точки.
// Одна математика для плеера (числа → WebGL) и экспорта (выражения → фильтр perspective FFmpeg).
import { placeOnCanvas } from './geometry';
import type { MediaClip } from './types';

/** Фокус «камеры» — во сколько раз дальше большей стороны кадра (как perspective в CSS). */
export const PERSP_FOCAL = 2;
export const TILT_MAX = 70;

export type Pt = [number, number];
export type Quad = [Pt, Pt, Pt, Pt]; // верхний левый, верхний правый, нижний левый, нижний правый

export interface Tilt { x: number; y: number } // градусы: x — наклон вперёд-назад, y — поворот влево-вправо

export function hasTilt(t: Tilt | undefined): t is Tilt {
  return !!t && (Math.abs(t.x) > 0.01 || Math.abs(t.y) > 0.01);
}
export function focal(W: number, H: number): number {
  return PERSP_FOCAL * Math.max(W, H);
}
const clampTilt = (v: number) => Math.max(-TILT_MAX, Math.min(TILT_MAX, v));

/**
 * Точка плоскости слоя (du, dv — пиксели от центра слоя, до поворота) после наклона и перспективы,
 * тоже от центра слоя. Наклон x > 0 — верх уходит от зрителя, y > 0 — правый край уходит от зрителя.
 */
export function tiltPoint(du: number, dv: number, t: Tilt, f: number): Pt {
  const ax = (clampTilt(t.x) * Math.PI) / 180;
  const ay = (clampTilt(t.y) * Math.PI) / 180;
  const y1 = dv * Math.cos(ax);
  const z1 = -dv * Math.sin(ax);
  const x2 = du * Math.cos(ay) - z1 * Math.sin(ay);
  const z2 = z1 * Math.cos(ay) + du * Math.sin(ay);
  const s = f / (f + z2);
  return [x2 * s, y1 * s];
}

const n = (v: number) => String(Math.round(v * 1e9) / 1e9);
/** То же для выражений FFmpeg: du, dv — выражения, наклон постоянный. */
export function tiltExpr(du: string, dv: string, t: Tilt, f: number): [string, string] {
  const ax = (clampTilt(t.x) * Math.PI) / 180;
  const ay = (clampTilt(t.y) * Math.PI) / 180;
  const ca = Math.cos(ax); const sa = Math.sin(ax); const cb = Math.cos(ay); const sb = Math.sin(ay);
  // x2 = du·cb + dv·sa·sb ; y1 = dv·ca ; z2 = −dv·sa·cb + du·sb
  const x2 = `(${du}*${n(cb)}+${dv}*${n(sa * sb)})`;
  const y1 = `(${dv}*${n(ca)})`;
  const z2 = `(${du}*${n(sb)}-${dv}*${n(sa * cb)})`;
  const s = `(${n(f)}/(${n(f)}+${z2}))`;
  return [`(${x2}*${s})`, `(${y1}*${s})`];
}

// ---------- проективное преобразование по 4 точкам ----------
/** Матрица 3×3 (по строкам), переводящая src[i] в dst[i]. */
export function homography(src: Quad, dst: Quad): number[] {
  // 8 уравнений: h = [a b c d e f g h], h33 = 1
  const A: number[][] = [];
  const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  const h = solve(A, B);
  return [...h, 1];
}
function solve(A: number[][], B: number[]): number[] {
  const N = B.length;
  const M = A.map((r, i) => [...r, B[i]]);
  for (let c = 0; c < N; c++) {
    let p = c;
    for (let r = c + 1; r < N; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < N; r++) {
      if (r === c) continue;
      const k = M[r][c] / d;
      if (k) for (let j = c; j <= N; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((r, i) => r[N] / (r[i] || 1e-12));
}
export function applyH(h: number[], x: number, y: number): Pt {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}
export function invertH(h: number[]): number[] {
  const [a, b, c, d, e, f, g, i, j] = h;
  const A = e * j - f * i; const B = -(d * j - f * g); const C = d * i - e * g;
  const det = a * A + b * B + c * C || 1e-12;
  return [A, -(b * j - c * i), b * f - c * e, B, a * j - c * g, -(a * f - c * d), C, -(a * i - b * g), a * e - b * d].map((v) => v / det);
}

// ---------- «Углы» ----------
/** Углы клипа в долях кадра: 8 чисел — верхний левый, верхний правый, нижний левый, нижний правый. */
export type Pin = [number, number, number, number, number, number, number, number];
export function pinQuad(pin: Pin, W: number, H: number): Quad {
  return [[pin[0] * W, pin[1] * H], [pin[2] * W, pin[3] * H], [pin[4] * W, pin[5] * H], [pin[6] * W, pin[7] * H]];
}
/** Где сейчас углы картинки (без перспективы) — чтобы «Углы» начинались с текущего положения. */
export function pinFromTransform(c: Pick<MediaClip, 'fit' | 'transform' | 'tilt'>, aw: number, ah: number, W: number, H: number): Pin {
  const pl = placeOnCanvas(W, H, aw, ah, c.fit, c.transform);
  const q = layerQuad(pl.w / 2, pl.h / 2, pl.cx, pl.cy, c.transform.rotation, c.tilt, W, H);
  return [q[0][0] / W, q[0][1] / H, q[1][0] / W, q[1][1] / H, q[2][0] / W, q[2][1] / H, q[3][0] / W, q[3][1] / H];
}

/** Углы прямоугольника слоя (полуширина hw, полувысота hh) с центром (cx, cy), поворотом и наклоном — пиксели кадра. */
export function layerQuad(hw: number, hh: number, cx: number, cy: number, rotationDeg: number, tilt: Tilt | undefined, W: number, H: number): Quad {
  const r = (rotationDeg * Math.PI) / 180;
  const f = focal(W, H);
  const pt = (du: number, dv: number): Pt => {
    const [px, py] = hasTilt(tilt) ? tiltPoint(du, dv, tilt, f) : [du, dv];
    return [cx + px * Math.cos(r) - py * Math.sin(r), cy + px * Math.sin(r) + py * Math.cos(r)];
  };
  return [pt(-hw, -hh), pt(hw, -hh), pt(-hw, hh), pt(hw, hh)];
}

/** Ширина и высота четырёхугольника (большие из противоположных сторон) — для чёткости слоя. */
export function quadSize(q: Quad): [number, number] {
  const d = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return [Math.max(d(q[0], q[1]), d(q[2], q[3]), 2), Math.max(d(q[0], q[2]), d(q[1], q[3]), 2)];
}

/** Нужна ли клипу перспектива (наклон или «Углы»). */
export function hasPerspective(c: Pick<MediaClip, 'tilt' | 'pin'>): boolean {
  return hasTilt(c.tilt) || !!c.pin;
}
