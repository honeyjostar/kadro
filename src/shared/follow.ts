// Слежение: текст или стикер едет за объектом в видео (лицо, машина, мяч). Трекер даёт рамку объекта в кадре
// исходника; здесь — где этот объект на холсте во времени и ключи положения для того, кто за ним следует.
import { mediaKeyTime, mediaLocalTime, mediaPropsAt, textPropsAt } from './anim';
import { placeOnCanvas, stretchedSize } from './geometry';
import { clipEnd } from './timeline';
import type { BlurBox, Clip, Keyframe, Keyframes, MediaAsset, MediaClip } from './types';

/** Точка объекта на холсте: T — время таймлайна, x, y — доли холста, s — ширина объекта в долях холста. */
export interface PathPt { T: number; x: number; y: number; s: number }

function placement(under: MediaClip, a: Pick<MediaAsset, 'width' | 'height'>, W: number, H: number, T: number) {
  const mp = mediaPropsAt(under, T);
  const ss = stretchedSize(a.width, a.height, under.stretch);
  return placeOnCanvas(W, H, ss.w, ss.h, under.fit, { x: mp.x, y: mp.y, scale: mp.scale, rotation: mp.rotation });
}

/** Рамки трекера (время и доли кадра исходника нижнего клипа) → путь объекта по холсту. */
export function objectPath(under: MediaClip, a: Pick<MediaAsset, 'width' | 'height'>, boxes: BlurBox[], W: number, H: number): PathPt[] {
  return boxes.map((b) => {
    const T = under.start + mediaLocalTime(under, b.t);
    const pl = placement(under, a, W, H, T);
    const r = (pl.rotation * Math.PI) / 180;
    const lx = (b.x - 0.5) * pl.w, ly = (b.y - 0.5) * pl.h;
    return { T, x: (pl.cx + lx * Math.cos(r) - ly * Math.sin(r)) / W, y: (pl.cy + lx * Math.sin(r) + ly * Math.cos(r)) / H, s: (b.w * pl.w) / W };
  });
}

/** Обратно: рамка на холсте (доли) в момент T → доли кадра исходника нижнего клипа. */
export function canvasToSource(under: MediaClip, a: Pick<MediaAsset, 'width' | 'height'>, W: number, H: number, T: number,
  box: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const pl = placement(under, a, W, H, T);
  const r = (-pl.rotation * Math.PI) / 180;
  const dx = box.x * W - pl.cx, dy = box.y * H - pl.cy;
  return {
    x: (dx * Math.cos(r) - dy * Math.sin(r)) / pl.w + 0.5,
    y: (dx * Math.sin(r) + dy * Math.cos(r)) / pl.h + 0.5,
    w: (box.w * W) / pl.w, h: (box.h * H) / pl.h,
  };
}

/** Лишние ключи (почти на прямой между соседями) — прочь. */
export function thinKeys(k: Keyframe[], tol: number): Keyframe[] {
  if (k.length <= 2) return k;
  const out = [k[0]];
  for (let i = 1; i < k.length - 1; i++) {
    const a = out[out.length - 1], c = k[i + 1], m = k[i];
    const v = a.v + ((c.v - a.v) * (m.t - a.t)) / Math.max(1e-9, c.t - a.t);
    if (Math.abs(v - m.v) > tol) out.push(m);
  }
  out.push(k[k.length - 1]);
  return out;
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * Ключи положения (и размера) того, кто едет за объектом. T0 — момент, где объект обвели: в нём тот, кто следует,
 * остаётся на своём месте, дальше смещается так же, как объект. withScale — растёт и уменьшается вместе с ним.
 */
export function followKeys(f: Clip, path: PathPt[], T0: number, withScale: boolean): Keyframes {
  if (!path.length) return {};
  const at = (T: number): PathPt => {
    if (T <= path[0].T) return path[0];
    if (T >= path[path.length - 1].T) return path[path.length - 1];
    let i = 1;
    while (path[i].T < T) i++;
    const a = path[i - 1], b = path[i], k = (T - a.T) / Math.max(1e-9, b.T - a.T);
    return { T, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, s: a.s + (b.s - a.s) * k };
  };
  const p0 = at(T0);
  const start = f.start, end = clipEnd(f);
  const isText = f.type === 'text';
  const base = isText ? textPropsAt(f, T0 - f.start) : mediaPropsAt(f as MediaClip, T0);
  const keyT = (T: number) => r4(isText ? T - start : mediaKeyTime(f as MediaClip, T));
  const pts = path.filter((p) => p.T >= start - 1e-6 && p.T <= end + 1e-6);
  if (!pts.length) return {};
  const x: Keyframe[] = [], y: Keyframe[] = [], s: Keyframe[] = [];
  for (const p of pts) {
    x.push({ t: keyT(p.T), v: r4(base.x + p.x - p0.x) });
    y.push({ t: keyT(p.T), v: r4(base.y + p.y - p0.y) });
    if (withScale && p0.s > 1e-6) s.push({ t: keyT(p.T), v: r4(base.scale * (p.s / p0.s)) });
  }
  const out: Keyframes = { x: thinKeys(x, 0.002), y: thinKeys(y, 0.002) };
  if (withScale && s.length) out.scale = thinKeys(s, 0.004);
  return out;
}
