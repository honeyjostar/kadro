// Цветокоррекция. Одна и та же математика для превью (SVG-фильтр в Chromium, sRGB)
// и для экспорта (FFmpeg lutrgb + colorchannelmixer). Порядок шагов строго одинаковый:
// 1) яркость  2) контраст  3) насыщенность  4) теплота. После каждого шага — обрезка 0..1.
import type { ColorAdjust } from './types';

export interface FilterPreset { id: string; label: string; b: number; c: number; s: number; w: number }

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', label: 'Нет', b: 1, c: 1, s: 1, w: 0 },
  { id: 'vivid', label: 'Сочный', b: 1.02, c: 1.1, s: 1.35, w: 0 },
  { id: 'warm', label: 'Тёплый', b: 1.03, c: 1.02, s: 1.08, w: 0.45 },
  { id: 'cool', label: 'Холодный', b: 1, c: 1.05, s: 1, w: -0.45 },
  { id: 'bw', label: 'Ч/б', b: 1.02, c: 1.15, s: 0, w: 0 },
  { id: 'film', label: 'Плёнка', b: 1.05, c: 0.9, s: 0.85, w: 0.18 },
  { id: 'drama', label: 'Драма', b: 0.95, c: 1.35, s: 0.8, w: 0 },
  { id: 'fade', label: 'Выцветший', b: 1.08, c: 0.8, s: 0.9, w: 0.05 },
  { id: 'neon', label: 'Неон', b: 1, c: 1.2, s: 1.6, w: -0.2 },
  { id: 'gothic', label: 'Готика', b: 0.9, c: 1.3, s: 0.55, w: -0.15 },
  { id: 'sunset', label: 'Закат', b: 1.04, c: 1.05, s: 1.2, w: 0.6 },
  { id: 'mono', label: 'Мягкое ч/б', b: 1.06, c: 0.92, s: 0, w: 0.1 },
];

export interface EffectiveColor { b: number; c: number; s: number; w: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Итоговые параметры = ручные настройки × пресет (с силой presetAmount). */
export function effectiveColor(adj: ColorAdjust): EffectiveColor {
  const p = FILTER_PRESETS.find((x) => x.id === adj.preset) ?? FILTER_PRESETS[0];
  const k = Math.max(0, Math.min(1, adj.presetAmount ?? 1));
  return {
    b: adj.brightness * lerp(1, p.b, k),
    c: adj.contrast * lerp(1, p.c, k),
    s: adj.saturation * lerp(1, p.s, k),
    w: Math.max(-1, Math.min(1, adj.warmth + lerp(0, p.w, k))),
  };
}

export function isIdentity(e: EffectiveColor): boolean {
  const n = (x: number) => Math.abs(x) < 1e-4;
  return n(e.b - 1) && n(e.c - 1) && n(e.s - 1) && n(e.w);
}

/** Матрица насыщенности (как CSS saturate / feColorMatrix type=saturate). Строки R,G,B. */
export function saturateMatrix(s: number): number[][] {
  return [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
}

/** Теплота: множители каналов R и B. */
export function warmthGains(w: number): { r: number; g: number; b: number } {
  return { r: 1 + 0.14 * w, g: 1 + 0.03 * w, b: 1 - 0.16 * w };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Эталонная реализация на одном пикселе (0..255) — для тестов и сверки превью с экспортом. */
export function applyColorToPixel(rgb: [number, number, number], e: EffectiveColor): [number, number, number] {
  let [r, g, b] = rgb.map((v) => v / 255);
  // 1) яркость
  [r, g, b] = [r, g, b].map((v) => clamp01(v * e.b));
  // 2) контраст
  [r, g, b] = [r, g, b].map((v) => clamp01((v - 0.5) * e.c + 0.5));
  // 3) насыщенность
  const m = saturateMatrix(e.s);
  const r2 = clamp01(m[0][0] * r + m[0][1] * g + m[0][2] * b);
  const g2 = clamp01(m[1][0] * r + m[1][1] * g + m[1][2] * b);
  const b2 = clamp01(m[2][0] * r + m[2][1] * g + m[2][2] * b);
  // 4) теплота
  const wg = warmthGains(e.w);
  return [clamp01(r2 * wg.r), clamp01(g2 * wg.g), clamp01(b2 * wg.b)].map((v) => Math.round(v * 255)) as [number, number, number];
}

const f = (n: number) => Number(n.toFixed(6)).toString();

/** Цепочка фильтров FFmpeg (вход/выход — rgb24/rgba). Пустая строка, если коррекции нет. */
export function ffmpegColorFilter(e: EffectiveColor): string {
  if (isIdentity(e)) return '';
  const parts: string[] = [];
  // яркость + контраст за один проход lutrgb, с обрезкой после каждого шага (как в Chromium)
  if (Math.abs(e.b - 1) > 1e-4 || Math.abs(e.c - 1) > 1e-4) {
    const expr = `clip((clip(val*${f(e.b)}\\,0\\,255)/255-0.5)*${f(e.c)}+0.5\\,0\\,1)*255`;
    parts.push(`lutrgb=r='${expr}':g='${expr}':b='${expr}'`);
  }
  if (Math.abs(e.s - 1) > 1e-4) {
    const m = saturateMatrix(e.s);
    parts.push(`colorchannelmixer=rr=${f(m[0][0])}:rg=${f(m[0][1])}:rb=${f(m[0][2])}:gr=${f(m[1][0])}:gg=${f(m[1][1])}:gb=${f(m[1][2])}:br=${f(m[2][0])}:bg=${f(m[2][1])}:bb=${f(m[2][2])}`);
  }
  if (Math.abs(e.w) > 1e-4) {
    const g = warmthGains(e.w);
    parts.push(`colorchannelmixer=rr=${f(g.r)}:gg=${f(g.g)}:bb=${f(g.b)}`);
  }
  return parts.join(',');
}

/** Описание SVG-фильтра для превью (Chromium, color-interpolation-filters=sRGB). */
export function svgFilterMarkup(id: string, e: EffectiveColor): string {
  const m = saturateMatrix(e.s);
  const wg = warmthGains(e.w);
  const slope = e.c;
  const icpt = 0.5 - 0.5 * e.c;
  const sat = `${m[0][0]} ${m[0][1]} ${m[0][2]} 0 0  ${m[1][0]} ${m[1][1]} ${m[1][2]} 0 0  ${m[2][0]} ${m[2][1]} ${m[2][2]} 0 0  0 0 0 1 0`;
  return `<filter id="${id}" color-interpolation-filters="sRGB" x="0" y="0" width="1" height="1">` +
    `<feComponentTransfer><feFuncR type="linear" slope="${e.b}"/><feFuncG type="linear" slope="${e.b}"/><feFuncB type="linear" slope="${e.b}"/></feComponentTransfer>` +
    `<feComponentTransfer><feFuncR type="linear" slope="${slope}" intercept="${icpt}"/><feFuncG type="linear" slope="${slope}" intercept="${icpt}"/><feFuncB type="linear" slope="${slope}" intercept="${icpt}"/></feComponentTransfer>` +
    `<feColorMatrix type="matrix" values="${sat}"/>` +
    `<feComponentTransfer><feFuncR type="linear" slope="${wg.r}"/><feFuncG type="linear" slope="${wg.g}"/><feFuncB type="linear" slope="${wg.b}"/></feComponentTransfer>` +
    `</filter>`;
}
