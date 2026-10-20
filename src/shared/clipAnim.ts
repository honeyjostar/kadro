// Анимации появления и исчезновения видео и фото (как у текста): наезд, выезд, выскок, вращение…
// Одна математика для превью (числа) и экспорта (выражения FFmpeg) — как у эффектов движения.
import type { ClipAnim, ClipAnimType, MediaClip } from './types';

export const CLIP_ANIMS: { type: ClipAnimType; in: string; out: string; hint: string }[] = [
  { type: 'fade', in: 'Проявление', out: 'Растворение', hint: 'плавно из прозрачного' },
  { type: 'zoomin', in: 'Из далёкого', out: 'В далёкое', hint: 'вырастает из маленького' },
  { type: 'zoomout', in: 'Из крупного', out: 'В крупное', hint: 'наплывает из большого' },
  { type: 'pop', in: 'Выскок', out: 'Схлопывание', hint: 'с пружинкой, как в TikTok' },
  { type: 'left', in: 'Слева', out: 'Влево', hint: 'выезжает из-за края' },
  { type: 'right', in: 'Справа', out: 'Вправо', hint: 'выезжает из-за края' },
  { type: 'top', in: 'Сверху', out: 'Вверх', hint: 'выезжает из-за края' },
  { type: 'bottom', in: 'Снизу', out: 'Вниз', hint: 'выезжает из-за края' },
  { type: 'drop', in: 'Падение', out: 'Подброс', hint: 'падает сверху и подпрыгивает' },
  { type: 'spin', in: 'Вращение', out: 'Вращение', hint: 'крутится и растёт' },
];

export const CLIP_ANIM_DEFAULT_DUR = 0.5;

/** Длительность анимации с учётом длины клипа: появление и исчезновение вместе не длиннее клипа. */
export function animDur(a: ClipAnim | undefined, clipDur: number): number {
  if (!a) return 0;
  return Math.max(0.05, Math.min(a.dur, clipDur / 2));
}

export interface AnimGeometry { dx: number; dy: number; drot: number; scale: number; opacity: number }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const smooth = (p: number) => p * p * (3 - 2 * p);
const C1 = 1.70158;
const backOut = (p: number) => 1 + (C1 + 1) * Math.pow(p - 1, 3) + C1 * Math.pow(p - 1, 2);
const N1 = 7.5625;
const D1 = 2.75;
export function bounceOut(p: number): number {
  if (p < 1 / D1) return N1 * p * p;
  if (p < 2 / D1) { const q = p - 1.5 / D1; return N1 * q * q + 0.75; }
  if (p < 2.5 / D1) { const q = p - 2.25 / D1; return N1 * q * q + 0.9375; }
  const q = p - 2.625 / D1;
  return N1 * q * q + 0.984375;
}

/** Вклад одной анимации при «видимости» e: 0 — клипа нет, 1 — он на месте. */
function part(type: ClipAnimType, e: number, g: AnimGeometry): void {
  switch (type) {
    case 'fade': g.opacity *= smooth(e); break;
    case 'zoomin': g.scale *= 0.55 + 0.45 * easeOut(e); g.opacity *= smooth(e); break;
    case 'zoomout': g.scale *= 1 + 0.5 * (1 - easeOut(e)); g.opacity *= smooth(e); break;
    case 'pop': g.scale *= Math.max(0.01, backOut(e)); g.opacity *= clamp01(e * 4); break;
    case 'left': g.dx -= 1 - easeOut(e); break;
    case 'right': g.dx += 1 - easeOut(e); break;
    case 'top': g.dy -= 1 - easeOut(e); break;
    case 'bottom': g.dy += 1 - easeOut(e); break;
    case 'drop': g.dy -= 0.7 * (1 - bounceOut(e)); g.opacity *= clamp01(e * 5); break;
    case 'spin': g.drot -= 180 * (1 - easeOut(e)); g.scale *= 0.3 + 0.7 * easeOut(e); g.opacity *= smooth(e); break;
  }
}

/** Геометрия и прозрачность от анимаций клипа в момент local (сек от начала клипа на таймлайне). */
export function clipAnimAt(c: Pick<MediaClip, 'anim'>, local: number, dur: number): AnimGeometry {
  const g: AnimGeometry = { dx: 0, dy: 0, drot: 0, scale: 1, opacity: 1 };
  const a = c.anim;
  if (!a) return g;
  if (a.in) { const d = animDur(a.in, dur); if (local < d) part(a.in.type, clamp01(local / d), g); }
  if (a.out) { const d = animDur(a.out, dur); if (local > dur - d) part(a.out.type, clamp01((dur - local) / d), g); }
  return g;
}

const MOVES: ClipAnimType[] = ['zoomin', 'zoomout', 'pop', 'left', 'right', 'top', 'bottom', 'drop', 'spin'];
const FADES: ClipAnimType[] = ['fade', 'zoomin', 'zoomout', 'pop', 'drop', 'spin'];
export function animMoves(c: Pick<MediaClip, 'anim'>): boolean {
  return [c.anim?.in, c.anim?.out].some((a) => !!a && MOVES.includes(a.type));
}
export function animFades(c: Pick<MediaClip, 'anim'>): boolean {
  return [c.anim?.in, c.anim?.out].some((a) => !!a && FADES.includes(a.type));
}
/** Наибольшее увеличение от анимаций (чтобы слой в экспорте был достаточно чётким). */
export function animMaxScale(c: Pick<MediaClip, 'anim'>): number {
  let s = 1;
  for (const a of [c.anim?.in, c.anim?.out]) {
    if (a?.type === 'zoomout') s = Math.max(s, 1.5);
    if (a?.type === 'pop') s = Math.max(s, 1.11);
  }
  return s;
}

// ---------- выражения FFmpeg ----------
const f = (n: number) => String(Math.round(n * 1e6) / 1e6);
const cl = (u: string) => `clip(${u}\\,0\\,1)`;
const eOutX = (p: string) => `(1-pow(1-${p}\\,3))`;
const backX = (p: string) => `(1+${f(C1 + 1)}*pow(${p}-1\\,3)+${f(C1)}*pow(${p}-1\\,2))`;
function bounceX(p: string): string {
  const q = (o: number, add: number) => `(${f(N1)}*(${p}-${f(o)})*(${p}-${f(o)})+${f(add)})`;
  return `if(lt(${p}\\,${f(1 / D1)})\\,${f(N1)}*${p}*${p}\\,if(lt(${p}\\,${f(2 / D1)})\\,${q(1.5 / D1, 0.75)}\\,if(lt(${p}\\,${f(2.5 / D1)})\\,${q(2.25 / D1, 0.9375)}\\,${q(2.625 / D1, 0.984375)})))`;
}

interface PartX { dx: string[]; dy: string[]; drot: string[]; scale: string[] }
/** Вклад анимации в выражения: p — выражение видимости 0..1, gate — 1 только в своём отрезке клипа. */
function partX(type: ClipAnimType, p: string, gate: string, x: PartX): void {
  // вне своего отрезка вклад нейтральный: для сдвигов — 0, для масштаба — 1
  const add = (list: string[], v: string) => list.push(`(${gate}*${v})`);
  const mul = (v: string) => x.scale.push(`(1+${gate}*(${v}-1))`);
  switch (type) {
    case 'zoomin': mul(`(0.55+0.45*${eOutX(p)})`); break;
    case 'zoomout': mul(`(1+0.5*(1-${eOutX(p)}))`); break;
    case 'pop': mul(`max(0.01\\,${backX(p)})`); break;
    case 'left': add(x.dx, `(-(1-${eOutX(p)}))`); break;
    case 'right': add(x.dx, `(1-${eOutX(p)})`); break;
    case 'top': add(x.dy, `(-(1-${eOutX(p)}))`); break;
    case 'bottom': add(x.dy, `(1-${eOutX(p)})`); break;
    case 'drop': add(x.dy, `(-0.7*(1-${bounceX(p)}))`); break;
    case 'spin': add(x.drot, `(-180*(1-${eOutX(p)}))`); mul(`(0.3+0.7*${eOutX(p)})`); break;
    default: break;
  }
}

/** То же, что clipAnimAt (без прозрачности — её экспорт задаёт покадрово), для выражений: tv — время от начала клипа. */
export function clipAnimExpr(c: Pick<MediaClip, 'anim'>, tv: string, dur: number): { dx: string; dy: string; drot: string; scale: string } {
  const x: PartX = { dx: [], dy: [], drot: [], scale: [] };
  const a = c.anim;
  if (a?.in) {
    const d = animDur(a.in, dur);
    partX(a.in.type, cl(`${tv}/${f(d)}`), `lt(${tv}\\,${f(d)})`, x);
  }
  if (a?.out) {
    const d = animDur(a.out, dur);
    partX(a.out.type, cl(`(${f(dur)}-${tv})/${f(d)}`), `gt(${tv}\\,${f(dur - d)})`, x);
  }
  const sum = (xs: string[]) => (xs.length ? `(${xs.join('+')})` : '0');
  return { dx: sum(x.dx), dy: sum(x.dy), drot: sum(x.drot), scale: x.scale.length ? `(${x.scale.join('*')})` : '1' };
}
