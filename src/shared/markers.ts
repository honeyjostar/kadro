// Маркеры на таймлайне: поставить, переименовать, перекрасить, перейти к соседнему; главы для YouTube
// и для MP4 (видны в плеерах). Чистые функции — проверяются без Electron.
import { tx } from './i18n';
import { uid } from './defaults';
import { projectDuration } from './timeline';
import type { Marker, MarkerColor, Project } from './types';

export const MARKER_COLORS: { id: MarkerColor; label: string; css: string }[] = [
  { id: 'pink', label: tx('Розовый'), css: '#ff3d8b' },
  { id: 'yellow', label: tx('Жёлтый'), css: '#ffc53d' },
  { id: 'green', label: tx('Зелёный'), css: '#3ddc84' },
  { id: 'blue', label: tx('Синий'), css: '#4aa8ff' },
  { id: 'violet', label: tx('Фиолетовый'), css: '#a77bff' },
];
export const markerCss = (c: MarkerColor | undefined): string => (MARKER_COLORS.find((x) => x.id === c) ?? MARKER_COLORS[0]).css;

export const markersOf = (p: Project): Marker[] => p.markers ?? [];
const sorted = (m: Marker[]) => [...m].sort((a, b) => a.t - b.t);
const round = (t: number) => Math.round(t * 1000) / 1000;

/** Поставить маркер; если в пределах кадра уже есть — новый не ставим (возвращаем тот же проект). */
export function addMarker(p: Project, t: number, init: Partial<Omit<Marker, 'id' | 't'>> = {}): { project: Project; id: string } {
  const at = round(Math.max(0, t));
  const near = markersOf(p).find((m) => Math.abs(m.t - at) < 0.5 / p.settings.fps);
  if (near) return { project: p, id: near.id };
  const id = uid('mk');
  const label = init.label ?? tx('Маркер {0}', markersOf(p).length + 1);
  const m: Marker = { id, t: at, label, color: init.color ?? 'pink' };
  return { project: { ...p, markers: sorted([...markersOf(p), m]) }, id };
}

export function updateMarker(p: Project, id: string, patch: Partial<Omit<Marker, 'id'>>): Project {
  if (!markersOf(p).some((m) => m.id === id)) return p;
  const fix = { ...patch, ...(patch.t !== undefined ? { t: round(Math.max(0, patch.t)) } : {}), ...(patch.label !== undefined ? { label: patch.label.replace(/\s+/g, ' ').trim().slice(0, 100) } : {}) };
  return { ...p, markers: sorted(markersOf(p).map((m) => (m.id === id ? { ...m, ...fix } : m))) };
}

export function removeMarker(p: Project, id: string): Project {
  const left = markersOf(p).filter((m) => m.id !== id);
  return left.length === markersOf(p).length ? p : { ...p, markers: left };
}
export const clearMarkers = (p: Project): Project => (markersOf(p).length ? { ...p, markers: [] } : p);

/** Ближайший маркер после t (или до t), с допуском на неточность времени. */
export function nextMarker(p: Project, t: number): Marker | undefined { return sorted(markersOf(p)).find((m) => m.t > t + 1e-3); }
export function prevMarker(p: Project, t: number): Marker | undefined { return sorted(markersOf(p)).reverse().find((m) => m.t < t - 1e-3); }

/** 0:00, 1:05, 1:02:03 — как пишет YouTube. */
export function chapterTime(t: number): string {
  const s = Math.floor(t + 1e-6);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export interface Chapter { start: number; end: number; title: string }

/**
 * Главы по маркерам: первая — с 0:00 (если маркера в начале нет — «Начало»), маркеры за концом ролика
 * отбрасываются, одинаковые секунды склеиваются.
 */
export function chaptersOf(p: Project): Chapter[] {
  const total = projectDuration(p);
  const ms = sorted(markersOf(p)).filter((m) => m.t < total - 0.5);
  if (!ms.length) return [];
  const pts: { t: number; title: string }[] = [];
  if (ms[0].t >= 1) pts.push({ t: 0, title: tx('Начало') });
  for (const m of ms) {
    const t = pts.length ? Math.floor(m.t + 1e-6) : 0;
    const title = m.label.trim() || tx('Глава {0}', pts.length + 1);
    if (pts.length && t <= pts[pts.length - 1].t) { pts[pts.length - 1].title = title; continue; }
    pts.push({ t, title });
  }
  return pts.map((x, i) => ({ start: x.t, end: i + 1 < pts.length ? pts[i + 1].t : total, title: x.title }));
}

/** Текст для описания YouTube и что YouTube не понравится (минимум 3 главы, каждая от 10 секунд). */
export function youtubeChapters(p: Project): { text: string; problems: string[] } {
  const ch = chaptersOf(p);
  const problems: string[] = [];
  if (ch.length && ch.length < 3) problems.push(tx('YouTube покажет главы, только если их хотя бы три — добавь маркеров.'));
  const short = ch.filter((c) => c.end - c.start < 10).map((c) => `«${c.title}»`);
  if (short.length) problems.push(tx('Короче 10 секунд: {0} — YouTube такие главы не покажет.', short.join(', ')));
  return { text: ch.map((c) => `${chapterTime(c.start)} ${c.title}`).join('\n'), problems };
}

/** Файл метаданных FFmpeg с главами — в MP4 они видны в плеерах (VLC, MPC-HC, «Кино и ТВ»). */
export function ffmetadataChapters(p: Project, title?: string): string | null {
  const ch = chaptersOf(p);
  if (!ch.length) return null;
  const esc = (s: string) => s.replace(/[=;#\\\n]/g, (c) => (c === '\n' ? ' ' : `\\${c}`));
  const out = [';FFMETADATA1', ...(title ? [`title=${esc(title)}`] : [])];
  for (const c of ch) out.push('', '[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(c.start * 1000)}`, `END=${Math.round(c.end * 1000)}`, `title=${esc(c.title)}`);
  return `${out.join('\n')}\n`;
}
