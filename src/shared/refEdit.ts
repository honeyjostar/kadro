// «Повторить монтаж по ролику» (как шаблоны CapCut из TikTok): в чужом ролике находятся склейки (точно по кадрам),
// вспышки, затемнения, тряска и наезды; из этого получается шаблон с окошками той же длины и музыкой образца.
// Свои видео и фото встают в окошки — склейки ложатся туда же, куда в образце, то есть в его музыку.
import { tx } from './i18n';
import { ASPECTS } from './defaults';
import type { AspectKey, ClipAnim, Effect } from './types';
import type { Template, TemplateSlot } from './templates';

/** Размер кадра для разбора образца. */
export const REF_W = 64;
export const REF_H = 36;
/** Длиннее — разбираем только начало. */
export const REF_MAX_SEC = 180;

export interface RefShot {
  start: number;
  end: number;
  flash: boolean;        // в начале кадра белая вспышка
  fadeIn: boolean;       // кадр проявляется из чёрного
  fadeOut: boolean;      // кадр уходит в чёрное
  shake: number;         // 0..1 — насколько трясётся
  zoom?: [number, number]; // наезд / отъезд (масштаб в начале и в конце)
}
export interface RefAnalysis { duration: number; fps: number; shots: RefShot[] }

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

function mean(g: Uint8Array): number { let s = 0; for (let i = 0; i < g.length; i++) s += g[i]; return s / g.length; }
function diff(a: Uint8Array, b: Uint8Array): number { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; }
/** Отпечаток 4×4 (средняя яркость клеток). */
function cells(g: Uint8Array, w = REF_W, h = REF_H): number[] {
  const out = new Array<number>(16).fill(0);
  const cnt = new Array<number>(16).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = Math.min(3, Math.floor((y * 4) / h)) * 4 + Math.min(3, Math.floor((x * 4) / w));
    out[k] += g[y * w + x]; cnt[k]++;
  }
  return out.map((v, k) => v / Math.max(1, cnt[k]));
}
const cellDiff = (a: number[], b: number[]) => a.reduce((s, v, k) => s + Math.abs(v - b[k]), 0) / a.length;

/** Кадр, увеличенный в s раз от центра (ближайший пиксель). */
function zoomed(g: Uint8Array, s: number, w = REF_W, h = REF_H): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = clamp(Math.round((x - w / 2) / s + w / 2), 0, w - 1);
    const sy = clamp(Math.round((y - h / 2) / s + h / 2), 0, h - 1);
    out[y * w + x] = g[sy * w + sx];
  }
  return out;
}
/** Разница только по середине кадра (края после увеличения недостоверны). */
function centerDiff(a: Uint8Array, b: Uint8Array, w = REF_W, h = REF_H): number {
  let s = 0; let n = 0;
  for (let y = Math.floor(h * 0.15); y < h * 0.85; y++) for (let x = Math.floor(w * 0.15); x < w * 0.85; x++) { s += Math.abs(a[y * w + x] - b[y * w + x]); n++; }
  return s / Math.max(1, n);
}

/** Наезд внутри кадра: последний кадр похож на увеличенный первый (или наоборот). */
function detectZoom(first: Uint8Array, last: Uint8Array): [number, number] | undefined {
  const base = centerDiff(first, last);
  if (base < 4) return undefined; // кадр почти не меняется
  let best: { s: number; d: number; dir: 1 | -1 } = { s: 1, d: base, dir: 1 };
  for (let s = 1.06; s <= 1.5 + 1e-6; s += 0.04) {
    const inD = centerDiff(zoomed(first, s), last);
    if (inD < best.d) best = { s, d: inD, dir: 1 };
    const outD = centerDiff(first, zoomed(last, s));
    if (outD < best.d) best = { s, d: outD, dir: -1 };
  }
  if (best.s === 1 || best.d > base * 0.6) return undefined;
  const z = Math.round(best.s * 100) / 100;
  return best.dir === 1 ? [1, z] : [z, 1];
}

/**
 * Разбор образца по маленьким серым кадрам (REF_W×REF_H, по порядку, частота fps).
 * Склейка — кадр резко не похож на прошлый и по пикселям, и по клеткам 4×4 (быстрое движение так не меняет клетки).
 */
export function analyzeRef(frames: Uint8Array[], fps: number): RefAnalysis {
  const n = frames.length;
  const duration = n / fps;
  if (n < 2) return { duration, fps, shots: [{ start: 0, end: duration, flash: false, fadeIn: false, fadeOut: false, shake: 0 }] };
  const b = frames.map(mean);
  const c = frames.map((g) => cells(g));
  const m = frames.map((g, i) => (i ? diff(g, frames[i - 1]) : 0));
  const cd = frames.map((_, i) => (i ? cellDiff(c[i], c[i - 1]) : 0));
  const dark = (i: number) => b[i] < 14;
  const cuts: number[] = [];
  const minShot = Math.max(2, Math.round(fps * 0.12));
  for (let i = 1; i < n; i++) {
    const around: number[] = [];
    for (let k = i - 6; k <= i + 6; k++) if (k > 0 && k < n && k !== i) around.push(m[k]);
    const med = median(around);
    const sharp = m[i] > 18 && m[i] > 2.6 * Math.max(med, 3) && cd[i] > 9;
    // из чёрного в кадр / из кадра в чёрное — тоже граница кадра
    const fromBlack = dark(i - 1) && !dark(i) && b[i] - b[i - 1] > 20;
    if (!(sharp || fromBlack)) continue;
    if (cuts.length && i - cuts[cuts.length - 1] < minShot) {
      // две склейки подряд (вспышка между кадрами) — оставляем более сильную
      const prev = cuts[cuts.length - 1];
      if (m[i] > m[prev]) cuts[cuts.length - 1] = i;
      continue;
    }
    if (i < minShot) continue;
    cuts.push(i);
  }
  const bounds = [0, ...cuts, n];
  const shots: RefShot[] = [];
  for (let s = 0; s < bounds.length - 1; s++) {
    const a = bounds[s]; const e = bounds[s + 1];
    // белая вспышка: в первые 0,3 с кадра яркость резко выше обычной для него
    const body = b.slice(a, e);
    const norm = median(body);
    let flash = false;
    for (let i = a; i < Math.min(e, a + Math.round(fps * 0.3)); i++) if (b[i] > norm + 45 && b[i] > 150) flash = true;
    const fadeIn = dark(a) || (e - a > 4 && b[a] < norm * 0.35 && b[a] < 40);
    const fadeOut = dark(e - 1) || (e - a > 4 && b[e - 1] < norm * 0.35 && b[e - 1] < 40);
    // тряска: движение то сильное, то слабое от кадра к кадру
    let jit = 0; let mm = 0;
    for (let i = a + 1; i < e; i++) { mm += m[i]; if (i > a + 1) jit += Math.abs(m[i] - m[i - 1]); }
    const k = Math.max(1, e - a - 1);
    mm /= k; jit /= Math.max(1, k - 1);
    const perQuarter = mm * (fps / 4);
    const shake = perQuarter > 12 ? clamp((jit / Math.max(1, mm) - 0.5) / 0.6, 0, 1) : 0;
    // наезд: по кадрам ближе к краям куска (не самые крайние — там бывают переходы)
    let zoom: [number, number] | undefined;
    if (e - a >= Math.round(fps * 0.4)) {
      const pad = Math.min(Math.round(fps * 0.08), Math.floor((e - a) / 6));
      zoom = detectZoom(frames[a + pad], frames[e - 1 - pad]);
    }
    shots.push({ start: a / fps, end: e / fps, flash, fadeIn, fadeOut, shake: Math.round(shake * 100) / 100, zoom });
  }
  return { duration, fps, shots };
}

/** Формат кадра по размеру образца. */
export function aspectOf(w: number, h: number): AspectKey {
  const r = w / Math.max(1, h);
  return (Object.keys(ASPECTS) as AspectKey[]).reduce((best, k) => {
    const a = ASPECTS[k].w / ASPECTS[k].h;
    const b = ASPECTS[best].w / ASPECTS[best].h;
    return Math.abs(Math.log(a / r)) < Math.abs(Math.log(b / r)) ? k : best;
  }, '9:16' as AspectKey);
}

/** Шаблон по разбору: окошки той же длины, вспышки, затемнения, тряска и наезды — как в образце. */
export function refTemplate(r: RefAnalysis, o: { name: string; width: number; height: number; music?: string; thumb?: string; id?: string }): Template {
  const slots: TemplateSlot[] = r.shots.map((s) => {
    const effects: Effect[] = [];
    if (s.flash) effects.push({ type: 'flash', amount: 0.6 });
    if (s.shake > 0.25) effects.push({ type: 'shake', amount: Math.round(clamp(s.shake, 0.2, 0.8) * 100) / 100 });
    const anim: { in?: ClipAnim; out?: ClipAnim } = {};
    const len = s.end - s.start;
    if (s.fadeIn) anim.in = { type: 'fade', dur: Math.round(Math.min(0.5, len * 0.3) * 100) / 100 };
    if (s.fadeOut) anim.out = { type: 'fade', dur: Math.round(Math.min(0.5, len * 0.3) * 100) / 100 };
    return {
      duration: Math.round(len * 1000) / 1000,
      ...(effects.length ? { effects } : {}),
      ...(s.zoom ? { zoom: s.zoom } : {}),
      ...(anim.in || anim.out ? { anim } : {}),
    };
  });
  const name = o.name.replace(/\.[a-z0-9]{2,4}$/i, '').slice(0, 40) || tx('ролик');
  return {
    id: o.id ?? `ref_${Date.now().toString(36)}`,
    name: tx('По ролику «{0}»', name),
    hint: tx('{0} окошек, как в образце', slots.length),
    aspect: aspectOf(o.width, o.height),
    slots,
    texts: [],
    custom: true,
    ...(o.thumb ? { thumb: o.thumb } : {}),
    ...(o.music ? { music: { path: o.music } } : {}),
  };
}
