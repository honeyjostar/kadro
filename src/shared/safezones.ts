// Где интерфейс TikTok, Reels и Shorts закрывает вертикальное видео 9:16 (доли кадра).
// Размеры примерные — по рекомендациям площадок и замерам на телефонах; в разных версиях приложений немного отличаются.
import { tx } from './i18n';
export type Platform = 'tiktok' | 'reels' | 'shorts';

export interface Zone { x: number; y: number; w: number; h: number; label: string; short: string }

export const PLATFORMS: { id: Platform; label: string; maxSec: number; maxNote: string }[] = [
  { id: 'tiktok', label: 'TikTok', maxSec: 600, maxNote: tx('TikTok принимает ролики до 10 минут') },
  { id: 'reels', label: 'Reels', maxSec: 180, maxNote: tx('Reels длиннее 3 минут Instagram почти не показывает новым зрителям') },
  { id: 'shorts', label: 'Shorts', maxSec: 180, maxNote: tx('Shorts — до 3 минут, длиннее YouTube выложит как обычное видео') },
];

export const SAFE_ZONES: Record<Platform, Zone[]> = {
  tiktok: [
    { x: 0, y: 0, w: 1, h: 0.08, label: tx('Вкладки «Подписки» и «Для вас»'), short: tx('Вкладки') },
    { x: 0.86, y: 0.36, w: 0.14, h: 0.5, label: tx('Аватар, лайк, комментарии, репост'), short: tx('Кнопки') },
    { x: 0, y: 0.78, w: 0.86, h: 0.15, label: tx('Ник, подпись и музыка'), short: tx('Ник и подпись') },
    { x: 0, y: 0.93, w: 1, h: 0.07, label: tx('Нижнее меню'), short: tx('Меню') },
  ],
  reels: [
    { x: 0, y: 0, w: 1, h: 0.12, label: tx('Заголовок «Reels» и камера'), short: tx('Заголовок') },
    { x: 0.84, y: 0.55, w: 0.16, h: 0.38, label: tx('Лайк, комментарии, репост, звук'), short: tx('Кнопки') },
    { x: 0, y: 0.7, w: 0.84, h: 0.23, label: tx('Ник, подпись и аудио'), short: tx('Ник и подпись') },
    { x: 0, y: 0.93, w: 1, h: 0.07, label: tx('Нижнее меню'), short: tx('Меню') },
  ],
  shorts: [
    { x: 0, y: 0, w: 1, h: 0.07, label: tx('Поиск и меню'), short: tx('Поиск') },
    { x: 0.85, y: 0.45, w: 0.15, h: 0.45, label: tx('Лайк, дизлайк, комментарии, репост'), short: tx('Кнопки') },
    { x: 0, y: 0.78, w: 0.85, h: 0.14, label: tx('Название, канал и «Подписаться»'), short: tx('Название и канал') },
    { x: 0, y: 0.92, w: 1, h: 0.08, label: tx('Нижнее меню'), short: tx('Меню') },
  ],
};

/** Вертикальный ли кадр (зоны имеют смысл только для 9:16 и близких). */
export function isVertical(w: number, h: number): boolean {
  return h / w > 1.6;
}

/** Какие зоны пересекает прямоугольник (доли кадра). Пересечение меньше 2% площади прямоугольника не считаем. */
export function zonesHit(platform: Platform, r: { x: number; y: number; w: number; h: number }): Zone[] {
  const area = Math.max(1e-9, r.w * r.h);
  return SAFE_ZONES[platform].filter((z) => {
    const ix = Math.max(0, Math.min(r.x + r.w, z.x + z.w) - Math.max(r.x, z.x));
    const iy = Math.max(0, Math.min(r.y + r.h, z.y + z.h) - Math.max(r.y, z.y));
    return (ix * iy) / area > 0.02;
  });
}
