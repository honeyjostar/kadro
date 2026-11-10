// Свой логотип на всё видео: картинка в углу кадра поверх всего (настройка проекта).
// Одна геометрия для плеера и экспорта — логотип стоит на одном и том же месте.
export type LogoCorner = 'tl' | 'tr' | 'bl' | 'br';

export interface ProjectLogo {
  path: string;
  name: string;
  /** ширина / высота картинки */
  ar: number;
  corner: LogoCorner;
  /** ширина логотипа — доля короткой стороны кадра */
  size: number;
  /** 0…1 */
  opacity: number;
}

export const LOGO_SIZE = { min: 0.05, max: 0.5 } as const;
export const LOGO_EXTS = ['png', 'jpg', 'jpeg', 'webp'] as const;

/** Новый логотип: правый верхний угол — снизу в шортсах подписи и кнопки. */
export function newLogo(path: string, name: string, ar: number): ProjectLogo {
  return { path, name, ar: ar > 0 && Number.isFinite(ar) ? ar : 1, corner: 'tr', size: 0.16, opacity: 0.85 };
}

const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);

/** Где логотип в кадре W×H (пиксели, чётные размеры — для кодировщика). Отступ от края — 4% короткой стороны. */
export function logoBox(W: number, H: number, l: Pick<ProjectLogo, 'ar' | 'corner' | 'size'>): { x: number; y: number; w: number; h: number } {
  const short = Math.min(W, H);
  const size = Math.min(LOGO_SIZE.max, Math.max(LOGO_SIZE.min, l.size));
  const w = even(size * short);
  const h = even(w / Math.max(0.05, l.ar || 1));
  const m = Math.round(short * 0.04);
  const x = l.corner[1] === 'l' ? m : W - m - w;
  const y = l.corner[0] === 't' ? m : H - m - h;
  return { x, y, w, h };
}

// ---------- полоска прогресса, как в шортсах ----------
export interface ProgressBar {
  color: string;
  /** толщина — доля короткой стороны кадра */
  size: number;
  place: 'bottom' | 'top';
}
export const PROGRESS_DEFAULT: ProgressBar = { color: '#ff3d7f', size: 0.012, place: 'bottom' };

/** Прямоугольник полоски в момент t (пиксели; ширина растёт от 0 до всей ширины кадра). */
export function progressBox(W: number, H: number, b: Pick<ProgressBar, 'size' | 'place'>, t: number, total: number): { x: number; y: number; w: number; h: number } {
  const h = Math.max(2, Math.round(Math.min(0.05, Math.max(0.004, b.size)) * Math.min(W, H)));
  const w = total > 0 ? Math.max(0, Math.min(1, t / total)) * W : 0;
  return { x: 0, y: b.place === 'top' ? 0 : H - h, w, h };
}
