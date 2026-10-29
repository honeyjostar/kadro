// «Копировать / вставить параметры» (Ctrl+Shift+C, Ctrl+Shift+V): что можно перенести с одного клипа на
// другой — по группам, как в Premiere. ИИ-обработку (фон, стабилизация, ретушь, голос) не переносим: это
// готовые копии фрагмента конкретного видео.
import { DEFAULT_COLOR, DEFAULT_TRANSFORM } from './defaults';
import { findClip, updateClip } from './timeline';
import type { Clip, MediaClip, Project, TextClip } from './types';

export type AttrGroup = 'frame' | 'keys' | 'anim' | 'color' | 'fx' | 'mask' | 'speed' | 'audio' | 'transition' | 'style';
export const MEDIA_GROUPS: AttrGroup[] = ['frame', 'keys', 'anim', 'color', 'fx', 'mask', 'speed', 'audio', 'transition'];
export const TEXT_GROUPS: AttrGroup[] = ['style', 'frame', 'keys', 'anim'];

export interface ClipAttrs {
  kind: 'media' | 'text';
  /** Откуда скопировано (для окна вставки). */
  from: string;
  values: Partial<Record<AttrGroup, Record<string, unknown>>>;
  /** Значения по умолчанию — в окне такие группы без галочки. */
  plain: AttrGroup[];
}

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const pick = (c: object, keys: string[]): Record<string, unknown> => Object.fromEntries(keys.map((k) => [k, clone((c as Record<string, unknown>)[k])]));
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const MEDIA_KEYS: Partial<Record<AttrGroup, string[]>> = {
  frame: ['fit', 'transform', 'opacity', 'tilt', 'pin', 'blend'],
  keys: ['keyframes'],
  anim: ['anim'],
  color: ['color', 'grade'],
  fx: ['effects'],
  mask: ['mask', 'chroma'],
  speed: ['speed'],
  audio: ['volume', 'muted', 'fadeIn', 'fadeOut'],
  transition: ['transitionOut'],
};
const TEXT_KEYS: Partial<Record<AttrGroup, string[]>> = {
  style: ['style'],
  frame: ['x', 'y', 'scale', 'rotation', 'opacity', 'tilt'],
  keys: ['keyframes'],
  anim: ['anim'],
};

function plainGroup(kind: ClipAttrs['kind'], g: AttrGroup, v: Record<string, unknown>): boolean {
  if (kind === 'text') {
    if (g === 'style') return false;
    if (g === 'frame') return (v.scale ?? 1) === 1 && (v.rotation ?? 0) === 0 && (v.opacity ?? 1) === 1 && !v.tilt && v.x === 0.5 && v.y === 0.5;
    if (g === 'keys') return !v.keyframes || !Object.keys(v.keyframes as object).length;
    return !v.anim || (!(v.anim as { in?: unknown }).in && !(v.anim as { out?: unknown }).out);
  }
  switch (g) {
    case 'frame': return v.fit === 'contain' && same(v.transform, DEFAULT_TRANSFORM) && (v.opacity ?? 1) === 1 && !v.tilt && !v.pin && (!v.blend || v.blend === 'normal');
    case 'keys': return !v.keyframes || !Object.keys(v.keyframes as object).length;
    case 'anim': return !v.anim || (!(v.anim as { in?: unknown }).in && !(v.anim as { out?: unknown }).out);
    case 'color': return same(v.color, DEFAULT_COLOR) && !v.grade;
    case 'fx': return !(v.effects as unknown[] | undefined)?.length;
    case 'mask': return !v.mask && !v.chroma;
    case 'speed': return v.speed === 1;
    case 'audio': return v.volume === 1 && !v.muted && !v.fadeIn && !v.fadeOut;
    case 'transition': return !v.transitionOut;
    default: return true;
  }
}

/** Скопировать параметры клипа. Скорость с кривой или реверсом не переносится (это пересобранная копия). */
export function copyAttrs(clip: Clip, from: string): ClipAttrs {
  const kind = clip.type;
  const keys = kind === 'media' ? MEDIA_KEYS : TEXT_KEYS;
  const values: ClipAttrs['values'] = {};
  for (const [g, ks] of Object.entries(keys) as [AttrGroup, string[]][]) {
    if (g === 'speed' && clip.type === 'media' && clip.retime) continue;
    values[g] = pick(clip, ks);
  }
  const plain = (Object.keys(values) as AttrGroup[]).filter((g) => plainGroup(kind, g, values[g]!));
  return { kind, from, values, plain };
}

/** На какие из выделенных клипов можно вставить: того же вида (видео/фото/звук или текст). */
export function pasteTargets(p: Project, ids: string[], a: ClipAttrs): string[] {
  return ids.filter((id) => findClip(p, id)?.clip.type === a.kind);
}

/** Вставить выбранные группы параметров во все подходящие клипы. Переход — только на основной дорожке. */
export function pasteAttrs(p: Project, ids: string[], a: ClipAttrs, groups: AttrGroup[]): { project: Project; count: number } {
  let q = p;
  let count = 0;
  for (const id of pasteTargets(p, ids, a)) {
    const f = findClip(q, id);
    if (!f) continue;
    const patch: Record<string, unknown> = {};
    for (const g of groups) {
      const v = a.values[g];
      if (!v) continue;
      if (g === 'transition') {
        const i = f.track.clips.findIndex((c) => c.id === id);
        if (f.track.kind !== 'main' || i < 0 || i === f.track.clips.length - 1) continue;
      }
      if (g === 'speed' && (f.clip as MediaClip).retime) continue;
      Object.assign(patch, clone(v));
    }
    if (!Object.keys(patch).length) continue;
    q = updateClip(q, id, patch as Partial<MediaClip> | Partial<TextClip>);
    count++;
  }
  return { project: q, count };
}
