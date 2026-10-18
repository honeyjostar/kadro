// Видеоэффекты клипа. Здесь — математика, общая для превью (canvas) и экспорта (FFmpeg):
// параметры в долях размера слоя, а всё, что меняется во времени, считается от номера кадра или времени клипа.
import type { Effect, EffectType } from './types';

export const EFFECTS: { type: EffectType; label: string; hint: string }[] = [
  { type: 'shake', label: 'Тряска', hint: 'Камера дрожит' },
  { type: 'pulse', label: 'Пульс', hint: 'Ритмичный «удар» масштабом' },
  { type: 'flash', label: 'Вспышка', hint: 'Белая вспышка в начале клипа' },
  { type: 'glitch', label: 'Глитч', hint: 'Цифровые сбои цвета' },
  { type: 'rgbsplit', label: 'RGB-сдвиг', hint: 'Каналы цвета разъезжаются' },
  { type: 'vhs', label: 'VHS', hint: 'Старая видеокассета' },
  { type: 'grain', label: 'Зерно', hint: 'Плёночный шум' },
  { type: 'vignette', label: 'Виньетка', hint: 'Затемнение краёв' },
  { type: 'blur', label: 'Размытие', hint: 'Мягкий фокус' },
  { type: 'pixelate', label: 'Пиксели', hint: 'Мозаика' },
  { type: 'mirror', label: 'Зеркало', hint: 'Левая половина отражается вправо' },
  { type: 'invert', label: 'Негатив', hint: 'Обращение цветов' },
  { type: 'rainbow', label: 'Радуга', hint: 'Цвета переливаются по кругу' },
];

/** Порядок применения эффектов — одинаковый в превью и экспорте. */
export const EFFECT_ORDER: EffectType[] = ['mirror', 'pixelate', 'blur', 'invert', 'rainbow', 'vhs', 'rgbsplit', 'glitch', 'vignette', 'grain', 'flash'];

export function sortedEffects(list: Effect[] | undefined): Effect[] {
  return (list ?? []).filter((e) => e.amount > 0.001 && EFFECT_ORDER.includes(e.type))
    .sort((a, b) => EFFECT_ORDER.indexOf(a.type) - EFFECT_ORDER.indexOf(b.type));
}
export function effectOf(list: Effect[] | undefined, type: EffectType): Effect | undefined {
  return list?.find((e) => e.type === type && e.amount > 0.001);
}

/** Детерминированный «случай» для номера кадра (одинаков в JS и в выражениях FFmpeg). */
export function hash01(n: number): number {
  const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// ---------- геометрия: тряска и пульс ----------
const TAU = Math.PI * 2;
export interface FxGeometry { dx: number; dy: number; drot: number; scale: number }

export function fxGeometry(list: Effect[] | undefined, local: number): FxGeometry {
  const g: FxGeometry = { dx: 0, dy: 0, drot: 0, scale: 1 };
  const sh = effectOf(list, 'shake');
  if (sh) {
    const a = sh.amount;
    g.dx = 0.02 * a * (0.6 * Math.sin(TAU * 7.3 * local + 1.1) + 0.4 * Math.sin(TAU * 13.1 * local + 0.3));
    g.dy = 0.02 * a * (0.6 * Math.sin(TAU * 6.1 * local + 2.3) + 0.4 * Math.sin(TAU * 11.7 * local + 0.7));
    g.drot = 1.5 * a * Math.sin(TAU * 5.7 * local + 2.0);
    g.scale *= 1 + 0.05 * a; // чуть крупнее — края не открываются
  }
  const pu = effectOf(list, 'pulse');
  if (pu) g.scale *= 1 + 0.1 * pu.amount * Math.exp(-((local % 0.5) / 0.08));
  return g;
}
export function fxMaxScale(list: Effect[] | undefined): number {
  let s = 1;
  const sh = effectOf(list, 'shake');
  if (sh) s *= 1 + 0.05 * sh.amount;
  const pu = effectOf(list, 'pulse');
  if (pu) s *= 1 + 0.1 * pu.amount;
  return s;
}
export function fxMoves(list: Effect[] | undefined): boolean {
  return !!effectOf(list, 'shake') || !!effectOf(list, 'pulse');
}

/** То же для выражений FFmpeg: tv — время от начала клипа. */
export function fxGeometryExpr(list: Effect[] | undefined, tv: string): { dx: string; dy: string; drot: string; scale: string } {
  const f = (n: number) => String(Math.round(n * 1e6) / 1e6);
  const out = { dx: '0', dy: '0', drot: '0', scale: '1' };
  const sh = effectOf(list, 'shake');
  if (sh) {
    const a = sh.amount;
    out.dx = `(${f(0.02 * a)}*(0.6*sin(${f(TAU * 7.3)}*${tv}+1.1)+0.4*sin(${f(TAU * 13.1)}*${tv}+0.3)))`;
    out.dy = `(${f(0.02 * a)}*(0.6*sin(${f(TAU * 6.1)}*${tv}+2.3)+0.4*sin(${f(TAU * 11.7)}*${tv}+0.7)))`;
    out.drot = `(${f(1.5 * a)}*sin(${f(TAU * 5.7)}*${tv}+2.0))`;
    out.scale = f(1 + 0.05 * a);
  }
  const pu = effectOf(list, 'pulse');
  if (pu) out.scale = `(${out.scale}*(1+${f(0.1 * pu.amount)}*exp(-(mod(${tv}\\,0.5)/0.08))))`;
  return out;
}

// ---------- параметры по кадрам ----------
/** RGB-сдвиг (пиксели слоя шириной w) для эффектов rgbsplit / glitch в кадре n. */
export function rgbShiftAt(list: Effect[] | undefined, w: number, n: number): { rh: number; bh: number; gv: number } {
  let rh = 0; let bh = 0; let gv = 0;
  const rs = effectOf(list, 'rgbsplit');
  if (rs) { const d = Math.max(1, Math.round(w * 0.02 * rs.amount)); rh -= d; bh += d; }
  const gl = effectOf(list, 'glitch');
  if (gl) {
    const base = Math.max(1, Math.round(w * 0.006 * gl.amount));
    const spike = hash01(n) > 0.72;
    const k = spike ? 2 + Math.round(hash01(n + 0.37) * 4) : 1;
    const dir = hash01(n + 0.71) > 0.5 ? 1 : -1;
    rh -= dir * base * k; bh += dir * base * k;
    if (spike) gv = Math.round((hash01(n + 0.13) - 0.5) * w * 0.02 * gl.amount);
  }
  return { rh, bh, gv };
}

/** Матрица поворота оттенка (как feColorMatrix hueRotate). */
export function hueMatrix(deg: number): number[][] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
    [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283],
    [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
  ];
}
/** Угол радуги в момент local (градусы). */
export function rainbowAngle(e: Effect, local: number): number {
  return (local * 360 * (0.2 + 0.8 * e.amount)) % 360;
}

/** Виньетка: множитель яркости 0..255 для каждой точки слоя (формула как у фильтра vignette FFmpeg). */
export function vignetteBytes(w: number, h: number, amount: number): Uint8Array {
  const angle = (amount * Math.PI) / 2;
  const out = new Uint8Array(w * h);
  const dmax = Math.hypot(w / 2, h / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) / dmax;
      const c = Math.cos(angle * Math.min(1, d));
      out[y * w + x] = Math.round(c * c * c * c * 255);
    }
  }
  return out;
}

export function pixelBlock(w: number, amount: number): number {
  return Math.max(2, Math.round(w * (0.006 + 0.044 * amount)));
}
export function blurSigma(w: number, amount: number): number {
  return w * 0.015 * amount;
}
export function scanlineStep(h: number): number {
  return Math.max(2, Math.round(h / 240));
}
export function flashDuration(amount: number): number {
  return 0.15 + 0.35 * amount;
}
