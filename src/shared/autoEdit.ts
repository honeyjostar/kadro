// Авто-ролик: из видео, фото и музыки — готовый монтаж, который дальше можно править как обычно.
// Склейки — на долях музыки. Из видео берутся лучшие куски: резкие, хорошо освещённые, с умеренным движением
// и без склеек внутри. Стиль задаёт длину кадров, переходы, цвет, эффекты и надпись.
import { tx } from './i18n';
import { ASPECTS, DEFAULT_COLOR, DEFAULT_TRANSFORM, TEXT_PRESETS, newMediaClip, newTextClip, newTrack } from './defaults';
import { layoutMain, mainTrack } from './timeline';
import type {
  AspectKey, ClipAnim, ColorAdjust, Effect, MediaAsset, MediaClip, Project, TextAnim, TextClip, TextStyle, Transition, TransitionType,
} from './types';

// ---------- разбор видео ----------
/** Размер кадра для разбора (серый, маленький — хватает, чтобы оценить резкость, свет и движение). */
export const HL_W = 80;
export const HL_H = 45;

/**
 * b — средняя яркость 0..255, s — резкость (средний модуль лапласиана), m — движение (средняя разница с прошлым кадром),
 * c — контраст, g — «отпечаток» кадра: средняя яркость в клетках 4×4 (чтобы не брать два одинаковых куска).
 */
export interface FrameStat { b: number; s: number; m: number; c: number; g?: number[] }
/**
 * Оценка видео по времени: score[i] — насколько хорош момент i·step (0..1); cuts — где внутри видео склейки;
 * sig — отпечатки кадров подряд по 16 чисел (может не быть у старых разборов).
 */
export interface Highlights { step: number; score: number[]; cuts: number[]; sig?: number[] }
export const SIG_N = 16;

export function frameStat(g: ArrayLike<number>, prev: ArrayLike<number> | null, w = HL_W, h = HL_H): FrameStat {
  const n = w * h;
  let sum = 0; let sum2 = 0; let diff = 0; let lap = 0;
  const cell = new Array<number>(SIG_N).fill(0);
  const cnt = new Array<number>(SIG_N).fill(0);
  for (let i = 0; i < n; i++) {
    const v = g[i];
    sum += v; sum2 += v * v;
    if (prev) diff += Math.abs(v - prev[i]);
    const k = Math.min(3, Math.floor(((i / w) | 0) * 4 / h)) * 4 + Math.min(3, Math.floor(((i % w) * 4) / w));
    cell[k] += v; cnt[k]++;
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      lap += Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]);
    }
  }
  const mean = sum / n;
  return { b: mean, s: lap / ((w - 2) * (h - 2)), m: prev ? diff / n : 0, c: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), g: cell.map((x, k) => Math.round(x / Math.max(1, cnt[k]))) };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * q)))];
}
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Оценки кадров → оценка моментов и склейки внутри видео. step — секунд между кадрами разбора. */
export function scoreFrames(st: FrameStat[], step: number): Highlights {
  const n = st.length;
  if (!n) return { step, score: [], cuts: [] };
  const sharpRef = Math.max(1, quantile(st.map((x) => x.s), 0.9));
  const toQuarter = Math.min(1, 0.25 / step); // движение «за четверть секунды», чтобы не зависеть от частоты разбора
  const cuts: number[] = [];
  const raw = st.map((f, i) => {
    // склейка: кадр резко не похож на прошлый, и это не просто быстрое движение (соседи спокойнее)
    if (i > 0) {
      const around: number[] = [];
      for (let k = i - 3; k <= i + 3; k++) if (k > 0 && k < n && k !== i) around.push(st[k].m);
      const med = quantile(around, 0.5);
      if (f.m > 30 && f.m > 2.5 * Math.max(med, 4)) cuts.push(r3((i - 0.5) * step));
    }
    const sharp = clamp(f.s / sharpRef, 0, 1);
    const expo = f.b < 60 ? clamp((f.b - 12) / 48, 0, 1) : f.b > 195 ? clamp((245 - f.b) / 50, 0, 1) : 1;
    const contrast = clamp(f.c / 45, 0, 1);
    const mq = f.m * toQuarter;
    const motion = i === 0 ? 0.8 : mq < 1.5 ? 0.55 + 0.3 * (mq / 1.5) : mq <= 14 ? 1 : clamp(1 - (mq - 14) / 22, 0, 1);
    // тряска: движение то сильное, то слабое от кадра к кадру при заметном движении в целом (рука дрожит, камера мотается)
    let shake = 0;
    if (i > 1 && i < n - 2) {
      let jit = 0; let mm = 0;
      for (let k = i - 1; k <= i + 2; k++) { jit += Math.abs(st[k].m - st[k - 1].m); mm += st[k].m; }
      mm /= 4; jit /= 4;
      const mq4 = mm * toQuarter;
      if (mq4 > 5) shake = clamp((jit / Math.max(1, mm) - 0.45) / 0.5, 0, 1) * clamp((mq4 - 5) / 10, 0, 1);
    }
    return 0.35 * sharp + 0.25 * expo + 0.15 * contrast + 0.25 * motion - 0.18 * shake;
  });
  const score = raw.map((v, i) => r3(Math.max(0, (raw[Math.max(0, i - 1)] + 2 * v + raw[Math.min(n - 1, i + 1)]) / 4)));
  const sig = st.every((f) => f.g?.length === SIG_N) ? st.flatMap((f) => f.g!) : undefined;
  return { step, score, cuts, ...(sig ? { sig } : {}) };
}

/** Насколько похожи два куска видео (по отпечаткам кадров): 0 — разные, 1 — одно и то же. */
export function windowSig(hl: Highlights, s: number, len: number): number[] | null {
  if (!hl.sig || hl.sig.length < SIG_N) return null;
  const frames = hl.sig.length / SIG_N;
  const a = clamp(Math.round(s / hl.step), 0, frames - 1);
  const b = clamp(Math.round((s + len) / hl.step), a + 1, frames);
  const out = new Array<number>(SIG_N).fill(0);
  for (let f = a; f < b; f++) for (let k = 0; k < SIG_N; k++) out[k] += hl.sig[f * SIG_N + k];
  return out.map((x) => x / (b - a));
}
export function sigSimilarity(x: number[] | null, y: number[] | null): number {
  if (!x || !y) return 0;
  let d = 0;
  for (let k = 0; k < SIG_N; k++) d += Math.abs(x[k] - y[k]);
  return clamp((18 - d / SIG_N) / 12, 0, 1);
}

/** Средняя оценка лучших 30% моментов (насколько видео в целом «удачное»). */
export function topScore(hl: Highlights | null | undefined): number {
  if (!hl?.score.length) return 0.5;
  const s = [...hl.score].sort((a, b) => b - a);
  const k = Math.max(1, Math.round(s.length * 0.3));
  return s.slice(0, k).reduce((a, b) => a + b, 0) / k;
}

/** Оценка куска: средняя, но один провал (темнота, смаз, рывок камеры) тянет вниз — такой кусок хуже ровного. */
function windowValue(sc: number[], pre: number[], a: number, b: number): number {
  const mean = (pre[b] - pre[a]) / (b - a);
  let mn = Infinity;
  for (let i = a; i < b; i++) if (sc[i] < mn) mn = sc[i];
  return 0.75 * mean + 0.25 * (Number.isFinite(mn) ? mn : mean);
}

/** Лучшее окно длиной len внутри [lo, hi]: начало и оценка (средняя, со штрафом за склейку внутри окна). */
export function scanWindow(hl: Highlights | null | undefined, len: number, lo: number, hi: number, noise?: () => number): { start: number; value: number } {
  if (hi - lo <= len + 1e-6) return { start: Math.max(0, lo), value: 0 };
  const span = hi - len - lo;
  if (!hl?.score.length) return { start: lo + span / 2, value: 0.5 };
  const step = Math.max(0.05, Math.min(hl.step, span / 40 || hl.step));
  const sc = hl.score;
  const pre = [0];
  for (const v of sc) pre.push(pre[pre.length - 1] + v);
  const at = (t: number) => clamp(Math.round(t / hl.step), 0, sc.length - 1);
  let best = lo; let bestV = -Infinity;
  for (let s = lo; s <= hi - len + 1e-6; s += step) {
    const a = at(s); const b = Math.max(a + 1, at(s + len) + 1);
    const mean = windowValue(sc, pre, a, b);
    const cut = hl.cuts.some((c) => c > s + 0.08 && c < s + len - 0.08);
    const center = 1 - Math.abs((s - lo) / Math.max(1e-6, span) - 0.5) * 0.04; // при равенстве — ближе к середине
    const v = mean * center - (cut ? 0.6 : 0) + (noise ? noise() * 0.06 : 0);
    if (v > bestV) { bestV = v; best = s; }
  }
  return { start: best, value: bestV };
}
/** Лучшее начало окна длиной len внутри [lo, hi]. noise — случайная добавка (для «другого варианта»). */
export function bestWindow(hl: Highlights | null | undefined, len: number, lo: number, hi: number, noise?: () => number): number {
  return scanWindow(hl, len, lo, hi, noise).start;
}

/** Сколько секунд в видео «хороших» (оценка заметно выше средней) — от этого зависит, сколько кусков из него брать. */
export function goodSeconds(hl: Highlights | null | undefined, a0: number, a1: number): number {
  const len = Math.max(0, a1 - a0);
  if (!hl?.score.length) return len;
  const bar = Math.max(0.45, topScore(hl) * 0.75);
  let n = 0; let all = 0;
  hl.score.forEach((v, i) => { const t = i * hl.step; if (t >= a0 - 1e-6 && t <= a1 + 1e-6) { all++; if (v >= bar) n++; } });
  return all ? Math.max(Math.min(len, 1.5), (len * n) / all) : len;
}
/** Самый длинный кусок видео без склеек внутри. */
export function longestShot(hl: Highlights | null | undefined, a0: number, a1: number): number {
  const cuts = (hl?.cuts ?? []).filter((c) => c > a0 && c < a1);
  const pts = [a0, ...cuts, a1];
  return Math.max(...pts.slice(1).map((x, i) => x - pts[i]));
}

/**
 * Куски одного видео для кадров с длинами needs (по порядку в ролике): по времени видео, без наложений,
 * с наибольшей суммарной оценкой (динамическое программирование по сетке начал).
 * Без разбора — видео делится на части по порядку, кусок из середины каждой.
 */
export function pickWindows(hl: Highlights | null | undefined, needs: number[], a0: number, a1: number, noise?: () => number): number[] {
  const span = a1 - a0;
  const total = needs.reduce((x, y) => x + y, 0);
  const R = needs.length;
  if (hl?.score.length && total <= span + 1e-6) {
    const gap = Math.min(0.5, Math.max(0, (span - total) / (R + 1)));
    const st = Math.max(0.05, Math.min(hl.step, span / 200));
    const P = Math.floor(span / st + 1e-6) + 1;
    const pos = (p: number) => a0 + p * st;
    const sc = hl.score;
    const pre = [0];
    for (const v of sc) pre.push(pre[pre.length - 1] + v);
    const at = (t: number) => clamp(Math.round(t / hl.step), 0, sc.length - 1);
    const value = (s: number, len: number) => {
      const x = at(s); const y = Math.max(x + 1, at(s + len) + 1);
      const cut = hl.cuts.some((c) => c > s + 0.08 && c < s + len - 0.08);
      return windowValue(sc, pre, x, y) - (cut ? 0.6 : 0) + (noise ? noise() * 0.06 : 0);
    };
    // соседние куски, похожие как две капли (камера стоит, ничего не происходит), — штраф: ролик не должен повторяться
    const sigOf = new Map<string, number[] | null>();
    const sigAt = (p: number, len: number) => {
      const k = `${p}:${len}`;
      if (!sigOf.has(k)) sigOf.set(k, windowSig(hl, pos(p), len));
      return sigOf.get(k)!;
    };
    const SIM_PEN = 0.35;
    const best: Float64Array[] = [];
    const from: Int32Array[] = [];
    for (let r = 0; r < R; r++) {
      const cur = new Float64Array(P).fill(-Infinity);
      const arg = new Int32Array(P).fill(-1);
      // прошлые куски по убыванию счёта: перебор останавливается, как только лучше уже не будет (штраф ≥ 0)
      const order = r > 0 ? [...best[r - 1].keys()].filter((p) => best[r - 1][p] > -Infinity).sort((x, y) => best[r - 1][y] - best[r - 1][x]) : [];
      const rest = needs.slice(r + 1).reduce((x, y) => x + y, 0);
      for (let p = 0; p < P; p++) {
        const s = pos(p);
        if (s + needs[r] + rest > a1 + 1e-6) break;
        let prev = 0;
        if (r > 0) {
          const lim = Math.floor((s - needs[r - 1] - gap - a0) / st + 1e-6);
          if (lim < 0) continue;
          let bv = -Infinity; let ba = -1;
          const mine = hl.sig ? sigAt(p, needs[r]) : null;
          for (const q of order) {
            const v0 = best[r - 1][q];
            if (v0 <= bv) break;
            if (q > lim) continue;
            const v = mine ? v0 - SIM_PEN * sigSimilarity(mine, sigAt(q, needs[r - 1])) : v0;
            if (v > bv) { bv = v; ba = q; }
            if (!mine) break;
          }
          if (ba < 0) continue;
          prev = bv;
          arg[p] = ba;
        }
        cur[p] = prev + value(s, needs[r]);
      }
      best.push(cur);
      from.push(arg);
    }
    let end = -1;
    best[R - 1].forEach((v, p) => { if (v > -Infinity && (end < 0 || v > best[R - 1][end])) end = p; });
    if (end >= 0) {
      const out: number[] = new Array(R);
      for (let r = R - 1, p = end; r >= 0; r--) { out[r] = pos(p); p = from[r][p]; }
      if (out.every((x) => Number.isFinite(x))) return out;
    }
  }
  // по порядку: каждое окно — в своей части видео
  const out: number[] = [];
  let prevEnd = a0;
  let cum = 0;
  const slack = Math.max(0, span - total);
  needs.forEach((len, r) => {
    const rs = a0 + cum + slack * (r / R);
    const re = rs + len + slack / R;
    const reserve = needs.slice(r + 1).reduce((x, y) => x + y, 0);
    const lo = Math.max(prevEnd, rs - (re - rs) * 0.25);
    let hi = Math.min(a1 - reserve, re + (re - rs) * 0.25);
    if (hi - lo < len) hi = Math.min(a1 - reserve, lo + len);
    const s0 = clamp(bestWindow(hl, len, lo, Math.max(hi, lo + len), noise), a0, Math.max(a0, a1 - len));
    out.push(s0);
    prevEnd = s0 + len;
    cum += len;
  });
  return out;
}

// ---------- стили ----------
export type AutoStyle = 'energy' | 'smooth' | 'cinema' | 'retro' | 'velocity' | 'flash' | 'zoom3d' | 'kinetic' | 'glitch' | 'clean';
export interface AutoStyleDef {
  id: AutoStyle;
  label: string;
  hint: string;
  bpm: number;              // темп без музыки
  cut: number;              // средняя длина кадра, сек
  first: number;            // во сколько раз длиннее первый кадр (на нём надпись)
  pattern: number[];        // ритм длин кадров (множители), по кругу
  trEvery: number;          // переход на каждой n-й склейке (остальные — резкие)
  trans: TransitionType[];
  trDur: (beat: number) => number;
  color: Partial<ColorAdjust>;
  effects: Effect[];        // на всех кадрах
  accent?: Effect;          // на кадрах, которые начинаются резкой склейкой на сильную долю
  zoom: number;             // наезд на фото (1 → 1 + zoom)
  zoomVideo: number;        // наезд на видео
  fadeIn: boolean;          // ролик проявляется из чёрного
  title: { preset: string; style: Partial<TextStyle>; anim: { in?: TextAnim; out?: TextAnim } };
  swatch: string;
  // ритм и динамика (по форме музыки: громкость и дропы)
  dyn?: number;             // 0..1 — насколько громкость музыки меняет длину кадров (громче — короче)
  burst?: boolean;          // после дропа — 8 долей короткими кадрами
  accentEvery?: number;     // акцент на резкой склейке каждые столько долей от сильной (по умолчанию 8)
  accentFirst?: boolean;    // акцент и на первом кадре
  dropFx?: Effect[];        // на кадре, который начинается с дропа
  build?: number;           // наезд на кадре перед дропом (1 → 1 + build)
  punch?: number;           // «удар» масштабом на каждой доле внутри кадра
  velocity?: boolean;       // ускорение и замедление: первая половина кадра быстро, вторая — замедленно
  kinetic?: boolean;        // надпись — по слову на долю
}

export const AUTO_STYLES: AutoStyleDef[] = [
  {
    id: 'energy', label: tx('Динамичный'), hint: tx('Быстрые склейки в ритм, вспышки на сильных долях, сочный цвет'),
    bpm: 124, cut: 0.9, first: 2, pattern: [1, 1, 1, 1, 0.5, 0.5, 1, 2], trEvery: 4,
    trans: ['zoomin', 'hlslice', 'squeezeh', 'pixelize', 'smoothleft', 'fadewhite'],
    trDur: (b) => clamp(b * 0.5, 0.2, 0.35),
    color: { preset: 'vivid', presetAmount: 0.6 }, effects: [], accent: { type: 'flash', amount: 0.45 },
    zoom: 0.12, zoomVideo: 0, fadeIn: false,
    title: { preset: 'classic', style: { font: 'Unbounded', size: 112, bold: true, uppercase: true }, anim: { in: { type: 'pop', dur: 0.35 }, out: { type: 'zoom', dur: 0.25 } } },
    swatch: 'linear-gradient(135deg,#ff3d6e,#ffb238)',
    dyn: 0.6, burst: true, accentFirst: true, dropFx: [{ type: 'shake', amount: 0.5 }], build: 0.18,
  },
  {
    id: 'smooth', label: tx('Плавный'), hint: tx('Длинные кадры, мягкие переходы, медленные наезды'),
    bpm: 90, cut: 2.6, first: 1, pattern: [1], trEvery: 1,
    trans: ['fade', 'smoothleft', 'dissolve', 'smoothup', 'fadeslow', 'circleopen'],
    trDur: (b) => clamp(b, 0.5, 0.9),
    color: { preset: 'soft', presetAmount: 0.6 }, effects: [{ type: 'glow', amount: 0.2 }],
    zoom: 0.1, zoomVideo: 0.06, fadeIn: true,
    title: { preset: 'classic', style: { font: 'Cormorant Garamond', size: 120, bold: true }, anim: { in: { type: 'blur', dur: 0.8 }, out: { type: 'fade', dur: 0.6 } } },
    swatch: 'linear-gradient(135deg,#f6d5c8,#9db4d8)',
    dyn: 0.25,
  },
  {
    id: 'cinema', label: tx('Кино'), hint: tx('Кинополосы, цвет как в фильме, переходы через чёрное'),
    bpm: 80, cut: 3.4, first: 1, pattern: [1, 1, 2], trEvery: 2,
    trans: ['fadeblack', 'fade', 'fadeslow'],
    trDur: (b) => clamp(b, 0.5, 1),
    color: { preset: 'tealorange', presetAmount: 0.75 }, effects: [{ type: 'letterbox', amount: 0.4 }, { type: 'grain', amount: 0.15 }],
    zoom: 0.06, zoomVideo: 0.05, fadeIn: true,
    title: { preset: 'classic', style: { font: 'Montserrat', size: 66, bold: true, uppercase: true }, anim: { in: { type: 'wipe', dur: 0.8 }, out: { type: 'fade', dur: 0.6 } } },
    swatch: 'linear-gradient(135deg,#0f3b4a,#d9823b)',
    dyn: 0.2, build: 0.1,
  },
  {
    id: 'retro', label: tx('Плёнка'), hint: tx('Тёплый плёночный цвет, зерно и засветки'),
    bpm: 104, cut: 1.7, first: 1.5, pattern: [1, 1, 2, 1], trEvery: 2,
    trans: ['fadewhite', 'pixelize', 'dissolve', 'hlwind', 'vuslice'],
    trDur: (b) => clamp(b * 0.5, 0.25, 0.45),
    color: { preset: 'kodak', presetAmount: 0.85 }, effects: [{ type: 'grain', amount: 0.4 }], accent: { type: 'lightleak', amount: 0.5 },
    zoom: 0.08, zoomVideo: 0, fadeIn: false,
    title: { preset: 'classic', style: { font: 'Press Start 2P', size: 54, color: '#ffe9b0' }, anim: { in: { type: 'typewriter', dur: 0.8 }, out: { type: 'fade', dur: 0.4 } } },
    swatch: 'linear-gradient(135deg,#c9763a,#5a3d2b)',
    dyn: 0.4,
  },
  {
    id: 'velocity', label: tx('Велосити'), hint: tx('Как в TikTok: кадр мчится и замирает в замедлении на доле, резкие склейки, вспышка на дропе'),
    bpm: 128, cut: 1.3, first: 1, pattern: [1, 1, 2, 1], trEvery: 0,
    trans: [], trDur: () => 0,
    color: { preset: 'drama', presetAmount: 0.55, contrast: 1.08 }, effects: [], accent: { type: 'flash', amount: 0.5 },
    zoom: 0, zoomVideo: 0, fadeIn: false,
    title: { preset: 'classic', style: { font: 'Dela Gothic One', size: 104, uppercase: true }, anim: { in: { type: 'pop', dur: 0.3 }, out: { type: 'zoom', dur: 0.2 } } },
    swatch: 'linear-gradient(135deg,#111827,#f43f5e 60%,#fde047)',
    dyn: 0.7, burst: true, accentEvery: 4, accentFirst: true, dropFx: [{ type: 'quake', amount: 0.5 }], velocity: true,
  },
  {
    id: 'flash', label: tx('Бит-флеш'), hint: tx('Очень частые склейки, белые вспышки на сильных долях, на дропе — двоение цвета'),
    bpm: 132, cut: 0.5, first: 2, pattern: [1, 1, 1, 1, 2, 1, 1, 1], trEvery: 0,
    trans: [], trDur: () => 0,
    color: { preset: 'vivid', presetAmount: 0.7, contrast: 1.1 }, effects: [], accent: { type: 'bwflash', amount: 0.6 },
    zoom: 0, zoomVideo: 0, fadeIn: false,
    title: { preset: 'classic', style: { font: 'Russo One', size: 112, uppercase: true }, anim: { in: { type: 'pop', dur: 0.25 }, out: { type: 'zoom', dur: 0.2 } } },
    swatch: 'linear-gradient(90deg,#fff 0 12%,#0f172a 12% 30%,#fff 30% 38%,#7c3aed 38% 70%,#fff 70% 76%,#0f172a 76%)',
    dyn: 0.9, burst: true, accentEvery: 4, dropFx: [{ type: 'rgbsplit', amount: 0.7 }, { type: 'shake', amount: 0.4 }], punch: 0.06,
  },
  {
    id: 'zoom3d', label: tx('3D-зум'), hint: tx('Переходы с объёмом и зумом, «удар» масштабом на каждую долю'),
    bpm: 112, cut: 1.4, first: 1.5, pattern: [1, 1, 2], trEvery: 1,
    trans: ['gl:CrossZoom', 'gl:Cube', 'gl:DreamyZoom', 'gl:ZoomInOut', 'gl:SimpleZoom', 'zoomin'],
    trDur: (b) => clamp(b * 0.6, 0.3, 0.5),
    color: { preset: 'cool', presetAmount: 0.5 }, effects: [], accent: { type: 'zoomin', amount: 0.5 },
    zoom: 0, zoomVideo: 0, fadeIn: false,
    title: { preset: 'classic', style: { font: 'Unbounded', size: 100, bold: true }, anim: { in: { type: 'zoom', dur: 0.4 }, out: { type: 'zoom', dur: 0.3 } } },
    swatch: 'radial-gradient(circle at 50% 50%,#a5f3fc,#3b82f6 45%,#1e1b4b)',
    dyn: 0.5, punch: 0.08, build: 0.22,
  },
  {
    id: 'kinetic', label: tx('Текст в ритм'), hint: tx('Надпись по слову на каждую долю, потом кадры с мягкими сдвигами'),
    bpm: 110, cut: 1.6, first: 1, pattern: [1, 1, 2, 1], trEvery: 2,
    trans: ['smoothleft', 'smoothup', 'coverleft', 'slideup'],
    trDur: (b) => clamp(b * 0.5, 0.25, 0.4),
    color: { preset: 'clean', presetAmount: 0.6 }, effects: [],
    zoom: 0.08, zoomVideo: 0.04, fadeIn: false,
    title: { preset: 'classic', style: { font: 'Rubik Mono One', size: 120, uppercase: true }, anim: { in: { type: 'pop', dur: 0.2 } } },
    swatch: 'linear-gradient(135deg,#fef08a,#fb923c 55%,#111)',
    dyn: 0.5, kinetic: true,
  },
  {
    id: 'glitch', label: tx('Глитч'), hint: tx('Цифровые помехи на склейках, двоение цвета, неоновый цвет'),
    bpm: 120, cut: 0.95, first: 1.5, pattern: [1, 1, 1, 2], trEvery: 2,
    trans: ['gl:GlitchMemories', 'gl:GlitchDisplace', 'pixelize', 'gl:GlitchBands', 'hlslice'],
    trDur: (b) => clamp(b * 0.5, 0.2, 0.35),
    color: { preset: 'nightcity', presetAmount: 0.6 }, effects: [{ type: 'rgbsplit', amount: 0.12 }], accent: { type: 'glitch', amount: 0.6 },
    zoom: 0.06, zoomVideo: 0, fadeIn: false,
    title: { preset: 'classic', style: { font: 'Tektur', size: 104, bold: true, uppercase: true }, anim: { in: { type: 'typewriter', dur: 0.5 }, out: { type: 'fade', dur: 0.3 } } },
    swatch: 'linear-gradient(135deg,#0b1020 20%,#22d3ee 21% 40%,#0b1020 41% 60%,#f0abfc 61% 72%,#0b1020 73%)',
    dyn: 0.6, burst: true, accentEvery: 4, dropFx: [{ type: 'vhs', amount: 0.5 }],
  },
  {
    id: 'clean', label: tx('Чистый'), hint: tx('Только резкие склейки точно в долю, естественный цвет, без эффектов'),
    bpm: 100, cut: 1.8, first: 1, pattern: [1, 1, 2, 1], trEvery: 0,
    trans: [], trDur: () => 0,
    color: { preset: 'clean', presetAmount: 0.35 }, effects: [],
    zoom: 0.05, zoomVideo: 0, fadeIn: false,
    title: { preset: 'classic', style: { font: 'Onest', size: 92, bold: true }, anim: { in: { type: 'fade', dur: 0.4 }, out: { type: 'fade', dur: 0.4 } } },
    swatch: 'linear-gradient(135deg,#f8fafc,#cbd5e1)',
    dyn: 0.45,
  },
];
export const autoStyle = (id: AutoStyle): AutoStyleDef => AUTO_STYLES.find((s) => s.id === id) ?? AUTO_STYLES[0];

// ---------- сборка ----------
export interface AutoMedia { asset: MediaAsset; hl?: Highlights | null }
export interface AutoInput {
  media: AutoMedia[];             // видео и фото по порядку
  music?: MediaAsset | null;      // если у неё есть beats — склейки на её долях
  style: AutoStyle;
  aspect: AspectKey;
  length: number | 'auto';        // секунды или «сколько получится из материала»
  title: string;
  videoSound: 'off' | 'quiet' | 'on';
  seed: number;
}
export interface AutoSummary {
  cuts: number;
  duration: number;
  used: number;                   // сколько файлов вошло
  dropped: number;                // сколько не поместилось
  repeated: boolean;              // материала мало — кадры повторяются
  bpm: number;
  onBeats: boolean;               // склейки на долях музыки (а не по сетке темпа)
}

/** Предсказуемые «случайные» числа: один seed — один и тот же ролик, другой — другой вариант. */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** «Сколько получится» — не короче стольких секунд, если материала хватает. */
export const AUTO_MIN = 8;
/** …и не длиннее стольких (длинный ролик — выбери длину сам). */
export const AUTO_MAX = 45;
const isVideo = (a: MediaAsset) => a.kind === 'video' && a.hasVideo && a.duration >= 0.5;
const usable = (a: MediaAsset) => {
  const edge = Math.min(0.2, a.duration * 0.05);
  return { a0: edge, a1: a.duration - edge, len: a.duration - 2 * edge };
};

/** Сетка долей на таймлайне: 0, потом доли музыки (или ровный темп), до maxT. */
export function beatGrid(music: MediaAsset | null | undefined, bpm: number, maxT: number): { grid: number[]; beat: number; musicIn: number; onBeats: boolean } {
  const raw = (music?.beats ?? []).filter((b) => b >= 0 && b <= (music?.duration ?? 0)).sort((a, b) => a - b);
  const beats: number[] = [];
  for (const b of raw) if (!beats.length || b - beats[beats.length - 1] >= 0.18) beats.push(b);
  if (music && beats.length >= 8) {
    // долгое тихое вступление — пропускаем, ролик начинается с первой доли
    const musicIn = beats[0] > 1 ? Math.max(0, beats[0] - 0.05) : 0;
    const diffs = beats.slice(1).map((b, i) => b - beats[i]);
    const beat = quantile(diffs, 0.5);
    const grid = [0, ...beats.map((b) => b - musicIn).filter((b) => b >= 0.25)];
    const end = Math.min(maxT, music.duration - musicIn);
    while (grid[grid.length - 1] + beat <= end + 1e-6) grid.push(grid[grid.length - 1] + beat);
    return { grid: grid.filter((g) => g <= end + 1e-6), beat, musicIn, onBeats: true };
  }
  const beat = 60 / (music?.bpm && music.bpm > 40 ? music.bpm : bpm);
  const end = music ? Math.min(maxT, music.duration) : maxT;
  const grid: number[] = [];
  for (let t = 0; t <= end + 1e-6; t += beat) grid.push(Math.round(t * 1e6) / 1e6);
  return { grid, beat, musicIn: 0, onBeats: false };
}

/** Длина кадра в долях — ближайшая из 1, 2, 4, 8 (так склейки ложатся на сильные доли). */
function baseBeats(cut: number, beat: number): number {
  const k = cut / beat;
  return [1, 2, 4, 8].reduce((best, x) => (Math.abs(Math.log(x / k)) < Math.abs(Math.log(best / k)) ? x : best), 1);
}

export function autoEdit(base: Project, inp: AutoInput): { project: Project; summary: AutoSummary } {
  const st = autoStyle(inp.style);
  const rand = rng(inp.seed);
  const media = inp.media.filter((m) => isVideo(m.asset) || m.asset.kind === 'image');
  if (!media.length) throw new Error(tx('Нужны видео или фото'));
  const music = inp.music && (inp.music.kind === 'audio' || inp.music.hasAudio) ? inp.music : null;

  // сколько кадров «естественно» даёт каждый файл
  const good = media.map((m) => (isVideo(m.asset) ? goodSeconds(m.hl, usable(m.asset).a0, usable(m.asset).a1) : 0));
  const natural = media.map((m, i) => (isVideo(m.asset) ? clamp(Math.round(good[i] / (st.cut * 2.2)), 1, 5) : 1));
  const cap = media.map((m, i) => (isVideo(m.asset) ? Math.max(1, Math.floor(good[i] / (st.cut * 1.6))) : 1));
  const weight = media.map((m, i) => (isVideo(m.asset) ? (1 + Math.min(3, good[i] / (st.cut * 4))) * (0.6 + 0.8 * topScore(m.hl)) : 1));

  const maxT = inp.length === 'auto' ? 600 : inp.length;
  const { grid, beat, musicIn, onBeats } = beatGrid(music, st.bpm, maxT);
  const k0 = baseBeats(st.cut, beat);
  const maxIdx = grid.length - 1;
  // форма музыки: громкость по времени ролика, дропы — на долях сетки, сильная доля такта
  const shape = onBeats ? music?.shape : undefined;
  const energyAt = (t: number) => {
    if (!shape?.energy.length) return 0.5;
    return shape.energy[clamp(Math.round((t + musicIn) / shape.step), 0, shape.energy.length - 1)];
  };
  const nearestIdx = (t: number) => grid.reduce((b, g, i) => (Math.abs(g - t) < Math.abs(grid[b] - t) ? i : b), 0);
  const dropIdx = [...new Set((shape?.drops ?? []).map((d) => d - musicIn).filter((d) => d > 0.5).map(nearestIdx))].filter((i) => i > 0 && i < maxIdx);
  const phase = shape ? shape.phase : 0;
  const inBurst = (at: number) => !!st.burst && dropIdx.some((d) => at >= d && at < d + 8);
  /** Длина кадра j в долях, если он начинается с доли at: ритм стиля, громкость музыки, всплеск после дропа. */
  const kAt = (j: number, at = 0) => {
    let k = k0 * st.pattern[j % st.pattern.length];
    if (j === 0) k = Math.max(k, k0 * st.first);
    if (shape && st.dyn) k *= Math.pow(2, st.dyn * (0.5 - energyAt(grid[Math.min(at, maxIdx)])) * 2);
    if (inBurst(at)) k = Math.min(k, Math.max(1, k0 / 2));
    return Math.max(1, Math.round(k));
  };

  // сколько долей займёт ролик
  const capTotal = cap.reduce((a, b) => a + b, 0);
  let NB: number;
  if (inp.length === 'auto') {
    // столько кадров, сколько естественно даёт материал, но не короче AUTO_MIN секунд, если материала хватает
    const want = Math.max(1, natural.reduce((a, b) => a + b, 0));
    let sum = 0;
    for (let j = 0; j < capTotal && (j < want || sum * beat < AUTO_MIN) && (j === 0 || (sum + kAt(j, sum)) * beat <= AUTO_MAX); j++) sum += kAt(j, sum);
    NB = Math.min(sum, maxIdx);
  } else {
    let i = 0;
    while (i < maxIdx && grid[i + 1] <= inp.length + beat * 0.25) i++;
    NB = i;
  }
  // кончаем на сильной доле (кратно 4): вверх, если есть музыка и материал, иначе вниз, если это немного
  const up = Math.ceil(NB / 4) * 4;
  const down = NB - (NB % 4);
  if (NB % 4) {
    if (inp.length === 'auto' && up <= maxIdx && (up - NB) * beat <= Math.max(1.6, 0.15 * NB * beat)) NB = up;
    else if (down >= 4 && (NB - down) * beat <= Math.max(1.6, 0.12 * NB * beat)) NB = down;
  }
  NB = Math.max(1, NB);

  // кадры: длины в долях по ритму стиля
  let ks: number[] = [];
  for (let sum = 0, j = 0; sum < NB; j++) {
    let k = Math.min(kAt(j, sum), NB - sum);
    // склейка точно на дропе
    const d = dropIdx.find((x) => x > sum && x < sum + k);
    if (d !== undefined) k = d - sum;
    ks.push(k);
    sum += k;
  }
  if (ks.length > 1 && ks[ks.length - 1] < Math.max(1, k0 / 2)) { const last = ks.pop()!; ks[ks.length - 1] += last; }

  // какие файлы в какие кадры
  const count = media.map((_, i) => natural[i]);
  let N = ks.length;
  const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  let repeated = false;
  while (sumOf(count) > N) {
    // меньше кусков из видео, где их много, потом — без самых слабых файлов
    let pick = -1;
    count.forEach((c, i) => { if (c > 1 && (pick < 0 || c / weight[i] > count[pick] / weight[pick])) pick = i; });
    if (pick >= 0) { count[pick]--; continue; }
    let weakest = -1;
    count.forEach((c, i) => { if (c > 0 && (weakest < 0 || weight[i] < weight[weakest])) weakest = i; });
    count[weakest] = 0;
  }
  while (sumOf(count) < N) {
    let pick = -1;
    count.forEach((c, i) => { if (c > 0 && c < cap[i] && (pick < 0 || weight[i] / (c + 1) > weight[pick] / (count[pick] + 1))) pick = i; });
    if (pick < 0) break;
    count[pick]++;
  }
  if (sumOf(count) < N) {
    if (inp.length === 'auto') {
      // материала меньше, чем просили доли, — ролик короче
      N = sumOf(count);
      ks = ks.slice(0, N);
    } else {
      repeated = true;
    }
  }
  // порядок кадров: файлы по порядку, кусков из одного видео — подряд; при нехватке материала — по кругу
  const owner: number[] = [];
  if (repeated) {
    const order = media.map((_, i) => i).filter((i) => count[i] > 0);
    for (let j = 0; j < N; j++) owner.push(order[j % order.length]);
  } else {
    count.forEach((c, i) => { for (let q = 0; q < c; q++) owner.push(i); });
  }

  // короткие видео почти не замедляем (не меньше 0.8×), кадр видео — не длиннее куска без склеек,
  // фото — не дольше полутора обычных кадров: лишние доли — соседним кадрам
  const tdGuess = st.trEvery ? st.trDur(beat) : 0;
  const photoMax = Math.max(st.cut * 1.6, 2 * beat);
  const limits = media.map((m) => {
    if (!isVideo(m.asset)) return { can: Infinity, shot: photoMax };
    const u = usable(m.asset);
    // материала мало и кадры повторяются — куски одного видео могут пересекаться, общий предел не нужен
    return { can: repeated ? Infinity : u.len * 1.25, shot: longestShot(m.hl, u.a0, u.a1), len: repeated ? Infinity : u.len };
  });
  const slotsOf = (i: number) => owner.map((o, j) => (o === i ? j : -1)).filter((j) => j >= 0);
  const needOf = (js: number[]) => js.reduce((s, j) => s + ks[j] * beat + tdGuess, 0);
  for (let i = 0; i < media.length; i++) {
    const mine = slotsOf(i);
    if (!mine.length) continue;
    const { can, shot } = limits[i];
    const canTake = (q: number) => {
      const o = owner[q];
      const lim = limits[o];
      if (!isVideo(media[o].asset)) return (ks[q] + 1) * beat <= lim.shot + 1e-6;
      return needOf(slotsOf(o)) + beat <= (lim.len ?? Infinity) && (ks[q] + 1) * beat + tdGuess <= lim.shot + 1e-6;
    };
    const taker = (j: number) => [j + 1, j - 1, j + 2, j - 2].find((q) => q >= 0 && q < N && owner[q] !== i && canTake(q));
    for (let guard = 0; guard < 1000; guard++) {
      if (needOf(mine) > can + 1e-6) {
        // всё видео короче нужного — укорачиваем самый длинный кадр (доля уходит соседу, если он может взять)
        const j = mine.reduce((b, x) => (ks[x] > ks[b] ? x : b), mine[0]);
        if (ks[j] <= 1) break;
        const q = taker(j);
        ks[j]--;
        if (q !== undefined) ks[q]++;
        continue;
      }
      // кадр длиннее допустимого — укорачиваем, только если долю есть кому отдать (длина ролика не меняется)
      const tdHere = isVideo(media[i].asset) ? tdGuess : 0;
      const move = mine.map((j) => ({ j, q: ks[j] > 1 && ks[j] * beat + tdHere > shot + 1e-6 ? taker(j) : undefined })).find((x) => x.q !== undefined);
      if (!move) break;
      ks[move.j]--;
      ks[move.q!]++;
    }
  }

  // время кадров
  const idx: number[] = [0];
  for (const k of ks) idx.push(Math.min(maxIdx, idx[idx.length - 1] + k));
  const B = idx.map((i) => grid[i]);
  const L = ks.map((_, j) => B[j + 1] - B[j]);
  // убираем пустые кадры (могли появиться, если сетка кончилась)
  const keep = L.map((l) => l > 0.12);
  const slots = ks.map((_, j) => j).filter((j) => keep[j]);

  // переходы
  const trOff = Math.floor(rand() * Math.max(1, st.trEvery));
  const td: number[] = slots.map(() => 0);
  const trType: (TransitionType | null)[] = slots.map(() => null);
  for (let q = 0; q < slots.length - 1; q++) {
    if (!st.trEvery || (q + 1 + trOff) % st.trEvery !== 0) continue;
    const d = Math.min(st.trDur(beat), 0.45 * Math.min(L[slots[q]], L[slots[q + 1]]));
    if (d < 0.12) continue;
    td[q] = Math.round(d * 1000) / 1000;
    trType[q] = st.trans[Math.floor(rand() * st.trans.length)];
  }

  // проект
  const asp = ASPECTS[inp.aspect];
  const p: Project = {
    ...structuredClone(base),
    settings: { ...base.settings, aspect: inp.aspect, width: asp.w, height: asp.h },
    tracks: [newTrack('main')],
    updatedAt: Date.now(),
  };
  for (const m of media) if (!p.assets.some((x) => x.id === m.asset.id)) p.assets.push(m.asset);
  if (music && !p.assets.some((x) => x.id === music.id)) p.assets.push(music);
  const main = mainTrack(p);
  const frameAR = asp.w / asp.h;
  let anyContain = false;
  let zoomDir = rand() < 0.5;

  // «велосити»: кадр видео от 2 долей делится на долю — первая часть быстро, вторая замедленно
  const VEL_FAST = 2;
  const VEL_SLOW = 0.5;
  const velSplit = (j: number, q: number): { tA: number; tB: number } | null => {
    if (!st.velocity || ks[j] < 2 || !isVideo(media[owner[j]].asset)) return null;
    const kA = Math.floor(ks[j] / 2);
    const tA = grid[Math.min(maxIdx, idx[j] + kA)] - grid[idx[j]];
    const tB = L[j] + td[q] - tA;
    return tA > 0.15 && tB > 0.15 ? { tA, tB } : null;
  };
  /** Сколько секунд исходника съест кадр (при скорости 1×). */
  const srcNeed = (j: number, q: number) => { const v = velSplit(j, q); return v ? v.tA * VEL_FAST + v.tB * VEL_SLOW : L[j] + td[q]; };

  // куски видео: лучшие моменты, по времени видео
  const windows = new Map<number, { start: number; speed: number }[]>();
  media.forEach((m, i) => {
    if (!isVideo(m.asset)) return;
    const mine = slots.map((j, q) => ({ j, q })).filter((x) => owner[x.j] === i);
    if (!mine.length) return;
    const u = usable(m.asset);
    const needs = mine.map((x) => srcNeed(x.j, x.q));
    const total = sumOf(needs);
    if (repeated && total > u.len) {
      // материала мало, кадры повторяются: каждое окно — в своей части видео, наложения допустимы
      const part = u.len / needs.length;
      windows.set(i, needs.map((n, r) => {
        const len = Math.min(n, u.len);
        const lo = Math.max(u.a0, u.a0 + part * (r - 0.25));
        const hi = Math.min(u.a1, Math.max(u.a0 + part * (r + 1.25), lo + len));
        return { start: bestWindow(m.hl, len, lo, hi, rand), speed: len < n - 1e-6 ? Math.max(0.25, len / n) : 1 };
      }));
      return;
    }
    // видео короче нужного — чуть замедляем все его куски
    const speed = total > u.len ? Math.max(0.25, u.len / total) : 1;
    const src = needs.map((n) => Math.min(n * speed, u.len));
    const starts = pickWindows(m.hl, src, u.a0, u.a1, rand);
    windows.set(i, starts.map((start, r) => ({ start, speed: src[r] < needs[r] * speed - 1e-6 ? Math.max(0.25, src[r] / needs[r]) : speed })));
  });
  const used = new Map<number, number>();
  const every = st.accentEvery ?? 8;
  const strongAt = (at: number) => (((at - phase) % every) + every) % every === 0;

  /** Клип из файла: кадрирование, звук, цвет. */
  const makeClip = (a: MediaAsset, inT: number, speed: number, dur: number): MediaClip => {
    const c: MediaClip = newMediaClip(a);
    const rot = Math.abs(a.rotation % 180) === 90;
    const ar = (rot ? a.height : a.width) / Math.max(1, rot ? a.width : a.height);
    // вертикальное видео в горизонтальном ролике — целиком на размытом фоне; горизонтальное в вертикальном — обрезаем по бокам, как в TikTok
    c.fit = ar && frameAR && frameAR / ar > 1.5 ? 'contain' : 'cover';
    if (c.fit === 'contain') anyContain = true;
    c.transform = { ...DEFAULT_TRANSFORM };
    if (isVideo(a)) {
      c.speed = Math.round(speed * 1e4) / 1e4;
      c.in = inT;
      c.out = Math.min(a.duration, inT + dur * c.speed);
      if (inp.videoSound === 'off' && music) { c.muted = true; c.volume = 0; } else if (inp.videoSound === 'quiet' && music) c.volume = 0.3;
      if (c.speed < 0.999 || c.speed > 1.001) c.muted = true; // ускоренный и замедленный звук звучит плохо
    } else {
      c.in = 0;
      c.out = dur;
    }
    c.color = { ...DEFAULT_COLOR, ...st.color };
    return c;
  };
  /** Масштаб во времени: наезд (z0 → z1) или «удары» на долях внутри кадра. t0 — начало кадра на таймлайне. */
  const zoomKeys = (c: MediaClip, z0: number, z1: number) => {
    c.keyframes = { scale: [{ t: c.in, v: z0, ease: 'smooth' }, { t: c.out, v: z1, ease: 'smooth' }] };
    c.transform.scale = z0;
  };
  const punchKeys = (c: MediaClip, t0: number, dur: number, amt: number) => {
    const beatsIn = grid.filter((g) => g > t0 + 0.12 && g < t0 + dur - 0.12);
    if (!beatsIn.length) return;
    const decay = Math.min(0.3, beat * 0.8);
    const keys: { t: number; v: number; ease: 'smooth' }[] = [{ t: c.in, v: 1, ease: 'smooth' }];
    for (const b of beatsIn) {
      const src = c.in + (b - t0) * c.speed;
      keys.push({ t: src - 0.01 * c.speed, v: 1, ease: 'smooth' }, { t: src + 0.06 * c.speed, v: 1 + amt, ease: 'smooth' }, { t: src + decay * c.speed, v: 1, ease: 'smooth' });
    }
    const clean = keys.filter((k, i) => i === 0 || k.t > keys[i - 1].t + 1e-4).map((k) => ({ ...k, t: Math.round(k.t * 1e4) / 1e4 }));
    c.keyframes = { scale: clean };
  };

  slots.forEach((j, q) => {
    const m = media[owner[j]];
    const a = m.asset;
    const d = L[j] + td[q];
    const t0 = B[j];
    const at = idx[j];
    const hardIn = q === 0 || !td[q - 1];
    const isDrop = dropIdx.includes(at);
    const beforeDrop = dropIdx.includes(idx[j + 1]);
    let w = { start: 0, speed: 1 };
    if (isVideo(a)) {
      const n = used.get(owner[j]) ?? 0;
      used.set(owner[j], n + 1);
      w = windows.get(owner[j])?.[n] ?? { start: usable(a).a0, speed: 1 };
    }
    const vel = velSplit(j, q);
    const parts: MediaClip[] = [];
    if (vel && w.speed >= 0.6) {
      const ca = makeClip(a, w.start, VEL_FAST * w.speed, vel.tA);
      const cb = makeClip(a, ca.out, Math.max(0.25, VEL_SLOW * w.speed), vel.tB);
      zoomKeys(cb, 1, beforeDrop && st.build ? 1 + st.build : 1.08); // замедление — с лёгким наездом
      parts.push(ca, cb);
    } else {
      const c = makeClip(a, w.start, w.speed, d);
      const z = isVideo(a) ? st.zoomVideo : st.zoom;
      if (beforeDrop && st.build) zoomKeys(c, 1, 1 + st.build);
      else if (st.punch) punchKeys(c, t0, d, st.punch);
      else if (z > 0) {
        zoomDir = !zoomDir;
        if (zoomDir) zoomKeys(c, 1, 1 + z); else zoomKeys(c, 1 + z, 1);
      }
      parts.push(c);
    }
    const head = parts[0];
    const fx: Effect[] = st.effects.map((e) => ({ ...e }));
    if (st.accent && (q === 0 ? !!st.accentFirst : hardIn && (strongAt(at) || isDrop))) fx.push({ ...st.accent });
    if (isDrop && st.dropFx) for (const e of st.dropFx) if (!fx.some((x) => x.type === e.type)) fx.push({ ...e });
    if (fx.length) head.effects = fx;
    for (const c of parts.slice(1)) if (st.effects.length) c.effects = st.effects.map((e) => ({ ...e }));
    const tail = parts[parts.length - 1];
    if (trType[q] && q < slots.length - 1) tail.transitionOut = { type: trType[q]!, duration: td[q] } as Transition;
    if (q === 0 && st.fadeIn) head.anim = { in: { type: 'fade', dur: Math.min(0.6, d * 0.3) } };
    if (q === slots.length - 1) tail.anim = { ...(tail.anim ?? {}), out: { type: 'fade', dur: Math.round(Math.min(1, d * 0.4) * 100) / 100 } as ClipAnim };
    main.clips.push(...parts);
  });
  layoutMain(p);
  if (anyContain) p.settings.background = 'blur';
  const last = main.clips[main.clips.length - 1] as MediaClip;
  const total = Math.round((last.start + (last.out - last.in) / last.speed) * 1000) / 1000;

  // музыка
  if (music) {
    const mc = newMediaClip(music, 0);
    mc.in = musicIn;
    mc.out = Math.min(music.duration, musicIn + total);
    const cut = music.duration - musicIn > total + 0.1;
    mc.fadeOut = cut ? Math.round(Math.min(2, total * 0.15) * 100) / 100 : 0;
    const t = newTrack('audio', tx('Музыка'));
    t.clips.push(mc);
    p.tracks.push(t);
  }

  // надпись
  const title = inp.title.trim();
  const words = title.split(/\s+/).filter(Boolean);
  if (title && st.kinetic && words.length > 1) {
    // по слову на долю (короткая надпись — по слову на две доли), в конце ролика — надпись целиком
    const preset = TEXT_PRESETS.find((x) => x.id === st.title.preset)?.style ?? {};
    const per = words.length <= 3 ? 2 : 1;
    const t = newTrack('text');
    const list = words.slice(0, 12);
    list.forEach((wd, i) => {
      const a0 = grid[Math.min(maxIdx, i * per)];
      const a1 = Math.min(total - 0.05, grid[Math.min(maxIdx, (i + 1) * per)] ?? a0 + beat * per);
      if (a1 - a0 < 0.12) return;
      const c: TextClip = newTextClip(a0, wd, { ...preset, ...st.title.style });
      c.duration = Math.round((a1 - a0 - 0.02) * 1000) / 1000;
      c.y = inp.aspect === '9:16' ? 0.42 : 0.45;
      c.anim = structuredClone(st.title.anim);
      t.clips.push(c);
    });
    const lastStart = main.clips[main.clips.length - 1].start;
    const wordsEnd = grid[Math.min(maxIdx, list.length * per)] ?? 0;
    if (total - lastStart > 1.2 && lastStart > wordsEnd + 0.5) {
      const c: TextClip = newTextClip(lastStart + 0.1, title, { ...preset, ...st.title.style, size: Math.round((st.title.style.size ?? 100) * 0.7) });
      c.duration = Math.round((total - lastStart - 0.25) * 1000) / 1000;
      c.y = inp.aspect === '9:16' ? 0.42 : 0.45;
      c.anim = { in: { type: 'pop', dur: 0.3 }, out: { type: 'fade', dur: 0.4 } };
      t.clips.push(c);
    }
    if (t.clips.length) p.tracks.push(t);
  } else if (title) {
    const preset = TEXT_PRESETS.find((x) => x.id === st.title.preset)?.style ?? {};
    const c: TextClip = newTextClip(0.15, title, { ...preset, ...st.title.style });
    const firstLen = L[slots[0]] + (slots.length > 1 ? L[slots[1]] * 0.5 : 0);
    c.duration = Math.round(clamp(firstLen - 0.2, 1.4, Math.min(4, total - 0.2)) * 1000) / 1000;
    c.y = inp.aspect === '9:16' ? 0.42 : 0.45;
    c.anim = structuredClone(st.title.anim);
    const t = newTrack('text');
    t.clips.push(c);
    p.tracks.push(t);
  }
  p.name = title || tx('Авто-ролик');

  const usedCount = new Set(slots.map((j) => owner[j])).size;
  return {
    project: p,
    summary: {
      cuts: Math.max(0, main.clips.length - 1), duration: total, used: usedCount, dropped: media.length - usedCount, repeated,
      bpm: Math.round(60 / beat), onBeats,
    },
  };
}
