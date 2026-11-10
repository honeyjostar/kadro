// Бумеранг: кусок видео вперёд-назад по кругу, быстрее и без звука — как в Instagram.
// Кусок от курсора (1,5 с записи, короткий клип — целиком) → за ним по очереди задом наперёд и снова вперёд.
// Задом наперёд — та же копия фрагмента, что у «Реверса» (готовит actions.ts), здесь — только правка проекта.
import { tx } from './i18n';
import { clipDuration, clipEnd, edit, findClip, MIN_CLIP, splitClip, updateClip } from './timeline';
import { uid } from './defaults';
import type { MediaClip, Project, Retime } from './types';

export const BOOM_SRC = 1.5;     // секунд записи
export const BOOM_LOOPS = 2;     // сколько раз «туда-обратно»
export const BOOM_SPEED = 1.5;

/** Кусок для бумеранга: от t на 1,5 с записи; клип короче 2 с — целиком. Только основная дорожка. */
export function boomerangPiece(p: Project, clipId: string, t: number): { project: Project; clipId: string } | { error: string } {
  const f = findClip(p, clipId);
  if (!f || f.clip.type !== 'media') return { error: tx('Выбери видеоклип') };
  if (f.track.kind !== 'main') return { error: tx('Бумеранг делается на основной дорожке') };
  const c = f.clip;
  if (c.retime || c.group) return { error: tx('Бумеранг не делается из реверса, кривой скорости или группы') };
  const asset = p.assets.find((a) => a.id === c.assetId);
  if (!asset || asset.kind !== 'video') return { error: tx('Бумеранг делается из видео') };
  if ((c.out - c.in) <= 2 + 1e-6) return { project: p, clipId };
  const len = BOOM_SRC / c.speed;
  const t0 = Math.min(Math.max(t, c.start), clipEnd(c) - len);
  let q = p;
  let piece = clipId;
  if (t0 > c.start + MIN_CLIP) { const r = splitClip(q, clipId, t0); if (r.clipId) { q = r.project; piece = r.clipId; } }
  const m = findClip(q, piece)!.clip;
  if (t0 + len < clipEnd(m) - MIN_CLIP) { const r = splitClip(q, piece, t0 + len); if (r.clipId) q = r.project; }
  return { project: q, clipId: piece };
}

/**
 * За куском — копии: задом наперёд (revAssetId — перевёрнутая копия фрагмента длиной revDur), вперёд, назад…
 * Всё быстрее (×1,5) и без звука. Возвращает id куска и копий по порядку.
 */
export function applyBoomerang(p: Project, pieceId: string, revAssetId: string, revDur: number, loops = BOOM_LOOPS): { project: Project; ids: string[] } {
  const ids = [pieceId];
  let project = updateClip(p, pieceId, { speed: BOOM_SPEED, muted: true });
  project = edit(project, (d) => {
    const f = findClip(d, pieceId);
    if (!f || f.clip.type !== 'media') return;
    const piece = f.clip;
    const r: Retime = { assetId: piece.assetId, in: piece.in, out: piece.out, reverse: true };
    const copies: MediaClip[] = [];
    for (let i = 1; i < loops * 2; i++) {
      const c: MediaClip = { ...structuredClone(piece), id: uid('clip'), transitionOut: undefined, cutSound: undefined, anim: undefined, keyframes: undefined };
      if (i % 2 === 1) Object.assign(c, { retime: r, assetId: revAssetId, in: 0, out: revDur });
      copies.push(c);
      ids.push(c.id);
    }
    // переход и звук стыка, что были после куска, — теперь после последней копии
    const last = copies[copies.length - 1];
    if (piece.transitionOut) { last.transitionOut = piece.transitionOut; delete piece.transitionOut; }
    if (piece.cutSound) { last.cutSound = piece.cutSound; delete piece.cutSound; }
    if (piece.anim?.out) { last.anim = { out: piece.anim.out }; piece.anim = piece.anim.in ? { in: piece.anim.in } : undefined; }
    f.track.clips.splice(f.index + 1, 0, ...copies);
  });
  return { project, ids };
}

/** Сколько длится бумеранг на таймлайне. */
export const boomerangDuration = (p: Project, ids: string[]): number =>
  ids.reduce((s, id) => { const f = findClip(p, id); return s + (f ? clipDuration(f.clip) : 0); }, 0);
