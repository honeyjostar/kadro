import { tx } from './i18n';
import type {
  VoiceEffect, ChromaKey, TextAnimType, WordHighlight, AspectKey, ColorAdjust, MediaAsset, MediaClip, Project, ProjectSettings, TextClip, TextStyle, Track, TrackKind, Transform, TransitionType,
} from './types';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${counter.toString(36)}`;
}

export const ASPECTS: Record<AspectKey, { w: number; h: number; label: string }> = {
  '9:16': { w: 1080, h: 1920, label: '9:16 · TikTok, Reels, Shorts' },
  '16:9': { w: 1920, h: 1080, label: '16:9 · YouTube' },
  '1:1': { w: 1080, h: 1080, label: tx('1:1 · Квадрат') },
  '4:5': { w: 1080, h: 1350, label: tx('4:5 · Лента Instagram') },
  '3:4': { w: 1080, h: 1440, label: '3:4' },
  '4:3': { w: 1440, h: 1080, label: '4:3' },
  '21:9': { w: 2520, h: 1080, label: tx('21:9 · Кино') },
};

/** Разрешение проекта — по короткой стороне кадра (720p, 1080p, 2K, 4K). */
export const RESOLUTIONS: { short: number; label: string }[] = [
  { short: 720, label: '720p' }, { short: 1080, label: '1080p' }, { short: 1440, label: '2K' }, { short: 2160, label: '4K' },
];
export const FPS_LIST = [24, 25, 30, 50, 60] as const;

/** Размер кадра для формата и короткой стороны (стороны чётные — так любит H.264). */
export function sizeFor(aspect: AspectKey, short = 1080): { width: number; height: number } {
  const a = ASPECTS[aspect];
  const k = short / Math.min(a.w, a.h);
  const even = (v: number) => Math.max(2, 2 * Math.round(v / 2));
  return { width: even(a.w * k), height: even(a.h * k) };
}
/** Короткая сторона кадра проекта (ближайшая из списка разрешений). */
export function shortSideOf(s: Pick<ProjectSettings, 'width' | 'height'>): number {
  const m = Math.min(s.width, s.height);
  return RESOLUTIONS.reduce((b, r) => (Math.abs(r.short - m) < Math.abs(b - m) ? r.short : b), 1080);
}

export function settingsFor(aspect: AspectKey, fps = 30, background: ProjectSettings['background'] = 'black'): ProjectSettings {
  const a = ASPECTS[aspect];
  return { aspect, width: a.w, height: a.h, fps, background };
}

export const DEFAULT_TRANSFORM: Transform = { scale: 1, x: 0, y: 0, rotation: 0 };
export const DEFAULT_COLOR: ColorAdjust = { brightness: 1, contrast: 1, saturation: 1, warmth: 0, preset: 'none', presetAmount: 1 };

export const DEFAULT_TEXT_STYLE: TextStyle = {
  font: 'Montserrat',
  size: 72,
  color: '#ffffff',
  bold: true,
  italic: false,
  uppercase: false,
  align: 'center',
  strokeColor: '#000000',
  strokeWidth: 0,
  shadow: true,
  bgColor: '#000000',
  bgOpacity: 0,
  maxWidth: 0.86,
};

export const CAPTION_STYLE: TextStyle = {
  ...DEFAULT_TEXT_STYLE,
  font: 'Montserrat',
  size: 64,
  bold: true,
  strokeColor: '#000000',
  strokeWidth: 7,
  shadow: false,
  maxWidth: 0.82,
};

export function newTrack(kind: TrackKind, name?: string): Track {
  const names: Record<TrackKind, string> = { main: tx('Основная'), video: tx('Наложение'), audio: tx('Аудио'), text: tx('Текст') };
  return { id: uid('trk'), kind, name: name ?? names[kind], muted: false, hidden: false, clips: [] };
}

export function newProject(name = tx('Новый проект'), aspect: AspectKey = '9:16'): Project {
  const now = Date.now();
  return {
    version: 1,
    name,
    settings: settingsFor(aspect),
    assets: [],
    tracks: [newTrack('main')],
    createdAt: now,
    updatedAt: now,
  };
}

export const IMAGE_DEFAULT_DURATION = 3;

export function newMediaClip(asset: MediaAsset, start = 0): MediaClip {
  const len = asset.kind === 'image' ? IMAGE_DEFAULT_DURATION : asset.loop ? Math.max(asset.duration, IMAGE_DEFAULT_DURATION) : asset.duration;
  return {
    id: uid('clip'),
    type: 'media',
    assetId: asset.id,
    start,
    in: 0,
    out: len,
    speed: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    fit: 'contain',
    transform: { ...DEFAULT_TRANSFORM },
    color: { ...DEFAULT_COLOR },
    removeBg: { enabled: false, status: 'none' },
    denoise: { enabled: false, status: 'none' },
  };
}

export function newTextClip(start: number, text = tx('Текст'), style: Partial<TextStyle> = {}, role: TextClip['role'] = 'title'): TextClip {
  return {
    id: uid('txt'),
    type: 'text',
    start,
    duration: 3,
    text,
    style: { ...DEFAULT_TEXT_STYLE, ...style },
    x: 0.5,
    y: role === 'caption' ? 0.64 : 0.5,
    role,
  };
}

export type TransitionCat = 'basic' | 'move' | 'wipe' | 'shape';
export const TRANSITION_CATS: { id: TransitionCat; label: string }[] = [
  { id: 'basic', label: tx('Основные') },
  { id: 'move', label: tx('Движение') },
  { id: 'wipe', label: tx('Шторки') },
  { id: 'shape', label: tx('Фигуры') },
];

export const TRANSITIONS: { type: TransitionType; label: string; cat: TransitionCat }[] = [
  { type: 'fade', label: tx('Растворение'), cat: 'basic' },
  { type: 'fadeslow', label: tx('Мягкое растворение'), cat: 'basic' },
  { type: 'fadefast', label: tx('Резкое растворение'), cat: 'basic' },
  { type: 'fadeblack', label: tx('Через чёрный'), cat: 'basic' },
  { type: 'fadewhite', label: tx('Через белый'), cat: 'basic' },
  { type: 'fadegrays', label: tx('Через ч/б'), cat: 'basic' },
  { type: 'dissolve', label: tx('Рассыпание'), cat: 'basic' },
  { type: 'distance', label: tx('По яркости'), cat: 'basic' },
  { type: 'pixelize', label: tx('Пиксели'), cat: 'basic' },
  { type: 'hblur', label: tx('Размытие'), cat: 'basic' },
  { type: 'zoomin', label: tx('Приближение'), cat: 'basic' },
  { type: 'slideleft', label: tx('Сдвиг ←'), cat: 'move' },
  { type: 'slideright', label: tx('Сдвиг →'), cat: 'move' },
  { type: 'slideup', label: tx('Сдвиг ↑'), cat: 'move' },
  { type: 'slidedown', label: tx('Сдвиг ↓'), cat: 'move' },
  { type: 'coverleft', label: tx('Наезд ←'), cat: 'move' },
  { type: 'coverright', label: tx('Наезд →'), cat: 'move' },
  { type: 'coverup', label: tx('Наезд ↑'), cat: 'move' },
  { type: 'coverdown', label: tx('Наезд ↓'), cat: 'move' },
  { type: 'revealleft', label: tx('Уход ←'), cat: 'move' },
  { type: 'revealright', label: tx('Уход →'), cat: 'move' },
  { type: 'revealup', label: tx('Уход ↑'), cat: 'move' },
  { type: 'revealdown', label: tx('Уход ↓'), cat: 'move' },
  { type: 'squeezeh', label: tx('Сжатие ↕'), cat: 'move' },
  { type: 'squeezev', label: tx('Сжатие ↔'), cat: 'move' },
  { type: 'wipeleft', label: tx('Шторка ←'), cat: 'wipe' },
  { type: 'wiperight', label: tx('Шторка →'), cat: 'wipe' },
  { type: 'wipeup', label: tx('Шторка ↑'), cat: 'wipe' },
  { type: 'wipedown', label: tx('Шторка ↓'), cat: 'wipe' },
  { type: 'smoothleft', label: tx('Мягкая шторка ←'), cat: 'wipe' },
  { type: 'smoothright', label: tx('Мягкая шторка →'), cat: 'wipe' },
  { type: 'smoothup', label: tx('Мягкая шторка ↑'), cat: 'wipe' },
  { type: 'smoothdown', label: tx('Мягкая шторка ↓'), cat: 'wipe' },
  { type: 'wipetl', label: tx('В угол ↖'), cat: 'wipe' },
  { type: 'wipetr', label: tx('В угол ↗'), cat: 'wipe' },
  { type: 'wipebl', label: tx('В угол ↙'), cat: 'wipe' },
  { type: 'wipebr', label: tx('В угол ↘'), cat: 'wipe' },
  { type: 'diagtl', label: tx('Диагональ ↖'), cat: 'wipe' },
  { type: 'diagtr', label: tx('Диагональ ↗'), cat: 'wipe' },
  { type: 'diagbl', label: tx('Диагональ ↙'), cat: 'wipe' },
  { type: 'diagbr', label: tx('Диагональ ↘'), cat: 'wipe' },
  { type: 'hlslice', label: tx('Жалюзи ←'), cat: 'wipe' },
  { type: 'hrslice', label: tx('Жалюзи →'), cat: 'wipe' },
  { type: 'vuslice', label: tx('Жалюзи ↑'), cat: 'wipe' },
  { type: 'vdslice', label: tx('Жалюзи ↓'), cat: 'wipe' },
  { type: 'hlwind', label: tx('Ветер ←'), cat: 'wipe' },
  { type: 'hrwind', label: tx('Ветер →'), cat: 'wipe' },
  { type: 'vuwind', label: tx('Ветер ↑'), cat: 'wipe' },
  { type: 'vdwind', label: tx('Ветер ↓'), cat: 'wipe' },
  { type: 'circleopen', label: tx('Круг из центра'), cat: 'shape' },
  { type: 'circleclose', label: tx('Круг к центру'), cat: 'shape' },
  { type: 'circlecrop', label: tx('Круг через чёрный'), cat: 'shape' },
  { type: 'rectcrop', label: tx('Рамка через чёрный'), cat: 'shape' },
  { type: 'radial', label: tx('Радар'), cat: 'shape' },
  { type: 'vertopen', label: tx('Раскрытие ↔'), cat: 'shape' },
  { type: 'vertclose', label: tx('Закрытие ↔'), cat: 'shape' },
  { type: 'horzopen', label: tx('Раскрытие ↕'), cat: 'shape' },
  { type: 'horzclose', label: tx('Закрытие ↕'), cat: 'shape' },
];

export type FontCat = 'sans' | 'display' | 'serif' | 'hand' | 'pixel' | 'fun' | 'mono';
export const FONT_CATS: { id: FontCat; label: string }[] = [
  { id: 'sans', label: tx('Без засечек') },
  { id: 'display', label: tx('Заголовки') },
  { id: 'fun', label: tx('Эффектные') },
  { id: 'pixel', label: tx('Пиксельные и ретро') },
  { id: 'hand', label: tx('Рукописные') },
  { id: 'serif', label: tx('С засечками') },
  { id: 'mono', label: tx('Моноширинные') },
];

/** Шрифты с кириллицей (встроены, см. renderer/fonts.ts). label — как показываем в списке. */
export const FONTS: { family: string; label: string; cat: FontCat }[] = [
  { family: 'Onest', label: 'Onest', cat: 'sans' },
  { family: 'Inter', label: 'Inter', cat: 'sans' },
  { family: 'Montserrat', label: 'Montserrat', cat: 'sans' },
  { family: 'Rubik', label: 'Rubik', cat: 'sans' },
  { family: 'Roboto', label: 'Roboto', cat: 'sans' },
  { family: 'Open Sans', label: 'Open Sans', cat: 'sans' },
  { family: 'Manrope', label: 'Manrope', cat: 'sans' },
  { family: 'Nunito', label: 'Nunito', cat: 'sans' },
  { family: 'Raleway', label: 'Raleway', cat: 'sans' },
  { family: 'Jost', label: 'Jost', cat: 'sans' },
  { family: 'Geologica', label: 'Geologica', cat: 'sans' },
  { family: 'Golos Text', label: 'Golos Text', cat: 'sans' },
  { family: 'Commissioner', label: 'Commissioner', cat: 'sans' },
  { family: 'Exo 2', label: 'Exo 2', cat: 'sans' },
  { family: 'Fira Sans', label: 'Fira Sans', cat: 'sans' },
  { family: 'Ubuntu', label: 'Ubuntu', cat: 'sans' },
  { family: 'PT Sans', label: 'PT Sans', cat: 'sans' },
  { family: 'Noto Sans', label: 'Noto Sans', cat: 'sans' },
  { family: 'Mulish', label: 'Mulish', cat: 'sans' },
  { family: 'Wix Madefor Display', label: 'Wix Madefor Display', cat: 'sans' },
  { family: 'Geist', label: 'Geist', cat: 'sans' },
  { family: 'Sofia Sans', label: 'Sofia Sans', cat: 'sans' },
  { family: 'Comfortaa', label: 'Comfortaa', cat: 'sans' },
  { family: 'Oswald', label: 'Oswald', cat: 'display' },
  { family: 'Unbounded', label: 'Unbounded', cat: 'display' },
  { family: 'Russo One', label: 'Russo One', cat: 'display' },
  { family: 'Dela Gothic One', label: 'Dela Gothic One', cat: 'display' },
  { family: 'Days One', label: 'Days One', cat: 'display' },
  { family: 'Rubik Mono One', label: 'Rubik Mono One', cat: 'display' },
  { family: 'Montserrat Alternates', label: 'Montserrat Alternates', cat: 'display' },
  { family: 'Tektur', label: 'Tektur', cat: 'display' },
  { family: 'Play', label: 'Play', cat: 'display' },
  { family: 'Jura', label: 'Jura', cat: 'display' },
  { family: 'Roboto Condensed', label: 'Roboto Condensed', cat: 'display' },
  { family: 'Fira Sans Condensed', label: 'Fira Sans Condensed', cat: 'display' },
  { family: 'Sofia Sans Extra Condensed', label: 'Sofia Sans Extra Condensed', cat: 'display' },
  { family: 'Yanone Kaffeesatz', label: 'Yanone Kaffeesatz', cat: 'display' },
  { family: 'Alumni Sans', label: 'Alumni Sans', cat: 'display' },
  { family: 'PT Sans Narrow', label: 'PT Sans Narrow', cat: 'display' },
  { family: 'Cuprum', label: 'Cuprum', cat: 'display' },
  { family: 'Stalinist One', label: 'Stalinist One', cat: 'display' },
  { family: 'Seymour One', label: 'Seymour One', cat: 'display' },
  { family: 'Ruslan Display', label: 'Ruslan Display', cat: 'display' },
  { family: 'Climate Crisis', label: 'Climate Crisis', cat: 'display' },
  { family: 'Train One', label: 'Train One', cat: 'display' },
  { family: 'Rampart One', label: 'Rampart One', cat: 'display' },
  { family: 'Reggae One', label: 'Reggae One', cat: 'display' },
  { family: 'Oi', label: 'Oi', cat: 'display' },
  { family: 'Kelly Slab', label: 'Kelly Slab', cat: 'display' },
  { family: 'PT Serif', label: 'PT Serif', cat: 'serif' },
  { family: 'Playfair Display', label: 'Playfair Display', cat: 'serif' },
  { family: 'Lora', label: 'Lora', cat: 'serif' },
  { family: 'Merriweather', label: 'Merriweather', cat: 'serif' },
  { family: 'Cormorant Garamond', label: 'Cormorant Garamond', cat: 'serif' },
  { family: 'EB Garamond', label: 'EB Garamond', cat: 'serif' },
  { family: 'Noto Serif', label: 'Noto Serif', cat: 'serif' },
  { family: 'Roboto Slab', label: 'Roboto Slab', cat: 'serif' },
  { family: 'Literata', label: 'Literata', cat: 'serif' },
  { family: 'Spectral', label: 'Spectral', cat: 'serif' },
  { family: 'Prata', label: 'Prata', cat: 'serif' },
  { family: 'Yeseva One', label: 'Yeseva One', cat: 'serif' },
  { family: 'Old Standard TT', label: 'Old Standard TT', cat: 'serif' },
  { family: 'Alice', label: 'Alice', cat: 'serif' },
  { family: 'Forum', label: 'Forum', cat: 'serif' },
  { family: 'Podkova', label: 'Podkova', cat: 'serif' },
  { family: 'Kurale', label: 'Kurale', cat: 'serif' },
  { family: 'Philosopher', label: 'Philosopher', cat: 'serif' },
  { family: 'Tenor Sans', label: 'Tenor Sans', cat: 'serif' },
  { family: 'Caveat', label: 'Caveat', cat: 'hand' },
  { family: 'Lobster', label: 'Lobster', cat: 'hand' },
  { family: 'Pacifico', label: 'Pacifico', cat: 'hand' },
  { family: 'Marck Script', label: 'Marck Script', cat: 'hand' },
  { family: 'Bad Script', label: 'Bad Script', cat: 'hand' },
  { family: 'Great Vibes', label: 'Great Vibes', cat: 'hand' },
  { family: 'Amatic SC', label: 'Amatic SC', cat: 'hand' },
  { family: 'Neucha', label: 'Neucha', cat: 'hand' },
  { family: 'Pangolin', label: 'Pangolin', cat: 'hand' },
  { family: 'Shantell Sans', label: 'Shantell Sans', cat: 'hand' },
  { family: 'Gabriela', label: 'Gabriela', cat: 'hand' },
  { family: 'Pattaya', label: 'Pattaya', cat: 'hand' },
  { family: 'Underdog', label: 'Underdog', cat: 'hand' },
  { family: 'Poiret One', label: 'Poiret One', cat: 'hand' },
  { family: 'Stick', label: 'Stick', cat: 'hand' },
  { family: 'Press Start 2P', label: 'Press Start 2P', cat: 'pixel' },
  { family: 'Pixelify Sans', label: 'Pixelify Sans', cat: 'pixel' },
  { family: 'Tiny5', label: 'Tiny5', cat: 'pixel' },
  { family: 'Handjet', label: 'Handjet', cat: 'pixel' },
  { family: 'Rubik Pixels', label: 'Rubik Pixels', cat: 'pixel' },
  { family: 'Rubik 80s Fade', label: 'Rubik 80s Fade', cat: 'pixel' },
  { family: 'Rubik Glitch', label: 'Rubik Glitch', cat: 'pixel' },
  { family: 'Rubik Glitch Pop', label: 'Rubik Glitch Pop', cat: 'pixel' },
  { family: 'Rubik Broken Fax', label: 'Rubik Broken Fax', cat: 'pixel' },
  { family: 'Rubik Bubbles', label: 'Rubik Bubbles', cat: 'fun' },
  { family: 'Rubik Wet Paint', label: 'Rubik Wet Paint', cat: 'fun' },
  { family: 'Rubik Burned', label: 'Rubik Burned', cat: 'fun' },
  { family: 'Rubik Puddles', label: 'Rubik Puddles', cat: 'fun' },
  { family: 'Rubik Microbe', label: 'Rubik Microbe', cat: 'fun' },
  { family: 'Rubik Moonrocks', label: 'Rubik Moonrocks', cat: 'fun' },
  { family: 'Rubik Vinyl', label: 'Rubik Vinyl', cat: 'fun' },
  { family: 'Rubik Iso', label: 'Rubik Iso', cat: 'fun' },
  { family: 'Rubik Distressed', label: 'Rubik Distressed', cat: 'fun' },
  { family: 'Rubik Spray Paint', label: 'Rubik Spray Paint', cat: 'fun' },
  { family: 'Rubik Maze', label: 'Rubik Maze', cat: 'fun' },
  { family: 'Rubik Beastly', label: 'Rubik Beastly', cat: 'fun' },
  { family: 'Rubik Gemstones', label: 'Rubik Gemstones', cat: 'fun' },
  { family: 'Rubik Dirt', label: 'Rubik Dirt', cat: 'fun' },
  { family: 'Rubik Marker Hatch', label: 'Rubik Marker Hatch', cat: 'fun' },
  { family: 'Rubik Storm', label: 'Rubik Storm', cat: 'fun' },
  { family: 'Rubik Doodle Shadow', label: 'Rubik Doodle Shadow', cat: 'fun' },
  { family: 'Rubik Doodle Triangles', label: 'Rubik Doodle Triangles', cat: 'fun' },
  { family: 'Rubik Scribble', label: 'Rubik Scribble', cat: 'fun' },
  { family: 'Rubik Lines', label: 'Rubik Lines', cat: 'fun' },
  { family: 'Rubik Maps', label: 'Rubik Maps', cat: 'fun' },
  { family: 'JetBrains Mono', label: 'JetBrains Mono', cat: 'mono' },
  { family: 'Fira Code', label: 'Fira Code', cat: 'mono' },
  { family: 'IBM Plex Mono', label: 'IBM Plex Mono', cat: 'mono' },
  { family: 'Roboto Mono', label: 'Roboto Mono', cat: 'mono' },
  { family: 'PT Mono', label: 'PT Mono', cat: 'mono' },
  { family: 'Ubuntu Mono', label: 'Ubuntu Mono', cat: 'mono' },
  { family: 'Source Code Pro', label: 'Source Code Pro', cat: 'mono' },
  { family: 'Victor Mono', label: 'Victor Mono', cat: 'mono' },
  { family: 'Martian Mono', label: 'Martian Mono', cat: 'mono' },
];

export const TEXT_PRESETS: { id: string; label: string; style: Partial<TextStyle> }[] = [
  { id: 'classic', label: tx('Классика'), style: { color: '#ffffff', strokeWidth: 0, shadow: true, bgOpacity: 0 } },
  { id: 'outline', label: tx('Обводка'), style: { color: '#ffffff', strokeColor: '#000000', strokeWidth: 8, shadow: false, bgOpacity: 0 } },
  { id: 'yellow', label: tx('Жёлтый'), style: { color: '#ffe14d', strokeColor: '#000000', strokeWidth: 8, shadow: false, bgOpacity: 0 } },
  { id: 'box', label: tx('Плашка'), style: { color: '#ffffff', strokeWidth: 0, shadow: false, bgColor: '#000000', bgOpacity: 0.7 } },
  { id: 'boxwhite', label: tx('Белая плашка'), style: { color: '#111111', strokeWidth: 0, shadow: false, bgColor: '#ffffff', bgOpacity: 0.95 } },
  { id: 'neon', label: tx('Неон'), style: { color: '#ff4fd8', strokeColor: '#2a0033', strokeWidth: 5, shadow: true, bgOpacity: 0 } },
  { id: 'blood', label: tx('Готика'), style: { color: '#e01e37', strokeColor: '#000000', strokeWidth: 6, shadow: true, bgOpacity: 0, font: 'Russo One' } },
];

export const TEXT_ANIMS: { type: TextAnimType; in: string; out: string }[] = [
  { type: 'fade', in: tx('Проявление'), out: tx('Растворение') },
  { type: 'slideUp', in: tx('Выезд снизу'), out: tx('Уход вниз') },
  { type: 'slideDown', in: tx('Выезд сверху'), out: tx('Уход вверх') },
  { type: 'slideLeft', in: tx('Выезд справа'), out: tx('Уход вправо') },
  { type: 'slideRight', in: tx('Выезд слева'), out: tx('Уход влево') },
  { type: 'pop', in: tx('Выскок'), out: tx('Схлопывание') },
  { type: 'zoom', in: tx('Наезд'), out: tx('Отъезд') },
  { type: 'typewriter', in: tx('Печатная машинка'), out: tx('Стирание') },
  { type: 'blur', in: tx('Из размытия'), out: tx('В размытие') },
  { type: 'wipe', in: tx('Шторка'), out: tx('Шторка') },
  { type: 'bounce', in: tx('Падение с прыжком'), out: tx('Подброс') },
  { type: 'elastic', in: tx('Пружина'), out: tx('Пружина') },
  { type: 'spin', in: tx('Вращение'), out: tx('Вращение') },
];

export const HIGHLIGHTS: { mode: WordHighlight['mode']; label: string }[] = [
  { mode: 'none', label: tx('Нет') },
  { mode: 'color', label: tx('Цвет произносимого слова') },
  { mode: 'karaoke', label: tx('Караоке — сказанное закрашивается') },
  { mode: 'box', label: tx('Плашка под словом') },
  { mode: 'pop', label: tx('Слово выскакивает') },
  { mode: 'reveal', label: tx('Слово за словом') },
];

export const DEFAULT_CHROMA: ChromaKey = { color: '#00ff00', similarity: 0.12, smoothness: 0.06 };

export const VOICE_FX: { id: VoiceEffect; label: string }[] = [
  { id: 'none', label: tx('Без эффекта') }, { id: 'chipmunk', label: tx('Бурундук') }, { id: 'deep', label: tx('Великан') },
  { id: 'robot', label: tx('Робот') }, { id: 'echo', label: tx('Эхо') }, { id: 'hall', label: tx('Большой зал') },
  { id: 'radio', label: tx('Рация') }, { id: 'phone', label: tx('Телефон') }, { id: 'megaphone', label: tx('Мегафон') },
];
