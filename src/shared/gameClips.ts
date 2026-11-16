// Клипы из игр (GTA, шутеры, гонки): записи с консоли или ПК без речи → лучшие моменты по экшену — где громко
// (выстрелы, взрывы, крики) и где кадр резко меняется (погоня, драка, авария). Из каждого — вертикальный проект
// 9:16: игра во весь экран или целиком с размытым фоном, сверху заголовок. Чистые функции — тестируются без программы.
import { tx } from './i18n';
import { newProject } from './defaults';
import { addAsset, addText, addToMain, updateClip } from './timeline';
import type { Highlights } from './autoEdit';
import type { ShortMoment, ShortReason } from './shorts';
import type { MediaAsset, Project } from './types';

export type GameLayout = 'fill' | 'blur';

/** Заголовки сверху — общие, без чужих игровых надписей и логотипов. */
export const GAME_TITLES = [
  tx('ЭТО БЫЛО ЖЁСТКО'), tx('НЕ ОЖИДАЛ'), tx('ЛУЧШИЙ МОМЕНТ'), tx('СМОТРИ ДО КОНЦА'), tx('ЧУТЬ НЕ ПРОИГРАЛ'),
  tx('ВОТ ЭТО ПОВОРОТ'), tx('КАК ТАК?'), tx('ЭПИЧНО'),
];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}
/** Значения → 0..1 относительно самого видео: медиана — 0, верхние 5 % — 1 (тихая игра и громкая сравнимы). */
function rel(xs: number[]): number[] {
  const lo = quantile(xs, 0.5);
  const hi = quantile(xs, 0.95);
  const d = Math.max(1e-6, hi - lo);
  return xs.map((x) => clamp((x - lo) / d, 0, 1.5));
}
function smooth(xs: number[], r: number): number[] {
  return xs.map((_, i) => {
    let s = 0, n = 0;
    for (let k = Math.max(0, i - r); k <= Math.min(xs.length - 1, i + r); k++) { s += xs[k]; n++; }
    return s / n;
  });
}

export interface GameSeries { step: number; loud: number[]; act: number[]; score: number[] }

/** Громкость и движение (разбор кадров) на одной сетке шагов → «экшен» каждого шага. Громкость — уровень звука
 *  на каждом шаге (loud) или, если его нет, форма волны peaks. */
export function gameSeries(hl: Pick<Highlights, 'step' | 'act' | 'cuts'>, peaks: number[] | undefined, duration: number, levels?: number[]): GameSeries {
  const step = hl.step > 0 ? hl.step : 0.5;
  const n = Math.max(1, Math.ceil(duration / step));
  const loudRaw: number[] = [];
  for (let i = 0; i < n; i++) {
    if (levels?.length) { loudRaw.push(levels[i] ?? 0); continue; }
    if (!peaks?.length) { loudRaw.push(0); continue; }
    const a = Math.floor(((i * step) / duration) * peaks.length);
    const b = Math.max(a + 1, Math.ceil((((i + 1) * step) / duration) * peaks.length));
    let m = 0;
    for (let k = a; k < Math.min(peaks.length, b); k++) m = Math.max(m, peaks[k]);
    loudRaw.push(m);
  }
  const actRaw = Array.from({ length: n }, (_, i) => hl.act?.[i] ?? 0);
  // смена кадра (взрыв, вспышка, телепорт) — тоже экшен
  for (const c of hl.cuts ?? []) { const i = Math.round(c / step); if (i >= 0 && i < n) actRaw[i] = Math.max(actRaw[i], 1); }
  const loud = rel(loudRaw);
  const act = rel(actRaw);
  const r = Math.max(1, Math.round(1.5 / step));
  const score = smooth(loud.map((l, i) => 0.6 * l + 0.4 * act[i]), r);
  return { step, loud, act, score };
}

const share = (xs: number[], a: number, b: number) => { let k = 0; for (let i = a; i < b; i++) if ((xs[i] ?? 0) > 0.6) k++; return k / Math.max(1, b - a); };
const avg = (xs: number[], a: number, b: number) => { let s = 0; for (let i = a; i < b; i++) s += xs[i] ?? 0; return s / Math.max(1, b - a); };

/**
 * Лучшие моменты: пики экшена, каждый в окне нужной длины (разгон до пика — две трети, после — треть), не
 * пересекаются. Возвращает по убыванию оценки.
 */
export function findGameMoments(g: GameSeries, duration: number, o: { min: number; max: number; count: number }): ShortMoment[] {
  const len = Math.min(duration, (o.min + o.max) / 2);
  if (duration < o.min || !g.score.length) return [];
  const used: [number, number][] = [];
  const order = g.score.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const out: ShortMoment[] = [];
  for (const [v, i] of order) {
    if (out.length >= o.count) break;
    if (v <= 0.05) break;
    const peak = (i + 0.5) * g.step;
    let start = clamp(peak - len * 0.65, 0, Math.max(0, duration - len));
    const end = Math.min(duration, start + len);
    start = Math.max(0, end - len);
    if (used.some(([a, b]) => start < b + 2 && end > a - 2)) continue;
    const a = Math.floor(start / g.step), b = Math.ceil(end / g.step);
    const reasons: ShortReason[] = [];
    // причина — если заметная часть окна (больше 15 %) громкая или в движении
    if (share(g.loud, a, b) > 0.15) reasons.push('loud');
    if (share(g.act, a, b) > 0.15) reasons.push('action');
    if ((g.loud[i] ?? 0) >= 1) reasons.push('peak');
    used.push([start, end]);
    const title = GAME_TITLES[out.length % GAME_TITLES.length];
    out.push({ start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100, score: Math.round((v + avg(g.score, a, b)) * 100) / 100, hook: title, title, reasons, words: [] });
  }
  return out;
}

/** Проект шортса из игрового момента: 9:16, игра во весь экран (fill) или целиком с размытым фоном (blur). */
export function gameShortProject(asset: MediaAsset, m: ShortMoment, n: number, layout: GameLayout = 'blur'): Project {
  let p = newProject(tx('Клип {0} — {1}', n, m.title.toLowerCase()), '9:16');
  if (layout === 'blur') p = { ...p, settings: { ...p.settings, background: 'blur' } };
  p = addAsset(p, asset);
  const r = addToMain(p, asset.id, 0, { in: m.start, out: m.end });
  // игра целиком: кадр по ширине, сверху и снизу — размытая копия; во весь экран — края по бокам обрезаны
  p = updateClip(r.project, r.clipId, { fit: layout === 'blur' ? 'contain' : 'cover' });
  const title = addText(p, 0, m.title, { font: 'Montserrat', bold: true, uppercase: true, size: 72, color: '#ffffff', bgColor: '#000000', bgOpacity: 0, strokeWidth: 6, strokeColor: '#000000', shadow: true });
  p = updateClip(title.project, title.clipId, { duration: Math.min(3, m.end - m.start), y: 0.16, anim: { in: { type: 'pop', dur: 0.25 }, out: { type: 'fade', dur: 0.2 } } });
  return p;
}
