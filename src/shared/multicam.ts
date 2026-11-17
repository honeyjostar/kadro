// Подкаст с нескольких камер: после синхронизации по звуку камера сама переключается на того, кто говорит.
// Громкость каждого ракурса (свой микрофон или микрофон камеры у говорящего) сравнивается со своей обычной
// громкостью; кадр — у того, кто заметно громче, но не чаще раза в minShot секунд. Говорят вместе или молчат —
// общий план (ракурс 0, основная дорожка). Чистые функции — тестируются без программы.
import { clipEnd, deleteClips, findClip, splitClip } from './timeline';
import type { Project } from './types';

export interface SwitchOpts {
  /** шаг громкости, с */
  step: number;
  /** короче этого кадр не бывает, с */
  minShot: number;
  /** новый говорящий должен звучать столько, чтобы переключиться, с */
  hold: number;
  /** склейка чуть раньше первых слов, с */
  lead: number;
  /** когда говорят вместе — общий план (ракурс 0) */
  wideOnBoth: boolean;
}
export const SWITCH_DEFAULTS: SwitchOpts = { step: 0.1, minShot: 2, hold: 0.7, lead: 0.15, wideOnBoth: true };

export interface Shot { t0: number; t1: number; angle: number }

function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * q)))];
}

/** Кто говорит в каждый шаг: номер ракурса, -1 — тишина, -2 — говорят вместе. */
export function speakers(levels: number[][], o: Pick<SwitchOpts, 'step'> = SWITCH_DEFAULTS): number[] {
  const n = Math.min(...levels.map((l) => l.length));
  if (!Number.isFinite(n) || n <= 0) return [];
  // своя «обычная громкость речи» у каждого ракурса — микрофоны и камеры пишут по-разному
  const norm = levels.map((l) => {
    const loud = l.slice(0, n).filter((v) => v > 0.004);
    const ref = Math.max(1e-4, quantile(loud, 0.75));
    // сглаживание по полсекунды
    const w = Math.max(1, Math.round(0.5 / o.step));
    const out = new Array<number>(n).fill(0);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += l[i];
      if (i >= w) acc -= l[i - w];
      out[i] = acc / Math.min(i + 1, w) / ref;
    }
    return out;
  });
  const who: number[] = [];
  for (let i = 0; i < n; i++) {
    let a = -1, b = -1;
    for (let k = 0; k < norm.length; k++) {
      const v = norm[k][i];
      if (a < 0 || v > norm[a][i]) { b = a; a = k; } else if (b < 0 || v > norm[b][i]) b = k;
    }
    const top = norm[a][i];
    if (top < 0.35) { who.push(-1); continue; }
    const second = b >= 0 ? norm[b][i] : 0;
    who.push(second >= 0.85 * top && second >= 0.35 ? -2 : a);
  }
  return who;
}

/** План переключений на отрезке [0, n·step): кадры не короче minShot, говорящий держится hold, склейка — с lead. */
export function switchPlan(levels: number[][], o: SwitchOpts = SWITCH_DEFAULTS): Shot[] {
  const who = speakers(levels, o);
  const n = who.length;
  if (!n) return [];
  const hold = Math.max(1, Math.round(o.hold / o.step));
  const want = (w: number, cur: number) => (w === -1 ? cur : w === -2 ? (o.wideOnBoth ? 0 : cur) : w);
  // с кого начать: первый, кто заговорил
  let cur = 0;
  for (const w of who) if (w >= 0) { cur = w; break; }
  const shots: Shot[] = [{ t0: 0, t1: 0, angle: cur }];
  let runAngle = cur, runStart = 0;
  for (let i = 0; i < n; i++) {
    const w = want(who[i], cur);
    if (w !== runAngle) { runAngle = w; runStart = i; }
    if (runAngle !== cur && i - runStart + 1 >= hold) {
      const last = shots[shots.length - 1];
      const at = Math.max(last.t0 + o.minShot, runStart * o.step - o.lead);
      if (at <= i * o.step + 1e-9) {
        const t = Math.round(at * 1000) / 1000;
        last.t1 = t;
        shots.push({ t0: t, t1: 0, angle: runAngle });
        cur = runAngle;
      }
    }
  }
  shots[shots.length - 1].t1 = Math.round(n * o.step * 1000) / 1000;
  // слишком короткий последний кадр — к предыдущему
  if (shots.length > 1 && shots[shots.length - 1].t1 - shots[shots.length - 1].t0 < o.minShot / 2) {
    const tail = shots.pop()!;
    shots[shots.length - 1].t1 = tail.t1;
  }
  return shots;
}

/**
 * Оставить у клипа только куски времени keep (таймлайн): разрезать на границах, лишнее убрать.
 * Для ракурсов на дорожках наложений — где их нет, видна основная дорожка (общий план).
 */
export function keepOnly(p: Project, clipId: string, keep: [number, number][]): Project {
  const f = findClip(p, clipId);
  if (!f) return p;
  const s = f.clip.start, e = clipEnd(f.clip);
  const cuts = [...new Set(keep.flatMap(([a, b]) => [a, b]).filter((t) => t > s + 0.05 && t < e - 0.05))].sort((a, b) => a - b);
  let q = p;
  const pieces = [clipId];
  let cur = clipId;
  for (const t of cuts) {
    const r = splitClip(q, cur, t);
    if (!r.clipId) continue;
    q = r.project;
    pieces.push(r.clipId);
    cur = r.clipId;
  }
  const drop = pieces.filter((id) => {
    const c = findClip(q, id)?.clip;
    if (!c) return false;
    const mid = (c.start + clipEnd(c)) / 2;
    return !keep.some(([a, b]) => mid > a && mid < b);
  });
  return drop.length ? deleteClips(q, drop) : q;
}

/** Куски времени, где виден ракурс k (таймлайн: план начинается в t0). */
export function rangesOf(shots: Shot[], k: number, t0: number): [number, number][] {
  return shots.filter((s) => s.angle === k).map((s) => [t0 + s.t0, t0 + s.t1] as [number, number]);
}
