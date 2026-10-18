// Правка анимируемых свойств из интерфейса: если у свойства есть ключи — ставим ключ в текущем моменте,
// если нет — меняем обычное значение. Так работают и ползунки инспектора, и перетаскивание в плеере.
import { keyframeAt, mediaKeyTime, mediaPropsAt, textPropsAt } from '../shared/anim';
import { findClip, removeKeyframe, setKeyframe, updateClip } from '../shared/timeline';
import type { AnimProp, Clip, MediaClip, Project, TextClip } from '../shared/types';

export const KF_EPS = 1 / 120;

/** Время ключа для момента таймлайна (видео — время исходника, текст — от начала клипа). */
export function keyTime(c: Clip, playhead: number): number {
  return c.type === 'media' ? mediaKeyTime(c, playhead) : playhead - c.start;
}

/** Текущее (видимое) значение свойства. */
export function propValue(c: Clip, prop: AnimProp, playhead: number): number {
  const v = c.type === 'media' ? mediaPropsAt(c, playhead) : textPropsAt(c, playhead - c.start);
  return v[prop];
}

export function isAnimated(c: Clip, prop: AnimProp): boolean {
  return (c.keyframes?.[prop]?.length ?? 0) > 0;
}

export function hasKeyHere(c: Clip, prop: AnimProp, playhead: number): boolean {
  return !!keyframeAt(c.keyframes?.[prop], keyTime(c, playhead), KF_EPS);
}

function setBase(p: Project, c: Clip, prop: AnimProp, v: number): Project {
  if (c.type === 'media') {
    if (prop === 'opacity') return updateClip(p, c.id, { opacity: v } as Partial<MediaClip>);
    return updateClip(p, c.id, { transform: { ...c.transform, [prop]: v } } as Partial<MediaClip>);
  }
  if (prop === 'x' || prop === 'y') return updateClip(p, c.id, { [prop]: v } as Partial<TextClip>);
  return updateClip(p, c.id, { [prop]: v } as Partial<TextClip>);
}

/** Записать значения свойств в момент playhead. */
export function writeProps(p: Project, c: Clip, values: Partial<Record<AnimProp, number>>, playhead: number): Project {
  let out = p;
  for (const [prop, v] of Object.entries(values) as [AnimProp, number][]) {
    const cur = findClip(out, c.id)?.clip ?? c; // текущая версия клипа: несколько свойств подряд не затирают друг друга
    out = isAnimated(cur, prop) ? setKeyframe(out, c.id, prop, keyTime(cur, playhead), v, KF_EPS) : setBase(out, cur, prop, v);
  }
  return out;
}

/** Ромбик: поставить ключ с текущим значением или убрать ключ в этом моменте. */
export function toggleKey(p: Project, c: Clip, prop: AnimProp, playhead: number): Project {
  const t = keyTime(c, playhead);
  if (keyframeAt(c.keyframes?.[prop], t, KF_EPS)) return removeKeyframe(p, c.id, prop, t, KF_EPS);
  return setKeyframe(p, c.id, prop, t, propValue(c, prop, playhead), KF_EPS);
}

/** Все моменты ключей клипа на таймлайне (для отметок и перехода между ключами). */
export function keyTimesOnTimeline(c: Clip, prop?: AnimProp): number[] {
  const out = new Set<number>();
  const props = prop ? [prop] : (Object.keys(c.keyframes ?? {}) as AnimProp[]);
  for (const pr of props) {
    for (const k of c.keyframes?.[pr] ?? []) {
      const t = c.type === 'media' ? c.start + (k.t - c.in) / c.speed : c.start + k.t;
      out.add(Math.round(t * 1e6) / 1e6);
    }
  }
  return [...out].sort((a, b) => a - b);
}
