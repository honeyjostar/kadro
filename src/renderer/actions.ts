// Действия редактора, которые вызываются из разных мест интерфейса.
import { aiCovers, aiSource, aiStale, videoSource } from '../shared/ai';
import { normalizeRamp, originalRange } from '../shared/retime';
import { reframeKeyframes } from '../shared/reframe';
import { CAPTION_STYLE, newProject } from '../shared/defaults';
import type { AiJob, AiResponse, TtsVoiceId } from '../shared/ipc';
import {
  addAsset, addFree, addToMain, alignMainToBeats, beatTimes, deleteClips, duplicateClip, findClip, keepSourceRanges, projectDuration, setCaptions,
  splitClip, updateAsset, updateClip, clipEnd, insertFreeze, setRetime,
} from '../shared/timeline';
import type { MediaAsset, MediaClip, Project, RampPoint, Retime, VoiceEffect } from '../shared/types';
import { api, getState, takeEarlyPatches } from './store';
import { uidShort } from './util';
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

export async function pickAndImport(place?: { mode: 'main' | 'overlay' | 'auto'; at?: number }): Promise<void> {
  const paths = await api.pickMedia();
  await importPaths(paths, place);
}

/** Добавить файл из медиатеки на таймлайн. auto: видео/фото — на основную, звук — на аудиодорожку. */
export function addAssetToTimeline(assetId: string, mode: 'main' | 'overlay' | 'auto', at?: number): string | null {
  const s = getState();
  const a = s.project.assets.find((x) => x.id === assetId);
  if (!a) return null;
  const t = at ?? s.playhead;
  let clipId: string | null = null;
  s.commit((p) => {
    const r = a.kind === 'audio' || mode === 'overlay' ? addFree(p, assetId, t) : addToMain(p, assetId, t);
    clipId = r.clipId;
    return r.project;
  });
  if (clipId) s.select([clipId]);
  return clipId;
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

export async function removeBackground(clipId: string): Promise<void> {
  const m = mediaClip(clipId);
  if (!m) return;
  const a = m.p.assets.find((x) => x.id === m.clip.assetId);
  if (!a || a.kind !== 'video') { getState().toast('Удаление фона работает с видео'); return; }
  const st = aiSource(m.clip, 'stab');
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
  if (!m) return;
  const a = m.p.assets.find((x) => x.id === m.clip.assetId);
  if (!a || a.kind !== 'video') { getState().toast('Стабилизация работает с видео'); return; }
  const r = await runJob('Стабилизирую', { kind: 'stab', jobId: `st_${uidShort()}`, path: a.path, in: m.clip.in, out: m.clip.out, strength }, clipId);
  if (!r.ok || r.output?.kind !== 'stab') { if (r.error !== 'Отменено') getState().toast(`Не получилось: ${r.error}`, 'err'); return; }
  const out = r.output;
  getState().commit((p) => updateClip(p, clipId, { stab: { enabled: true, status: 'ready', path: out.path, range: out.range } }));
  getState().toast('Видео стабилизировано', 'ok');
}
export function disableStab(clipId: string): void {
  getState().commit((p) => {
    const f = findClip(p, clipId);
    if (!f || f.clip.type !== 'media' || !f.clip.stab) return p;
    return updateClip(p, clipId, { stab: { ...f.clip.stab, enabled: false } });
  });
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
  if (!m) return;
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
export async function retimeClip(clipId: string, opts: { reverse?: boolean; ramp?: RampPoint[] | null; preset?: string }): Promise<void> {
  const m = mediaClip(clipId);
  if (!m) return;
  const c = m.clip;
  const orig = originalRange(c);
  const src = m.p.assets.find((a) => a.id === orig.assetId);
  if (!src || src.kind === 'image') { getState().toast('Реверс и кривая скорости работают с видео и звуком'); return; }
  if (src.missing) { getState().toast(`Файл «${src.name}» не найден на диске`, 'err'); return; }
  const reverse = opts.reverse ?? c.retime?.reverse ?? false;
  const ramp = opts.ramp === undefined ? c.retime?.ramp : opts.ramp ?? undefined;
  const preset = opts.ramp === undefined ? c.retime?.preset : opts.ramp ? opts.preset ?? 'custom' : undefined;
  const same = (q: Project) => {
    const f = findClip(q, clipId);
    if (!f || f.clip.type !== 'media') return false;
    const o = originalRange(f.clip);
    return o.assetId === orig.assetId && Math.abs(o.in - orig.in) < 1e-3 && Math.abs(o.out - orig.out) < 1e-3;
  };
  if (!reverse && !ramp) {
    getState().commit((p) => setRetime(p, clipId, undefined, orig.assetId, orig.in, orig.out));
    await reprocessAi(clipId);
    return;
  }
  const r: Retime = { assetId: orig.assetId, in: orig.in, out: orig.out, reverse, ramp: ramp && normalizeRamp(ramp), preset };
  const res = await runJob(reverse && !ramp ? 'Переворачиваю клип' : 'Меняю скорость', {
    kind: 'retime', jobId: `rt_${uidShort()}`, path: src.path, in: r.in, out: r.out, reverse, ramp: r.ramp,
    hasVideo: src.hasVideo, hasAudio: src.hasAudio, width: src.width, height: src.height, fps: src.fps || getState().project.settings.fps,
  }, clipId);
  if (!res.ok || res.output?.kind !== 'retime') { if (res.error !== 'Отменено') getState().toast(`Не получилось: ${res.error}`, 'err'); return; }
  const out = res.output;
  const asset = await importDerived(out.path, `${src.name} · ${reverse && ramp ? 'реверс, кривая' : reverse ? 'реверс' : 'кривая скорости'}`);
  if (!asset) return;
  if (!same(getState().project)) { getState().toast('Клип изменился, пока шла обработка — повтори действие'); return; }
  getState().commit((p) => setRetime(addAsset(p, asset), clipId, r, asset.id, 0, Math.min(asset.duration || out.duration, out.duration)));
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
  if (m.clip.stab?.enabled && aiStale(m.clip, 'stab')) await stabilizeClip(clipId);
  if (mediaClip(clipId)?.clip.removeBg.enabled && aiStale(mediaClip(clipId)!.clip, 'removeBg')) await removeBackground(clipId);
  if (mediaClip(clipId)?.clip.denoise.enabled && aiStale(mediaClip(clipId)!.clip, 'denoise')) await enhanceVoice(clipId);
  else await refreshVoice(clipId);
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
  if (!c) { getState().toast('Поставь курсор на видео, из которого нужен стоп-кадр'); return; }
  const p = getState().project;
  const a = p.assets.find((x) => x.id === c.assetId)!;
  const t = getState().playhead;
  const fps = a.fps || p.settings.fps;
  const s = Math.min(c.out - 0.5 / fps, Math.max(c.in, c.in + (t - c.start) * c.speed));
  const vs = videoSource(c);
  const res = await runJob('Делаю стоп-кадр', { kind: 'freeze', jobId: `fz_${uidShort()}`, path: vs?.path ?? a.path, t: s - (vs?.offset ?? 0), fps, alpha: !!vs?.alpha }, c.id, false);
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
  getState().commit((p) => setCaptions(p, cues, CAPTION_STYLE, vertical ? 0.72 : 0.86));
  getState().toast(`Готово: ${cues.length} субтитров. Их можно поправить — кликни по любому.`, 'ok');
  return true;
}

/** Предупреждение перед экспортом: ИИ-обработка устарела (клип обрезали после обработки). */
export function staleAiClips(p: Project): string[] {
  const out: string[] = [];
  for (const t of p.tracks) for (const c of t.clips) {
    if (c.type === 'media' && (aiStale(c, 'removeBg') || aiStale(c, 'denoise') || aiStale(c, 'stab') || aiStale(c, 'voice'))) out.push(c.id);
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

export async function openProject(): Promise<void> {
  const r = await api.openProject();
  if (!r) return;
  getState().replace(r.project, r.path);
  reportMissing(r.project);
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
  if (rebuild.length) void (async () => { for (const id of rebuild) await retimeClip(id, {}); })();
  const lost = p.assets.filter((a) => a.missing && !rebuilt.has(a.id));
  if (!lost.length) return;
  getState().toast(lost.length === 1
    ? `Не найден файл «${lost[0].name}». Верни его на место — иначе клип не попадёт в видео.`
    : `Не найдено файлов: ${lost.length}. Верни их на место — иначе эти клипы не попадут в видео.`, 'err');
}

export function newProjectAction(): void {
  const s = getState();
  s.replace(newProject('Новый проект', s.project.settings.aspect));
}
