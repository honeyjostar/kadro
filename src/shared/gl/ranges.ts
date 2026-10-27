// Где в ролике есть шейдеры: переходы-шейдеры на стыках основной дорожки и клипы с эффектами-шейдерами.
// Эти куски при экспорте рисует движок Kadro по кадрам (renderer/engine/glExport.ts).
import { clipEnd, projectDuration } from '../timeline';
import type { Project } from '../types';
import { isGlType } from './glsl';

export interface GlRange { start: number; end: number; frames: number }

/** Куски времени с шейдерами, выровненные по кадрам экспорта и слитые, если касаются друг друга. */
export function glRanges(p: Project, fps: number): GlRange[] {
  const raw: [number, number][] = [];
  const main = p.tracks.find((t) => t.kind === 'main');
  if (main && !main.hidden) {
    main.clips.forEach((c, i) => {
      const next = main.clips[i + 1];
      if (c.type !== 'media' || !next || !c.transitionOut || !isGlType(c.transitionOut.type)) return;
      raw.push([next.start, clipEnd(c)]);
    });
  }
  for (const t of p.tracks) {
    if (t.hidden || t.kind === 'audio' || t.kind === 'text') continue;
    for (const c of t.clips) {
      if (c.type !== 'media' || !c.effects?.some((e) => isGlType(e.type) && e.amount > 0.001)) continue;
      raw.push([c.start, clipEnd(c)]);
    }
  }
  const total = projectDuration(p);
  const F = fps;
  const aligned = raw
    .map(([s, e]) => [Math.max(0, Math.floor(s * F + 1e-6) / F), Math.min(total, Math.ceil(e * F - 1e-6) / F)] as [number, number])
    .filter(([s, e]) => e > s + 1e-6)
    .sort((a, b) => a[0] - b[0]);
  const out: GlRange[] = [];
  for (const [s, e] of aligned) {
    const last = out[out.length - 1];
    if (last && s <= last.end + 1e-6) { last.end = Math.max(last.end, e); continue; }
    out.push({ start: s, end: e, frames: 0 });
  }
  for (const r of out) r.frames = Math.max(1, Math.round((r.end - r.start) * F));
  return out;
}
