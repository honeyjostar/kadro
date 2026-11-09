// «Где пролистнут»: ролик глазами TikTok — места, где зритель скорее всего смахнёт дальше.
// Первые 2 секунды без движения, речи и надписи; речь начинается поздно; один план дольше 3,5 с без смены;
// тихий звук; тишина посреди ролика. У большинства — исправление одной кнопкой. Чистая функция — тестируется отдельно.
import { tx } from './i18n';
import { clipEnd, projectDuration } from './timeline';
import type { MediaAsset, MediaClip, Project, TextClip } from './types';

export type RetKind = 'hook' | 'lateSpeech' | 'static' | 'quiet' | 'noSound' | 'silence';
export type RetFix = 'hookZoom' | 'staticZoom' | 'louder' | 'trimStart' | 'music' | 'pauses';
export interface RetIssue { id: string; kind: RetKind; t0: number; t1: number; text: string; clipId?: string; fix?: RetFix }

export interface RetCtx {
  /** движение (0…1) видео на отрезке исходника [s0, s1]; undefined — не разобрано */
  motion: (asset: MediaAsset, s0: number, s1: number) => number | undefined;
}

/** Порог «нет движения» и «мало движения для длинного плана». */
const STILL = 0.06;
const CALM = 0.2;
const STEP = 0.1;

const visualTracks = (p: Project) => p.tracks.filter((t) => !t.hidden && t.kind !== 'audio' && t.kind !== 'text');
const assetOf = (p: Project, c: MediaClip) => p.assets.find((a) => a.id === c.assetId);
const at = (c: { start: number }, t: number, end: number) => t >= c.start - 1e-6 && t < end - 1e-6;
const srcTime = (c: MediaClip, t: number) => c.in + (t - c.start) * c.speed;
const animated = (c: MediaClip) => !!(c.keyframes && Object.values(c.keyframes).some((k) => (k?.length ?? 0) > 1));

/** Движение в момент t: самое заметное из видимых клипов (анимация клипа тоже движение). */
function motionAt(p: Project, ctx: RetCtx, t: number): number {
  let m = 0;
  for (const tr of visualTracks(p)) for (const c of tr.clips) {
    if (c.type !== 'media' || !at(c, t, clipEnd(c))) continue;
    if (animated(c) || c.effects?.length) m = Math.max(m, 0.3);
    const local = t - c.start;
    if (c.anim?.in && local < c.anim.in.dur) m = Math.max(m, 0.5);
    const a = assetOf(p, c);
    if (a?.kind !== 'video') continue;
    const s = srcTime(c, t);
    const v = ctx.motion(a, Math.max(0, s - 0.25 * c.speed), s + 0.25 * c.speed);
    if (v !== undefined) m = Math.max(m, v);
    else m = Math.max(m, 0.3); // не разобрано — не придираемся
  }
  return m;
}

/** Громкость в момент t (пиковая амплитуда 0…1 с учётом громкости клипа). music — считать ли музыку (дорожки звука). */
function levelAt(p: Project, t: number, music: boolean): number {
  let l = 0;
  for (const tr of p.tracks) {
    if (tr.hidden || tr.kind === 'text' || (!music && tr.kind === 'audio')) continue;
    for (const c of tr.clips) {
      if (c.type !== 'media' || c.muted || !at(c, t, clipEnd(c))) continue;
      const a = assetOf(p, c);
      if (!a?.hasAudio || !a.peaks?.length || a.duration <= 0) continue;
      const i = Math.min(a.peaks.length - 1, Math.max(0, Math.floor((srcTime(c, t) / a.duration) * a.peaks.length)));
      l = Math.max(l, a.peaks[i] * c.volume);
    }
  }
  return l;
}

const captionWords = (p: Project) => p.tracks.flatMap((t) => t.clips)
  .filter((c): c is TextClip => c.type === 'text' && c.role === 'caption')
  .flatMap((c) => (c.words?.length ? c.words.map((w) => ({ start: c.start + w.start, end: c.start + w.end })) : [{ start: c.start, end: c.start + c.duration }]))
  .sort((a, b) => a.start - b.start);

const mainClipAt = (p: Project, t: number) => p.tracks.find((tr) => tr.kind === 'main')?.clips.find((c) => at(c, t, clipEnd(c))) as MediaClip | undefined;
const sec = (v: number) => Math.round(v * 10) / 10;

export function retentionIssues(p: Project, ctx: RetCtx): RetIssue[] {
  const dur = projectDuration(p);
  if (dur <= 0) return [];
  const out: RetIssue[] = [];
  const words = captionWords(p);
  const n = Math.max(1, Math.ceil(dur / STEP));
  const motion: number[] = [];
  const level: number[] = [];
  const voice: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(dur - 1e-3, i * STEP);
    motion.push(motionAt(p, ctx, t));
    level.push(levelAt(p, t, true));
    voice.push(levelAt(p, t, false));
  }
  const avg = (a: number[], i0: number, i1: number) => { let s = 0; for (let i = i0; i < i1; i++) s += a[i]; return i1 > i0 ? s / (i1 - i0) : 0; };
  const anyAudio = p.assets.some((a) => a.hasAudio && a.peaks?.length) && level.some((v) => v > 0.02);

  // 1) крючок: первые 2 секунды
  const h = Math.min(n, Math.round(2 / STEP));
  const speechEarly = words.length ? words.some((w) => w.start < 2) : voice.slice(0, h).filter((v) => v > 0.1).length * STEP > 0.4;
  const textEarly = p.tracks.some((tr) => tr.kind === 'text' && !tr.hidden && tr.clips.some((c) => c.start < 2 && c.type === 'text' && c.text.trim()));
  const first = mainClipAt(p, 0);
  if (avg(motion, 0, h) < STILL && !speechEarly && !textEarly) {
    out.push({ id: 'hook', kind: 'hook', t0: 0, t1: Math.min(2, dur), clipId: first?.id, fix: first && !first.keyframes?.scale?.length ? 'hookZoom' : undefined,
      text: tx('Первые 2 секунды ничего не происходит: нет движения, речи и надписи. В ленте решают за секунду — начни с движения, фразы или заголовка.') });
  }
  // 2) речь начинается поздно
  if (words.length && words[0].start > 2 && first && first.start === 0) {
    const fa = assetOf(p, first);
    const canTrim = fa?.kind === 'video' && fa.hasAudio && words[0].start < clipEnd(first) - 0.5;
    out.push({ id: 'late', kind: 'lateSpeech', t0: 0, t1: words[0].start, clipId: first.id, fix: canTrim ? 'trimStart' : undefined,
      text: tx('Речь начинается только на {0}-й секунде — начни сразу с главного.', Math.floor(words[0].start) + 1) });
  }
  // 3) длинный план без смены и движения
  const main = p.tracks.find((tr) => tr.kind === 'main');
  for (const c of main?.clips ?? []) {
    if (c.type !== 'media') continue;
    const i0 = Math.round(c.start / STEP);
    const i1 = Math.min(n, Math.round(clipEnd(c) / STEP));
    if ((i1 - i0) * STEP < 3.5 || animated(c)) continue;
    // окна по 3,5 с: спокойно — значит проблема; соседние спокойные окна сливаем
    let runStart = -1;
    const W = Math.round(3.5 / STEP);
    const runs: [number, number][] = [];
    for (let i = i0; i + W <= i1; i++) {
      const calm = avg(motion, i, i + W) < CALM;
      if (calm && runStart < 0) runStart = i;
      if (!calm && runStart >= 0) { runs.push([runStart, i + W - 1]); runStart = -1; }
    }
    if (runStart >= 0) runs.push([runStart, i1]);
    for (const [a, b] of runs) {
      const t0 = a * STEP;
      const t1 = Math.min(clipEnd(c), b * STEP);
      if (out.some((x) => x.kind === 'hook') && t1 <= 3.6) continue;
      out.push({ id: `static-${c.id}-${Math.round(t0 * 10)}`, kind: 'static', t0, t1, clipId: c.id, fix: c.keyframes?.scale?.length ? undefined : 'staticZoom',
        text: tx('Один план {0} с без смены и движения — тут начинают листать. Добавь медленный зум или склейку.', sec(t1 - t0)) });
    }
  }
  // 4) звук: нет совсем, тихий, тишина посреди ролика
  if (!anyAudio) {
    out.push({ id: 'nosound', kind: 'noSound', t0: 0, t1: dur, fix: 'music', text: tx('В ролике нет звука — без музыки или голоса шортсы досматривают реже.') });
  } else {
    const sorted = [...level].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    if (p95 < 0.25) {
      out.push({ id: 'quiet', kind: 'quiet', t0: 0, t1: dur, fix: 'louder', text: tx('Звук тихий — на телефоне без наушников его почти не слышно.') });
    }
    let s0 = -1;
    for (let i = 0; i <= n; i++) {
      const quiet = i < n && level[i] < 0.02;
      if (quiet && s0 < 0) s0 = i;
      if (!quiet && s0 >= 0) {
        const t0 = s0 * STEP;
        const t1 = Math.min(dur, i * STEP);
        if (t1 - t0 >= 1.5 && t0 > 0.5 && t1 < dur - 0.5) {
          const c = mainClipAt(p, (t0 + t1) / 2);
          const ca = c ? assetOf(p, c) : undefined;
          out.push({ id: `silence-${Math.round(t0 * 10)}`, kind: 'silence', t0, t1, clipId: c?.id, fix: ca?.kind === 'video' && ca.hasAudio ? 'pauses' : undefined,
            text: tx('Тишина {0} с — ролик «проседает».', sec(t1 - t0)) });
        }
        s0 = -1;
      }
    }
  }
  return out.sort((a, b) => a.t0 - b.t0);
}

/** Медленный зум на отрезке клипа [t0, t1] таймлайна: ключи масштаба по времени исходника. */
export function zoomKeys(c: MediaClip, t0: number, t1: number, to = 1.12): { t: number; v: number; ease: 'smooth' }[] {
  const base = c.transform.scale || 1;
  const s0 = Math.round(srcTime(c, Math.max(c.start, t0)) * 1000) / 1000;
  const s1 = Math.round(srcTime(c, Math.min(clipEnd(c), t1)) * 1000) / 1000;
  return [{ t: s0, v: base, ease: 'smooth' }, { t: s1, v: Math.round(base * to * 1000) / 1000, ease: 'smooth' }];
}
