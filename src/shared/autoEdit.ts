// Авто-ролик: из видео, фото и музыки — готовый монтаж, который дальше можно править как обычно.
// Склейки — на долях музыки. Из видео берутся лучшие куски: резкие, хорошо освещённые, с умеренным движением
// и без склеек внутри. Стиль задаёт длину кадров, переходы, цвет, эффекты и надпись.
import { ASPECTS, DEFAULT_COLOR, DEFAULT_TRANSFORM, TEXT_PRESETS, newMediaClip, newTextClip, newTrack } from './defaults';
import { layoutMain, mainTrack } from './timeline';
import type {
  AspectKey, ClipAnim, ColorAdjust, Effect, MediaAsset, MediaClip, Project, TextAnim, TextClip, TextStyle, Transition, TransitionType,
} from './types';

// ---------- разбор видео ----------
/** Размер кадра для разбора (серый, маленький — хватает, чтобы оценить резкость, свет и движение). */
export const HL_W = 80;
export const HL_H = 45;

/** b — средняя яркость 0..255, s — резкость (средний модуль лапласиана), m — движение (средняя разница с прошлым кадром), c — контраст. */
export interface FrameStat { b: number; s: number; m: number; c: number }
/** Оценка видео по времени: score[i] — насколько хорош момент i·step (0..1); cuts — где внутри видео склейки. */
export interface Highlights { step: number; score: number[]; cuts: number[] }

export function frameStat(g: ArrayLike<number>, prev: ArrayLike<number> | null, w = HL_W, h = HL_H): FrameStat {
  const n = w * h;
  let sum = 0; let sum2 = 0; let diff = 0; let lap = 0;
  for (let i = 0; i < n; i++) {
    const v = g[i];
    sum += v; sum2 += v * v;
    if (prev) diff += Math.abs(v - prev[i]);
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      lap += Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]);
    }
  }
  const mean = sum / n;
  return { b: mean, s: lap / ((w - 2) * (h - 2)), m: prev ? diff / n : 0, c: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
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
    return 0.35 * sharp + 0.25 * expo + 0.15 * contrast + 0.25 * motion;
  });
  const score = raw.map((v, i) => r3((raw[Math.max(0, i - 1)] + 2 * v + raw[Math.min(n - 1, i + 1)]) / 4));
  return { step, score, cuts };
}

/** Средняя оценка лучших 30% моментов (насколько видео в целом «удачное»). */
export function topScore(hl: Highlights | null | undefined): number {
  if (!hl?.score.length) return 0.5;
  const s = [...hl.score].sort((a, b) => b - a);
  const k = Math.max(1, Math.round(s.length * 0.3));
  return s.slice(0, k).reduce((a, b) => a + b, 0) / k;
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
    const mean = (pre[b] - pre[a]) / (b - a);
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
      return (pre[y] - pre[x]) / (y - x) - (cut ? 0.6 : 0) + (noise ? noise() * 0.06 : 0);
    };
    const best: Float64Array[] = [];
    const from: Int32Array[] = [];
    for (let r = 0; r < R; r++) {
      const cur = new Float64Array(P).fill(-Infinity);
      const arg = new Int32Array(P).fill(-1);
      // лучший прошлый кусок, который кончается до начала этого (префиксный максимум)
      let pm: Float64Array | null = null; let pa: Int32Array | null = null;
      if (r > 0) {
        pm = new Float64Array(P); pa = new Int32Array(P);
        for (let p = 0; p < P; p++) {
          const v = best[r - 1][p];
          if (p === 0 || v > pm[p - 1]) { pm[p] = v; pa[p] = p; } else { pm[p] = pm[p - 1]; pa[p] = pa[p - 1]; }
        }
      }
      const rest = needs.slice(r + 1).reduce((x, y) => x + y, 0);
      for (let p = 0; p < P; p++) {
        const s = pos(p);
        if (s + needs[r] + rest > a1 + 1e-6) break;
        let prev = 0;
        if (r > 0) {
          const lim = Math.floor((s - needs[r - 1] - gap - a0) / st + 1e-6);
          if (lim < 0 || pm![lim] === -Infinity) continue;
          prev = pm![lim];
          arg[p] = pa![lim];
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
export type AutoStyle = 'energy' | 'smooth' | 'cinema' | 'retro';
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
}

export const AUTO_STYLES: AutoStyleDef[] = [
  {
    id: 'energy', label: 'Динамичный', hint: 'Быстрые склейки в ритм, вспышки на сильных долях, сочный цвет',
    bpm: 124, cut: 0.9, first: 2, pattern: [1, 1, 1, 1, 0.5, 0.5, 1, 2], trEvery: 4,
    trans: ['zoomin', 'hlslice', 'squeezeh', 'pixelize', 'smoothleft', 'fadewhite'],
    trDur: (b) => clamp(b * 0.5, 0.2, 0.35),
    color: { preset: 'vivid', presetAmount: 0.6 }, effects: [], accent: { type: 'flash', amount: 0.45 },
    zoom: 0.12, zoomVideo: 0, fadeIn: false,
    title: { preset: 'classic', style: { font: 'Unbounded', size: 112, bold: true, uppercase: true }, anim: { in: { type: 'pop', dur: 0.35 }, out: { type: 'zoom', dur: 0.25 } } },
    swatch: 'linear-gradient(135deg,#ff3d6e,#ffb238)',
  },
  {
    id: 'smooth', label: 'Плавный', hint: 'Длинные кадры, мягкие переходы, медленные наезды',
    bpm: 90, cut: 2.6, first: 1, pattern: [1], trEvery: 1,
    trans: ['fade', 'smoothleft', 'dissolve', 'smoothup', 'fadeslow', 'circleopen'],
    trDur: (b) => clamp(b, 0.5, 0.9),
    color: { preset: 'soft', presetAmount: 0.6 }, effects: [{ type: 'glow', amount: 0.2 }],
    zoom: 0.1, zoomVideo: 0.06, fadeIn: true,
    title: { preset: 'classic', style: { font: 'Cormorant Garamond', size: 120, bold: true }, anim: { in: { type: 'blur', dur: 0.8 }, out: { type: 'fade', dur: 0.6 } } },
    swatch: 'linear-gradient(135deg,#f6d5c8,#9db4d8)',
  },
  {
    id: 'cinema', label: 'Кино', hint: 'Кинополосы, цвет как в фильме, переходы через чёрное',
    bpm: 80, cut: 3.4, first: 1, pattern: [1, 1, 2], trEvery: 2,
    trans: ['fadeblack', 'fade', 'fadeslow'],
    trDur: (b) => clamp(b, 0.5, 1),
    color: { preset: 'tealorange', presetAmount: 0.75 }, effects: [{ type: 'letterbox', amount: 0.4 }, { type: 'grain', amount: 0.15 }],
    zoom: 0.06, zoomVideo: 0.05, fadeIn: true,
    title: { preset: 'classic', style: { font: 'Montserrat', size: 66, bold: true, uppercase: true }, anim: { in: { type: 'wipe', dur: 0.8 }, out: { type: 'fade', dur: 0.6 } } },
    swatch: 'linear-gradient(135deg,#0f3b4a,#d9823b)',
  },
  {
    id: 'retro', label: 'Плёнка', hint: 'Тёплый плёночный цвет, зерно и засветки',
    bpm: 104, cut: 1.7, first: 1.5, pattern: [1, 1, 2, 1], trEvery: 2,
    trans: ['fadewhite', 'pixelize', 'dissolve', 'hlwind', 'vuslice'],
    trDur: (b) => clamp(b * 0.5, 0.25, 0.45),
    color: { preset: 'kodak', presetAmount: 0.85 }, effects: [{ type: 'grain', amount: 0.4 }], accent: { type: 'lightleak', amount: 0.5 },
    zoom: 0.08, zoomVideo: 0, fadeIn: false,
    title: { preset: 'classic', style: { font: 'Press Start 2P', size: 54, color: '#ffe9b0' }, anim: { in: { type: 'typewriter', dur: 0.8 }, out: { type: 'fade', dur: 0.4 } } },
    swatch: 'linear-gradient(135deg,#c9763a,#5a3d2b)',
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
  if (!media.length) throw new Error('Нужны видео или фото');
  const music = inp.music && (inp.music.kind === 'audio' || inp.music.hasAudio) ? inp.music : null;

  // сколько кадров «естественно» даёт каждый файл
  const good = media.map((m) => (isVideo(m.asset) ? goodSeconds(m.hl, usable(m.asset).a0, usable(m.asset).a1) : 0));
  const natural = media.map((m, i) => (isVideo(m.asset) ? clamp(Math.round(good[i] / (st.cut * 2.2)), 1, 5) : 1));
  const cap = media.map((m, i) => (isVideo(m.asset) ? Math.max(1, Math.floor(good[i] / (st.cut * 1.6))) : 1));
  const weight = media.map((m, i) => (isVideo(m.asset) ? (1 + Math.min(3, good[i] / (st.cut * 4))) * (0.6 + 0.8 * topScore(m.hl)) : 1));

  const maxT = inp.length === 'auto' ? 600 : inp.length;
  const { grid, beat, musicIn, onBeats } = beatGrid(music, st.bpm, maxT);
  const k0 = baseBeats(st.cut, beat);
  const kAt = (j: number) => {
    const k = Math.max(1, Math.round(k0 * st.pattern[j % st.pattern.length]));
    return j === 0 ? Math.max(k, Math.round(k0 * st.first)) : k;
  };
  const maxIdx = grid.length - 1;

  // сколько долей займёт ролик
  const capTotal = cap.reduce((a, b) => a + b, 0);
  let NB: number;
  if (inp.length === 'auto') {
    // столько кадров, сколько естественно даёт материал, но не короче AUTO_MIN секунд, если материала хватает
    const want = Math.max(1, natural.reduce((a, b) => a + b, 0));
    let sum = 0;
    for (let j = 0; j < capTotal && (j < want || sum * beat < AUTO_MIN) && (j === 0 || (sum + kAt(j)) * beat <= AUTO_MAX); j++) sum += kAt(j);
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
  for (let sum = 0, j = 0; sum < NB; j++) { const k = Math.min(kAt(j), NB - sum); ks.push(k); sum += k; }
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

  // куски видео: лучшие моменты, по времени видео
  const windows = new Map<number, { start: number; speed: number }[]>();
  media.forEach((m, i) => {
    if (!isVideo(m.asset)) return;
    const mine = slots.map((j, q) => ({ j, q })).filter((x) => owner[x.j] === i);
    if (!mine.length) return;
    const u = usable(m.asset);
    const needs = mine.map((x) => L[x.j] + td[x.q]);
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

  slots.forEach((j, q) => {
    const m = media[owner[j]];
    const a = m.asset;
    const d = L[j] + td[q];
    const c: MediaClip = newMediaClip(a);
    const rot = Math.abs(a.rotation % 180) === 90;
    const ar = (rot ? a.height : a.width) / Math.max(1, rot ? a.width : a.height);
    // вертикальное видео в горизонтальном ролике — целиком на размытом фоне; горизонтальное в вертикальном — обрезаем по бокам, как в TikTok
    c.fit = ar && frameAR && frameAR / ar > 1.5 ? 'contain' : 'cover';
    if (c.fit === 'contain') anyContain = true;
    c.transform = { ...DEFAULT_TRANSFORM };
    if (isVideo(a)) {
      const n = used.get(owner[j]) ?? 0;
      used.set(owner[j], n + 1);
      const w = windows.get(owner[j])?.[n] ?? { start: usable(a).a0, speed: 1 };
      c.speed = Math.round(w.speed * 1e4) / 1e4;
      c.in = w.start;
      c.out = Math.min(a.duration, w.start + d * c.speed);
      if (inp.videoSound === 'off' && music) { c.muted = true; c.volume = 0; } else if (inp.videoSound === 'quiet' && music) c.volume = 0.3;
      if (c.speed < 0.999 && !c.muted) c.muted = true; // замедленный звук звучит плохо
    } else {
      c.in = 0;
      c.out = d;
    }
    const z = isVideo(a) ? st.zoomVideo : st.zoom;
    if (z > 0) {
      zoomDir = !zoomDir;
      const [z0, z1] = zoomDir ? [1, 1 + z] : [1 + z, 1];
      c.keyframes = { scale: [{ t: c.in, v: z0, ease: 'smooth' }, { t: c.out, v: z1, ease: 'smooth' }] };
      c.transform.scale = z0;
    }
    c.color = { ...DEFAULT_COLOR, ...st.color };
    const fx: Effect[] = st.effects.map((e) => ({ ...e }));
    const hardIn = q === 0 || !td[q - 1];
    if (st.accent && (q === 0 ? st.id === 'energy' : hardIn && idx[j] % 8 === 0)) fx.push({ ...st.accent });
    if (fx.length) c.effects = fx;
    if (trType[q] && q < slots.length - 1) c.transitionOut = { type: trType[q]!, duration: td[q] } as Transition;
    const anim: { in?: ClipAnim; out?: ClipAnim } = {};
    if (q === 0 && st.fadeIn) anim.in = { type: 'fade', dur: Math.min(0.6, d * 0.3) };
    if (q === slots.length - 1) anim.out = { type: 'fade', dur: Math.round(Math.min(1, d * 0.4) * 100) / 100 };
    if (anim.in || anim.out) c.anim = anim;
    main.clips.push(c);
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
    const t = newTrack('audio', 'Музыка');
    t.clips.push(mc);
    p.tracks.push(t);
  }

  // надпись
  const title = inp.title.trim();
  if (title) {
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
  p.name = title || 'Авто-ролик';

  const usedCount = new Set(slots.map((j) => owner[j])).size;
  return {
    project: p,
    summary: {
      cuts: Math.max(0, slots.length - 1), duration: total, used: usedCount, dropped: media.length - usedCount, repeated,
      bpm: Math.round(60 / beat), onBeats,
    },
  };
}
