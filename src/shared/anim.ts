// Ключевые кадры: интерполяция значений во времени. Одна математика для превью (canvas) и экспорта
// (выражения FFmpeg генерируются из тех же ключей — см. kfExpr).
import type { AnimProp, Keyframe, Keyframes, MediaClip, TextClip } from './types';

export const ANIM_PROPS: AnimProp[] = ['x', 'y', 'scale', 'rotation', 'opacity'];

const smooth = (p: number) => p * p * (3 - 2 * p);

/** Значение по ключам в момент t (t в тех же единицах, что и ключи). Без ключей — base. */
export function valueAt(kfs: Keyframe[] | undefined, base: number, t: number): number {
  if (!kfs || kfs.length === 0) return base;
  if (t <= kfs[0].t) return kfs[0].v;
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t < b.t) {
      const p0 = (t - a.t) / Math.max(1e-9, b.t - a.t);
      const p = a.ease === 'smooth' ? smooth(p0) : p0;
      return a.v + (b.v - a.v) * p;
    }
  }
  return last.v;
}

export function hasAnim(k?: Keyframes): boolean {
  return !!k && ANIM_PROPS.some((p) => (k[p]?.length ?? 0) > 0);
}

/** Поставить/обновить ключ (с допуском eps по времени). Возвращает новый массив, отсортированный. */
export function putKeyframe(list: Keyframe[] | undefined, t: number, v: number, eps: number, ease: Keyframe['ease'] = 'smooth'): Keyframe[] {
  const out = (list ?? []).filter((k) => Math.abs(k.t - t) > eps);
  out.push({ t: Math.round(t * 1e6) / 1e6, v, ease });
  return out.sort((a, b) => a.t - b.t);
}
export function dropKeyframe(list: Keyframe[] | undefined, t: number, eps: number): Keyframe[] {
  return (list ?? []).filter((k) => Math.abs(k.t - t) > eps);
}
export function keyframeAt(list: Keyframe[] | undefined, t: number, eps: number): Keyframe | undefined {
  return list?.find((k) => Math.abs(k.t - t) <= eps);
}

// ---------- видео и фото ----------
export interface MediaProps { x: number; y: number; scale: number; rotation: number; opacity: number }

/** Время ключей клипа (время исходника) для момента таймлайна. */
export function mediaKeyTime(c: MediaClip, timelineT: number): number {
  return c.in + (timelineT - c.start) * c.speed;
}
/** Обратно: время ключа → время от начала клипа на таймлайне. */
export function mediaLocalTime(c: MediaClip, keyT: number): number {
  return (keyT - c.in) / c.speed;
}

export function mediaBase(c: MediaClip): MediaProps {
  return { x: c.transform.x, y: c.transform.y, scale: c.transform.scale, rotation: c.transform.rotation, opacity: c.opacity ?? 1 };
}

export function mediaPropsAt(c: MediaClip, timelineT: number): MediaProps {
  const b = mediaBase(c);
  const k = c.keyframes;
  if (!hasAnim(k)) return b;
  const s = mediaKeyTime(c, timelineT);
  return {
    x: valueAt(k!.x, b.x, s), y: valueAt(k!.y, b.y, s), scale: valueAt(k!.scale, b.scale, s),
    rotation: valueAt(k!.rotation, b.rotation, s), opacity: valueAt(k!.opacity, b.opacity, s),
  };
}

/** Наибольший масштаб клипа за время показа (для качества при экспорте). */
export function maxScale(c: MediaClip): number {
  const b = c.transform.scale;
  const ks = c.keyframes?.scale;
  return Math.max(b, ...(ks?.map((k) => k.v) ?? [b]));
}

// ---------- текст ----------
export interface TextProps { x: number; y: number; scale: number; rotation: number; opacity: number }

export function textBase(c: TextClip): TextProps {
  return { x: c.x, y: c.y, scale: c.scale ?? 1, rotation: c.rotation ?? 0, opacity: c.opacity ?? 1 };
}

/** Свойства текста в момент «от начала клипа» (без анимаций появления — их добавляет textRender). */
export function textPropsAt(c: TextClip, local: number): TextProps {
  const b = textBase(c);
  const k = c.keyframes;
  if (!hasAnim(k)) return b;
  return {
    x: valueAt(k!.x, b.x, local), y: valueAt(k!.y, b.y, local), scale: valueAt(k!.scale, b.scale, local),
    rotation: valueAt(k!.rotation, b.rotation, local), opacity: valueAt(k!.opacity, b.opacity, local),
  };
}

// ---------- выражения FFmpeg ----------
const f = (n: number) => {
  const s = (Math.round(n * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, '');
  return s === '-0' || s === '' ? '0' : s;
};

/**
 * Выражение FFmpeg для значения по ключам как функции переменной tv (например «(in/30)» — время от начала клипа).
 * map переводит время ключа в ту же шкалу, что и tv.
 */
export function kfExpr(kfs: Keyframe[] | undefined, base: number, tv: string, map: (t: number) => number = (t) => t): string {
  if (!kfs || kfs.length === 0) return f(base);
  const pts = kfs.map((k) => ({ t: map(k.t), v: k.v, ease: k.ease }));
  if (pts.length === 1) return f(pts[0].v);
  let expr = f(pts[pts.length - 1].v);
  for (let i = pts.length - 2; i >= 0; i--) {
    const a = pts[i];
    const b = pts[i + 1];
    const d = Math.max(1e-9, b.t - a.t);
    const p = `((${tv})-${f(a.t)})/${f(d)}`;
    const pe = a.ease === 'smooth' ? `(${p})*(${p})*(3-2*(${p}))` : p;
    const seg = `${f(a.v)}+(${f(b.v - a.v)})*${pe}`;
    expr = `if(lt(${tv}\\,${f(b.t)})\\,${seg}\\,${expr})`;
  }
  return `if(lt(${tv}\\,${f(pts[0].t)})\\,${f(pts[0].v)}\\,${expr})`;
}
