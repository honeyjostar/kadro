// «Ещё форматы» при экспорте: тот же ролик сразу в 9:16, 16:9, 1:1 и кружком для Telegram.
// Кадр перестраивается под формат (как при смене формата под плеером); где видео не заполняет кадр — размытый фон.
import { tx } from './i18n';
import { sizeFor } from './defaults';
import { setSettings } from './timeline';
import type { AspectKey, Project } from './types';

export type ExtraFormatId = 'v916' | 'h169' | 'sq11' | 'tgcircle';
export interface ExtraFormat {
  id: ExtraFormatId;
  aspect: AspectKey;
  label: string;
  /** где пригодится */
  where: string;
  /** короткая сторона кадра; нет — как у основного файла */
  short?: number;
  /** не длиннее, секунд */
  maxSec?: number;
  /** приписка к имени файла */
  suffix: string;
}

/** Кружок Telegram: квадрат 640×640, до 60 секунд. */
export const TG_CIRCLE = { short: 640, maxSec: 60 };

export const EXTRA_FORMATS: ExtraFormat[] = [
  { id: 'v916', aspect: '9:16', label: '9:16', where: tx('TikTok, Reels, Shorts, ВК Клипы'), suffix: '9x16' },
  { id: 'h169', aspect: '16:9', label: '16:9', where: tx('YouTube, RuTube, Дзен'), suffix: '16x9' },
  { id: 'sq11', aspect: '1:1', label: '1:1', where: tx('пост ВКонтакте, в Telegram, Instagram'), suffix: '1x1' },
  { id: 'tgcircle', aspect: '1:1', label: tx('Кружок Telegram'), where: tx('квадрат 640×640, до 60 секунд'), short: TG_CIRCLE.short, maxSec: TG_CIRCLE.maxSec, suffix: tx('кружок') },
];

/** Формат совпадает с проектом — это и есть основной файл (кроме кружка: у него свой размер и длина). */
export function sameAsProject(p: Project, f: ExtraFormat): boolean {
  return f.id !== 'tgcircle' && p.settings.aspect === f.aspect;
}

/** Проект в другом формате кадра; где кадр не заполнен — размытый фон вместо чёрного. */
export function variantProject(p: Project, f: ExtraFormat, short: number): Project {
  const s = f.short ?? short;
  const background = p.settings.aspect !== f.aspect && p.settings.background === 'black' ? 'blur' : p.settings.background;
  return setSettings(p, { aspect: f.aspect, ...sizeFor(f.aspect, s), background });
}

/** Путь файла другого формата рядом с основным: «Ролик · 16x9.mp4». */
export function extraPath(main: string, f: ExtraFormat): string {
  const m = /^(.*?)(\.[^./\\]+)?$/.exec(main)!;
  return `${m[1]} · ${f.suffix}${m[2] ?? '.mp4'}`;
}
