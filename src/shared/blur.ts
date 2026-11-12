// Скрыть лица и номера: области размытия, которые едут за объектом.
// Лица находит нейросеть YuNet (кадры раз в 1/8 с), номер или любой предмет — человек обводит рамкой, дальше следит трекер.
// Здесь чистые функции: разбор ответа YuNet, связывание находок в «дорожки» объектов, рамка в момент t
// и маска размытия — по ней рисуется и превью, и экспорт, поэтому края совпадают.
import type { BlurBox, BlurRegion, BlurStyle } from './types';

/** Находка детектора: центр и размер в долях кадра, уверенность 0..1. */
export interface Det { x: number; y: number; w: number; h: number; score: number }

export const YUNET_SIZE = 640;
export const FACE_MIN_SCORE = 0.6;

/**
 * Ответ YuNet (вход 640×640, BGR 0..255) → лица в пикселях входа.
 * Как в OpenCV FaceDetectorYN: score = √(cls·obj), центр = (клетка + сдвиг)·шаг, размер = e^v·шаг.
 */
export function decodeYunet(out: Record<string, Float32Array>, size = YUNET_SIZE, minScore = FACE_MIN_SCORE): Det[] {
  const dets: Det[] = [];
  for (const s of [8, 16, 32]) {
    const cls = out[`cls_${s}`], obj = out[`obj_${s}`], bb = out[`bbox_${s}`];
    if (!cls || !obj || !bb) continue;
    const cols = Math.floor(size / s), rows = Math.floor(size / s);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const score = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
        if (score < minScore) continue;
        const cx = (c + bb[i * 4]) * s, cy = (r + bb[i * 4 + 1]) * s;
        const w = Math.exp(bb[i * 4 + 2]) * s, h = Math.exp(bb[i * 4 + 3]) * s;
        dets.push({ x: cx, y: cy, w, h, score });
      }
    }
  }
  return nms(dets, 0.3);
}

/** Пересечение к объединению двух рамок (центр + размер). */
export function iou(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const ix = Math.max(0, Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2));
  const iy = Math.max(0, Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2));
  const inter = ix * iy;
  const u = a.w * a.h + b.w * b.h - inter;
  return u > 0 ? inter / u : 0;
}

/** Убрать дубли: из пересекающихся рамок остаётся самая уверенная. */
export function nms(dets: Det[], thr: number): Det[] {
  const s = [...dets].sort((a, b) => b.score - a.score);
  const out: Det[] = [];
  for (const d of s) if (out.every((o) => iou(o, d) <= thr)) out.push(d);
  return out;
}

/** Кадр с находками; время — исходника. */
export interface DetFrame { t: number; dets: Det[] }

/**
 * Находки по кадрам → дорожки объектов. Соседние находки одного лица связываются по пересечению рамок
 * (или близости центров); пропуск до maxGap секунд заполняется, одиночные слабые находки отбрасываются.
 */
export function linkTracks(frames: DetFrame[], opts: { maxGap?: number; minScoreSingle?: number } = {}): BlurBox[][] {
  const maxGap = opts.maxGap ?? 0.8;
  const single = opts.minScoreSingle ?? 0.85;
  interface Tr { boxes: BlurBox[]; best: number; lastT: number; last: Det; vx: number; vy: number }
  const live: Tr[] = [];
  const done: Tr[] = [];
  const fs = [...frames].sort((a, b) => a.t - b.t);
  for (const f of fs) {
    for (let i = live.length - 1; i >= 0; i--) if (f.t - live[i].lastT > maxGap + 1e-6) done.push(...live.splice(i, 1));
    const pairs: { ti: number; di: number; s: number }[] = [];
    live.forEach((tr, ti) => {
      const dt = f.t - tr.lastT;
      const pred = { ...tr.last, x: tr.last.x + tr.vx * dt, y: tr.last.y + tr.vy * dt };
      f.dets.forEach((d, di) => {
        const o = iou(pred, d);
        const dist = Math.hypot(pred.x - d.x, pred.y - d.y) / Math.max(1e-6, Math.max(pred.w, pred.h, d.w, d.h));
        const sizeOk = d.w / pred.w < 2.2 && pred.w / d.w < 2.2;
        if (sizeOk && (o > 0.15 || dist < 0.7)) pairs.push({ ti, di, s: o + (1 - Math.min(1, dist)) * 0.5 });
      });
    });
    pairs.sort((a, b) => b.s - a.s);
    const usedT = new Set<number>(), usedD = new Set<number>();
    for (const p of pairs) {
      if (usedT.has(p.ti) || usedD.has(p.di)) continue;
      usedT.add(p.ti); usedD.add(p.di);
      const tr = live[p.ti], d = f.dets[p.di];
      const dt = Math.max(1e-3, f.t - tr.lastT);
      tr.vx = 0.5 * tr.vx + 0.5 * (d.x - tr.last.x) / dt;
      tr.vy = 0.5 * tr.vy + 0.5 * (d.y - tr.last.y) / dt;
      tr.last = d; tr.lastT = f.t; tr.best = Math.max(tr.best, d.score);
      tr.boxes.push({ t: f.t, x: d.x, y: d.y, w: d.w, h: d.h });
    }
    f.dets.forEach((d, di) => {
      if (usedD.has(di)) return;
      live.push({ boxes: [{ t: f.t, x: d.x, y: d.y, w: d.w, h: d.h }], best: d.score, lastT: f.t, last: d, vx: 0, vy: 0 });
    });
  }
  done.push(...live);
  return done
    .filter((tr) => tr.boxes.length >= 2 || tr.best >= single)
    .sort((a, b) => a.boxes[0].t - b.boxes[0].t)
    .map((tr) => smoothBoxes(tr.boxes));
}

/** Сгладить дрожание рамки (скользящее среднее по 3 соседям). */
export function smoothBoxes(b: BlurBox[]): BlurBox[] {
  if (b.length < 3) return b.map((x) => ({ ...x }));
  return b.map((x, i) => {
    const w = b.slice(Math.max(0, i - 1), Math.min(b.length, i + 2));
    const avg = (k: 'x' | 'y' | 'w' | 'h') => w.reduce((s, q) => s + q[k], 0) / w.length;
    return { t: x.t, x: avg('x'), y: avg('y'), w: avg('w'), h: avg('h') };
  });
}

/** Лицо у YuNet — от бровей до подбородка; прячем с запасом: лоб, волосы, уши. */
export function padFace(b: BlurBox): BlurBox {
  return { t: b.t, x: b.x, y: b.y - b.h * 0.06, w: b.w * 1.3, h: b.h * 1.5 };
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
/** Округлить и убрать лишние точки (почти на прямой между соседями) — проект не раздувается. */
export function compactBoxes(b: BlurBox[], tol = 0.004): BlurBox[] {
  const pts = b.map((x) => ({ t: Math.round(x.t * 1000) / 1000, x: r4(x.x), y: r4(x.y), w: r4(x.w), h: r4(x.h) }));
  if (pts.length <= 2) return pts;
  const keep = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = keep[keep.length - 1], c = pts[i + 1], m = pts[i];
    const k = (m.t - a.t) / Math.max(1e-9, c.t - a.t);
    const off = Math.max(...(['x', 'y', 'w', 'h'] as const).map((p) => Math.abs(a[p] + (c[p] - a[p]) * k - m[p])));
    if (off > tol) keep.push(m);
  }
  keep.push(pts[pts.length - 1]);
  return keep;
}

/** Сколько секунд держать рамку до первой и после последней точки (между кадрами детектора). */
export const BLUR_HOLD = 0.2;

/** Рамка области в момент t исходника (между точками — по прямой), вне её времени — null. */
export function boxAt(r: BlurRegion, t: number): BlurBox | null {
  const b = r.boxes;
  if (!b.length) return null;
  const hold = r.hold ?? BLUR_HOLD;
  if (t < b[0].t - hold || t > b[b.length - 1].t + hold) return null;
  if (t <= b[0].t) return { ...b[0], t };
  if (t >= b[b.length - 1].t) return { ...b[b.length - 1], t };
  let lo = 0, hi = b.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (b[m].t <= t) lo = m; else hi = m; }
  const a = b[lo], c = b[hi];
  const k = (t - a.t) / Math.max(1e-9, c.t - a.t);
  return { t, x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, w: a.w + (c.w - a.w) * k, h: a.h + (c.h - a.h) * k };
}

/** Растушёвка края — доля размера области (снаружи; внутри области — полностью скрыто). */
export const BLUR_FEATHER = 0.22;

/** Маска (0..255 по строкам, w × h) для областей в момент t: эллипс у лица, прямоугольник у предмета. */
export function blurMaskBytes(regions: BlurRegion[], t: number, w: number, h: number, out?: Uint8Array): Uint8Array {
  const m = out ?? new Uint8Array(w * h);
  if (out) m.fill(0);
  for (const r of regions) {
    const b = boxAt(r, t);
    if (!b) continue;
    const rx = Math.max(0.5, (b.w * w) / 2), ry = Math.max(0.5, (b.h * h) / 2);
    const cx = b.x * w, cy = b.y * h;
    const F = 1 + BLUR_FEATHER;
    const x0 = Math.max(0, Math.floor(cx - rx * F - 1)), x1 = Math.min(w - 1, Math.ceil(cx + rx * F + 1));
    const y0 = Math.max(0, Math.floor(cy - ry * F - 1)), y1 = Math.min(h - 1, Math.ceil(cy + ry * F + 1));
    const rect = r.shape === 'rect';
    for (let y = y0; y <= y1; y++) {
      const dy = Math.abs(y + 0.5 - cy) / ry;
      for (let x = x0; x <= x1; x++) {
        const dx = Math.abs(x + 0.5 - cx) / rx;
        const d = rect ? Math.max(dx, dy) : Math.hypot(dx, dy); // 1 — край области
        if (d >= F) continue;
        const p = d <= 1 ? 1 : 1 - (d - 1) / BLUR_FEATHER;
        const a = Math.round(p * p * (3 - 2 * p) * 255);
        const i = y * w + x;
        if (a > m[i]) m[i] = a;
      }
    }
  }
  return m;
}

/** Области с одинаковым видом скрытия рисуются одним проходом. */
export function blurGroups(regions: BlurRegion[] | undefined): { style: BlurStyle; strength: number; regions: BlurRegion[]; key: string }[] {
  const out: { style: BlurStyle; strength: number; regions: BlurRegion[]; key: string }[] = [];
  for (const r of regions ?? []) {
    if (!r.boxes.length || r.off) continue;
    const key = `${r.style}:${r.strength.toFixed(2)}`;
    const g = out.find((x) => x.key === key);
    if (g) g.regions.push(r);
    else out.push({ style: r.style, strength: r.strength, regions: [r], key });
  }
  return out;
}

/** Сила размытия → радиус в долях меньшей стороны слоя (как у boxblur в экспорте). */
export const blurRadius = (strength: number): number => 0.012 + 0.045 * Math.min(1, Math.max(0, strength));
/** Размер «пикселя» мозаики в долях меньшей стороны слоя. */
export const mosaicBlock = (strength: number): number => 0.014 + 0.04 * Math.min(1, Math.max(0, strength));

/** Размер маски для экспорта и превью: длинная сторона ≤ 320 — края мягкие, считать быстро. */
export function maskSize(w: number, h: number, long = 320): { w: number; h: number } {
  const k = Math.min(1, long / Math.max(w, h));
  return { w: Math.max(2, Math.round(w * k)), h: Math.max(2, Math.round(h * k)) };
}

/** Новая область лица или предмета. */
export function newRegion(id: string, kind: BlurRegion['kind'], boxes: BlurBox[], style: BlurStyle = 'blur'): BlurRegion {
  return { id, kind, style, strength: 0.7, shape: kind === 'face' ? 'ellipse' : 'rect', boxes: compactBoxes(boxes) };
}

/** Время, когда область видна (от первой до последней рамки). */
export function regionSpan(r: BlurRegion): [number, number] {
  return r.boxes.length ? [r.boxes[0].t, r.boxes[r.boxes.length - 1].t] : [0, 0];
}
