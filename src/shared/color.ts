// Цветокоррекция. Одна и та же математика для превью (SVG-фильтр в Chromium, sRGB)
// и для экспорта (FFmpeg lutrgb + colorchannelmixer). Порядок шагов строго одинаковый:
// 1) яркость  2) контраст  3) насыщенность  4) теплота. После каждого шага — обрезка 0..1.
import type { ColorAdjust } from './types';

/** «Характер» фильтра — то, что не сводится к яркости/контрасту/насыщенности/теплоте.
 *  Считается цветовой таблицей вместе с кривыми и HSL (shared/grade.ts), поэтому превью = экспорт. */
export interface FilterLook {
  shadows?: [number, number, number];     // добавка к цвету в тенях (−0.1..0.1)
  highlights?: [number, number, number];  // добавка в светах
  fade?: number;                          // приподнять чёрное (0..0.15) — «выцветание»
  mono?: [number, number, number];        // тонировать ч/б в этот цвет (сепия, цианотипия…)
}
export type FilterCat = 'basic' | 'cinema' | 'portrait' | 'nature' | 'retro' | 'bw' | 'bright';
export const FILTER_CATS: { id: FilterCat; label: string }[] = [
  { id: 'basic', label: 'Основные' },
  { id: 'cinema', label: 'Кино' },
  { id: 'portrait', label: 'Портрет' },
  { id: 'nature', label: 'Природа' },
  { id: 'retro', label: 'Ретро' },
  { id: 'bw', label: 'Ч/б' },
  { id: 'bright', label: 'Яркие' },
];
export interface FilterPreset { id: string; label: string; b: number; c: number; s: number; w: number; cat?: FilterCat; look?: FilterLook }

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', label: 'Нет', b: 1, c: 1, s: 1, w: 0 },
  // основные
  { id: 'vivid', label: 'Сочный', b: 1.02, c: 1.1, s: 1.35, w: 0, cat: 'basic' },
  { id: 'warm', label: 'Тёплый', b: 1.03, c: 1.02, s: 1.08, w: 0.45, cat: 'basic' },
  { id: 'cool', label: 'Холодный', b: 1, c: 1.05, s: 1, w: -0.45, cat: 'basic' },
  { id: 'fade', label: 'Выцветший', b: 1.08, c: 0.8, s: 0.9, w: 0.05, cat: 'basic' },
  { id: 'drama', label: 'Драма', b: 0.95, c: 1.35, s: 0.8, w: 0, cat: 'basic' },
  { id: 'clean', label: 'Чистый', b: 1.04, c: 1.06, s: 1.08, w: 0.03, cat: 'basic', look: { highlights: [0.01, 0.01, 0.02] } },
  { id: 'matte', label: 'Матовый', b: 1.03, c: 0.9, s: 0.92, w: 0.05, cat: 'basic', look: { fade: 0.08 } },
  { id: 'sunset', label: 'Закат', b: 1.04, c: 1.05, s: 1.2, w: 0.6, cat: 'basic' },
  // кино
  { id: 'tealorange', label: 'Бирюза и оранж', b: 1, c: 1.12, s: 1.1, w: 0.05, cat: 'cinema', look: { shadows: [-0.05, 0.03, 0.09], highlights: [0.08, 0.03, -0.06] } },
  { id: 'cinema', label: 'Кинематограф', b: 0.98, c: 1.15, s: 0.9, w: 0.02, cat: 'cinema', look: { shadows: [-0.02, 0.01, 0.05], highlights: [0.05, 0.02, -0.02], fade: 0.03 } },
  { id: 'blockbuster', label: 'Блокбастер', b: 0.98, c: 1.25, s: 1.05, w: 0.08, cat: 'cinema', look: { shadows: [-0.06, 0.03, 0.1], highlights: [0.1, 0.04, -0.06] } },
  { id: 'moody', label: 'Мрачный', b: 0.92, c: 1.15, s: 0.7, w: -0.05, cat: 'cinema', look: { shadows: [0, 0.02, 0.05], fade: 0.03 } },
  { id: 'matrix', label: 'Матрица', b: 0.98, c: 1.12, s: 0.8, w: -0.1, cat: 'cinema', look: { shadows: [-0.03, 0.05, 0], highlights: [-0.02, 0.06, -0.03] } },
  { id: 'bleach', label: 'Без серебра', b: 1.02, c: 1.3, s: 0.45, w: 0, cat: 'cinema' },
  { id: 'gothic', label: 'Готика', b: 0.9, c: 1.3, s: 0.55, w: -0.15, cat: 'cinema' },
  { id: 'nightcity', label: 'Ночной город', b: 0.95, c: 1.15, s: 1.15, w: -0.25, cat: 'cinema', look: { shadows: [0.03, -0.01, 0.08], highlights: [0.05, 0.02, 0] } },
  // портрет
  { id: 'portrait', label: 'Портрет', b: 1.04, c: 0.95, s: 0.95, w: 0.15, cat: 'portrait', look: { highlights: [0.03, 0.01, 0], fade: 0.02 } },
  { id: 'soft', label: 'Нежный', b: 1.06, c: 0.88, s: 0.9, w: 0.08, cat: 'portrait', look: { fade: 0.05 } },
  { id: 'peach', label: 'Персик', b: 1.03, c: 0.98, s: 1.05, w: 0.3, cat: 'portrait', look: { highlights: [0.06, 0.03, 0], shadows: [0.02, 0, 0.02] } },
  { id: 'rose', label: 'Розовый', b: 1.03, c: 0.97, s: 0.95, w: 0.05, cat: 'portrait', look: { highlights: [0.05, 0, 0.03], shadows: [0.03, 0, 0.02] } },
  { id: 'skinglow', label: 'Сияние кожи', b: 1.08, c: 0.9, s: 1, w: 0.1, cat: 'portrait', look: { fade: 0.03, highlights: [0.02, 0.01, 0] } },
  { id: 'beige', label: 'Беж', b: 1.04, c: 0.92, s: 0.75, w: 0.25, cat: 'portrait', look: { fade: 0.04 } },
  // природа
  { id: 'golden', label: 'Золотой час', b: 1.05, c: 1.04, s: 1.15, w: 0.5, cat: 'nature', look: { highlights: [0.06, 0.04, 0] } },
  { id: 'forest', label: 'Лес', b: 1, c: 1.06, s: 1.15, w: -0.05, cat: 'nature', look: { shadows: [-0.02, 0.03, 0], highlights: [0, 0.03, 0] } },
  { id: 'ocean', label: 'Океан', b: 1.02, c: 1.05, s: 1.2, w: -0.35, cat: 'nature', look: { shadows: [-0.02, 0, 0.06] } },
  { id: 'autumn', label: 'Осень', b: 1.02, c: 1.05, s: 1.1, w: 0.35, cat: 'nature', look: { highlights: [0.05, 0.02, -0.04] } },
  { id: 'winter', label: 'Зима', b: 1.06, c: 0.98, s: 0.8, w: -0.4, cat: 'nature', look: { fade: 0.03 } },
  { id: 'spring', label: 'Весна', b: 1.05, c: 1.02, s: 1.2, w: 0.05, cat: 'nature', look: { highlights: [0.02, 0.04, 0.02] } },
  { id: 'desert', label: 'Пустыня', b: 1.04, c: 1.08, s: 0.9, w: 0.55, cat: 'nature', look: { fade: 0.03, highlights: [0.04, 0.02, -0.03] } },
  // ретро
  { id: 'film', label: 'Плёнка', b: 1.05, c: 0.9, s: 0.85, w: 0.18, cat: 'retro' },
  { id: 'kodak', label: 'Кодак', b: 1.02, c: 1.08, s: 1.1, w: 0.2, cat: 'retro', look: { fade: 0.04, shadows: [0.02, 0, -0.02] } },
  { id: 'polaroid', label: 'Полароид', b: 1.04, c: 0.85, s: 0.85, w: 0.1, cat: 'retro', look: { fade: 0.08, highlights: [0.02, 0.02, -0.03], shadows: [0, 0.02, 0.04] } },
  { id: 'seventies', label: '70-е', b: 1.03, c: 0.95, s: 0.8, w: 0.35, cat: 'retro', look: { fade: 0.06, highlights: [0.06, 0.03, -0.04] } },
  { id: 'eighties', label: '80-е', b: 1, c: 1.1, s: 1.3, w: 0, cat: 'retro', look: { shadows: [0.04, -0.02, 0.08], highlights: [0.04, 0.02, -0.02] } },
  { id: 'lomo', label: 'Ломо', b: 1, c: 1.3, s: 1.25, w: 0.05, cat: 'retro', look: { shadows: [-0.02, 0, 0.05] } },
  { id: 'sepia', label: 'Сепия', b: 1.02, c: 1.02, s: 1, w: 0, cat: 'retro', look: { mono: [1, 0.82, 0.6] } },
  // ч/б
  { id: 'bw', label: 'Ч/б', b: 1.02, c: 1.15, s: 0, w: 0, cat: 'bw' },
  { id: 'mono', label: 'Мягкое ч/б', b: 1.06, c: 0.92, s: 0, w: 0.1, cat: 'bw' },
  { id: 'hardbw', label: 'Жёсткое ч/б', b: 1, c: 1.5, s: 0, w: 0, cat: 'bw' },
  { id: 'silver', label: 'Серебро', b: 1.08, c: 0.9, s: 0, w: 0, cat: 'bw', look: { fade: 0.05, highlights: [0, 0.01, 0.03] } },
  { id: 'selenium', label: 'Селен', b: 1.02, c: 1.1, s: 1, w: 0, cat: 'bw', look: { mono: [0.92, 0.86, 1] } },
  { id: 'cyanotype', label: 'Цианотипия', b: 1.02, c: 1.05, s: 1, w: 0, cat: 'bw', look: { mono: [0.55, 0.78, 1] } },
  // яркие
  { id: 'neon', label: 'Неон', b: 1, c: 1.2, s: 1.6, w: -0.2, cat: 'bright' },
  { id: 'pop', label: 'Поп', b: 1.02, c: 1.15, s: 1.6, w: 0, cat: 'bright' },
  { id: 'candy', label: 'Конфета', b: 1.05, c: 1.02, s: 1.3, w: 0, cat: 'bright', look: { highlights: [0.05, 0, 0.05] } },
  { id: 'tropical', label: 'Тропики', b: 1.03, c: 1.08, s: 1.4, w: 0.15, cat: 'bright', look: { shadows: [-0.03, 0.04, 0.02] } },
  { id: 'electric', label: 'Электро', b: 1, c: 1.12, s: 1.4, w: -0.3, cat: 'bright', look: { shadows: [0.04, -0.02, 0.08] } },
];

/** «Характер» пресета клипа с учётом силы: null — нет. */
export function filterLook(adj: ColorAdjust | undefined): { look: FilterLook; k: number; id: string } | null {
  if (!adj || adj.preset === 'none') return null;
  const p = FILTER_PRESETS.find((x) => x.id === adj.preset);
  const k = Math.max(0, Math.min(1, adj.presetAmount ?? 1));
  if (!p?.look || k < 0.001) return null;
  return { look: p.look, k, id: p.id };
}
/** Применение «характера» к точке (0..1). */
export function lookFilterPixel(look: FilterLook, k: number, rgb: [number, number, number]): [number, number, number] {
  const c01 = (v: number) => Math.min(1, Math.max(0, v));
  let [r, g, b] = rgb;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (look.mono) {
    const m = look.mono;
    const t = (ch: number) => (y < 0.5 ? m[ch] * 2 * y : m[ch] + (1 - m[ch]) * (2 * y - 1));
    [r, g, b] = [t(0), t(1), t(2)];
  }
  if (look.shadows || look.highlights) {
    const ws = (1 - y) * (1 - y);
    const wh = y * y;
    const s = look.shadows ?? [0, 0, 0];
    const h = look.highlights ?? [0, 0, 0];
    r += s[0] * ws + h[0] * wh; g += s[1] * ws + h[1] * wh; b += s[2] * ws + h[2] * wh;
  }
  if (look.fade) { const f0 = look.fade; r = f0 + c01(r) * (1 - f0); g = f0 + c01(g) * (1 - f0); b = f0 + c01(b) * (1 - f0); }
  const o: [number, number, number] = [c01(r), c01(g), c01(b)];
  return [rgb[0] + (o[0] - rgb[0]) * k, rgb[1] + (o[1] - rgb[1]) * k, rgb[2] + (o[2] - rgb[2]) * k];
}

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
