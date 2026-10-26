// Действия редактора, которые вызываются из разных мест интерфейса.
import { aiCovers, aiSource, aiStale, videoInputFor, videoSource } from '../shared/ai';
import { normalizeRamp, originalRange } from '../shared/retime';
import { reframeKeyframes } from '../shared/reframe';
import { CAPTION_STYLE, newProject, shortSideOf, sizeFor } from '../shared/defaults';
import { exportSize } from '../shared/geometry';
import type { AiJob, AiResponse, DemoFiles, ExportResult, TtsVoiceId } from '../shared/ipc';
import {
  addAsset, addFree, addToMain, alignMainToBeats, beatTimes, deleteClips, duplicateClip, findClip, keepSourceRanges, projectDuration, setCaptions,
  splitClip, updateAsset, updateClip, clipEnd, insertFreeze, setRetime, planGroup, applyGroup, ungroupClip, setSettings, type SourceRange,
} from '../shared/timeline';
import { renderTextLayers } from './engine/textExport';
import { DEMO_SCENES, DEMO_TEMPLATE, applyTemplate, projectToTemplate, type Template } from '../shared/templates';
import { autoEdit, type AutoSummary, type Highlights } from '../shared/autoEdit';
import type { AspectKey, ExportOptions, MediaAsset, MediaClip, Model3D, Project, RampPoint, Retime, VoiceEffect } from '../shared/types';
import { api, getState, takeEarlyPatches, type AutoParams } from './store';
import { fmtDur, fmtTime, plural, uidShort } from './util';
import { VoiceRecorder } from './recorder';

// ---------- импорт ----------
export async function importPaths(paths: string[], place?: { mode: 'main' | 'overlay' | 'auto'; at?: number }): Promise<string[]> {
  if (!paths.length) return [];
  const s = getState();
  const jobId = `import_${uidShort()}`;
  s.setJob({ id: jobId, label: paths.length > 1 ? `Добавляю файлы (${paths.length})` : 'Добавляю файл', progress: 0.3, cancellable: false });
  try {
    const r = await api.importMedia(paths);
    for (const e of r.errors) s.toast(`Не получилось открыть «${e.path.split(/[\\/]/).pop()}»: ${e.message}`, 'err');
    if (!r.assets.length) return [];
    getState().commit((p) => r.assets.reduce((acc, a) => addAsset(acc, a), p));
    const ids = r.assets.map((a) => a.id);
    takeEarlyPatches(ids);
    if (place) {
      let at = place.at ?? getState().playhead;
      for (const a of r.assets) {
        const id = addAssetToTimeline(a.id, place.mode, at);
        const f = id ? findClip(getState().project, id) : undefined;
        if (f) at = clipEnd(f.clip);
      }
    }
    return ids;
  } finally {
    getState().setJob(null, jobId);
  }
}

/**
 * Файлы из библиотеки — на таймлайн по порядку (от курсора или от at). Файл, который уже есть в проекте,
 * второй раз не импортируется: берётся тот же.
 */
export async function placeLibraryFiles(paths: string[], place: { mode: 'main' | 'overlay' | 'auto'; at?: number } = { mode: 'auto' }): Promise<void> {
  if (!paths.length) return;
  const have = new Map(getState().project.assets.filter((a) => !a.derived && !a.missing).map((a) => [a.path, a.id]));
  const fresh = paths.filter((p) => !have.has(p));
  if (fresh.length) {
    const ids = await importPaths(fresh);
    ids.forEach((id) => { const a = getState().project.assets.find((x) => x.id === id); if (a) have.set(a.path, id); });
  }
  let at = place.at ?? getState().playhead;
  for (const p of paths) {
    const id = have.get(p);
    if (!id) continue;
    const clipId = addAssetToTimeline(id, place.mode, at);
    const f = clipId ? findClip(getState().project, clipId) : undefined;
    if (f) at = clipEnd(f.clip);
  }
}

/** Папки, брошенные в окно, — в библиотеку; файлы — в проект. */
export async function dropPaths(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const dirs = await api.whichDirs(paths);
  const folders = paths.filter((_, i) => dirs[i]);
  const files = paths.filter((_, i) => !dirs[i]);
  if (folders.length) {
    await api.libAdd(folders);
    getState().setLeftTab('media');
    getState().setLibJump(folders[0]);
    getState().toast(folders.length === 1 ? `Папка «${folders[0].split(/[\\/]/).pop()}» добавлена в библиотеку` : `Папок добавлено в библиотеку: ${folders.length}`, 'ok');
  }
  if (files.length) {
    const empty = projectDuration(getState().project) === 0;
    await importPaths(files, empty ? { mode: 'auto', at: 0 } : undefined);
  }
}

export async function pickAndImport(place?: { mode: 'main' | 'overlay' | 'auto'; at?: number }): Promise<void> {
  const paths = await api.pickMedia();
  await importPaths(paths, place);
}

/** Добавить файл из медиатеки на таймлайн. auto: видео/фото — на основную, звук — на аудиодорожку. */
export function addAssetToTimeline(assetId: string, mode: 'main' | 'overlay' | 'auto', at?: number, range?: SourceRange): string | null {
  const s = getState();
  const a = s.project.assets.find((x) => x.id === assetId);
  if (!a) return null;
  const t = at ?? s.playhead;
  let clipId: string | null = null;
  s.commit((p) => {
    const r = a.kind === 'audio' || mode === 'overlay' ? addFree(p, assetId, t, range) : addToMain(p, assetId, t, range);
    clipId = r.clipId;
    return r.project;
  });
  if (clipId) { s.select([clipId]); s.revealClip(clipId); }
  return clipId;
}

/**
 * Музыка и звуки из раздела «Аудио»: сразу на таймлайн — с начала ролика или к курсору (как выбрано),
 * или только в список. Добавленный клип выделяется, таймлайн прокручивается к нему.
 */
export async function importAudio(paths?: string[]): Promise<string[]> {
  const files = paths ?? await api.pickMedia();
  if (!files.length) return [];
  const where = getState().audioPlace;
  const ids = await importPaths(files, where === 'list' ? undefined : { mode: 'auto', at: where === 'start' ? 0 : getState().playhead });
  if (!ids.length) return ids;
  const s = getState();
  if (where === 'list') s.toast(ids.length === 1 ? 'Файл в списке — перетащи его на таймлайн или нажми «+»' : `Файлов в списке: ${ids.length}`, 'ok');
  else s.toast(`На дорожке звука${where === 'start' ? ' с начала ролика' : ` с ${fmtTime(s.playhead)}`}`, 'ok');
  return ids;
}

/** Где этот файл на таймлайне: выделить его клипы, курсор — к первому. */
export function findOnTimeline(assetId: string): boolean {
  const s = getState();
  const clips = s.project.tracks.flatMap((t) => t.clips).filter((c) => c.type === 'media' && (c.assetId === assetId || c.retime?.assetId === assetId))
    .sort((a, b) => a.start - b.start);
  if (!clips.length) { s.toast('Этого файла на таймлайне нет'); return false; }
  s.select(clips.map((c) => c.id));
  s.setPlaying(false);
  s.setPlayhead(clips[0].start);
  s.revealClip(clips[0].id);
  return true;
}

// ---------- правка ----------
export function splitAtPlayhead(): void {
  const s = getState();
  const t = s.playhead;
  const targets = s.selection.length
    ? s.selection
    : s.project.tracks.flatMap((tr) => tr.clips.filter((c) => t > c.start && t < clipEnd(c)).map((c) => c.id)).slice(0, 1);
  if (!targets.length) { s.toast('Поставь курсор на клип, который нужно разрезать'); return; }
  let last: string | null = null;
  s.commit((p) => targets.reduce((acc, id) => {
    const r = splitClip(acc, id, t);
    if (r.clipId) last = r.clipId;
    return r.project;
  }, p));
  if (last) s.select([last]);
}

export function deleteSelection(): void {
  const s = getState();
  if (!s.selection.length) return;
  s.commit((p) => deleteClips(p, s.selection));
  s.select([]);
}

export function duplicateSelection(): void {
  const s = getState();
  if (s.selection.length !== 1) return;
  let id = '';
  s.commit((p) => { const r = duplicateClip(p, s.selection[0]); id = r.clipId; return r.project; });
  if (id) s.select([id]);
}

// ---------- ИИ ----------
let progressHooked = false;
function hookProgress(): void {
  if (progressHooked) return;
  progressHooked = true;
  api.onAiProgress((jobId, p, stage) => {
    const j = getState().jobs[jobId];
    if (j) getState().setJob({ ...j, progress: p, stage: stage ?? j.stage });
  });
}

async function runJob(label: string, job: AiJob, clipId?: string, cancellable = true): Promise<AiResponse> {
  hookProgress();
  const s = getState();
  s.setJob({ id: job.jobId, label, progress: 0, clipId, cancellable });
  try {
    return await api.runAi(job);
  } finally {
    getState().setJob(null, job.jobId);
  }
}

export function cancelJob(id: string): void { api.cancelAi(id); }

export function jobForClip(clipId: string): boolean {
  return Object.values(getState().jobs).some((j) => j.clipId === clipId);
}

function mediaClip(clipId: string): { clip: MediaClip; p: Project } | null {
  const p = getState().project;
  const f = findClip(p, clipId);
  if (!f || f.clip.type !== 'media') return null;
  return { clip: f.clip, p };
}

/** GIF играет по кругу — обработка фрагмента исходника к нему не применяется. */
function gifBlocked(p: Project, c: MediaClip, what: string): boolean {
  const a = p.assets.find((x) => x.id === c.assetId);
  if (!a?.loop) return false;
  getState().toast(`${what} не работает с GIF — только с обычным видео`);
  return true;
}

export async function removeBackground(clipId: string): Promise<void> {
  const m = mediaClip(clipId);
  if (!m || gifBlocked(m.p, m.clip, 'Удаление фона')) return;
  const a = m.p.assets.find((x) => x.id === m.clip.assetId);
  if (!a || a.kind !== 'video') { getState().toast('Удаление фона работает с видео'); return; }
  const st = videoInputFor(m.clip, 'removeBg');
  const src = st ? { path: st.path, off: st.offset } : { path: a.path, off: 0 };
  const r = await runJob('Удаляю фон', { kind: 'removeBg', jobId: `bg_${uidShort()}`, path: src.path, in: m.clip.in - src.off, out: m.clip.out - src.off, offset: src.off, width: a.width, height: a.height, fps: Math.min(60, a.fps || 30) }, clipId);
  if (!r.ok || r.output?.kind !== 'removeBg') { if (r.error !== 'Отменено') getState().toast(`Фон убрать не удалось: ${r.error}`, 'err'); return; }
  const out = r.output;
  getState().commit((p) => updateClip(p, clipId, { removeBg: { enabled: true, status: 'ready', path: out.path, range: out.range } }));
  getState().toast('Фон удалён', 'ok');
}

export function disableRemoveBg(clipId: string): void {
  getState().commit((p) => {
    const f = findClip(p, clipId);
    if (!f || f.clip.type !== 'media') return p;
    return updateClip(p, clipId, { removeBg: { ...f.clip.removeBg, enabled: false } });
  });
}

export async function enhanceVoice(clipId: string): Promise<void> {
  const m = mediaClip(clipId);
  if (!m) return;
  const a = m.p.assets.find((x) => x.id === m.clip.assetId);
  if (!a || !a.hasAudio) { getState().toast('В этом клипе нет звука'); return; }
  const r = await runJob('Улучшаю голос', { kind: 'denoise', jobId: `dn_${uidShort()}`, path: a.path, in: m.clip.in, out: m.clip.out }, clipId);
  if (!r.ok || r.output?.kind !== 'denoise') { if (r.error !== 'Отменено') getState().toast(`Не получилось: ${r.error}`, 'err'); return; }
  const out = r.output;
  getState().commit((p) => updateClip(p, clipId, { denoise: { enabled: true, status: 'ready', path: out.path, range: out.range } }));
  getState().toast('Голос очищен от шума', 'ok');
  await refreshVoice(clipId);
}

export function disableDenoise(clipId: string): void {
  getState().commit((p) => {
    const f = findClip(p, clipId);
    if (!f || f.clip.type !== 'media') return p;
    return updateClip(p, clipId, { denoise: { ...f.clip.denoise, enabled: false } });
  });
  void refreshVoice(clipId);
}

// ---------- голос: эффекты ----------
/** Включить эффект голоса (обрабатывает звук фрагмента; чистка шума учитывается). */
export async function setVoiceEffect(clipId: string, effect: VoiceEffect): Promise<void> {
  const m = mediaClip(clipId);
  if (!m) return;
  if (effect === 'none') {
    getState().commit((p) => updateClip(p, clipId, { voice: { enabled: false, status: 'none', effect: 'none' } }));
    return;
  }
  const a = m.p.assets.find((x) => x.id === m.clip.assetId);
  if (!a || !a.hasAudio) { getState().toast('В этом клипе нет звука'); return; }
  const withDenoise = m.clip.denoise.enabled;
  const r = await runJob('Меняю голос', { kind: 'voice', jobId: `vo_${uidShort()}`, path: a.path, in: m.clip.in, out: m.clip.out, effect, denoise: withDenoise }, clipId);
  if (!r.ok || r.output?.kind !== 'voice') { if (r.error !== 'Отменено') getState().toast(`Не получилось: ${r.error}`, 'err'); return; }
  const out = r.output;
  getState().commit((p) => updateClip(p, clipId, { voice: { enabled: true, status: 'ready', path: out.path, range: out.range, effect, withDenoise } }));
}

/** Эффект голоса пересчитывается, если поменялась чистка шума. */
async function refreshVoice(clipId: string): Promise<void> {
  const m = mediaClip(clipId);
  const fx = m?.clip.voice?.effect;
  if (!m || !fx || fx === 'none') return;
  if (m.clip.voice?.withDenoise === m.clip.denoise.enabled && aiCovers(m.clip.voice, m.clip.in, m.clip.out)) return;
  await setVoiceEffect(clipId, fx);
}

// ---------- стабилизация ----------
export async function stabilizeClip(clipId: string, strength = 0.5): Promise<void> {
  const m = mediaClip(clipId);
  if (!m || gifBlocked(m.p, m.clip, 'Стабилизация')) return;
  const a = m.p.assets.find((x) => x.id === m.clip.assetId);
  if (!a || a.kind !== 'video') { getState().toast('Стабилизация работает с видео'); return; }
  const r = await runJob('Стабилизирую', { kind: 'stab', jobId: `st_${uidShort()}`, path: a.path, in: m.clip.in, out: m.clip.out, strength }, clipId);
  if (!r.ok || r.output?.kind !== 'stab') { if (r.error !== 'Отменено') getState().toast(`Не получилось: ${r.error}`, 'err'); return; }
  const out = r.output;
  getState().commit((p) => updateClip(p, clipId, { stab: { enabled: true, status: 'ready', path: out.path, range: out.range } }));
  getState().toast('Видео стабилизировано', 'ok');
  await rebuildAfter(clipId, 'stab');
}
export function disableStab(clipId: string): void {
  getState().commit((p) => {
    const f = findClip(p, clipId);
    if (!f || f.clip.type !== 'media' || !f.clip.stab) return p;
    return updateClip(p, clipId, { stab: { ...f.clip.stab, enabled: false } });
  });
  void rebuildAfter(clipId, 'stab');
}

/** Обработки картинки идут цепочкой (стабилизация → ретушь → без фона): после смены звена пересобираем следующие. */
async function rebuildAfter(clipId: string, changed: 'stab' | 'beauty'): Promise<void> {
  const c = mediaClip(clipId)?.clip;
  if (!c) return;
  if (changed === 'stab' && c.beauty?.enabled) { await retouchClip(clipId, c.beauty.smooth, c.beauty.bright); return; }
  if (c.removeBg.enabled) await removeBackground(clipId);
}

// ---------- ретушь ----------
export async function retouchClip(clipId: string, smooth: number, bright: number): Promise<void> {
  const m = mediaClip(clipId);
  if (!m || gifBlocked(m.p, m.clip, 'Ретушь')) return;
  const a = m.p.assets.find((x) => x.id === m.clip.assetId);
  if (!a || a.kind !== 'video') { getState().toast('Ретушь работает с видео'); return; }
  if (smooth < 0.01 && bright < 0.01) { disableRetouch(clipId); return; }
  const st = videoInputFor(m.clip, 'beauty');
  const src = st ? { path: st.path, off: st.offset } : { path: a.path, off: 0 };
  const r = await runJob('Ретушь', {
    kind: 'beauty', jobId: `be_${uidShort()}`, path: src.path, in: m.clip.in - src.off, out: m.clip.out - src.off, offset: src.off,
    smooth, bright, width: a.width, height: a.height,
  }, clipId);
  if (!r.ok || r.output?.kind !== 'beauty') { if (r.error !== 'Отменено') getState().toast(`Не получилось: ${r.error}`, 'err'); return; }
  const out = r.output;
  getState().commit((p) => updateClip(p, clipId, { beauty: { enabled: true, status: 'ready', path: out.path, range: out.range, smooth, bright } }));
  getState().toast('Ретушь готова', 'ok');
  await rebuildAfter(clipId, 'beauty');
}
export function disableRetouch(clipId: string): void {
  getState().commit((p) => {
    const f = findClip(p, clipId);
    if (!f || f.clip.type !== 'media' || !f.clip.beauty) return p;
    return updateClip(p, clipId, { beauty: { ...f.clip.beauty, enabled: false } });
  });
  void rebuildAfter(clipId, 'beauty');
}

// ---------- ритм ----------
export async function findBeats(assetId: string): Promise<boolean> {
  const a = getState().project.assets.find((x) => x.id === assetId);
  if (!a || !a.hasAudio) { getState().toast('В этом файле нет звука'); return false; }
  const r = await runJob('Ищу ритм', { kind: 'beats', jobId: `bt_${uidShort()}`, path: a.path });
  if (!r.ok || r.output?.kind !== 'beats') { if (r.error !== 'Отменено') getState().toast(`Не получилось: ${r.error}`, 'err'); return false; }
  const { beats, bpm } = r.output;
  if (!beats.length) { getState().toast('Ритм не найден — слишком тихо или нет ударных'); return false; }
  getState().commit((p) => updateAsset(p, assetId, { beats, bpm }));
  getState().toast(`Ритм найден: ${Math.round(bpm)} ударов в минуту, ${beats.length} долей`, 'ok');
  return true;
}
export function alignToBeats(): void {
  const s = getState();
  const beats = beatTimes(s.project);
  if (!beats.length) { s.toast('Сначала найди ритм у музыки: выдели музыку и нажми «Ритм»'); return; }
  s.commit((p) => alignMainToBeats(p, beats));
  s.toast('Склейки подогнаны под доли такта', 'ok');
}

// ---------- автокадрирование ----------
export async function autoReframe(clipId: string): Promise<void> {
  const m = mediaClip(clipId);
  if (!m || gifBlocked(m.p, m.clip, 'Автокадрирование')) return;
  const a = m.p.assets.find((x) => x.id === m.clip.assetId);
  if (!a || a.kind !== 'video') { getState().toast('Автокадрирование работает с видео'); return; }
  const st = aiSource(m.clip, 'stab');
  const src = st ? { path: st.path, off: st.offset } : { path: a.path, off: 0 };
  const r = await runJob('Автокадрирование', { kind: 'reframe', jobId: `rf_${uidShort()}`, path: src.path, in: m.clip.in - src.off, out: m.clip.out - src.off, width: a.width, height: a.height }, clipId);
  if (!r.ok || r.output?.kind !== 'reframe') { if (r.error !== 'Отменено') getState().toast(`Не получилось: ${r.error}`, 'err'); return; }
  const pts = r.output.points.map((q) => ({ ...q, t: q.t + src.off }));
  if (!pts.some((q) => q.found)) { getState().toast('Человек в кадре не найден — кадр оставлен по центру'); return; }
  const { width: W, height: H } = getState().project.settings;
  const scale = Math.max(1, m.clip.transform.scale);
  const k = reframeKeyframes(pts, a.width, a.height, W, H, scale);
  getState().commit((p) => updateClip(p, clipId, {
    fit: 'cover',
    transform: { ...m.clip.transform, scale, x: 0, y: 0 },
    keyframes: { ...m.clip.keyframes, x: k.x.length ? k.x : undefined, y: k.y.length ? k.y : undefined },
  }));
  getState().toast('Кадр следует за человеком', 'ok');
}

// ---------- реверс и кривая скорости ----------
/**
 * Меняет реверс и/или кривую скорости клипа. ramp: undefined — оставить как есть, null — убрать.
 * Копия фрагмента строится из исходника заново; без реверса и кривой клип возвращается к исходнику.
 */
/** Кривая, которую видит пользователь (при плавном замедлении в копию вшита кривая × скорость). */
export function userCurve(r: Retime | undefined): RampPoint[] | undefined {
  return r?.smooth ? r.userRamp : r?.ramp;
}
/** Скорость клипа, как её видит пользователь. */
export function userSpeed(c: MediaClip): number {
  return c.retime?.smooth ? c.retime.speed ?? 1 : c.speed;
}

export async function retimeClip(clipId: string, opts: { reverse?: boolean; ramp?: RampPoint[] | null; preset?: string; smooth?: boolean; speed?: number }): Promise<void> {
  const m = mediaClip(clipId);
  if (!m || gifBlocked(m.p, m.clip, 'Реверс, кривая скорости и плавное замедление')) return;
  const c = m.clip;
  const orig = originalRange(c);
  const src = m.p.assets.find((a) => a.id === orig.assetId);
  if (!src || src.kind === 'image') { getState().toast('Реверс, кривая скорости и плавное замедление работают с видео и звуком'); return; }
  if (src.missing) { getState().toast(`Файл «${src.name}» не найден на диске`, 'err'); return; }
  const reverse = opts.reverse ?? c.retime?.reverse ?? false;
  const ramp = opts.ramp === undefined ? userCurve(c.retime) : opts.ramp ?? undefined;
  const preset = opts.ramp === undefined ? c.retime?.preset : opts.ramp ? opts.preset ?? 'custom' : undefined;
  const smooth = (opts.smooth ?? c.retime?.smooth ?? false) && src.hasVideo;
  const speed = opts.speed ?? userSpeed(c);
  const same = (q: Project) => {
    const f = findClip(q, clipId);
    if (!f || f.clip.type !== 'media') return false;
    const o = originalRange(f.clip);
    return o.assetId === orig.assetId && Math.abs(o.in - orig.in) < 1e-3 && Math.abs(o.out - orig.out) < 1e-3;
  };
  if (!reverse && !ramp && !smooth) {
    getState().commit((p) => updateClip(setRetime(p, clipId, undefined, orig.assetId, orig.in, orig.out), clipId, { speed }));
    await reprocessAi(clipId);
    return;
  }
  // плавно: скорость клипа вшивается в копию (кривая × скорость), а сам клип играет её 1:1
  const userRamp = ramp && normalizeRamp(ramp);
  const effRamp = smooth ? normalizeRamp((userRamp ?? [{ x: 0, v: 1 }, { x: 1, v: 1 }]).map((q) => ({ x: q.x, v: q.v * speed }))) : userRamp;
  const r: Retime = {
    assetId: orig.assetId, in: orig.in, out: orig.out, reverse, ramp: effRamp, preset,
    ...(smooth ? { smooth: true, speed, userRamp } : {}),
  };
  const label = smooth ? 'Плавное замедление' : reverse && !ramp ? 'Переворачиваю клип' : 'Меняю скорость';
  const res = await runJob(label, {
    kind: 'retime', jobId: `rt_${uidShort()}`, path: src.path, in: r.in, out: r.out, reverse, ramp: r.ramp, smooth,
    hasVideo: src.hasVideo, hasAudio: src.hasAudio, width: src.width, height: src.height,
    // плавное — сразу в частоте проекта (дорисованные кадры как раз на неё); иначе — как у исходника
    fps: smooth ? getState().project.settings.fps || src.fps : src.fps || getState().project.settings.fps,
  }, clipId);
  if (!res.ok || res.output?.kind !== 'retime') { if (res.error !== 'Отменено') getState().toast(`Не получилось: ${res.error}`, 'err'); return; }
  const out = res.output;
  const what = [reverse && 'реверс', smooth && 'плавно', !smooth && ramp && 'кривая скорости'].filter(Boolean).join(', ');
  const asset = await importDerived(out.path, `${src.name} · ${what}`);
  if (!asset) return;
  if (!same(getState().project)) { getState().toast('Клип изменился, пока шла обработка — повтори действие'); return; }
  getState().commit((p) => {
    const q = setRetime(addAsset(p, asset), clipId, r, asset.id, 0, Math.min(asset.duration || out.duration, out.duration));
    // только реверс без кривой — скорость остаётся у клипа
    return r.ramp ? q : updateClip(q, clipId, { speed });
  });
  takeEarlyPatches([asset.id]);
  await reprocessAi(clipId);
}

/** Добавляет служебный файл (копию, кадр) как скрытый ресурс проекта. */
async function importDerived(path: string, name: string): Promise<MediaAsset | null> {
  const imp = await api.importMedia([path]);
  const asset = imp.assets[0];
  if (!asset) { getState().toast(`Не получилось добавить результат: ${imp.errors[0]?.message ?? ''}`, 'err'); return null; }
  asset.name = name;
  asset.derived = true;
  return asset;
}

/** После смены источника клипа — повторить включённую ИИ-обработку. */
async function reprocessAi(clipId: string): Promise<void> {
  const m = mediaClip(clipId);
  if (!m) return;
  if (m.clip.stab?.enabled && aiStale(m.clip, 'stab')) await stabilizeClip(clipId); // сама пересоберёт ретушь и фон
  const c1 = mediaClip(clipId)?.clip;
  if (c1?.beauty?.enabled && aiStale(c1, 'beauty')) await retouchClip(clipId, c1.beauty.smooth, c1.beauty.bright);
  if (mediaClip(clipId)?.clip.removeBg.enabled && aiStale(mediaClip(clipId)!.clip, 'removeBg')) await removeBackground(clipId);
  if (mediaClip(clipId)?.clip.denoise.enabled && aiStale(mediaClip(clipId)!.clip, 'denoise')) await enhanceVoice(clipId);
  else await refreshVoice(clipId);
}

// ---------- извлечь звук ----------
/**
 * Звук видеоклипа — отдельным клипом на аудиодорожке: тот же кусок, скорость, громкость и затухания,
 * эффект голоса и чистый голос переносятся (обработка повторится для нового клипа). У видео звук выключается.
 */
export async function extractAudio(clipId: string): Promise<string | null> {
  const m = mediaClip(clipId);
  if (!m) return null;
  const c = m.clip;
  const a = m.p.assets.find((x) => x.id === c.assetId);
  if (!a || a.kind === 'audio') { getState().toast('Выдели видеоклип — у звукового клипа звук и так отдельно'); return null; }
  if (!a.hasAudio) { getState().toast('У этого клипа нет звука'); return null; }
  if (a.missing) { getState().toast(`Файл «${a.name}» не найден на диске`, 'err'); return null; }
  const jobId = `xa_${uidShort()}`;
  getState().setJob({ id: jobId, label: 'Извлекаю звук', progress: 0.3, cancellable: false, clipId });
  let file: string;
  try { file = await api.extractAudio(a.path); } catch (e) {
    getState().toast(`Не получилось извлечь звук: ${e instanceof Error ? e.message : String(e)}`, 'err');
    return null;
  } finally { getState().setJob(null, jobId); }
  const r = await api.importMedia([file]);
  const au = r.assets[0];
  if (!au) { getState().toast('Не получилось открыть извлечённый звук', 'err'); return null; }
  let newId = '';
  getState().commit((p) => {
    let q = addAsset(p, au);
    const f = findClip(q, clipId);
    if (!f || f.clip.type !== 'media') return p;
    const v = f.clip;
    const add = addFree(q, au.id, v.start);
    newId = add.clipId;
    q = updateClip(add.project, newId, {
      in: v.in, out: Math.min(v.out, au.duration), speed: v.speed, volume: v.volume, fadeIn: v.fadeIn, fadeOut: v.fadeOut,
      denoise: { ...v.denoise, status: 'none', path: undefined, range: undefined },
      ...(v.voice ? { voice: { ...v.voice, status: 'none', path: undefined, range: undefined } } : {}),
    });
    return updateClip(q, clipId, { muted: true });
  });
  takeEarlyPatches([au.id]);
  if (!newId) return null;
  getState().select([newId]);
  getState().toast('Звук на отдельной дорожке — его можно резать, двигать и обрабатывать отдельно. У видео звук выключен', 'ok');
  await reprocessAi(newId);
  return newId;
}

// ---------- стоп-кадр ----------
/** Клип для стоп-кадра: выделенный (если под курсором) или клип основной дорожки под курсором. */
function freezeTarget(): MediaClip | null {
  const s = getState();
  const t = s.playhead;
  const ok = (c: unknown): c is MediaClip => {
    const x = c as MediaClip;
    if (!x || x.type !== 'media' || t < x.start - 1e-6 || t > clipEnd(x) + 1e-6) return false;
    const a = s.project.assets.find((q) => q.id === x.assetId);
    return !!a && a.kind === 'video';
  };
  if (s.selection.length === 1) {
    const f = findClip(s.project, s.selection[0]);
    if (f && ok(f.clip)) return f.clip;
  }
  const main = s.project.tracks.find((tr) => tr.kind === 'main')!;
  return main.clips.find(ok) ?? null;
}

export async function freezeFrame(dur = 2): Promise<void> {
  const c = freezeTarget();
  if (!c) { getState().toast('Стоп-кадр берётся из кадра под розовой линией времени. Передвинь её на видео и нажми ещё раз'); return; }
  const p = getState().project;
  const a = p.assets.find((x) => x.id === c.assetId)!;
  const t = getState().playhead;
  const fps = a.fps || p.settings.fps;
  let s = Math.min(c.out - 0.5 / fps, Math.max(c.in, c.in + (t - c.start) * c.speed));
  if (a.loop && a.duration > 0) s = Math.min(a.duration - 0.5 / fps, s % a.duration);
  const vs = videoSource(c);
  const res = await runJob('Делаю стоп-кадр', { kind: 'freeze', jobId: `fz_${uidShort()}`, path: vs?.path ?? a.path, t: s - (vs?.offset ?? 0), fps, alpha: !!vs?.alpha || !!a.loop }, c.id, false);
  if (!res.ok || res.output?.kind !== 'freeze') { getState().toast(`Не получилось: ${res.error}`, 'err'); return; }
  const asset = await importDerived(res.output.path, `Стоп-кадр · ${a.name}`);
  if (!asset) return;
  let id = '';
  getState().commit((q) => { const r = insertFreeze(addAsset(q, asset), c.id, t, asset.id, dur); id = r.clipId; return r.project; });
  takeEarlyPatches([asset.id]);
  if (id) getState().select([id]);
  getState().toast('Стоп-кадр добавлен', 'ok');
}

// ---------- запись голоса ----------
let recorder: VoiceRecorder | null = null;
export function voiceLevel(): number { return recorder?.level() ?? 0; }

/** Начать запись с микрофона: с текущего места, таймлайн играет, звук проекта по желанию заглушён. */
export async function startRecording(deviceId?: string, muteProject = true): Promise<boolean> {
  const s = getState();
  if (recorder || s.recording) return false;
  const r = new VoiceRecorder();
  try {
    await r.start(deviceId);
  } catch (e) {
    r.cancel();
    const name = (e as { name?: string }).name;
    s.toast(name === 'NotAllowedError' || name === 'SecurityError'
      ? 'Нет доступа к микрофону. В Windows: Параметры → Конфиденциальность → Микрофон → разрешить классическим приложениям.'
      : name === 'NotFoundError' ? 'Микрофон не найден — подключи его и попробуй снова.'
        : `Микрофон не включился: ${e instanceof Error ? e.message : String(e)}`, 'err');
    return false;
  }
  recorder = r;
  getState().setRecording({ startT: getState().playhead, muted: muteProject });
  if (projectDuration(getState().project) > getState().playhead + 0.05) getState().setPlaying(true);
  return true;
}

/** Закончить запись и положить её на аудиодорожку с того места, где начали. */
export async function stopRecording(): Promise<string | null> {
  const s = getState();
  const r = recorder;
  const rec = s.recording;
  if (!r || !rec) return null;
  recorder = null;
  s.setPlaying(false);
  s.setRecording(null);
  const jobId = `rec_${uidShort()}`;
  s.setJob({ id: jobId, label: 'Сохраняю запись', progress: 0.5, cancellable: false });
  try {
    const blob = await r.stop();
    if (blob.size < 200) { getState().toast('Запись пустая — микрофон ничего не передал', 'err'); return null; }
    const path = await api.saveRecording(await blob.arrayBuffer());
    const imp = await api.importMedia([path]);
    const asset = imp.assets[0];
    if (!asset) { getState().toast(`Запись не добавилась: ${imp.errors[0]?.message ?? ''}`, 'err'); return null; }
    const n = getState().project.assets.filter((a) => a.name.startsWith('Голос ')).length + 1;
    asset.name = `Голос ${n}`;
    let clipId = '';
    getState().commit((p) => { const res = addFree(addAsset(p, asset), asset.id, rec.startT); clipId = res.clipId; return res.project; });
    takeEarlyPatches([asset.id]);
    getState().select([clipId]);
    getState().toast(`Запись добавлена: ${asset.duration.toFixed(1)} с`, 'ok');
    return clipId;
  } catch (e) {
    getState().toast(`Запись не сохранилась: ${e instanceof Error ? e.message : String(e)}`, 'err');
    return null;
  } finally {
    getState().setJob(null, jobId);
  }
}

export function cancelRecording(): void {
  recorder?.cancel();
  recorder = null;
  getState().setPlaying(false);
  getState().setRecording(null);
}

// ---------- группы (составные клипы) ----------
/** Отрисовывает содержимое группы в файл (через тот же экспорт). */
async function renderGroup(sub: Project, alpha: boolean): Promise<MediaAsset | null> {
  const s = getState();
  if (s.exportOpen) { s.toast('Сначала закрой окно экспорта'); return null; }
  const { width: W, height: H, fps } = sub.settings;
  const jobId = `grp_${uidShort()}`;
  s.setJob({ id: jobId, label: 'Собираю группу', progress: 0, cancellable: false });
  const off = api.onExportProgress((p) => { const j = getState().jobs[jobId]; if (j) getState().setJob({ ...j, progress: 0.05 + p * 0.95 }); });
  try {
    const { layers, blank } = await renderTextLayers(sub, W, H, fps);
    const outPath = await api.groupPath(alpha ? 'webm' : 'mp4');
    const r = await api.startExport({
      project: sub, textLayers: layers, blankPng: blank,
      opts: { height: Math.min(W, H) as 1080, fps: fps as 30, quality: 'high', encoder: 'auto', outPath, alpha },
    });
    if (!r.ok || !r.path) { getState().toast(`Группа не собралась: ${r.error ?? ''}`, 'err'); return null; }
    const name = `Группа · ${sub.tracks.reduce((n, t) => n + t.clips.length, 0)} клипа`;
    const asset = await importDerived(r.path, name);
    if (asset && alpha) asset.alpha = true;
    return asset;
  } finally {
    off();
    getState().setJob(null, jobId);
  }
}

/** Ctrl+G: выделенные клипы → один составной клип. */
export async function groupSelection(): Promise<string | null> {
  const s = getState();
  const plan = planGroup(s.project, s.selection);
  if ('error' in plan) { s.toast(plan.error); return null; }
  const ids = [...s.selection];
  const before = s.project;
  const asset = await renderGroup(plan.sub, plan.data.alpha);
  if (!asset) return null;
  if (getState().project.tracks !== before.tracks) {
    // за время сборки что-то поменяли — проверим, что выделенные клипы на месте
    const again = planGroup(getState().project, ids);
    if ('error' in again || JSON.stringify(again.data) !== JSON.stringify(plan.data)) { getState().toast('Клипы изменились, пока собиралась группа — повтори'); return null; }
  }
  let id = '';
  getState().commit((p) => { const r = applyGroup(addAsset(p, asset), ids, asset.id, plan.data, plan.t0); id = r.clipId; return r.project; });
  takeEarlyPatches([asset.id]);
  getState().select(id ? [id] : []);
  getState().toast('Группа готова. Разгруппировать — Ctrl+Shift+G', 'ok');
  return id || null;
}

/** Ctrl+Shift+G: вернуть клипы из группы. */
export function ungroupSelection(): void {
  const s = getState();
  const f = s.selection.length === 1 ? findClip(s.project, s.selection[0]) : undefined;
  if (!f || f.clip.type !== 'media' || !f.clip.group) { s.toast('Выдели группу на таймлайне'); return; }
  let ids: string[] = [];
  s.commit((p) => { const r = ungroupClip(p, f.clip.id); ids = r.ids; return r.project; });
  s.select(ids);
}

/** Пересобрать группу (файл пропал или поменялся формат кадра). */
export async function rebuildGroup(clipId: string): Promise<void> {
  const f = findClip(getState().project, clipId);
  if (!f || f.clip.type !== 'media' || !f.clip.group) return;
  const g = f.clip.group;
  const p = getState().project;
  const sub: Project = { ...structuredClone(p), tracks: structuredClone(g.tracks), name: `${p.name} — группа` };
  const asset = await renderGroup(sub, g.alpha);
  if (!asset) return;
  getState().commit((q) => {
    const r = addAsset(q, asset);
    const mc = f.clip as MediaClip;
    return setRetime(r, clipId, undefined, asset.id, Math.min(mc.in, asset.duration), Math.min(mc.out, asset.duration));
  });
  takeEarlyPatches([asset.id]);
}

// ---------- шаблоны ----------
/** Применить шаблон: к выбранным файлам (from='pick') или ко всем видео и фото медиатеки. Отмена — Ctrl+Z. */
export async function startFromTemplate(t: Template, from: 'pick' | 'library'): Promise<boolean> {
  let assets: MediaAsset[];
  if (from === 'pick') {
    const paths = await api.pickMedia();
    if (!paths.length) return false;
    assets = await importForTemplate(paths);
  } else {
    assets = getState().project.assets.filter((a) => !a.derived && !a.missing && (a.kind === 'video' || a.kind === 'image'));
  }
  return applyTemplateNow(t, assets);
}

/** Шаблон со стартового экрана: выбрать свои файлы → новый проект по шаблону. */
export async function templateFromFiles(t: Template): Promise<boolean> {
  const paths = await api.pickMedia();
  if (!paths.length) return false;
  await replaceProject(newProject(t.name, t.aspect));
  return applyTemplateNow(t, await importForTemplate(paths));
}

async function importForTemplate(paths: string[]): Promise<MediaAsset[]> {
  const ids = await importPaths(paths);
  return ids.map((id) => getState().project.assets.find((a) => a.id === id)).filter((a): a is MediaAsset => !!a);
}

function applyTemplateNow(t: Template, all: MediaAsset[]): boolean {
  const assets = all.filter((a) => a.kind === 'video' || a.kind === 'image');
  if (!assets.length) { getState().toast('Нужны видео или фото — добавь их в медиатеку'); return false; }
  getState().setPlaying(false);
  getState().commit((p) => applyTemplate(p, t, assets));
  getState().select([]);
  getState().setPlayhead(0);
  getState().toast(`Шаблон «${t.name}» готов: ${t.slots.length} окошек из ${assets.length} файлов. Отменить — Ctrl+Z`, 'ok');
  return true;
}

/** Сохранить текущий монтаж как свой шаблон (с картинкой кадра). */
export async function saveAsTemplate(name: string): Promise<boolean> {
  const p = getState().project;
  let thumb: string | undefined;
  try {
    const eng = (window as unknown as { __kadroEngine?: { snapshot(): string } }).__kadroEngine;
    const src = eng?.snapshot();
    if (src) thumb = await shrink(src, 180);
  } catch { /* без картинки */ }
  let t: Template;
  try { t = projectToTemplate(p, name, thumb); } catch (e) { getState().toast(e instanceof Error ? e.message : String(e)); return false; }
  const ok = await api.saveTemplate(t);
  getState().toast(ok ? `Шаблон «${t.name}» сохранён` : 'Шаблон не сохранился', ok ? 'ok' : 'err');
  return ok;
}
function shrink(dataUrl: string, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ---------- озвучка текста ----------
export async function ensureVoice(voice: TtsVoiceId): Promise<boolean> {
  const list = await api.ttsVoices();
  if (list.find((v) => v.id === voice)?.ready) return true;
  const r = await runJob('Скачиваю голос', { kind: 'ttsDownload', jobId: `tdl_${uidShort()}`, voice });
  if (!r.ok) { if (r.error !== 'Отменено') getState().toast(`Голос не скачался: ${r.error}`, 'err'); return false; }
  return true;
}
export async function speakText(clipId: string, voice: TtsVoiceId, speed: number): Promise<void> {
  const f = findClip(getState().project, clipId);
  if (!f || f.clip.type !== 'text' || !f.clip.text.trim()) { getState().toast('Сначала напиши текст'); return; }
  const text = f.clip.text;
  if (!(await ensureVoice(voice))) return;
  const r = await runJob('Озвучиваю текст', { kind: 'tts', jobId: `tts_${uidShort()}`, text, voice, speed }, clipId);
  if (!r.ok || r.output?.kind !== 'tts') { if (r.error !== 'Отменено') getState().toast(`Не получилось: ${r.error}`, 'err'); return; }
  const out = r.output;
  const imp = await api.importMedia([out.path]);
  const asset = imp.assets[0];
  if (!asset) { getState().toast('Не получилось добавить озвучку', 'err'); return; }
  const start = (findClip(getState().project, clipId)?.clip.start) ?? 0;
  asset.name = `Озвучка: ${text.slice(0, 24)}${text.length > 24 ? '…' : ''}`;
  getState().commit((p) => {
    let q = addAsset(p, asset);
    q = addFree(q, asset.id, start).project;
    return updateClip(q, clipId, { duration: Math.max(0.5, Math.round(out.duration * 100) / 100 + 0.2) });
  });
  takeEarlyPatches([asset.id]);
  getState().toast('Текст озвучен — звук на аудиодорожке', 'ok');
}

export async function removePauses(clipId: string): Promise<void> {
  const m = mediaClip(clipId);
  if (!m) return;
  const a = m.p.assets.find((x) => x.id === m.clip.assetId);
  if (!a || !a.hasAudio) { getState().toast('В этом клипе нет звука — паузы искать не по чему'); return; }
  const r = await runJob('Ищу паузы', { kind: 'silence', jobId: `sil_${uidShort()}`, path: a.path, in: m.clip.in, out: m.clip.out }, clipId);
  if (!r.ok || r.output?.kind !== 'silence') { if (r.error !== 'Отменено') getState().toast(`Не получилось: ${r.error}`, 'err'); return; }
  const ranges = r.output.ranges;
  if (!ranges.length) { getState().toast('Речь не найдена — клип оставлен как есть'); return; }
  const before = (m.clip.out - m.clip.in) / m.clip.speed;
  const after = ranges.reduce((s, [x, y]) => s + (y - x), 0) / m.clip.speed;
  if (before - after < 0.2) { getState().toast('Пауз почти нет — резать нечего', 'ok'); return; }
  getState().commit((p) => keepSourceRanges(p, clipId, ranges));
  getState().toast(`Паузы вырезаны: ролик короче на ${(before - after).toFixed(1)} с`, 'ok');
}

export async function ensureModel(model: 'multi' | 'ru'): Promise<boolean> {
  const models = await api.models();
  if (models.find((m) => m.id === model)?.ready) return true;
  const r = await runJob('Скачиваю модель распознавания', { kind: 'download', jobId: `dl_${uidShort()}`, model });
  if (!r.ok) { if (r.error !== 'Отменено') getState().toast(`Модель не скачалась: ${r.error}`, 'err'); return false; }
  getState().toast('Модель скачана — работает без интернета', 'ok');
  return true;
}

export async function makeCaptions(model: 'multi' | 'ru', includeMusic: boolean): Promise<boolean> {
  const s = getState();
  if (projectDuration(s.project) <= 0) { s.toast('Сначала добавь видео со звуком на таймлайн'); return false; }
  if (!(await ensureModel(model))) return false;
  const r = await runJob('Создаю субтитры', { kind: 'captions', jobId: `cap_${uidShort()}`, project: getState().project, model, includeMusic });
  if (!r.ok || r.output?.kind !== 'captions') { if (r.error !== 'Отменено') getState().toast(`Субтитры не получились: ${r.error}`, 'err'); return false; }
  const cues = r.output.cues;
  if (!cues.length) { getState().toast('Речь не найдена. Проверь, что у видео есть звук и он не выключен.'); return false; }
  const vertical = getState().project.settings.height > getState().project.settings.width;
  // на вертикальном видео — выше подписи и кнопок TikTok, Reels и Shorts
  getState().commit((p) => setCaptions(p, cues, CAPTION_STYLE, vertical ? 0.64 : 0.86));
  getState().toast(`Готово: ${cues.length} субтитров. Их можно поправить — кликни по любому.`, 'ok');
  return true;
}

/** Предупреждение перед экспортом: ИИ-обработка устарела (клип обрезали после обработки). */
export function staleAiClips(p: Project): string[] {
  const out: string[] = [];
  for (const t of p.tracks) for (const c of t.clips) {
    if (c.type === 'media' && (aiStale(c, 'removeBg') || aiStale(c, 'denoise') || aiStale(c, 'stab') || aiStale(c, 'beauty') || aiStale(c, 'voice'))) out.push(c.id);
  }
  return out;
}

// ---------- проект ----------
export async function saveProject(as = false): Promise<boolean> {
  const s = getState();
  const path = await api.saveProject(s.project, as ? null : s.projectPath);
  if (!path) return false;
  getState().markSaved(path);
  getState().toast('Проект сохранён', 'ok');
  return true;
}

/** «Открыть»: проект .kadro — открывается; видео, фото, звук — добавляются в проект (с главного экрана — в новый). */
export async function openProject(): Promise<void> {
  const r = await api.openProject();
  if (!r) return;
  if ('media' in r) { await openFiles(r.media, { fresh: getState().home }); return; }
  await replaceProject(r.project, r.path);
  reportMissing(r.project);
}

/** Формат кадра под первое видео или фото (как в CapCut: проект подстраивается под материал). */
export function aspectFor(w: number, h: number): AspectKey {
  if (!w || !h) return '16:9';
  const r = w / h;
  const opts: [AspectKey, number][] = [['16:9', 16 / 9], ['9:16', 9 / 16], ['1:1', 1], ['4:5', 4 / 5], ['4:3', 4 / 3], ['3:4', 3 / 4], ['21:9', 21 / 9]];
  return opts.reduce((b, x) => (Math.abs(Math.log(x[1] / r)) < Math.abs(Math.log(b[1] / r)) ? x : b))[0];
}

/**
 * Открыть файлы: .kadro — как проект; видео, фото и звук — на таймлайн (видео и фото — на основную дорожку
 * в конец, звук — на аудиодорожку). fresh — новым проектом, формат кадра — по первому видео.
 */
export async function openFiles(paths: string[], opts: { fresh?: boolean } = {}): Promise<void> {
  if (!paths.length) return;
  const kadro = paths.find((p) => p.toLowerCase().endsWith('.kadro'));
  if (kadro) { await openRecent(kadro); return; }
  const fresh = opts.fresh || getState().project.tracks.every((t) => !t.clips.length) && !getState().project.assets.length;
  if (fresh) await replaceProject(newProject('Новый проект', getState().project.settings.aspect));
  getState().setHome(false);
  const at = projectDuration(getState().project);
  const ids = await importPaths(paths, { mode: 'auto', at });
  if (!ids.length) return;
  if (fresh) {
    const first = getState().project.assets.find((a) => ids.includes(a.id) && a.kind !== 'audio');
    if (first) {
      const aspect = aspectFor(first.width, first.height);
      getState().commit((p) => setSettings(p, { aspect, ...sizeFor(aspect, shortSideOf(p.settings)) }));
    }
  }
  getState().toast(ids.length === 1 ? 'Файл добавлен на таймлайн' : `Добавлено на таймлайн файлов: ${ids.length}`, 'ok');
}

/** Брошено на главный экран: папки — в библиотеку, файлы — новым проектом. */
export async function dropOnHome(paths: string[]): Promise<void> {
  const dirs = await api.whichDirs(paths);
  const folders = paths.filter((_, i) => dirs[i]);
  const files = paths.filter((_, i) => !dirs[i]);
  if (folders.length) await dropPaths(folders);
  if (files.length) await openFiles(files, { fresh: true });
}

/** Открыть проект из списка недавних. */
export async function openRecent(file: string): Promise<boolean> {
  const r = await api.openProjectPath(file);
  if ('error' in r) { getState().toast(r.error, 'err'); return false; }
  await replaceProject(r.project, r.path);
  reportMissing(r.project);
  return true;
}

/** В проекте есть монтаж или файлы. */
function hasWork(p: Project): boolean {
  return p.assets.length > 0 || p.tracks.some((t) => t.clips.length > 0);
}

/**
 * Заменить проект другим. Если в текущем есть несохранённая работа — сначала копия в «Черновики»
 * (видна в «Моих проектах» на главном экране), чтобы новый проект, демо или пример шаблона ничего не стёрли.
 */
export async function replaceProject(next: Project, path: string | null = null): Promise<void> {
  const s = getState();
  let stashed = false;
  if (hasWork(s.project) && (!s.projectPath || s.dirty)) {
    try { await api.stashDraft(s.project); stashed = true; } catch { /* не вышло — продолжаем */ }
  }
  getState().replace(next, path);
  getState().setHome(false);
  if (stashed) getState().toast('Прошлый проект сохранён — он в «Моих проектах» на главном экране', 'ok');
}

export async function loadDemoFiles(): Promise<DemoFiles> {
  const cached = getState().demo;
  if (cached) return cached;
  const info = await api.homeInfo();
  getState().setDemo(info.demo);
  return info.demo;
}

/** Собрать пример из демо-роликов по шаблону (с демо-битом), как готовый проект. */
async function buildExample(t: Template, name: string): Promise<boolean> {
  const demo = await loadDemoFiles();
  const files = [...new Set((t.demo ?? DEMO_SCENES).map((x) => demo.scenes[x]).filter(Boolean))];
  if (!files.length) { getState().toast('Демо-ролики не найдены — переустанови Kadro', 'err'); return false; }
  getState().setPlaying(false);
  await replaceProject(newProject(name, t.aspect));
  const ids = await importPaths(demo.beat ? [...files, demo.beat] : files);
  const assets = ids.map((id) => getState().project.assets.find((a) => a.id === id)).filter((a): a is MediaAsset => !!a);
  const media = files.map((f) => assets.find((a) => a.path === f && a.kind !== 'audio')).filter((a): a is MediaAsset => !!a);
  if (!media.length) return false;
  getState().commit((p) => applyTemplate(p, t, media));
  const beat = assets.find((a) => a.kind === 'audio');
  if (beat) {
    const total = projectDuration(getState().project);
    getState().commit((p) => {
      const r = addFree(p, beat.id, 0);
      return updateClip(r.project, r.clipId, { out: Math.min(beat.duration, total), fadeOut: 1.2 });
    });
  }
  // готовый пример — без истории правок, чтобы Ctrl+Z не разбирал его по кусочкам
  const ready = getState().project;
  getState().replace(ready, null);
  getState().select([]);
  return true;
}

/** Демо-проект со стартового экрана: все демо-ролики под бит, эффекты, переходы, надписи. */
export async function openDemo(): Promise<boolean> {
  const ok = await buildExample(DEMO_TEMPLATE, 'Демо Kadro');
  if (ok) getState().toast('Это демо-проект: нажми пробел, чтобы посмотреть, и меняй что угодно', 'ok');
  return ok;
}

/** Шаблон на демо-роликах: посмотреть, как он выглядит, без своих файлов. */
export async function tryTemplate(t: Template): Promise<boolean> {
  const ok = await buildExample(t, `${t.name} (пример)`);
  if (ok) getState().toast(`Шаблон «${t.name}» на демо-роликах. Чтобы поставить свои видео, нажми на шаблон во вкладке «Шаблоны» → «Свои файлы…»`, 'ok');
  return ok;
}

/** Экспорт без окна (сборка превью шаблонов и демо-ролика). */
export async function exportTo(outPath: string, shortSide: number, fps = 30): Promise<ExportResult> {
  const p = getState().project;
  const size = exportSize(p.settings.width, p.settings.height, shortSide);
  const { layers, blank } = await renderTextLayers(p, size.w, size.h, fps, () => undefined);
  const opts: ExportOptions = { height: shortSide as ExportOptions['height'], fps: fps as ExportOptions['fps'], quality: 'high', encoder: 'x264', outPath };
  return api.startExport({ project: p, opts, textLayers: layers, blankPng: blank });
}

/** Предупредить о файлах, которых нет на диске. */
export function reportMissing(p: Project): void {
  // пропавшие служебные копии (реверс, кривая) пересобираем из исходника, если он на месте
  const rebuild: string[] = [];
  const rebuilt = new Set<string>();
  for (const t of p.tracks) {
    for (const c of t.clips) {
      if (c.type !== 'media' || !c.retime) continue;
      const a = p.assets.find((x) => x.id === c.assetId);
      const o = p.assets.find((x) => x.id === c.retime!.assetId);
      if (a?.missing && o && !o.missing) { rebuild.push(c.id); rebuilt.add(a.id); }
    }
  }
  // то же для групп: все клипы внутри на месте — собираем заново
  const regroup: string[] = [];
  for (const t of p.tracks) {
    for (const c of t.clips) {
      if (c.type !== 'media' || !c.group) continue;
      const a = p.assets.find((x) => x.id === c.assetId);
      const inner = c.group.tracks.flatMap((tr) => tr.clips).filter((x): x is MediaClip => x.type === 'media');
      if (a?.missing && inner.every((x) => !p.assets.find((q) => q.id === x.assetId)?.missing)) { regroup.push(c.id); rebuilt.add(a.id); }
    }
  }
  if (rebuild.length || regroup.length) {
    void (async () => {
      for (const id of rebuild) await retimeClip(id, {});
      for (const id of regroup) await rebuildGroup(id);
    })();
  }
  const lost = p.assets.filter((a) => a.missing && !rebuilt.has(a.id));
  if (!lost.length) return;
  getState().toast(lost.length === 1
    ? `Не найден файл «${lost[0].name}». Верни его на место — иначе клип не попадёт в видео.`
    : `Не найдено файлов: ${lost.length}. Верни их на место — иначе эти клипы не попадут в видео.`, 'err');
}

export async function newProjectAction(aspect?: AspectKey): Promise<void> {
  await replaceProject(newProject('Новый проект', aspect ?? getState().project.settings.aspect));
}

// ---------- 3D-объекты ----------
/**
 * Собрать 3D-объект в видео с прозрачным фоном и поставить на дорожку наложений у курсора
 * (или заменить им уже добавленный 3D-клип clipId — положение, эффекты и анимация остаются).
 */
export async function place3D(m: Model3D, clipId?: string, onProgress?: (p: number) => void, cancelled?: () => boolean): Promise<boolean> {
  const { renderModelVideo } = await import('./three/scene3d');
  const file = await renderModelVideo(m, api, { onProgress, cancelled });
  const ids = await importPaths([file]);
  const id = ids[0];
  const a = id ? getState().project.assets.find((x) => x.id === id) : undefined;
  if (!a) return false;
  getState().commit((p) => updateAsset(p, a.id, { derived: true, name: `3D: ${m.name}` }));
  if (clipId) {
    getState().commit((p) => updateClip(p, clipId, { assetId: a.id, in: 0, out: a.duration, model3d: m }), `m3d-${clipId}`);
    getState().select([clipId]);
    getState().toast('3D-объект обновлён', 'ok');
    return true;
  }
  const newId = addAssetToTimeline(a.id, 'overlay', getState().playhead);
  if (newId) getState().commit((p) => updateClip(p, newId, { model3d: m }));
  getState().toast(`3D «${m.name}» на дорожке наложений — двигай и масштабируй его прямо в кадре`, 'ok');
  return true;
}

// ---------- авто-ролик ----------
/** Этап сборки авто-ролика — для окна: что сейчас происходит и какая задача (её прогресс — в store.jobs). */
export interface AutoStage { label: string; jobId?: string; step: number; steps: number }

const hlMemo = new Map<string, Highlights | null>();
let autoCancel: (() => void) | null = null;
let autoStopped = false;

/** Остановить сборку авто-ролика (текущий разбор или поиск ритма). */
export function cancelAutoEdit(): void {
  autoStopped = true;
  autoCancel?.();
}

/** Файлы по путям → файлы проекта (что уже есть — берём, остальное добавляем). */
async function assetsForPaths(paths: string[]): Promise<Map<string, MediaAsset>> {
  const have = new Map(getState().project.assets.filter((a) => !a.derived && !a.missing).map((a) => [a.path, a] as const));
  const fresh = [...new Set(paths.filter((p) => !have.has(p)))];
  if (fresh.length) {
    const ids = await importPaths(fresh);
    for (const id of ids) { const a = getState().project.assets.find((x) => x.id === id); if (a) have.set(a.path, a); }
  }
  return have;
}

/**
 * Собрать авто-ролик: файлы → (ритм музыки) → (разбор каждого видео) → монтаж.
 * fresh — новым проектом (прошлый уйдёт в «Черновики»), иначе — вместо монтажа текущего проекта (Ctrl+Z вернёт).
 */
export async function buildAutoEdit(params: AutoParams, opts: { fresh: boolean; seed?: number; onStage?: (s: AutoStage) => void }): Promise<AutoSummary | null> {
  autoStopped = false;
  const stage = opts.onStage ?? (() => undefined);
  const s0 = getState();
  s0.setPlaying(false);
  if (opts.fresh) await replaceProject(newProject(params.title.trim() || 'Авто-ролик', params.aspect));
  stage({ label: 'Добавляю файлы', step: 0, steps: 1 });
  const paths = [...params.files, ...(params.music ? [params.music] : [])];
  const byPath = await assetsForPaths(paths);
  const media = params.files.map((f) => byPath.get(f)).filter((a): a is MediaAsset => !!a && (a.kind === 'image' || (a.kind === 'video' && a.hasVideo)));
  if (!media.length) { getState().toast('Нужны видео или фото — выбери хотя бы один файл', 'err'); return null; }
  let music = params.music ? byPath.get(params.music) ?? null : null;
  if (music && music.kind !== 'audio') { getState().toast('Музыка — это звуковой файл (MP3, WAV, M4A…). Ролик собран без неё.', 'err'); music = null; }

  const videos = [...new Map(media.filter((a) => a.kind === 'video').map((a) => [a.path, a])).values()];
  const steps = videos.filter((a) => !hlMemo.has(a.path)).length + (music && !music.beats ? 1 : 0);
  let step = 0;
  const run = async (label: string, job: AiJob): Promise<AiResponse> => {
    stage({ label, jobId: job.jobId, step: step++, steps: Math.max(1, steps) });
    autoCancel = () => api.cancelAi(job.jobId);
    try { return await runJob(label, job); } finally { autoCancel = null; }
  };
  // ритм музыки
  if (music && !music.beats) {
    const r = await run('Ищу ритм музыки', { kind: 'beats', jobId: `bt_${uidShort()}`, path: music.path });
    if (autoStopped) return null;
    if (r.ok && r.output?.kind === 'beats' && r.output.beats.length) {
      const { beats, bpm } = r.output;
      const id = music.id;
      getState().commit((p) => updateAsset(p, id, { beats, bpm }));
      music = { ...music, beats, bpm };
    }
  }
  // лучшие места в видео
  const todo = videos.filter((a) => !hlMemo.has(a.path));
  for (const [n, a] of todo.entries()) {
    const src = a.proxy === 'ready' && a.previewPath ? a.previewPath : a.path;
    const r = await run(todo.length > 1 ? `Смотрю видео ${n + 1} из ${todo.length}` : 'Смотрю видео', { kind: 'highlights', jobId: `hl_${uidShort()}`, path: src, duration: a.duration });
    if (autoStopped) return null;
    hlMemo.set(a.path, r.ok && r.output?.kind === 'highlights' ? r.output.hl : null);
  }
  if (autoStopped) return null;

  stage({ label: 'Собираю ролик', step: steps, steps: Math.max(1, steps) });
  const seed = opts.seed ?? ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let summary: AutoSummary | null = null;
  const current = getState().project.assets;
  const live = (a: MediaAsset) => current.find((x) => x.id === a.id) ?? a; // миниатюры и прокси могли подъехать
  try {
    getState().commit((p) => {
      const r = autoEdit(p, {
        media: media.map((a) => ({ asset: live(a), hl: hlMemo.get(a.path) ?? null })),
        music: music ? { ...live(music), beats: music.beats, bpm: music.bpm } : null,
        style: params.style, aspect: params.aspect, length: params.length, title: params.title, videoSound: params.videoSound, seed,
      });
      summary = r.summary;
      return r.project;
    });
  } catch (e) {
    getState().toast(`Не получилось собрать ролик: ${e instanceof Error ? e.message : String(e)}`, 'err');
    return null;
  }
  const sum = summary as AutoSummary | null;
  if (!sum) return null;
  const st = getState();
  st.setAutoLast(params);
  st.select([]);
  st.setPlayhead(0);
  st.setLeftTab('templates');
  const notes: string[] = [];
  if (music && !sum.onBeats) notes.push('ритм в музыке не нашёлся — склейки по ровному темпу');
  if (sum.dropped > 0) notes.push(`не поместилось файлов: ${sum.dropped} (${params.length === 'auto' ? 'музыка короче' : 'выбери длину побольше'})`);
  if (sum.repeated) notes.push('материала мало — кадры повторяются');
  st.toast(`Авто-ролик готов: ${sum.cuts + 1} ${plural(sum.cuts + 1, 'кадр', 'кадра', 'кадров')}${sum.onBeats ? ' в ритм музыки' : ''}, ${fmtDur(sum.duration)}.${notes.length ? ` Важно: ${notes.join('; ')}.` : ''} Не нравится — «Ещё вариант» слева или Ctrl+Z.`, 'ok');
  return sum;
}

/** Тот же авто-ролик заново, с другими кусками и переходами (разбор видео уже есть — это быстро). */
export async function autoVariant(): Promise<AutoSummary | null> {
  const last = getState().autoLast;
  if (!last) return null;
  return buildAutoEdit({ ...last, aspect: getState().project.settings.aspect }, { fresh: false });
}
