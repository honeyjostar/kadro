// Поправки из «Проверки охватов» прямо в проекте: закрыть знак размытием, обрезать пустое начало или заставку в конце,
// растянуть видео из рамки на весь кадр, сделать 9:16, 1080p. Время и рамки — как в готовом ролике (он начинается с 0).
import { mediaKeyTime } from './anim';
import { BLUR_HOLD } from './blur';
import { sizeFor, shortSideOf } from './defaults';
import { canvasToSource } from './follow';
import type { Box } from './reach';
import { cutTimeline } from './textEdit';
import { clipEnd, mainTrack, projectDuration, setSettings, updateClip } from './timeline';
import type { BlurRegion, MediaClip, Project } from './types';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** Закрыть знак размытием: в каждом клипе основной дорожки, который идёт в это время. Сколько клипов поправлено. */
export function hideMark(p: Project, box: Box, t0: number, t1: number, id: (i: number) => string): { project: Project; clips: number } {
  const { width: W, height: H } = p.settings;
  let q = p;
  let n = 0;
  for (const c of mainTrack(p).clips) {
    if (c.type !== 'media') continue;
    const a = p.assets.find((x) => x.id === c.assetId);
    if (!a || a.kind === 'audio' || !a.width || !a.height) continue;
    const s = Math.max(t0, c.start), e = Math.min(t1, clipEnd(c));
    if (e - s < 0.05) continue;
    const mid = (s + e) / 2;
    const src = canvasToSource(c, a, W, H, mid, { x: box.x + box.w / 2, y: box.y + box.h / 2, w: box.w, h: box.h });
    const b = { x: r4(clamp(src.x, 0, 1)), y: r4(clamp(src.y, 0, 1)), w: r4(clamp(src.w, 0.01, 1)), h: r4(clamp(src.h, 0.01, 1)) };
    const reg: BlurRegion = {
      id: id(n), kind: 'object', style: 'blur', strength: 0.9, shape: 'rect', hold: BLUR_HOLD,
      boxes: [{ t: r4(mediaKeyTime(c, s)), ...b }, { t: r4(mediaKeyTime(c, e)), ...b }],
    };
    q = updateClip(q, c.id, { blurs: [...((c as MediaClip).blurs ?? []), reg] });
    n++;
  }
  return { project: q, clips: n };
}

const mainEnd = (p: Project) => mainTrack(p).clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);

/** Клипы других дорожек, которые шли до конца ролика (музыка), — до нового конца, остальное после него — прочь. */
function clampTail(q: Project, oldEnd: number): Project {
  const end = mainEnd(q);
  const mainId = mainTrack(q).id;
  for (const t of q.tracks) {
    if (t.id === mainId) continue;
    for (const c of t.clips) {
      if (c.start >= end - 1e-3) { q = { ...q, tracks: q.tracks.map((x) => (x.id === t.id ? { ...x, clips: x.clips.filter((y) => y.id !== c.id) } : x)) }; continue; }
      if (clipEnd(c) > end + 1e-3 && clipEnd(c) >= oldEnd - 0.05) {
        q = c.type === 'media'
          ? updateClip(q, c.id, { out: r4(c.in + (end - c.start) * c.speed) })
          : updateClip(q, c.id, { duration: r4(end - c.start) });
      }
    }
  }
  return q;
}

/** Начать ролик с секунды at (всё до неё вырезается, субтитры и остальное сдвигаются). */
export function trimStart(p: Project, at: number): Project {
  if (at <= 0.05) return p;
  return clampTail(cutTimeline(p, [[0, at]]), mainEnd(p));
}

/** Обрезать ролик с секунды at до конца. */
export function trimEnd(p: Project, at: number): Project {
  const D = projectDuration(p);
  if (at >= D - 0.05) return p;
  return clampTail(cutTimeline(p, [[at, D + 1]]), mainEnd(p));
}

/** Видео в рамке — на весь кадр: «вписать» → «заполнить», а если поля в самом видео — увеличить на их долю. */
export function fillFrame(p: Project, share: number): Project {
  let q = p;
  const main = mainTrack(p).clips.filter((c): c is MediaClip => c.type === 'media');
  const frameAR = p.settings.width / Math.max(1, p.settings.height);
  // «вписать» даёт поля, только если пропорции видео другие, чем у кадра
  const contain = main.filter((c) => {
    const a = p.assets.find((x) => x.id === c.assetId);
    if (c.fit !== 'contain' || !a?.width || !a.height) return false;
    const rot = Math.abs(a.rotation % 180) === 90;
    const ar = (rot ? a.height : a.width) / (rot ? a.width : a.height);
    return Math.abs(ar - frameAR) / frameAR > 0.02;
  });
  if (contain.length) {
    for (const c of contain) q = updateClip(q, c.id, { fit: 'cover' });
    return q;
  }
  const k = 1 / Math.max(0.5, 1 - clamp(share, 0, 0.45));
  for (const c of main) q = updateClip(q, c.id, { transform: { ...c.transform, scale: r4(c.transform.scale * k) } });
  return q;
}

/** Кадр 9:16 той же чёткости. */
export function makeVertical(p: Project): Project {
  return setSettings(p, { aspect: '9:16', ...sizeFor('9:16', shortSideOf(p.settings)) });
}

/** Не ниже 1080p по короткой стороне. */
export function make1080(p: Project): Project {
  return shortSideOf(p.settings) >= 1080 ? p : setSettings(p, sizeFor(p.settings.aspect, 1080));
}
