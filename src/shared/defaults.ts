import type {
  AspectKey, ColorAdjust, MediaAsset, MediaClip, Project, ProjectSettings, TextClip, TextStyle, Track, TrackKind, Transform, TransitionType,
} from './types';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${counter.toString(36)}`;
}

export const ASPECTS: Record<AspectKey, { w: number; h: number; label: string }> = {
  '9:16': { w: 1080, h: 1920, label: '9:16 · TikTok, Reels, Shorts' },
  '16:9': { w: 1920, h: 1080, label: '16:9 · YouTube' },
  '1:1': { w: 1080, h: 1080, label: '1:1 · Квадрат' },
  '4:5': { w: 1080, h: 1350, label: '4:5 · Лента Instagram' },
  '3:4': { w: 1080, h: 1440, label: '3:4' },
  '4:3': { w: 1440, h: 1080, label: '4:3' },
  '21:9': { w: 2520, h: 1080, label: '21:9 · Кино' },
};

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
  const names: Record<TrackKind, string> = { main: 'Основная', video: 'Наложение', audio: 'Аудио', text: 'Текст' };
  return { id: uid('trk'), kind, name: name ?? names[kind], muted: false, hidden: false, clips: [] };
}

export function newProject(name = 'Новый проект', aspect: AspectKey = '9:16'): Project {
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
  const len = asset.kind === 'image' ? IMAGE_DEFAULT_DURATION : asset.duration;
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

export function newTextClip(start: number, text = 'Текст', style: Partial<TextStyle> = {}, role: TextClip['role'] = 'title'): TextClip {
  return {
    id: uid('txt'),
    type: 'text',
    start,
    duration: 3,
    text,
    style: { ...DEFAULT_TEXT_STYLE, ...style },
    x: 0.5,
    y: role === 'caption' ? 0.72 : 0.5,
    role,
  };
}

export const TRANSITIONS: { type: TransitionType; label: string }[] = [
  { type: 'fade', label: 'Растворение' },
  { type: 'fadeblack', label: 'Через чёрный' },
  { type: 'fadewhite', label: 'Через белый' },
  { type: 'slideleft', label: 'Сдвиг влево' },
  { type: 'slideright', label: 'Сдвиг вправо' },
  { type: 'slideup', label: 'Сдвиг вверх' },
  { type: 'slidedown', label: 'Сдвиг вниз' },
  { type: 'wipeleft', label: 'Шторка влево' },
  { type: 'wiperight', label: 'Шторка вправо' },
  { type: 'circleopen', label: 'Круг' },
  { type: 'zoomin', label: 'Приближение' },
];

export const FONTS: { family: string; label: string }[] = [
  { family: 'Montserrat', label: 'Montserrat' },
  { family: 'Rubik', label: 'Rubik' },
  { family: 'Unbounded', label: 'Unbounded' },
  { family: 'Russo One', label: 'Russo One' },
  { family: 'Oswald', label: 'Oswald' },
  { family: 'Comfortaa', label: 'Comfortaa' },
  { family: 'Lobster', label: 'Lobster' },
  { family: 'Caveat', label: 'Caveat' },
  { family: 'PT Serif', label: 'PT Serif' },
  { family: 'Press Start 2P', label: 'Пиксель' },
];

export const TEXT_PRESETS: { id: string; label: string; style: Partial<TextStyle> }[] = [
  { id: 'classic', label: 'Классика', style: { color: '#ffffff', strokeWidth: 0, shadow: true, bgOpacity: 0 } },
  { id: 'outline', label: 'Обводка', style: { color: '#ffffff', strokeColor: '#000000', strokeWidth: 8, shadow: false, bgOpacity: 0 } },
  { id: 'yellow', label: 'Жёлтый', style: { color: '#ffe14d', strokeColor: '#000000', strokeWidth: 8, shadow: false, bgOpacity: 0 } },
  { id: 'box', label: 'Плашка', style: { color: '#ffffff', strokeWidth: 0, shadow: false, bgColor: '#000000', bgOpacity: 0.7 } },
  { id: 'boxwhite', label: 'Белая плашка', style: { color: '#111111', strokeWidth: 0, shadow: false, bgColor: '#ffffff', bgOpacity: 0.95 } },
  { id: 'neon', label: 'Неон', style: { color: '#ff4fd8', strokeColor: '#2a0033', strokeWidth: 5, shadow: true, bgOpacity: 0 } },
  { id: 'blood', label: 'Готика', style: { color: '#e01e37', strokeColor: '#000000', strokeWidth: 6, shadow: true, bgOpacity: 0, font: 'Russo One' } },
];
