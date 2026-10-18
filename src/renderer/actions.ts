// Действия редактора, которые вызываются из разных мест интерфейса.
import { aiCovers, aiSource, aiStale } from '../shared/ai';
import { reframeKeyframes } from '../shared/reframe';
import { CAPTION_STYLE, newProject } from '../shared/defaults';
import type { AiJob, AiResponse, TtsVoiceId } from '../shared/ipc';
import {
  addAsset, addFree, addToMain, alignMainToBeats, beatTimes, deleteClips, duplicateClip, findClip, keepSourceRanges, projectDuration, setCaptions,
  splitClip, updateAsset, updateClip, clipEnd,
} from '../shared/timeline';
import type { MediaClip, Project, VoiceEffect } from '../shared/types';
import { api, getState, takeEarlyPatches } from './store';
import { uidShort } from './util';

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
  const lost = p.assets.filter((a) => a.missing);
  if (!lost.length) return;
  getState().toast(lost.length === 1
    ? `Не найден файл «${lost[0].name}». Верни его на место — иначе клип не попадёт в видео.`
    : `Не найдено файлов: ${lost.length}. Верни их на место — иначе эти клипы не попадут в видео.`, 'err');
}

export function newProjectAction(): void {
  const s = getState();
  s.replace(newProject('Новый проект', s.project.settings.aspect));
}
