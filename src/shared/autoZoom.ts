// Автозум на важных словах: на ключевом слове камера быстро «наезжает» и потом плавно возвращается —
// как у блогеров. Слова — из субтитров (ключевые, с «!», имена, длинные и редкие), не чаще раза в N секунд.
import { mediaKeyTime } from './anim';
import { keywordScore } from './blogCaptions';
import { clipEnd, edit, mainTrack, round } from './timeline';
import type { Keyframe, MediaClip, Project } from './types';
import type { TWord } from './textEdit';

export type ZoomStrength = 'soft' | 'mid' | 'strong';
export const ZOOM: Record<ZoomStrength, { to: number; gap: number }> = {
  soft: { to: 1.1, gap: 4 },
  mid: { to: 1.18, gap: 2.6 },
  strong: { to: 1.28, gap: 1.6 },
};

/** Моменты наезда (время на таймлайне): самые весомые слова, не ближе gap секунд друг к другу. */
export function zoomMoments(words: (TWord & { key?: boolean })[], gap: number): number[] {
  const scored = words.map((w, i) => {
    const prev = words[i - 1];
    let s = keywordScore(w.text, !prev || /[.!?…]$/.test(prev.text));
    if (w.key) s += 2;
    if (/[!?]$/.test(w.text)) s += 1;
    if (prev && w.start - prev.end > 0.35) s += 0.5; // после паузы слово звучит весомее
    return { t: w.start, s };
  }).filter((x) => x.s >= 1.5).sort((a, b) => b.s - a.s);
  const picked: number[] = [];
  for (const x of scored) if (picked.every((t) => Math.abs(t - x.t) >= gap)) picked.push(x.t);
  return picked.sort((a, b) => a - b);
}

/** Ключи масштаба одного наезда (время исходника): быстро к to на слове, держим, плавно назад. */
function punchKeys(c: MediaClip, t: number, to: number): Keyframe[] {
  const base = c.transform.scale || 1;
  const at = (x: number) => round(mediaKeyTime(c, Math.min(clipEnd(c) - 0.01, Math.max(c.start, x))), 4);
  return [
    { t: at(t - 0.08), v: base, ease: 'smooth' },
    { t: at(t + 0.14), v: round(base * to, 3), ease: 'smooth' },
    { t: at(t + 0.95), v: round(base * to, 3), ease: 'smooth' },
    { t: at(t + 1.7), v: base, ease: 'smooth' },
  ];
}

/** Поставить автозум на клипы основной дорожки; прежний автозум убирается, ручные ключи остаются. */
export function applyAutoZoom(p: Project, moments: number[], to: number): { project: Project; count: number } {
  let count = 0;
  const project = edit(clearAutoZoom(p), (d) => {
    for (const c of mainTrack(d).clips) {
      if (c.type !== 'media') continue;
      const inside = moments.filter((t) => t >= c.start + 0.1 && t + 1.7 <= clipEnd(c) + 0.3);
      if (!inside.length) continue;
      const added = inside.flatMap((t) => punchKeys(c, t, to));
      // ручные ключи масштаба внутри наезда мешали бы — их не трогаем, наезд там не ставим
      const manual = c.keyframes?.scale ?? [];
      const free = added.filter((k) => manual.every((m) => Math.abs(m.t - k.t) > 0.05));
      if (!free.length) continue;
      c.keyframes = { ...c.keyframes, scale: [...manual, ...free].sort((a, b) => a.t - b.t) };
      c.autoZoom = free.map((k) => k.t);
      count += inside.length;
    }
  });
  return { project, count };
}

/** Убрать только автозум (ключи, которые поставил он). */
export function clearAutoZoom(p: Project): Project {
  if (!p.tracks.some((t) => t.clips.some((c) => c.type === 'media' && c.autoZoom?.length))) return p;
  return edit(p, (d) => {
    for (const t of d.tracks) {
      for (const c of t.clips) {
        if (c.type !== 'media' || !c.autoZoom?.length) continue;
        const auto = new Set(c.autoZoom.map((x) => x.toFixed(4)));
        const scale = (c.keyframes?.scale ?? []).filter((k) => !auto.has(k.t.toFixed(4)));
        c.keyframes = { ...c.keyframes, scale };
        if (!scale.length) delete c.keyframes!.scale;
        delete c.autoZoom;
      }
    }
  });
}
