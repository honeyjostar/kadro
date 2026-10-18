// Операции над таймлайном. Все функции чистые: принимают проект и возвращают новый.
import { IMAGE_DEFAULT_DURATION, newMediaClip, newTextClip, newTrack, uid } from './defaults';
import type { Clip, MediaAsset, MediaClip, Project, TextClip, TextStyle, Track, TrackKind, Transition } from './types';

export const MIN_CLIP = 0.1;      // минимальная длина клипа на таймлайне, сек
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
  if (!a || a.kind === 'image') return Infinity;
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
      c.duration = round(t - c.start);
      right.start = round(t);
      right.duration = round(right.duration - c.duration);
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

/** Перемещение клипа по свободной дорожке (или на другую дорожку того же вида). */
export function moveClip(p: Project, clipId: string, start: number, targetTrackId?: string): Project {
  return edit(p, (d) => {
    const f = findClip(d, clipId);
    if (!f) return;
    if (f.track.kind === 'main') return; // для основной — reorderMain
    const c = f.clip;
    c.start = round(Math.max(0, start));
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

/** Перенос клипа с основной дорожки на дорожку наложения. */
export function mainToOverlay(p: Project, clipId: string, start: number): Project {
  return edit(p, (d) => {
    const f = findClip(d, clipId);
    if (!f || f.track.kind !== 'main' || f.clip.type !== 'media') return;
    const c = f.clip;
    f.track.clips.splice(f.index, 1);
    delete c.transitionOut;
    c.start = round(Math.max(0, start));
    c.transform = { ...c.transform, scale: 0.6 };
    placeFree(d, 'video', c);
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

export interface Cue { start: number; end: number; text: string }

/** Создать (или заменить) дорожку субтитров. */
export function setCaptions(p: Project, cues: Cue[], style: TextStyle, y = 0.72): Project {
  return edit(p, (d) => {
    d.tracks = d.tracks.filter((t) => !(t.kind === 'text' && t.clips.length > 0 && t.clips.every((c) => c.type === 'text' && c.role === 'caption')));
    if (cues.length === 0) return;
    const t = newTrack('text', 'Субтитры');
    for (const q of cues) {
      const c = newTextClip(round(q.start), q.text, style, 'caption');
      c.duration = round(Math.max(MIN_CLIP, q.end - q.start));
      c.y = y;
      t.clips.push(c);
    }
    insertTrack(d, t);
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

export { IMAGE_DEFAULT_DURATION };
