// Реверс и кривая скорости. Клип с такой обработкой показывает пересчитанную копию фрагмента
// (отдельный файл), а здесь — общая математика: как время исходника переходит во время копии и обратно,
// пресеты кривых и выражения для FFmpeg, которые строят копию.
import { tx } from './i18n';
import type { Keyframes, MediaClip, RampPoint, Retime } from './types';

export const RAMP_MIN = 0.1;
export const RAMP_MAX = 10;

export const RAMP_PRESETS: { id: string; label: string; hint: string; points: RampPoint[] }[] = [
  { id: 'hero', label: tx('Герой'), hint: tx('Замедление в середине'), points: [{ x: 0, v: 1 }, { x: 0.35, v: 1 }, { x: 0.5, v: 0.25 }, { x: 0.65, v: 1 }, { x: 1, v: 1 }] },
  { id: 'bullet', label: tx('Пуля'), hint: tx('Быстро — очень медленно — быстро'), points: [{ x: 0, v: 3 }, { x: 0.4, v: 3 }, { x: 0.5, v: 0.2 }, { x: 0.6, v: 3 }, { x: 1, v: 3 }] },
  { id: 'montage', label: tx('Монтаж'), hint: tx('Рывки скорости'), points: [{ x: 0, v: 1 }, { x: 0.2, v: 3 }, { x: 0.4, v: 0.5 }, { x: 0.6, v: 3 }, { x: 0.8, v: 0.5 }, { x: 1, v: 1 }] },
  { id: 'jump', label: tx('Рывок'), hint: tx('Медленно, резкий скачок, медленно'), points: [{ x: 0, v: 0.6 }, { x: 0.42, v: 0.6 }, { x: 0.5, v: 5 }, { x: 0.58, v: 0.6 }, { x: 1, v: 0.6 }] },
  { id: 'rampin', label: tx('Разгон'), hint: tx('Начало быстро, потом обычная скорость'), points: [{ x: 0, v: 4 }, { x: 0.4, v: 1 }, { x: 1, v: 1 }] },
  { id: 'rampout', label: tx('Ускорение'), hint: tx('Обычная скорость, к концу быстро'), points: [{ x: 0, v: 1 }, { x: 0.6, v: 1 }, { x: 1, v: 4 }] },
];

/** Приводит точки к порядку: x от 0 до 1, первая на 0, последняя на 1, скорость в пределах. */
export function normalizeRamp(points: RampPoint[]): RampPoint[] {
  const pts = points
    .map((p) => ({ x: Math.min(1, Math.max(0, p.x)), v: Math.min(RAMP_MAX, Math.max(RAMP_MIN, p.v)) }))
    .sort((a, b) => a.x - b.x);
  if (!pts.length) return [{ x: 0, v: 1 }, { x: 1, v: 1 }];
  if (pts[0].x > 0) pts.unshift({ x: 0, v: pts[0].v });
  if (pts[pts.length - 1].x < 1) pts.push({ x: 1, v: pts[pts.length - 1].v });
  // слишком близкие точки по x — оставляем последнюю
  const out: RampPoint[] = [];
  for (const p of pts) {
    if (out.length && p.x - out[out.length - 1].x < 0.01 && p.x < 1) continue;
    if (out.length && p.x - out[out.length - 1].x < 0.01) out.pop();
    out.push(p);
  }
  return out;
}

/** Скорость кривой в точке x (0..1), линейно между точками. */
export function rampSpeedAt(points: RampPoint[], x: number): number {
  if (x <= points[0].x) return points[0].v;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]; const b = points[i + 1];
    if (x <= b.x) return b.x - a.x < 1e-9 ? b.v : a.v + ((b.v - a.v) * (x - a.x)) / (b.x - a.x);
  }
  return points[points.length - 1].v;
}

interface Seg { s0: number; s1: number; v0: number; k: number; t0: number; t1: number }

/** Отображение «секунда фрагмента u (0..L) → секунда копии τ» для кривой скорости. */
export class RampMap {
  readonly segs: Seg[] = [];
  readonly total: number;
  constructor(readonly points: RampPoint[], readonly L: number) {
    let t = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const s0 = points[i].x * L; const s1 = points[i + 1].x * L;
      if (s1 - s0 < 1e-9) continue;
      const v0 = points[i].v; const v1 = points[i + 1].v;
      const k = (v1 - v0) / (s1 - s0);
      const seg: Seg = { s0, s1, v0, k, t0: t, t1: 0 };
      seg.t1 = t + segTime(seg, s1);
      t = seg.t1;
      this.segs.push(seg);
    }
    this.total = t;
  }
  /** τ(u) — с продолжением за края (постоянной крайней скоростью). */
  forward(u: number): number {
    const S = this.segs;
    if (!S.length) return u;
    if (u <= 0) return u / S[0].v0;
    for (const g of S) if (u <= g.s1) return g.t0 + segTime(g, u);
    const last = S[S.length - 1];
    return this.total + (u - this.L) / (last.v0 + last.k * (last.s1 - last.s0));
  }
  /** u(τ) — обратное отображение. */
  inverse(t: number): number {
    const S = this.segs;
    if (!S.length) return t;
    if (t <= 0) return t * S[0].v0;
    for (const g of S) {
      if (t <= g.t1) {
        const d = t - g.t0;
        return g.s0 + (Math.abs(g.k) < 1e-9 ? g.v0 * d : (g.v0 * (Math.exp(g.k * d) - 1)) / g.k);
      }
    }
    const last = S[S.length - 1];
    return this.L + (t - this.total) * (last.v0 + last.k * (last.s1 - last.s0));
  }
}
function segTime(g: Seg, s: number): number {
  const ds = s - g.s0;
  if (Math.abs(g.k) < 1e-9) return ds / g.v0;
  return Math.log((g.v0 + g.k * ds) / g.v0) / g.k;
}

/** Длина копии в секундах. */
export function retimeDuration(r: Retime): number {
  const L = r.out - r.in;
  return r.ramp ? new RampMap(r.ramp, L).total : L;
}
/** Время исходника s → время копии. */
export function retimeForward(r: Retime, s: number): number {
  const u = r.reverse ? r.out - s : s - r.in;
  return r.ramp ? new RampMap(r.ramp, r.out - r.in).forward(u) : u;
}
/** Время копии τ → время исходника. */
export function retimeBackward(r: Retime, t: number): number {
  const u = r.ramp ? new RampMap(r.ramp, r.out - r.in).inverse(t) : t;
  return r.reverse ? r.out - u : r.in + u;
}

/** Какой кусок исходника сейчас показывает клип (для обработанного клипа — через обратное отображение). */
export function originalRange(c: MediaClip): { assetId: string; in: number; out: number } {
  if (!c.retime) return { assetId: c.assetId, in: c.in, out: c.out };
  const a = retimeBackward(c.retime, c.in);
  const b = retimeBackward(c.retime, c.out);
  const r = c.retime;
  return { assetId: r.assetId, in: Math.max(r.in, Math.min(a, b)), out: Math.min(r.out, Math.max(a, b)) };
}

/** Переносит ключевые кадры клипа (время исходника) из старого отображения в новое. */
export function remapKeyframes(kfs: Keyframes | undefined, from: Retime | undefined, to: Retime | undefined): Keyframes | undefined {
  if (!kfs) return kfs;
  const out: Keyframes = {};
  for (const [prop, list] of Object.entries(kfs) as [keyof Keyframes, Keyframes[keyof Keyframes]][]) {
    if (!list?.length) continue;
    out[prop] = list
      .map((k) => {
        const s = from ? retimeBackward(from, k.t) : k.t;
        const t = to ? retimeForward(to, s) : s;
        return { ...k, t: Math.round(t * 1e6) / 1e6 };
      })
      .sort((a, b) => a.t - b.t);
  }
  return out;
}

// ---------- FFmpeg ----------
const fmt = (n: number) => String(Math.round(n * 1e6) / 1e6);

/** Выражение setpts: новое время кадра (в секундах) от времени кадра T во фрагменте. */
export function rampPtsExpr(points: RampPoint[], L: number): string {
  const m = new RampMap(points, L);
  const piece = (g: Seg) => (Math.abs(g.k) < 1e-9
    ? `(${fmt(g.t0)}+(T-${fmt(g.s0)})/${fmt(g.v0)})`
    : `(${fmt(g.t0)}+log((${fmt(g.v0)}+${fmt(g.k)}*(T-${fmt(g.s0)}))/${fmt(g.v0)})/${fmt(g.k)})`);
  let expr = '';
  const S = m.segs;
  for (let i = S.length - 1; i >= 0; i--) {
    expr = i === S.length - 1 ? piece(S[i]) : `if(lt(T\\,${fmt(S[i].s1)})\\,${piece(S[i])}\\,${expr})`;
  }
  return expr || 'T';
}

/** Команды asendcmd для четырёх atempo подряд (каждое берёт корень 4-й степени скорости: 0.1…10 укладывается в 0.5…2). */
export function rampTempoCommands(points: RampPoint[], L: number, step = 0.05): { first: number; cmds: string } {
  const m = new RampMap(points, L);
  const n = Math.max(1, Math.ceil(L / step));
  const parts: string[] = [];
  let first = 1;
  for (let i = 0; i < n; i++) {
    const a = (i * L) / n; const b = ((i + 1) * L) / n;
    const v = (b - a) / Math.max(1e-6, m.forward(b) - m.forward(a)); // средняя скорость куска — точная длина
    const q = Math.pow(v, 0.25);
    if (i === 0) first = q;
    parts.push(`${fmt(a)} ${[0, 1, 2, 3].map((j) => `atempo@rt${j} tempo ${fmt(q)}`).join('\\,')}`);
  }
  return { first, cmds: parts.join(';') };
}
