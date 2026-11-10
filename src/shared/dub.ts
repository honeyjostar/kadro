// Дубляж: речь ролика → перевод → озвучка другим голосом по тем же таймингам, без интернета.
// Здесь — чистая часть: фразы из субтитров, сколько времени у каждой фразы, ускорение голоса, раскладка по дорожке.
import { tx } from './i18n';
import { newMediaClip, newTrack } from './defaults';
import { groupCues, type LangCode } from './translate';
import { edit } from './timeline';
import type { Project, TextClip } from './types';

/** Направления, для которых в Kadro есть и перевод, и голоса. */
export const DUB_PAIRS: { from: LangCode; to: LangCode; label: string }[] = [
  { from: 'ru', to: 'en', label: tx('На английский') },
  { from: 'en', to: 'ru', label: tx('На русский') },
];

export interface DubPhrase { start: number; end: number; text: string; cues: number[] }

/** Субтитры проекта по порядку (первая строка — без второй строки перевода). */
export function captionCues(p: Project): { id: string; text: string; start: number; end: number }[] {
  return p.tracks.flatMap((t) => t.clips)
    .filter((c): c is TextClip => c.type === 'text' && c.role === 'caption')
    .sort((a, b) => a.start - b.start)
    .map((c) => ({ id: c.id, text: c.text.split('\n')[0].trim(), start: c.start, end: c.start + c.duration }));
}

/** Фразы для озвучки: соседние субтитры склеены в предложения (как для перевода). */
export function dubPhrases(cues: { text: string; start: number; end: number }[]): DubPhrase[] {
  return groupCues(cues).map((g) => ({ start: cues[g[0]].start, end: cues[g[g.length - 1]].end, text: g.map((i) => cues[i].text).join(' '), cues: g }));
}

/** Сколько времени у фразы: до начала следующей (или до конца ролика), минимум — её собственная длина. */
export function slotOf(ph: DubPhrase[], i: number, total: number): number {
  const next = ph[i + 1]?.start ?? total;
  return Math.max(ph[i].end - ph[i].start, next - ph[i].start - 0.08, 0.4);
}

/** Озвучка не влезает — во сколько раз ускорить голос (не больше чем в 1,45 раза: дальше неразборчиво). */
export function fitSpeed(duration: number, slot: number): number {
  if (duration <= slot * 1.04) return 1;
  return Math.round(Math.min(1.45, duration / slot) * 100) / 100;
}

/**
 * Разложить озвученные фразы по новой дорожке «Дубляж» (файлы уже в проекте). Наезды убираются: фраза, которая
 * началась бы раньше конца предыдущей, сдвигается за неё.
 */
export function placeDub(p: Project, lines: { assetId: string; start: number }[], name = tx('Дубляж')): Project {
  return edit(p, (d) => {
    const track = newTrack('audio', name);
    let end = 0;
    for (const l of [...lines].sort((a, b) => a.start - b.start)) {
      const a = d.assets.find((x) => x.id === l.assetId);
      if (!a) continue;
      const c = newMediaClip(a, Math.max(l.start, end));
      track.clips.push(c);
      end = c.start + (c.out - c.in) / c.speed + 0.02;
    }
    d.tracks.push(track);
  });
}

/** Оригинальная речь: тихо под дубляжом или выключить (только звук видео — музыка остаётся как есть). */
export function quietOriginal(p: Project, mode: 'duck' | 'mute', skipTrackId?: string): Project {
  return edit(p, (d) => {
    for (const t of d.tracks) {
      if (t.id === skipTrackId || t.kind === 'audio' || t.kind === 'text') continue;
      for (const c of t.clips) {
        if (c.type !== 'media') continue;
        const a = d.assets.find((x) => x.id === c.assetId);
        if (!a?.hasAudio || a.kind !== 'video') continue;
        if (mode === 'mute') c.muted = true;
        else c.volume = Math.min(c.volume, 0.15);
      }
    }
  });
}
