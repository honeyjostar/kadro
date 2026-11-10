// Стикеры: эмодзи крупно, с движением по кругу всё время показа (прыгает, пульсирует, качается, крутится, парит).
// Это обычный текстовый клип (эмодзи рисует шрифт системы) с полем loop — двигается и в плеере, и в экспорте.
import { tx } from './i18n';
import { addText, updateClip } from './timeline';
import type { Project, StickerMotion } from './types';

export const STICKER_GROUPS: { id: string; label: string; items: string[] }[] = [
  { id: 'react', label: tx('Реакции'), items: ['😂', '🤣', '😍', '🥹', '😱', '🤯', '😭', '😎', '🥶', '🤡', '💀', '👀'] },
  { id: 'hands', label: tx('Руки'), items: ['👍', '👎', '👏', '🙏', '✌️', '🤝', '💪', '👉', '👆', '🫶'] },
  { id: 'signs', label: tx('Знаки'), items: ['🔥', '❤️', '💯', '✨', '⭐', '💥', '⚡', '❗', '❓', '✅', '❌', '🎉'] },
  { id: 'things', label: tx('Вещи'), items: ['💸', '🎁', '🍕', '☕', '🎧', '📸', '🚀', '🏆', '💎', '🎮', '📈', '⏰'] },
];

export const STICKER_MOTIONS: { id: StickerMotion; label: string }[] = [
  { id: 'bounce', label: tx('Прыгает') },
  { id: 'pulse', label: tx('Пульсирует') },
  { id: 'wiggle', label: tx('Качается') },
  { id: 'spin', label: tx('Крутится') },
  { id: 'float', label: tx('Плавает') },
];

export const STICKER_DUR = 3;

/** Стикер у курсора: крупное эмодзи, выскакивает и двигается по кругу 3 с. */
export function addStickerClip(p: Project, at: number, emoji: string, motion: StickerMotion): { project: Project; clipId: string } {
  const r = addText(p, at, emoji, { size: 190, strokeWidth: 0, shadow: true, bgOpacity: 0 });
  const project = updateClip(r.project, r.clipId, { loop: motion, duration: STICKER_DUR, x: 0.72, y: 0.3, anim: { in: { type: 'pop', dur: 0.3 } } });
  return { project, clipId: r.clipId };
}
