// Мем-кнопки: драматический зум, «Продолжение следует…», басс-буст с тряской, замедление с «бум».
// Каждая — правка клипа у курсора (ключевые кадры, разрез, скорость, эффекты, стоп-кадр с плашкой) и свой звук
// на дорожке звука (звуки сочинены формулой — scripts/make-memes.mjs). Здесь — чистые правки проекта;
// звук, стоп-кадр и обработка голоса — в renderer/actions.ts (applyMeme).
import { tx } from './i18n';
import { mediaPropsAt } from './anim';
import { addText, clipEnd, edit, findClip, MIN_CLIP, setKeyframe, sourceTimeAt, splitClip, updateClip, insertFreeze } from './timeline';
import { TBC_DUR } from './tbc';
import type { Effect, MediaClip, Project } from './types';

export type MemeId = 'drama' | 'tbc' | 'bass' | 'slowmo';
/** Какой звук кладётся: свои файлы мемов (resources/demo/meme-*.m4a) или «бум» со стыков. */
export type MemeSound = 'drama' | 'tbc' | 'drop' | 'boom';

export const MEMES: { id: MemeId; label: string; hint: string; sound: MemeSound }[] = [
  { id: 'drama', label: tx('Драматический зум'), hint: tx('Три рывка камеры и «дун-дун-дууун»'), sound: 'drama' },
  { id: 'tbc', label: tx('Продолжение следует…'), hint: tx('Стоп-кадр в сепии, стрелка и своя музыка'), sound: 'tbc' },
  { id: 'bass', label: tx('Басс-буст'), hint: tx('Звук уходит в басы, кадр трясётся, «дроп»'), sound: 'drop' },
  { id: 'slowmo', label: tx('Замедление с «бум»'), hint: tx('Момент замедляется, камера наезжает, «бум»'), sound: 'boom' },
];

/** Драматический зум: [через сколько секунд, во сколько раз крупнее]. Пары с одинаковым масштабом — пауза. */
export const DRAMA_STEPS: [number, number][] = [[0, 1], [0.1, 1.3], [0.55, 1.3], [0.65, 1.65], [1.1, 1.65], [1.2, 2.1], [2.4, 2.1], [2.55, 1]];
export const BASS_DUR = 1.6;
/** Замедление: сколько секунд записи растягивается и во сколько раз медленнее. */
export const SLOWMO_SRC = 0.8;
export const SLOWMO_SPEED = 0.3;

type Res = { project: Project; clipId: string } | { error: string };
const mediaAt = (p: Project, clipId: string, t: number): MediaClip | string => {
  const f = findClip(p, clipId);
  if (!f || f.clip.type !== 'media') return tx('Выбери видеоклип');
  if (t < f.clip.start - 1e-6 || t > clipEnd(f.clip) - MIN_CLIP) return tx('Поставь курсор на клип — мем начнётся с этого места');
  return f.clip;
};

/** Драматический зум от момента t: три рывка всё крупнее, пауза — и обратно. Ключевые кадры масштаба клипа. */
export function dramaZoom(p: Project, clipId: string, t: number): Res {
  const c = mediaAt(p, clipId, t);
  if (typeof c === 'string') return { error: c };
  const base = mediaPropsAt(c, t).scale;
  const end = clipEnd(c);
  let q = p;
  // ключи — во времени исходника (анимация привязана к содержимому)
  for (const [dt, k] of DRAMA_STEPS) {
    const tt = Math.min(end, t + dt);
    q = setKeyframe(q, clipId, 'scale', sourceTimeAt(c, tt), base * k);
    if (tt >= end) break;
  }
  return { project: q, clipId };
}

/** Кусок клипа [t, t + len] отдельным клипом (разрез с двух сторон). Возвращает id куска. */
function carve(p: Project, clipId: string, t: number, len: number): Res {
  const c = mediaAt(p, clipId, t);
  if (typeof c === 'string') return { error: c };
  let q = p;
  let mid = clipId;
  if (t > c.start + MIN_CLIP) {
    const r = splitClip(q, clipId, t);
    if (r.clipId) { q = r.project; mid = r.clipId; }
  }
  const m = findClip(q, mid)!.clip;
  if (t + len < clipEnd(m) - MIN_CLIP) {
    const r = splitClip(q, mid, t + len);
    if (r.clipId) q = r.project;
  }
  return { project: q, clipId: mid };
}

const addFx = (list: Effect[] | undefined, fx: Effect[]): Effect[] => [...(list ?? []).filter((e) => !fx.some((x) => x.type === e.type)), ...fx];

/**
 * Басс-буст: кусок от t на 1,6 с — тряска и «удар» масштабом, громче. Звук в басы — обработкой голоса
 * (эффект bassboost, делает applyMeme). Возвращает id куска.
 */
export function bassBoost(p: Project, clipId: string, t: number): Res {
  const r = carve(p, clipId, t, BASS_DUR);
  if ('error' in r) return r;
  const m = findClip(r.project, r.clipId)!.clip as MediaClip;
  const project = updateClip(r.project, r.clipId, { effects: addFx(m.effects, [{ type: 'shake', amount: 0.9 }, { type: 'pulse', amount: 0.7 }]), volume: Math.min(2, m.volume * 1.3) });
  return { project, clipId: r.clipId };
}

/** Замедление: 0,8 с записи от t растягиваются в 0,3 раза, камера медленно наезжает, свой звук клипа — тише. */
export function slowMo(p: Project, clipId: string, t: number): Res {
  const c = mediaAt(p, clipId, t);
  if (typeof c === 'string') return { error: c };
  const r = carve(p, clipId, t, SLOWMO_SRC / c.speed);
  if ('error' in r) return r;
  const m = findClip(r.project, r.clipId)!.clip as MediaClip;
  let q = updateClip(r.project, r.clipId, { speed: SLOWMO_SPEED, volume: m.volume * 0.25 });
  const mm = findClip(q, r.clipId)!.clip as MediaClip;
  const base = mediaPropsAt(mm, mm.start).scale;
  q = setKeyframe(q, r.clipId, 'scale', mm.in, base);
  q = setKeyframe(q, r.clipId, 'scale', mm.out, base * 1.15);
  return { project: q, clipId: r.clipId };
}

/**
 * «Продолжение следует…»: стоп-кадр (assetId — кадр в момент t) в тёплой сепии на 3,4 с и плашка-стрелка.
 * vertical — плашка по центру снизу (вертикальный ролик), иначе слева снизу.
 */
export function toBeContinued(p: Project, clipId: string, t: number, freezeAssetId: string, vertical: boolean): Res & { textId?: string } {
  const c = mediaAt(p, clipId, t);
  if (typeof c === 'string') return { error: c };
  const fr = insertFreeze(p, clipId, t, freezeAssetId, TBC_DUR);
  if (!fr.clipId) return { error: tx('Стоп-кадр не встал') };
  let q = edit(fr.project, (d) => {
    const f = findClip(d, fr.clipId);
    if (f?.clip.type === 'media') f.clip.color = { ...f.clip.color, preset: 'sepia', presetAmount: 1, warmth: 0.25, contrast: 1.08 };
  });
  const tx0 = addText(q, t, tx('Продолжение следует…'), { font: 'Montserrat', bold: true, italic: true, size: vertical ? 46 : 56, color: '#fffaf0', bgColor: '#e8c37a', bgOpacity: 1, strokeWidth: 0, shadow: false });
  q = updateClip(tx0.project, tx0.clipId, { widget: 'tbc', duration: TBC_DUR, x: vertical ? 0.5 : 0.3, y: vertical ? 0.8 : 0.84 });
  return { project: q, clipId: fr.clipId, textId: tx0.clipId };
}
