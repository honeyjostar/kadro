// Модель проекта Kadro. Чистые данные (JSON), без ссылок на DOM/Electron —
// одинаково используется в интерфейсе, при экспорте и в тестах.

export type Id = string;

export type AspectKey = '9:16' | '16:9' | '1:1' | '4:5' | '3:4' | '4:3' | '21:9';

export interface ProjectSettings {
  aspect: AspectKey;
  width: number;        // размер холста превью/экспорта в «базовом» разрешении (короткая сторона 1080)
  height: number;
  fps: number;
  background: 'black' | 'blur' | 'white';
}

export type MediaKind = 'video' | 'audio' | 'image';

export interface MediaAsset {
  id: Id;
  kind: MediaKind;
  path: string;              // оригинал — из него идёт экспорт
  previewPath: string;       // что играет плеер (оригинал или прокси)
  name: string;
  duration: number;          // сек; для картинок 0
  width: number;
  height: number;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
  videoCodec?: string;
  audioCodec?: string;
  size: number;              // байт
  rotation: number;          // поворот из метаданных телефона, градусы
  proxy: 'none' | 'pending' | 'ready' | 'error';
  thumbs?: string[];         // пути к кадрам-миниатюрам (равномерно по длительности)
  peaks?: number[];          // форма волны 0..1 (до ~2000 точек)
}

export type TrackKind = 'main' | 'video' | 'audio' | 'text';

export interface Transform {
  scale: number;   // 1 = вписано в холст по правилу fit
  x: number;       // смещение центра, доля ширины холста (0 = центр)
  y: number;       // смещение центра, доля высоты холста
  rotation: number; // градусы
}

export interface ColorAdjust {
  brightness: number; // 1 = без изменений (CSS brightness)
  contrast: number;   // 1 = без изменений (CSS contrast)
  saturation: number; // 1 = без изменений (CSS saturate)
  warmth: number;     // -1..1, 0 = без изменений (сдвиг R/B)
  preset: string;     // id пресета фильтра ('none' — нет)
  presetAmount: number; // 0..1
}

export type TransitionType =
  | 'fade' | 'fadeblack' | 'fadewhite'
  | 'slideleft' | 'slideright' | 'slideup' | 'slidedown'
  | 'wipeleft' | 'wiperight' | 'circleopen' | 'zoomin';

export interface Transition {
  type: TransitionType;
  duration: number; // сек
}

export type AiStatus = 'none' | 'processing' | 'ready' | 'error';

/** Результат ИИ-обработки фрагмента исходника [range0, range1] (сек исходника). */
export interface AiResult {
  enabled: boolean;
  status: AiStatus;
  path?: string;            // обработанный файл; время 0 в нём = range[0] исходника
  range?: [number, number];
  progress?: number;        // 0..1
  error?: string;
}

export interface MediaClip {
  id: Id;
  type: 'media';
  assetId: Id;
  start: number;     // позиция на таймлайне, сек
  in: number;        // начало фрагмента в исходнике, сек
  out: number;       // конец фрагмента в исходнике, сек (для картинок — длительность показа)
  speed: number;     // 0.25..4
  volume: number;    // 0..2
  muted: boolean;
  fadeIn: number;    // сек, затухание звука
  fadeOut: number;
  fit: 'contain' | 'cover';
  transform: Transform;
  color: ColorAdjust;
  transitionOut?: Transition;   // переход к следующему клипу основной дорожки
  removeBg: AiResult;
  denoise: AiResult;
}

export interface TextStyle {
  font: string;
  size: number;          // кегль в пикселях при короткой стороне холста 1080
  color: string;         // #rrggbb
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  align: 'left' | 'center' | 'right';
  strokeColor: string;
  strokeWidth: number;   // в тех же «пикселях 1080»
  shadow: boolean;
  bgColor: string;
  bgOpacity: number;     // 0..1, 0 = без плашки
  maxWidth: number;      // доля ширины холста для переноса строк
}

export interface TextClip {
  id: Id;
  type: 'text';
  start: number;
  duration: number;
  text: string;
  style: TextStyle;
  x: number;  // центр, доля ширины 0..1
  y: number;  // центр, доля высоты 0..1
  role: 'title' | 'caption';
}

export type Clip = MediaClip | TextClip;

export interface Track {
  id: Id;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
  clips: Clip[];
}

export interface Project {
  version: 1;
  name: string;
  settings: ProjectSettings;
  assets: MediaAsset[];
  tracks: Track[]; // порядок отрисовки: [0] — самая нижняя (main), выше — поверх
  createdAt: number;
  updatedAt: number;
}

export interface ExportOptions {
  height: 720 | 1080 | 1440 | 2160; // по короткой стороне
  fps: 24 | 25 | 30 | 50 | 60;
  quality: 'normal' | 'high' | 'max';
  encoder: 'auto' | 'nvenc' | 'x264';
  outPath: string;
}
