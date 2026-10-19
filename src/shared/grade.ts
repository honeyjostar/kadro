// Тонкая цветокоррекция: кривые, HSL по цветам, свой LUT (.cube).
// Всё сводится в одну 3D-таблицу N×N×N: превью применяет её (WebGL или процессор), экспорт — фильтром haldclut.
// Интерполяция одинаковая — трилинейная, результат обрезается вниз до целого (как в FFmpeg).
import type { CurvePoint, Grade, HslBand } from './types';

export const GRADE_LEVEL = 6;                       // уровень Hald CLUT
export const GRADE_N = GRADE_LEVEL * GRADE_LEVEL;   // 36 точек по каждой оси

export const HSL_BANDS: { id: HslBand; label: string; hue: number; color: string }[] = [
  { id: 'red', label: 'Красный', hue: 0, color: '#ff4040' },
  { id: 'orange', label: 'Оранжевый', hue: 30, color: '#ff9a2e' },
  { id: 'yellow', label: 'Жёлтый', hue: 60, color: '#ffe23d' },
  { id: 'green', label: 'Зелёный', hue: 120, color: '#3fd45a' },
  { id: 'cyan', label: 'Голубой', hue: 180, color: '#3fd8e0' },
  { id: 'blue', label: 'Синий', hue: 240, color: '#3f6bff' },
  { id: 'purple', label: 'Фиолетовый', hue: 280, color: '#9a4dff' },
  { id: 'magenta', label: 'Пурпурный', hue: 320, color: '#ff4dc4' },
];

export const IDENTITY_CURVE: CurvePoint[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];

// ---------- .cube ----------
export interface CubeLut { kind: '3d' | '1d'; size: number; data: Float32Array; min: [number, number, number]; max: [number, number, number]; title?: string }

/** Разбор файла .cube (Adobe/Resolve): LUT_3D_SIZE или LUT_1D_SIZE, DOMAIN_MIN/MAX. */
export function parseCube(text: string): CubeLut {
  let size3 = 0;
  let size1 = 0;
  let title: string | undefined;
  let min: [number, number, number] = [0, 0, 0];
  let max: [number, number, number] = [1, 1, 1];
  const vals: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const up = line.toUpperCase();
    if (up.startsWith('TITLE')) { title = line.slice(5).trim().replace(/^"|"$/g, ''); continue; }
    if (up.startsWith('LUT_3D_SIZE')) { size3 = parseInt(line.split(/\s+/)[1], 10); continue; }
    if (up.startsWith('LUT_1D_SIZE')) { size1 = parseInt(line.split(/\s+/)[1], 10); continue; }
    if (up.startsWith('DOMAIN_MIN')) { min = line.split(/\s+/).slice(1, 4).map(Number) as [number, number, number]; continue; }
    if (up.startsWith('DOMAIN_MAX')) { max = line.split(/\s+/).slice(1, 4).map(Number) as [number, number, number]; continue; }
    if (/^[A-Z_]/.test(up)) continue; // прочие ключи (LUT_3D_INPUT_RANGE и т. п.)
    const p = line.split(/\s+/);
    if (p.length < 3) continue;
    vals.push(Number(p[0]), Number(p[1]), Number(p[2]));
  }
  const kind = size3 ? '3d' : size1 ? '1d' : null;
  if (!kind) throw new Error('Это не файл LUT: нет строки LUT_3D_SIZE');
  const size = size3 || size1;
  if (size < 2 || size > 256) throw new Error(`Неподдерживаемый размер таблицы: ${size}`);
  const need = (kind === '3d' ? size * size * size : size) * 3;
  if (vals.length < need) throw new Error(`В файле не хватает значений: ${vals.length / 3} из ${need / 3}`);
  if (vals.slice(0, need).some((v) => !Number.isFinite(v))) throw new Error('В файле есть нечисловые значения');
  return { kind, size, data: Float32Array.from(vals.slice(0, need)), min, max, title };
}

/** Значение LUT в точке (вход 0..1), трилинейно. */
function sampleCube(l: CubeLut, rgb: [number, number, number]): [number, number, number] {
  const n = l.size - 1;
  const u = rgb.map((v, i) => Math.min(1, Math.max(0, (v - l.min[i]) / (l.max[i] - l.min[i] || 1))) * n);
  if (l.kind === '1d') {
    return [0, 1, 2].map((ch) => {
      const a = Math.floor(u[ch]); const b = Math.min(n, a + 1); const d = u[ch] - a;
      return l.data[a * 3 + ch] * (1 - d) + l.data[b * 3 + ch] * d;
    }) as [number, number, number];
  }
  const S = l.size;
  const r0 = Math.floor(u[0]); const g0 = Math.floor(u[1]); const b0 = Math.floor(u[2]);
  const r1 = Math.min(n, r0 + 1); const g1 = Math.min(n, g0 + 1); const b1 = Math.min(n, b0 + 1);
  const dr = u[0] - r0; const dg = u[1] - g0; const db = u[2] - b0;
  const at = (r: number, g: number, b: number, ch: number) => l.data[((b * S + g) * S + r) * 3 + ch];
  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    const c00 = at(r0, g0, b0, ch) * (1 - dr) + at(r1, g0, b0, ch) * dr;
    const c10 = at(r0, g1, b0, ch) * (1 - dr) + at(r1, g1, b0, ch) * dr;
    const c01 = at(r0, g0, b1, ch) * (1 - dr) + at(r1, g0, b1, ch) * dr;
    const c11 = at(r0, g1, b1, ch) * (1 - dr) + at(r1, g1, b1, ch) * dr;
    out[ch] = (c00 * (1 - dg) + c10 * dg) * (1 - db) + (c01 * (1 - dg) + c11 * dg) * db;
  }
  return out;
}

// ---------- кривые ----------
/** Монотонный кубический сплайн (Фритч — Карлсон): кривая не «перехлёстывает» между точками. */
export function curveFn(points: CurvePoint[] | undefined): ((x: number) => number) | null {
  if (!points || points.length < 2) return null;
  const p = [...points].sort((a, b) => a.x - b.x);
  if (p.length === 2 && p[0].x === 0 && p[0].y === 0 && p[1].x === 1 && p[1].y === 1) return null;
  const n = p.length;
  const dx: number[] = []; const m: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx.push(Math.max(1e-6, p[i + 1].x - p[i].x)); m.push((p[i + 1].y - p[i].y) / dx[i]); }
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]) < 1e-12) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i]; const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  return (x: number) => {
    if (x <= p[0].x) return p[0].y;
    if (x >= p[n - 1].x) return p[n - 1].y;
    let i = 0;
    while (i < n - 2 && x > p[i + 1].x) i++;
    const h = dx[i]; const s = (x - p[i].x) / h;
    const s2 = s * s; const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * p[i].y + (s3 - 2 * s2 + s) * h * t[i] + (-2 * s3 + 3 * s2) * p[i + 1].y + (s3 - s2) * h * t[i + 1];
  };
}

// ---------- HSL ----------
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx - mn < 1e-9) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s <= 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const hh = h / 360;
  return [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)];
}
type Adj = { h: number; s: number; l: number };
/** Поправка для оттенка h: плавно между соседними опорными цветами. */
function hslAdjAt(hsl: Grade['hsl'], h: number): Adj {
  const B = HSL_BANDS;
  const get = (i: number): Adj => hsl?.[B[(i + B.length) % B.length].id] ?? { h: 0, s: 0, l: 0 };
  for (let i = 0; i < B.length; i++) {
    const a = B[i].hue;
    const b = i === B.length - 1 ? 360 : B[i + 1].hue;
    if (h >= a && h < b) {
      let t = (h - a) / (b - a);
      t = t * t * (3 - 2 * t);
      const x = get(i); const y = get(i + 1);
      return { h: x.h + (y.h - x.h) * t, s: x.s + (y.s - x.s) * t, l: x.l + (y.l - x.l) * t };
    }
  }
  return get(0);
}
function hslActive(hsl: Grade['hsl']): boolean {
  return !!hsl && Object.values(hsl).some((a) => a && (Math.abs(a.h) > 1e-4 || Math.abs(a.s) > 1e-4 || Math.abs(a.l) > 1e-4));
}

// ---------- сборка ----------
export function gradeActive(g: Grade | undefined, lutReady = true): boolean {
  if (!g) return false;
  const c = g.curves;
  const curves = !!c && [c.all, c.r, c.g, c.b].some((x) => curveFn(x));
  return curves || hslActive(g.hsl) || (!!g.lut && g.lut.amount > 0.001 && lutReady);
}

/** Точка: LUT (с силой) → кривые (общая, затем каналы) → HSL. Вход/выход 0..1. */
export function gradePixel(g: Grade, cube: CubeLut | null, rgb: [number, number, number]): [number, number, number] {
  let [r, gg, b] = rgb;
  if (cube && g.lut && g.lut.amount > 0.001) {
    const o = sampleCube(cube, [r, gg, b]);
    const k = Math.min(1, g.lut.amount);
    r += (o[0] - r) * k; gg += (o[1] - gg) * k; b += (o[2] - b) * k;
  }
  const c = g.curves;
  const fa = curveFn(c?.all); const fr = curveFn(c?.r); const fg = curveFn(c?.g); const fb = curveFn(c?.b);
  const cl = (v: number) => Math.min(1, Math.max(0, v));
  if (fa) { r = cl(fa(cl(r))); gg = cl(fa(cl(gg))); b = cl(fa(cl(b))); }
  if (fr) r = cl(fr(cl(r)));
  if (fg) gg = cl(fg(cl(gg)));
  if (fb) b = cl(fb(cl(b)));
  if (hslActive(g.hsl)) {
    const [h, s, l] = rgbToHsl(cl(r), cl(gg), cl(b));
    if (s > 1e-6) {
      const a = hslAdjAt(g.hsl, h);
      const h2 = (h + a.h * 30 + 360) % 360;
      const s2 = cl(s * (1 + a.s));
      const w = Math.min(1, s * 1.5); // серые точки почти не трогаем
      const l2 = cl(l + a.l * 0.5 * w * (a.l > 0 ? 1 - l : l));
      [r, gg, b] = hslToRgb(h2, s2, l2);
    }
  }
  return [cl(r), cl(gg), cl(b)];
}

/** Таблица N³ (RGB, байты), индекс (r + g·N + b·N²)·3 — так же, как раскладка Hald CLUT. */
export function gradeTable(g: Grade, cube: CubeLut | null, N = GRADE_N): Uint8Array {
  const out = new Uint8Array(N * N * N * 3);
  let i = 0;
  for (let b = 0; b < N; b++) {
    for (let gg = 0; gg < N; gg++) {
      for (let r = 0; r < N; r++) {
        const o = gradePixel(g, cube, [r / (N - 1), gg / (N - 1), b / (N - 1)]);
        out[i++] = Math.round(o[0] * 255); out[i++] = Math.round(o[1] * 255); out[i++] = Math.round(o[2] * 255);
      }
    }
  }
  return out;
}

/** Применение таблицы к пикселю 0..255 — как haldclut interp=trilinear в FFmpeg (с обрезкой вниз). */
export function applyTable(t: Uint8Array, N: number, r8: number, g8: number, b8: number): [number, number, number] {
  const n = N - 1;
  const sr = (r8 / 255) * n; const sg = (g8 / 255) * n; const sb = (b8 / 255) * n;
  const r0 = Math.floor(sr); const g0 = Math.floor(sg); const b0 = Math.floor(sb);
  const r1 = Math.min(n, r0 + 1); const g1 = Math.min(n, g0 + 1); const b1 = Math.min(n, b0 + 1);
  const dr = sr - r0; const dg = sg - g0; const db = sb - b0;
  const out: [number, number, number] = [0, 0, 0];
  const i000 = ((b0 * N + g0) * N + r0) * 3; const i100 = ((b0 * N + g0) * N + r1) * 3;
  const i010 = ((b0 * N + g1) * N + r0) * 3; const i110 = ((b0 * N + g1) * N + r1) * 3;
  const i001 = ((b1 * N + g0) * N + r0) * 3; const i101 = ((b1 * N + g0) * N + r1) * 3;
  const i011 = ((b1 * N + g1) * N + r0) * 3; const i111 = ((b1 * N + g1) * N + r1) * 3;
  for (let ch = 0; ch < 3; ch++) {
    const c00 = t[i000 + ch] + (t[i100 + ch] - t[i000 + ch]) * dr;
    const c10 = t[i010 + ch] + (t[i110 + ch] - t[i010 + ch]) * dr;
    const c01 = t[i001 + ch] + (t[i101 + ch] - t[i001 + ch]) * dr;
    const c11 = t[i011 + ch] + (t[i111 + ch] - t[i011 + ch]) * dr;
    const c0 = c00 + (c10 - c00) * dg;
    const c1 = c01 + (c11 - c01) * dg;
    out[ch] = Math.max(0, Math.min(255, Math.floor(c0 + (c1 - c0) * db - 1e-4)));
  }
  return out;
}

/** Картинка Hald CLUT (уровень L, сторона L³) из таблицы N = L². */
export function haldImage(t: Uint8Array, level = GRADE_LEVEL): { w: number; h: number; rgb: Uint8Array } {
  const side = level * level * level;
  return { w: side, h: side, rgb: t };
}
