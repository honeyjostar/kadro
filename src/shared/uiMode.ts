// Простой режим и «Про»: новичку — только главное, остальное спрятано (но доступно через поиск Ctrl+K и переключатель).

export type UiMode = 'simple' | 'pro';

/** Что прячет простой режим. */
export const SIMPLE_HIDES = {
  /** вкладки инспектора клипа: ключевые кадры и анимация, маска и хромакей, 3D-фото */
  inspector: ['anim', 'mask', 'p3d'] as string[],
  /** цвет: только «Основное» (без кривых, HSL и LUT) */
  colorSub: ['curves', 'hsl', 'lut'] as string[],
  /** боковая панель */
  rail: ['3d'] as string[],
};

export const showsInMode = (mode: UiMode, where: keyof typeof SIMPLE_HIDES, id: string): boolean => mode === 'pro' || !SIMPLE_HIDES[where].includes(id);

/** Уровень из знакомства → режим. */
export type Level = 'new' | 'some' | 'pro';
export const modeForLevel = (l: Level): UiMode => (l === 'new' ? 'simple' : 'pro');
