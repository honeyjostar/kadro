// Операции над таймлайном. Все функции чистые: принимают проект и возвращают новый.
import { IMAGE_DEFAULT_DURATION, newMediaClip, newTextClip, newTrack, uid } from './defaults';
import { dropKeyframe, mediaPropsAt, putKeyframe } from './anim';
import { remapKeyframes } from './retime';
import type { AnimProp, Clip, GroupData, Keyframes, MediaAsset, MediaClip, Project, Retime, TextClip, TextStyle, Track, TrackKind, Transition } from './types';

export const MIN_CLIP = 0.1;      // минимальная длина клипа на таймлайне, сек
export const NEW_TRACK = 'new';   // цель перемещения: создать новую дорожку
const EPS = 1e-6;

// ---------- базовые вычисления ----------
export function clipDuration(c: Clip): number {
  return c.type === 'text' ? c.duration : (c.out - c.in) / c.speed;
}
export function clipEnd(c: Clip): number {
  return c.start + clipDuration(c);
}
/** Привязка времени исходника к сетке кадров проекта (чтобы склейки не давали рассинхрона звука). */
export function snapFrame(t: number, fps: number): number {
  return Math.round(t * fps) / fps;
}
export function round(n: number, d = 6): number {
  const k = 10 ** d;
  return Math.round(n * k) / k;
}
export function assetOf(p: Project, c: MediaClip): MediaAsset | undefined {
  return p.assets.find((a) => a.id === c.assetId);
}
export function mainTrack(p: Project): Track {
  const t = p.tracks.find((x) => x.kind === 'main');
  if (!t) throw new Error('В проекте нет основной дорожки');
  return t;
}
export function findClip(p: Project, clipId: string): { track: Track; clip: Clip; index: number } | undefined {
  for (const track of p.tracks) {
    const index = track.clips.findIndex((c) => c.id === clipId);
    if (index >= 0) return { track, clip: track.clips[index], index };
  }
  return undefined;
}
export function projectDuration(p: Project): number {
  let d = 0;
  for (const t of p.tracks) for (const c of t.clips) d = Math.max(d, clipEnd(c));
  return round(d);
}
/** Переход между клипами i и i+1 основной дорожки (или 0). */
export function transitionDur(t: Track, i: number): number {
  if (i < 0 || i >= t.clips.length - 1) return 0;
  const c = t.clips[i];
  return c.type === 'media' && c.transitionOut ? c.transitionOut.duration : 0;
}

/** Максимальная длина источника для клипа (картинки — без ограничения). */
function sourceLimit(p: Project, c: MediaClip): number {
  const a = assetOf(p, c);
  if (!a || a.kind === 'image' || a.loop) return Infinity;
  return a.duration;
}

// ---------- «магнитная» основная дорожка ----------
/** Пересчитывает позиции клипов основной дорожки: подряд, без дыр, с учётом перекрытия на переходах. */
export function layoutMain(p: Project): void {
  const t = mainTrack(p);
  let pos = 0;
  t.clips.forEach((c, i) => {
    if (c.type !== 'media') return;
    const dur = clipDuration(c);
    // ограничиваем переход: не длиннее 45% каждого из соседей
    if (c.transitionOut) {
      const next = t.clips[i + 1];
      if (!next || next.type !== 'media') {
        delete c.transitionOut;
      } else {
        const maxD = Math.max(0, Math.min(dur, clipDuration(next)) * 0.45);
        c.transitionOut.duration = round(Math.min(c.transitionOut.duration, maxD));
        if (c.transitionOut.duration < 0.05) delete c.transitionOut;
      }
    }
    c.start = round(pos);
    pos = pos + dur - (c.transitionOut?.duration ?? 0);
  });
}

function edit(p: Project, fn: (d: Project) => void): Project {
  const d: Project = structuredClone(p);
  fn(d);
  layoutMain(d);
  d.updatedAt = Date.now();
  return d;
}

function overlaps(track: Track, start: number, end: number, ignoreId?: string): boolean {
  return track.clips.some((c) => c.id !== ignoreId && start < clipEnd(c) - EPS && end > c.start + EPS);
}

/** Кладёт клип на первую свободную дорожку нужного типа или создаёт новую. Возвращает id дорожки. */
function placeFree(d: Project, kind: Exclude<TrackKind, 'main'>, clip: Clip, preferTrackId?: string): string {
  const end = clip.start + clipDuration(clip);
  const candidates = d.tracks.filter((t) => t.kind === kind);
  const pref = preferTrackId ? candidates.find((t) => t.id === preferTrackId) : undefined;
  const order = pref ? [pref, ...candidates.filter((t) => t !== pref)] : candidates;
  for (const t of order) {
    if (!overlaps(t, clip.start, end, clip.id)) {
      t.clips.push(clip);
      t.clips.sort((a, b) => a.start - b.start);
      return t.id;
    }
  }
  const t = newTrack(kind);
  t.clips.push(clip);
  insertTrack(d, t);
  return t.id;
}

/** Порядок дорожек: main, затем визуальные (video/text) по порядку наложения, аудио — в конце. */
function insertTrack(d: Project, t: Track): void {
  if (t.kind === 'audio') {
    d.tracks.push(t);
    return;
  }
  // визуальные дорожки — перед первой аудио, то есть поверх уже существующих
  const firstAudio = d.tracks.findIndex((x) => x.kind === 'audio');
  if (firstAudio === -1) d.tracks.push(t);
  else d.tracks.splice(firstAudio, 0, t);
}

function cleanupEmptyTracks(d: Project): void {
  d.tracks = d.tracks.filter((t) => t.kind === 'main' || t.clips.length > 0);
}

// ---------- медиатека ----------
export function addAsset(p: Project, asset: MediaAsset): Project {
  return edit(p, (d) => {
    if (!d.assets.some((a) => a.id === asset.id)) d.assets.push(asset);
  });
}
export function updateAsset(p: Project, id: string, patch: Partial<MediaAsset>): Project {
  return edit(p, (d) => {
    const a = d.assets.find((x) => x.id === id);
    if (a) Object.assign(a, patch);
  });
}
export function removeAsset(p: Project, id: string): Project {
  return edit(p, (d) => {
    d.assets = d.assets.filter((a) => a.id !== id);
    for (const t of d.tracks) t.clips = t.clips.filter((c) => !(c.type === 'media' && c.assetId === id));
    cleanupEmptyTracks(d);
  });
}

// ---------- добавление на таймлайн ----------
export interface AddResult { project: Project; clipId: string }

/** Видео/фото на основную дорожку: после клипа под плейхедом (или в конец). */
export function addToMain(p: Project, assetId: string, at: number): AddResult {
  let clipId = '';
  const project = edit(p, (d) => {
    const asset = d.assets.find((a) => a.id === assetId);
    if (!asset) throw new Error('Нет такого файла в проекте');
    if (asset.kind === 'audio') throw new Error('Аудио нельзя положить на основную дорожку');
    const t = mainTrack(d);
    const clip = newMediaClip(asset);
    clipId = clip.id;
    let idx = t.clips.length;
    for (let i = 0; i < t.clips.length; i++) {
      const c = t.clips[i];
      if (at < c.start + EPS) { idx = i; break; }
      if (at < clipEnd(c) - EPS) { idx = i + 1; break; }
    }
    t.clips.splice(idx, 0, clip);
  });
  return { project, clipId };
}

/** Картинка/видео поверх (картинка-в-картинке) или аудио: свободная дорожка, начиная с плейхеда. */
export function addFree(p: Project, assetId: string, at: number): AddResult {
  let clipId = '';
  const project = edit(p, (d) => {
    const asset = d.assets.find((a) => a.id === assetId);
    if (!asset) throw new Error('Нет такого файла в проекте');
    const clip = newMediaClip(asset, Math.max(0, at));
    if (asset.kind !== 'audio') clip.transform.scale = 0.6;
    clipId = clip.id;
    placeFree(d, asset.kind === 'audio' ? 'audio' : 'video', clip);
  });
  return { project, clipId };
}

export function addText(p: Project, at: number, text?: string, style?: Partial<TextStyle>): AddResult {
  const clip = newTextClip(Math.max(0, at), text, style);
  const project = edit(p, (d) => { placeFree(d, 'text', clip); });
  return { project, clipId: clip.id };
}

// ---------- правка клипов ----------
export function updateClip(p: Project, clipId: string, patch: Partial<MediaClip> | Partial<TextClip>): Project {
  return edit(p, (d) => {
    const f = findClip(d, clipId);
    if (!f) return;
    Object.assign(f.clip, patch);
    if (f.clip.type === 'media') sanitizeMedia(d, f.clip);
    else f.clip.duration = Math.max(MIN_CLIP, f.clip.duration);
  });
}

function sanitizeMedia(d: Project, c: MediaClip): void {
  c.speed = Math.min(4, Math.max(0.25, c.speed));
  if (c.opacity !== undefined) c.opacity = Math.min(1, Math.max(0, c.opacity));
  c.volume = Math.min(2, Math.max(0, c.volume));
  const limit = sourceLimit(d, c);
  c.in = Math.max(0, c.in);
  c.out = Math.min(limit, c.out);
  if (c.out - c.in < MIN_CLIP * c.speed) c.out = Math.min(limit, c.in + MIN_CLIP * c.speed);
  const dur = clipDuration(c);
  c.fadeIn = Math.max(0, Math.min(c.fadeIn, dur / 2));
  c.fadeOut = Math.max(0, Math.min(c.fadeOut, dur / 2));
  c.start = Math.max(0, c.start);
}

export function deleteClips(p: Project, ids: string[]): Project {
  return edit(p, (d) => {
    for (const t of d.tracks) t.clips = t.clips.filter((c) => !ids.includes(c.id));
    cleanupEmptyTracks(d);
  });
}

export function duplicateClip(p: Project, clipId: string): AddResult {
  let newId = '';
  const project = edit(p, (d) => {
    const f = findClip(d, clipId);
    if (!f) return;
    const copy: Clip = structuredClone(f.clip);
    copy.id = uid(copy.type === 'text' ? 'txt' : 'clip');
    newId = copy.id;
    if (f.track.kind === 'main') {
      if (copy.type === 'media') delete copy.transitionOut;
      f.track.clips.splice(f.index + 1, 0, copy);
    } else {
      copy.start = clipEnd(f.clip);
      placeFree(d, f.track.kind as Exclude<TrackKind, 'main'>, copy, f.track.id);
    }
  });
  return { project, clipId: newId };
}

/** Разрезать клип в момент времени t (время таймлайна). */
export function splitClip(p: Project, clipId: string, t: number): AddResult {
  let rightId = '';
  const project = edit(p, (d) => {
    const f = findClip(d, clipId);
    if (!f) return;
    const c = f.clip;
    if (t <= c.start + MIN_CLIP - EPS || t >= clipEnd(c) - MIN_CLIP + EPS) return;
    const right: Clip = structuredClone(c);
    right.id = uid(c.type === 'text' ? 'txt' : 'clip');
    rightId = right.id;
    if (c.type === 'media' && right.type === 'media') {
      const srcT = round(snapFrame(c.in + (t - c.start) * c.speed, d.settings.fps));
      if (srcT <= c.in + 1e-6 || srcT >= c.out - 1e-6) return;
      c.out = srcT;
      right.in = srcT;
      right.start = round(t);
      right.fadeIn = 0;
      c.fadeOut = 0;
      delete c.transitionOut; // переход остаётся у правой части
    } else if (c.type === 'text' && right.type === 'text') {
      const cut = t - c.start;
      c.duration = round(cut);
      right.start = round(t);
      right.duration = round(right.duration - c.duration);
      // субтитр со словами делим и по тексту: слова до разреза — левой части, после — правой
      const toks = c.text.split(/\s+/).filter(Boolean);
      const byWords = !!c.words?.length && toks.length === c.words.length;
      shiftText(right, -cut);
      if (c.words) c.words = c.words.filter((w) => w.start < cut - 1e-6).map((w) => ({ ...w, end: Math.min(w.end, cut) }));
      if (right.words) right.words = right.words.filter((w) => w.start >= -1e-6);
      if (byWords && c.words!.length && right.words!.length) {
        c.text = toks.slice(0, c.words!.length).join(' ');
        right.text = toks.slice(c.words!.length).join(' ');
      }
      if (c.anim?.out) c.anim = { ...c.anim, out: undefined };
      if (right.anim?.in) right.anim = { ...right.anim, in: undefined };
    }
    f.track.clips.splice(f.index + 1, 0, right);
  });
  return { project, clipId: rightId };
}

/** Обрезка края клипа. edge='start' — левый край, 'end' — правый; time — новое положение края на таймлайне. */
export function trimClip(p: Project, clipId: string, edge: 'start' | 'end', time: number): Project {
  return edit(p, (d) => {
    const f = findClip(d, clipId);
    if (!f) return;
    const c = f.clip;
    const isMain = f.track.kind === 'main';
    if (c.type === 'text') {
      const end = clipEnd(c);
      if (edge === 'start') {
        const ns = Math.max(0, Math.min(time, end - MIN_CLIP));
        shiftText(c, c.start - ns);
        c.duration = round(end - ns);
        c.start = round(ns);
      } else {
        c.duration = round(Math.max(MIN_CLIP, time - c.start));
      }
      return;
    }
    const limit = sourceLimit(d, c);
    const asset = assetOf(d, c);
    const isImage = asset?.kind === 'image';
    if (edge === 'end') {
      const newDur = Math.max(MIN_CLIP, time - c.start);
      let nout = Math.min(limit, c.in + newDur * c.speed);
      if (nout < limit - 1e-6 && !isImage) nout = snapFrame(nout, d.settings.fps);
      c.out = round(Math.max(c.in + MIN_CLIP * c.speed, Math.min(limit, nout)));
    } else {
      const end = clipEnd(c);
      const delta = time - c.start; // >0 — укорачиваем слева
      if (isImage) {
        const newDur = Math.max(MIN_CLIP, end - time);
        c.out = round(c.in + newDur * c.speed);
        if (!isMain) c.start = round(Math.max(0, end - newDur));
      } else {
        let nin = snapFrame(c.in + delta * c.speed, d.settings.fps);
        nin = Math.max(0, Math.min(nin, c.out - MIN_CLIP * c.speed));
        const realDelta = (nin - c.in) / c.speed;
        c.in = round(nin);
        if (!isMain) c.start = round(Math.max(0, c.start + realDelta));
      }
    }
  });
}

/** Сдвиг внутренних времён текста (ключи, слова) — при обрезке слева и разрезании. */
function shiftText(c: TextClip, delta: number): void {
  if (c.keyframes) {
    const k: Keyframes = {};
    for (const [prop, list] of Object.entries(c.keyframes) as [AnimProp, Keyframes[AnimProp]][]) {
      if (list) k[prop] = list.map((x) => ({ ...x, t: round(x.t + delta) }));
    }
    c.keyframes = k;
  }
  if (c.words) c.words = c.words.map((w) => ({ ...w, start: round(w.start + delta), end: round(w.end + delta) }));
}

// ---------- ключевые кадры ----------
/** Поставить ключ свойства (t — время ключа: исходника для видео, от начала клипа для текста). */
export function setKeyframe(p: Project, clipId: string, prop: AnimProp, t: number, v: number, eps = 1 / 120): Project {
  return edit(p, (d) => {
    const f = findClip(d, clipId);
    if (!f) return;
    const c = f.clip;
    c.keyframes = { ...c.keyframes, [prop]: putKeyframe(c.keyframes?.[prop], t, v, eps) };
  });
}
export function removeKeyframe(p: Project, clipId: string, prop: AnimProp, t: number, eps = 1 / 120): Project {
  return edit(p, (d) => {
    const f = findClip(d, clipId);
    if (!f || !f.clip.keyframes) return;
    const list = dropKeyframe(f.clip.keyframes[prop], t, eps);
    const k = { ...f.clip.keyframes, [prop]: list };
    if (!list.length) delete k[prop];
    f.clip.keyframes = Object.keys(k).length ? k : undefined;
  });
}
export function clearKeyframes(p: Project, clipId: string, props?: AnimProp[]): Project {
  return edit(p, (d) => {
    const f = findClip(d, clipId);
    if (!f || !f.clip.keyframes) return;
    if (!props) { f.clip.keyframes = undefined; return; }
    const k = { ...f.clip.keyframes };
    for (const pr of props) delete k[pr];
    f.clip.keyframes = Object.keys(k).length ? k : undefined;
  });
}

/** Перемещение клипа по свободной дорожке (или на другую дорожку того же вида). */
export function moveClip(p: Project, clipId: string, start: number, targetTrackId?: string): Project {
  return edit(p, (d) => {
    const f = findClip(d, clipId);
    if (!f) return;
    if (f.track.kind === 'main') return; // для основной — reorderMain
    const c = f.clip;
    c.start = round(Math.max(0, start));
    if (targetTrackId === NEW_TRACK) {
      // новая дорожка поверх остальных (для звука — внизу)
      const kind: Exclude<TrackKind, 'main'> = c.type === 'text' ? 'text' : assetOf(d, c)?.kind === 'audio' ? 'audio' : 'video';
      f.track.clips.splice(f.index, 1);
      const t = newTrack(kind);
      t.clips.push(c);
      insertTrack(d, t);
      cleanupEmptyTracks(d);
      return;
    }
    const target = targetTrackId ? d.tracks.find((t) => t.id === targetTrackId) : f.track;
    if (!target) return;
    // переход между основной и наложением — только для видео/фото
    if (target.kind === 'main') {
      if (c.type !== 'media') return;
      const asset = assetOf(d, c);
      if (!asset || asset.kind === 'audio') return;
      f.track.clips.splice(f.index, 1);
      c.transform = { ...c.transform, scale: 1, x: 0, y: 0 };
      const t = mainTrack(d);
      let idx = t.clips.length;
      for (let i = 0; i < t.clips.length; i++) {
        if (start < t.clips[i].start + clipDuration(t.clips[i]) / 2) { idx = i; break; }
      }
      t.clips.splice(idx, 0, c);
      cleanupEmptyTracks(d);
      return;
    }
    const sameKind = target.kind === f.track.kind ||
      (c.type === 'media' && f.track.kind !== 'audio' && target.kind === 'video');
    if (!sameKind) return;
    f.track.clips.splice(f.index, 1);
    if (!overlaps(target, c.start, c.start + clipDuration(c), c.id)) {
      target.clips.push(c);
      target.clips.sort((a, b) => a.start - b.start);
    } else {
      placeFree(d, target.kind as Exclude<TrackKind, 'main'>, c, undefined);
    }
    cleanupEmptyTracks(d);
  });
}

/** Перенос клипа с основной дорожки на дорожку наложения (target: id дорожки или NEW_TRACK). */
export function mainToOverlay(p: Project, clipId: string, start: number, target?: string): Project {
  return edit(p, (d) => {
    const f = findClip(d, clipId);
    if (!f || f.track.kind !== 'main' || f.clip.type !== 'media') return;
    const c = f.clip;
    f.track.clips.splice(f.index, 1);
    delete c.transitionOut;
    c.start = round(Math.max(0, start));
    c.transform = { ...c.transform, scale: 0.6 };
    if (target === NEW_TRACK) {
      const t = newTrack('video');
      t.clips.push(c);
      insertTrack(d, t);
    } else {
      const pref = target && d.tracks.find((t) => t.id === target && t.kind === 'video') ? target : undefined;
      placeFree(d, 'video', c, pref);
    }
  });
}

/** Изменение порядка на основной дорожке. */
export function reorderMain(p: Project, clipId: string, newIndex: number): Project {
  return edit(p, (d) => {
    const t = mainTrack(d);
    const i = t.clips.findIndex((c) => c.id === clipId);
    if (i < 0) return;
    const [c] = t.clips.splice(i, 1);
    if (c.type === 'media') delete c.transitionOut;
    // переход у предыдущего клипа мог указывать на перемещённый — оставляем, layoutMain поправит длительность
    const idx = Math.max(0, Math.min(newIndex, t.clips.length));
    t.clips.splice(idx, 0, c);
  });
}

export function setTransition(p: Project, clipId: string, tr: Transition | null): Project {
  return edit(p, (d) => {
    const f = findClip(d, clipId);
    if (!f || f.track.kind !== 'main' || f.clip.type !== 'media') return;
    if (!tr) delete f.clip.transitionOut;
    else f.clip.transitionOut = { ...tr };
  });
}

export function setTrackFlag(p: Project, trackId: string, patch: Partial<Pick<Track, 'muted' | 'hidden'>>): Project {
  return edit(p, (d) => {
    const t = d.tracks.find((x) => x.id === trackId);
    if (t) Object.assign(t, patch);
  });
}

// ---------- ритм ----------
/** Доли такта всех музыкальных клипов в шкале таймлайна. */
export function beatTimes(p: Project): number[] {
  const out: number[] = [];
  for (const t of p.tracks) {
    if (t.kind !== 'audio') continue;
    for (const c of t.clips) {
      if (c.type !== 'media') continue;
      const a = assetOf(p, c);
      for (const b of a?.beats ?? []) if (b >= c.in && b <= c.out) out.push(round(c.start + (b - c.in) / c.speed));
    }
  }
  return [...new Set(out)].sort((x, y) => x - y);
}

/** Подогнать склейки основной дорожки к долям такта: конец каждого клипа — на ближайшую долю. */
export function alignMainToBeats(p: Project, beats: number[], minClip = 0.3): Project {
  if (!beats.length) return p;
  let d = p;
  const n = mainTrack(d).clips.length;
  for (let i = 0; i < n; i++) {
    const c = mainTrack(d).clips[i];
    if (c.type !== 'media') continue;
    const end = clipEnd(c);
    const a = assetOf(d, c);
    const maxEnd = a && a.kind !== 'image' && !a.loop ? c.start + (a.duration - c.in) / c.speed : end + 10;
    let best: number | null = null;
    for (const b of beats) {
      if (b < c.start + minClip || b > maxEnd + 1e-6) continue;
      if (best === null || Math.abs(b - end) < Math.abs(best - end)) best = b;
    }
    if (best === null || Math.abs(best - end) < 1 / (2 * d.settings.fps)) continue;
    d = trimClip(d, c.id, 'end', best);
  }
  return d;
}

// ---------- ИИ-операции над таймлайном ----------
/** Оставить в клипе только указанные отрезки исходника (вырезание пауз). */
export function keepSourceRanges(p: Project, clipId: string, ranges: [number, number][]): Project {
  return edit(p, (d) => {
    const f = findClip(d, clipId);
    if (!f || f.clip.type !== 'media') return;
    const c = f.clip;
    const F = d.settings.fps;
    const parts = ranges
      .map(([a, b]) => [Math.max(snapFrame(a, F), c.in), Math.min(snapFrame(b, F), c.out)] as [number, number])
      .filter(([a, b]) => b - a >= MIN_CLIP * c.speed);
    if (parts.length === 0) return;
    const pieces: MediaClip[] = parts.map(([a, b], i) => {
      const n: MediaClip = structuredClone(c);
      n.id = i === 0 ? c.id : uid('clip');
      n.in = round(a);
      n.out = round(b);
      n.fadeIn = 0;
      n.fadeOut = 0;
      delete n.transitionOut;
      return n;
    });
    pieces[pieces.length - 1].transitionOut = c.transitionOut;
    f.track.clips.splice(f.index, 1, ...pieces);
    if (f.track.kind !== 'main') {
      // на свободной дорожке укладываем куски подряд, начиная со старта исходного клипа
      let pos = c.start;
      for (const n of pieces) { n.start = round(pos); pos += clipDuration(n); }
      // сдвигаем остальные клипы дорожки, которые шли после, чтобы не осталось «дыр»
      const removed = clipDuration(c) - (pos - c.start);
      for (const other of f.track.clips) {
        if (!pieces.includes(other as MediaClip) && other.start >= clipEnd(c) - EPS) other.start = round(other.start - removed);
      }
    }
  });
}

export interface Cue { start: number; end: number; text: string; words?: { text: string; start: number; end: number }[] }

/** Создать (или заменить) дорожку субтитров. */
export function setCaptions(p: Project, cues: Cue[], style: TextStyle, y = 0.72): Project {
  return edit(p, (d) => {
    d.tracks = d.tracks.filter((t) => !(t.kind === 'text' && t.clips.length > 0 && t.clips.every((c) => c.type === 'text' && c.role === 'caption')));
    if (cues.length === 0) return;
    const t = newTrack('text', 'Субтитры');
    for (const q of cues) {
      const c = newTextClip(round(q.start), q.text, style, 'caption');
      c.duration = round(Math.max(MIN_CLIP, q.end - q.start));
      if (q.words?.length) c.words = q.words.map((w) => ({ text: w.text, start: round(Math.max(0, w.start - c.start)), end: round(Math.max(0, w.end - c.start)) }));
      c.y = y;
      t.clips.push(c);
    }
    insertTrack(d, t);
  });
}

/** Анимация появления для всех субтитров. */
export function animAllCaptions(p: Project, a: import('./types').TextAnim | undefined): Project {
  return edit(p, (d) => {
    for (const t of d.tracks) for (const c of t.clips) {
      if (c.type === 'text' && c.role === 'caption') c.anim = { ...c.anim, in: a ? { ...a, dur: Math.min(a.dur, c.duration * 0.5) } : undefined };
    }
  });
}

/** Применить стиль ко всем субтитрам сразу. */
export function styleAllCaptions(p: Project, patch: Partial<TextStyle>, y?: number): Project {
  return edit(p, (d) => {
    for (const t of d.tracks) for (const c of t.clips) {
      if (c.type === 'text' && c.role === 'caption') {
        c.style = { ...c.style, ...patch };
        if (y !== undefined) c.y = y;
      }
    }
  });
}

export function setSettings(p: Project, patch: Partial<Project['settings']>): Project {
  return edit(p, (d) => { d.settings = { ...d.settings, ...patch }; });
}

export function renameProject(p: Project, name: string): Project {
  return edit(p, (d) => { d.name = name; });
}

/** Все клипы, видимые в момент t (с учётом перекрытий переходов на основной дорожке). */
export function activeClipsAt(p: Project, t: number): { track: Track; clip: Clip; index: number }[] {
  const out: { track: Track; clip: Clip; index: number }[] = [];
  for (const track of p.tracks) {
    track.clips.forEach((clip, index) => {
      if (t >= clip.start - EPS && t < clipEnd(clip) - EPS) out.push({ track, clip, index });
    });
  }
  return out;
}

/** Время источника для клипа в момент таймлайна t. */
export function sourceTimeAt(c: MediaClip, t: number): number {
  return c.in + (t - c.start) * c.speed;
}

// ---------- реверс, кривая скорости, стоп-кадр ----------
/**
 * Переключает клип на копию фрагмента (r задан) или обратно на исходник (r = undefined).
 * assetId/in/out — что теперь показывает клип. Ключевые кадры переносятся, ИИ-обработку нужно сделать заново.
 */
export function setRetime(p: Project, clipId: string, r: Retime | undefined, assetId: string, inT: number, outT: number): Project {
  return edit(p, (d) => {
    const f = findClip(d, clipId);
    if (!f || f.clip.type !== 'media') return;
    const c = f.clip;
    c.keyframes = remapKeyframes(c.keyframes, c.retime, r);
    if (r) c.retime = r;
    else delete c.retime;
    c.assetId = assetId;
    c.in = round(inT);
    c.out = round(outT);
    if (r?.ramp) c.speed = 1;
    const reset = <T extends { enabled: boolean; status: string; path?: string; range?: [number, number] }>(x: T): T =>
      ({ ...x, status: 'none', path: undefined, range: undefined });
    c.removeBg = reset(c.removeBg);
    c.denoise = reset(c.denoise);
    if (c.stab) c.stab = reset(c.stab);
    if (c.beauty) c.beauty = reset(c.beauty);
    if (c.voice) c.voice = reset(c.voice);
    sanitizeMedia(d, c);
    pruneDerived(d);
  });
}

/** Убирает служебные копии, на которые не ссылается ни один клип. */
function pruneDerived(d: Project): void {
  const used = new Set<string>();
  // клипы внутри групп (в том числе вложенных) тоже держат свои файлы — они вернутся при разгруппировке
  const walk = (tracks: Track[]) => {
    for (const t of tracks) {
      for (const c of t.clips) {
        if (c.type !== 'media') continue;
        used.add(c.assetId);
        if (c.group) walk(c.group.tracks);
      }
    }
  };
  walk(d.tracks);
  d.assets = d.assets.filter((a) => !a.derived || used.has(a.id));
}

/**
 * Стоп-кадр: в момент t клип разрезается, между частями встаёт картинка (assetId) длиной dur.
 * На основной дорожке всё дальше сдвигается само, на дорожке наложений — сдвигаются клипы после t.
 */
export function insertFreeze(p: Project, clipId: string, t: number, assetId: string, dur: number): AddResult {
  let newId = '';
  const project = edit(p, (d) => {
    const f = findClip(d, clipId);
    const asset = d.assets.find((a) => a.id === assetId);
    if (!f || f.clip.type !== 'media' || !asset) return;
    const c = f.clip;
    const props = mediaPropsAt(c, t);
    const img = newMediaClip(asset, t);
    newId = img.id;
    img.out = round(dur);
    Object.assign(img, {
      fit: c.fit, color: structuredClone(c.color), mask: c.mask && structuredClone(c.mask), blend: c.blend,
      chroma: c.removeBg.enabled ? undefined : c.chroma && structuredClone(c.chroma), effects: c.effects && structuredClone(c.effects),
      grade: c.grade && structuredClone(c.grade),
      transform: { scale: props.scale, x: props.x, y: props.y, rotation: props.rotation },
    });
    if (props.opacity < 1) img.opacity = props.opacity;
    const track = f.track;
    // разрезаем исходный клип (если t внутри) — правая часть начинается после стоп-кадра
    let idx = f.index + 1;
    if (t <= c.start + EPS) idx = f.index;
    else if (t < clipEnd(c) - EPS) {
      const srcT = round(snapFrame(c.in + (t - c.start) * c.speed, d.settings.fps));
      if (srcT > c.in + 1e-6 && srcT < c.out - 1e-6) {
        const right: MediaClip = structuredClone(c);
        right.id = uid('clip');
        right.in = srcT;
        right.start = round(t);
        right.fadeIn = 0;
        c.out = srcT;
        c.fadeOut = 0;
        delete c.transitionOut;
        track.clips.splice(f.index + 1, 0, right);
      }
    }
    if (track.kind === 'main') {
      track.clips.splice(idx, 0, img);
    } else {
      for (const x of track.clips) if (x.start >= t - EPS) x.start = round(x.start + dur);
      img.start = round(t);
      track.clips.splice(idx, 0, img);
      track.clips.sort((a, b) => a.start - b.start);
    }
  });
  return { project, clipId: newId };
}

// ---------- составные клипы (группы) ----------
/** Проверяет выделение и собирает содержимое группы. Ошибка — понятным текстом. */
export function planGroup(p: Project, ids: string[]): { data: GroupData; t0: number; sub: Project } | { error: string } {
  const found = ids.map((id) => findClip(p, id)).filter((f): f is NonNullable<typeof f> => !!f);
  if (found.length < 2) return { error: 'Выдели два клипа или больше (Shift или Ctrl + клик)' };
  const visual = found.some((f) => f.clip.type === 'text' || assetOf(p, f.clip as MediaClip)?.kind !== 'audio');
  if (!visual) return { error: 'В группе должен быть хотя бы один видеоклип, фото или текст' };
  const mainF = found.filter((f) => f.track.kind === 'main').sort((a, b) => a.index - b.index);
  for (let i = 1; i < mainF.length; i++) {
    if (mainF[i].index !== mainF[i - 1].index + 1) return { error: 'Клипы основной дорожки в группе должны идти подряд' };
  }
  let t0 = Math.min(...found.map((f) => f.clip.start));
  let t1 = Math.max(...found.map((f) => clipEnd(f.clip)));
  if (mainF.length) {
    const a = mainF[0].clip.start;
    const b = clipEnd(mainF[mainF.length - 1].clip);
    if (t0 < a - EPS || t1 > b + EPS) return { error: 'Наложения и текст в группе не должны выходить за начало и конец выделенных клипов основной дорожки — подрежь их' };
    t0 = a;
    t1 = b;
  }
  const dur = round(t1 - t0);
  const main = newTrack('main');
  mainF.forEach((f, i) => {
    const c = structuredClone(f.clip) as MediaClip;
    c.start = round(c.start - t0);
    if (i === mainF.length - 1) delete c.transitionOut; // переход к следующему клипу снаружи группы остаётся у самой группы
    main.clips.push(c);
  });
  const tracks: Track[] = [main];
  for (const t of p.tracks) {
    if (t.kind === 'main') continue;
    const mine = found.filter((f) => f.track.id === t.id);
    if (!mine.length) continue;
    const nt: Track = { ...newTrack(t.kind, t.name), muted: t.muted, hidden: t.hidden, clips: [] };
    for (const f of mine) {
      const c = structuredClone(f.clip);
      c.start = round(c.start - t0);
      nt.clips.push(c);
    }
    nt.clips.sort((a, b) => a.start - b.start);
    tracks.push(nt);
  }
  const data: GroupData = { tracks, alpha: mainF.length === 0, duration: dur };
  const sub: Project = { ...structuredClone(p), tracks: structuredClone(tracks), name: `${p.name} — группа` };
  return { data, t0, sub };
}

/** Заменяет выделенные клипы одним составным клипом (assetId — отрисованная группа). */
export function applyGroup(p: Project, ids: string[], assetId: string, data: GroupData, t0: number): AddResult {
  let clipId = '';
  const project = edit(p, (d) => {
    const asset = d.assets.find((a) => a.id === assetId);
    if (!asset) return;
    const mainT = mainTrack(d);
    const mainIdx = mainT.clips.findIndex((c) => ids.includes(c.id));
    const lastMain = [...mainT.clips].reverse().find((c) => ids.includes(c.id)) as MediaClip | undefined;
    const prefTrack = d.tracks.find((t) => t.kind === 'video' && t.clips.some((c) => ids.includes(c.id)))?.id;
    const clip = newMediaClip(asset, t0);
    clip.out = round(Math.min(asset.duration || data.duration, data.duration));
    clip.group = data;
    clipId = clip.id;
    for (const t of d.tracks) t.clips = t.clips.filter((c) => !ids.includes(c.id));
    if (mainIdx >= 0) {
      if (lastMain?.transitionOut) clip.transitionOut = lastMain.transitionOut;
      mainT.clips.splice(mainIdx, 0, clip);
    } else {
      placeFree(d, 'video', clip, prefTrack);
    }
    cleanupEmptyTracks(d);
    pruneDerived(d);
  });
  return { project, clipId };
}

/** Разгруппировать: вернуть клипы на место (относительно текущего начала группы). */
export function ungroupClip(p: Project, clipId: string): { project: Project; ids: string[] } {
  const ids: string[] = [];
  const project = edit(p, (d) => {
    const f = findClip(d, clipId);
    if (!f || f.clip.type !== 'media' || !f.clip.group) return;
    const g = f.clip.group;
    const at = f.clip.start;
    const tr = f.clip.transitionOut;
    f.track.clips.splice(f.index, 1);
    const [gm, ...rest] = g.tracks;
    if (gm?.clips.length) {
      const mainT = mainTrack(d);
      const idx = f.track.kind === 'main' ? f.index : mainT.clips.length;
      const restored = gm.clips.map((c) => ({ ...structuredClone(c), id: uid('clip') }) as MediaClip);
      if (tr && restored.length) restored[restored.length - 1].transitionOut = tr;
      mainT.clips.splice(idx, 0, ...restored);
      ids.push(...restored.map((c) => c.id));
    }
    for (const t of rest) {
      for (const c0 of t.clips) {
        const c = structuredClone(c0);
        c.id = uid(c.type === 'text' ? 'txt' : 'clip');
        c.start = round(c.start + at);
        ids.push(c.id);
        // на свою дорожку того же вида, если там свободно, иначе — на новую
        placeFree(d, t.kind as Exclude<TrackKind, 'main'>, c);
      }
    }
    cleanupEmptyTracks(d);
    pruneDerived(d);
  });
  return { project, ids };
}

export { IMAGE_DEFAULT_DURATION };
