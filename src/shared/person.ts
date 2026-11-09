// Человек отдельным слоем — на удалении фона: портретный режим (фон размыт), неоновый контур вокруг человека
// (вспыхивает под бит) и текст за человеком. Хранится настройка клипа (person); при показе и экспорте клип
// раскладывается на два: фон (исходник, при портрете — размытый) и вырезанный человек поверх — так плеер
// и экспорт рисуют одинаково, без отдельного кода для каждого.
import { aiSource } from './ai';
import { beatTimes } from './timeline';
import type { MediaClip, PersonFx, Project, Track } from './types';

export const NEON_DEFAULT = { color: '#3df5ff', width: 14, pulse: true };

/** Есть ли что показывать: хоть одна фишка включена и фон уже удалён (вырезанный человек готов). */
export function personActive(c: MediaClip): boolean {
  const f = c.person;
  return !!f && !f.layer && (!!f.blur || !!f.neon || !!f.front) && !!aiSource(c, 'removeBg');
}

/** Включено ли что-то (фон, может, ещё не удалён). */
export const personWanted = (f: PersonFx | undefined): boolean => !!f && (!!f.blur || !!f.neon || !!f.front);

const isCaptionTrack = (t: Track) => t.kind === 'text' && t.clips.length > 0 && t.clips.every((c) => c.type === 'text' && c.role === 'caption');

/**
 * Проект для показа и экспорта: у клипов с человеком отдельным слоем фон — исходник (с портретом — размытый),
 * а вырезанный человек — копией на своей дорожке: сразу над клипом или (текст за человеком) над надписями,
 * но под субтитрами. Без таких клипов возвращает тот же проект.
 */
export function expandPerson(p: Project): Project {
  if (!p.tracks.some((t) => t.clips.some((c) => c.type === 'media' && personActive(c)))) return p;
  const d: Project = structuredClone(p);
  const above = new Map<number, Track[]>(); // индекс дорожки → дорожки с людьми сразу над ней
  const front: Track[] = [];
  d.tracks.forEach((t, ti) => {
    if (t.kind === 'audio' || t.kind === 'text') return;
    for (const c of t.clips) {
      if (c.type !== 'media' || !personActive(c)) continue;
      const f = c.person!;
      const layer: MediaClip = structuredClone(c);
      layer.id = `${c.id}~p`;
      layer.person = { neon: f.neon, layer: true };
      layer.muted = true;
      layer.transitionOut = undefined;
      // на стыках основной дорожки человек появляется и уходит вместе с переходом
      if (t.kind === 'main') {
        const i = t.clips.indexOf(c);
        const prev = t.clips[i - 1];
        layer.fadeIn = Math.max(c.fadeIn, prev?.type === 'media' ? prev.transitionOut?.duration ?? 0 : 0);
        layer.fadeOut = Math.max(c.fadeOut, c.transitionOut?.duration ?? 0);
        layer.start = c.start;
      }
      // фон — исходник без удаления фона; портрет — размыт
      c.removeBg = { ...c.removeBg, enabled: false };
      if (f.blur) c.effects = [...(c.effects ?? []).filter((e) => e.type !== 'blur'), { type: 'blur', amount: Math.min(1, Math.max(0.05, f.blur)) }];
      const track: Track = { id: `${t.id}~p~${c.id}`, kind: 'video', name: 'person', muted: true, hidden: false, clips: [layer] };
      if (f.front) front.push(track);
      else above.set(ti, [...(above.get(ti) ?? []), track]);
    }
  });
  const out: Track[] = [];
  d.tracks.forEach((t, ti) => { out.push(t); for (const x of above.get(ti) ?? []) out.push(x); });
  // текст за человеком: над всеми надписями, но под субтитрами и звуком
  const cap = out.findIndex((t) => isCaptionTrack(t) || t.kind === 'audio');
  out.splice(cap < 0 ? out.length : cap, 0, ...front);
  d.tracks = out;
  return d;
}

/**
 * Сила неона в момент t (1 — обычная): с pulse — вспышка на каждой доле музыки (или 2 раза в секунду, если
 * ритм не найден) и плавный спад.
 */
export function neonPulse(t: number, beats: number[], pulse: boolean): number {
  if (!pulse) return 1;
  let last = -Infinity;
  if (beats.length) {
    let lo = 0;
    let hi = beats.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (beats[m] <= t) { last = beats[m]; lo = m + 1; } else hi = m - 1; }
  } else last = Math.floor(t * 2) / 2;
  const since = t - last;
  return since < 0 || !Number.isFinite(since) ? 0.7 : 0.7 + 0.9 * Math.exp(-since * 7);
}

/** Доли такта для пульса: из найденного ритма музыки проекта. */
export const projectBeats = (p: Project): number[] => beatTimes(p);
