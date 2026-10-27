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
  missing?: boolean;         // файл пропал с диска (проект открыт на другом компьютере, файл перемещён)
  beats?: number[];          // доли такта (время исходника), если искали ритм
  bpm?: number;
  alpha?: boolean;           // видео с прозрачностью (VP8/VP9 WebM)
  loop?: boolean;            // анимированный GIF: клип можно растянуть, анимация повторяется по кругу
  derived?: boolean;         // служебная копия (реверс, кривая скорости, стоп-кадр) — не показывается в медиатеке
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
  | 'wipeleft' | 'wiperight' | 'circleopen' | 'zoomin'
  // считаются по пикселям — те же формулы, что в FFmpeg xfade
  | 'fadefast' | 'fadeslow' | 'fadegrays' | 'dissolve' | 'distance' | 'pixelize' | 'hblur'
  | 'wipeup' | 'wipedown' | 'wipetl' | 'wipetr' | 'wipebl' | 'wipebr'
  | 'smoothleft' | 'smoothright' | 'smoothup' | 'smoothdown'
  | 'coverleft' | 'coverright' | 'coverup' | 'coverdown'
  | 'revealleft' | 'revealright' | 'revealup' | 'revealdown'
  | 'circleclose' | 'circlecrop' | 'rectcrop' | 'radial'
  | 'vertopen' | 'vertclose' | 'horzopen' | 'horzclose'
  | 'diagtl' | 'diagtr' | 'diagbl' | 'diagbr'
  | 'hlslice' | 'hrslice' | 'vuslice' | 'vdslice'
  | 'hlwind' | 'hrwind' | 'vuwind' | 'vdwind'
  | 'squeezeh' | 'squeezev'
  // шейдеры: gl:<имя> — встроенные (gl-transitions), plug:t/<файл> — плагины пользователя
  | `gl:${string}` | `plug:${string}`;

export interface Transition {
  type: TransitionType;
  duration: number; // сек
  params?: Record<string, number | boolean | number[]>; // параметры шейдера (если отличаются от заданных в нём)
}

export type AiStatus = 'none' | 'processing' | 'ready' | 'error';

/** Анимируемые свойства. x, y — как в Transform (видео) или доли холста 0..1 (текст); rotation — градусы. */
export type AnimProp = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';
export interface Keyframe {
  t: number;                 // видео/фото: время ИСХОДНИКА (анимация привязана к содержимому); текст: от начала клипа
  v: number;
  ease?: 'linear' | 'smooth';
}
export type Keyframes = Partial<Record<AnimProp, Keyframe[]>>;

/** Маска клипа — в долях рамки клипа (до поворота). */
export interface Mask {
  shape: 'linear' | 'mirror' | 'circle' | 'rect';
  x: number;          // центр, смещение от центра рамки (доля ширины)
  y: number;
  w: number;          // размер (доля ширины/высоты рамки) — для circle/rect; для mirror — ширина полосы
  h: number;
  rotation: number;   // градусы
  feather: number;    // растушёвка 0..1 (доля от меньшей стороны рамки)
  invert: boolean;
}

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'add';

export interface ChromaKey {
  color: string;      // #rrggbb
  similarity: number; // 0.01..0.5
  smoothness: number; // 0..0.3 (мягкость края)
}

export type EffectType =
  | 'shake' | 'pulse' | 'flash' | 'glitch' | 'rgbsplit' | 'vhs' | 'grain' | 'vignette' | 'blur' | 'pixelate' | 'mirror' | 'invert' | 'rainbow'
  // движение
  | 'quake' | 'heartbeat' | 'zoomin' | 'zoomout' | 'sway' | 'bounce' | 'drift' | 'spin'
  // свет и цвет во времени
  | 'strobe' | 'flicker' | 'colorpulse' | 'bwflash' | 'glow' | 'lightleak'
  // образы (одна цветовая таблица)
  | 'oldfilm' | 'comic' | 'duotone' | 'solarize' | 'thermal' | 'nightvision' | 'noir' | 'cyber'
  // кадр
  | 'mirrorv' | 'kaleido' | 'split2' | 'split3' | 'split4' | 'split9' | 'letterbox'
  // частицы поверх кадра
  | 'snow' | 'rain' | 'confetti' | 'hearts' | 'sparkles' | 'bubbles'
  // шейдеры: gl:<имя> — встроенные, plug:e/<файл> — плагины пользователя
  | `gl:${string}` | `plug:${string}`;
export interface Effect { type: EffectType; amount: number; params?: Record<string, number | boolean | number[]> } // amount 0..1

export type VoiceEffect = 'none' | 'chipmunk' | 'deep' | 'robot' | 'echo' | 'hall' | 'radio' | 'phone' | 'megaphone';

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
  opacity?: number;             // 0..1 (по умолчанию 1)
  keyframes?: Keyframes;
  mask?: Mask;
  blend?: BlendMode;            // только для наложений
  chroma?: ChromaKey;
  stab?: AiResult;              // стабилизированная копия фрагмента
  beauty?: AiResult & { smooth: number; bright: number }; // ретушь кожи (копия фрагмента)
  voice?: AiResult & { effect?: VoiceEffect; withDenoise?: boolean }; // обработанный звук с эффектом голоса
  effects?: Effect[];           // видеоэффекты (тряска, глитч, виньетка…)
  retime?: Retime;              // клип показывает копию фрагмента с реверсом / кривой скорости
  grade?: Grade;                // кривые, HSL, свой LUT
  group?: GroupData;            // составной клип: что внутри (для разгруппировки и пересборки)
  anim?: { in?: ClipAnim; out?: ClipAnim }; // появление и исчезновение
  tilt?: { x: number; y: number };   // 3D-наклон, градусы (x — вперёд-назад, y — влево-вправо)
  /** «Углы»: картинка натянута на 4 точки (доли кадра: верх-лево, верх-право, низ-лево, низ-право). */
  pin?: [number, number, number, number, number, number, number, number];
  model3d?: Model3D;             // клип — отрисованный 3D-объект (можно изменить и пересобрать)
}

/** 3D-объект: готовая фигура или свой файл модели, движение, угол, материал и свет. */
export type Model3DMotion = 'spin' | 'sway' | 'float' | 'tumble' | 'pulse' | 'still';
export type Model3DMaterial = 'model' | 'gloss' | 'metal' | 'matte' | 'glass' | 'neon';
export type Model3DLight = 'studio' | 'soft' | 'sunset' | 'neon';
export interface Model3D {
  source: string;            // 'shape:heart' … или путь к файлу модели
  name: string;
  motion: Model3DMotion;
  speed: number;             // 1 — обычная
  tiltX: number;             // наклон к зрителю, градусы
  turnY: number;             // поворот, градусы
  material: Model3DMaterial; // 'model' — как в файле модели
  color: string;
  light: Model3DLight;
  duration: number;          // секунды
}

/** Анимации появления и исчезновения видео и фото. */
export type ClipAnimType = 'fade' | 'zoomin' | 'zoomout' | 'pop' | 'left' | 'right' | 'top' | 'bottom' | 'drop' | 'spin';
export interface ClipAnim { type: ClipAnimType; dur: number }

/** Содержимое составного клипа: дорожки с клипами, время — от начала группы. */
export interface GroupData {
  tracks: Track[];      // [0] — основная (может быть пустой), дальше — в порядке наложения
  alpha: boolean;       // группа без основной дорожки — с прозрачным фоном
  duration: number;
}

/** Точка кривой: x — вход, y — выход (0..1). */
export interface CurvePoint { x: number; y: number }
export type HslBand = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'magenta';
/** Тонкая цветокоррекция: применяется после основной (яркость, контраст…) одной 3D-таблицей. */
export interface Grade {
  curves?: { all?: CurvePoint[]; r?: CurvePoint[]; g?: CurvePoint[]; b?: CurvePoint[] };
  hsl?: Partial<Record<HslBand, { h: number; s: number; l: number }>>; // каждое -1..1
  lut?: { path: string; name: string; amount: number };              // файл .cube и сила 0..1
}

/** Точка кривой скорости: x — доля фрагмента (0..1), v — скорость (0.1..10). */
export interface RampPoint { x: number; v: number }
/** Откуда взята копия: исходный файл, его фрагмент и что с ним сделано. */
export interface Retime {
  assetId: Id;
  in: number;
  out: number;
  reverse: boolean;
  ramp?: RampPoint[];
  preset?: string;              // id пресета или 'custom'
  /** Плавное замедление: промежуточные кадры дорисованы. Тогда ramp — итоговая скорость (кривая × speed). */
  smooth?: boolean;
  speed?: number;               // постоянная скорость, вшитая в копию (при smooth)
  userRamp?: RampPoint[];       // кривая, которую выбрал пользователь (при smooth)
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
  highlight?: WordHighlight; // подсветка произносимого слова (субтитры)
}

export interface WordHighlight {
  mode: 'none' | 'color' | 'box' | 'karaoke' | 'reveal' | 'pop';
  color: string;
}

export type TextAnimType = 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'pop' | 'zoom' | 'typewriter' | 'blur' | 'wipe' | 'bounce' | 'elastic' | 'spin';
export interface TextAnim { type: TextAnimType; dur: number }
export interface Word { text: string; start: number; end: number }

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
  scale?: number;      // 1 по умолчанию
  rotation?: number;   // градусы
  opacity?: number;
  keyframes?: Keyframes;
  anim?: { in?: TextAnim; out?: TextAnim };
  words?: Word[];      // слова со временем от начала клипа (для подсветки)
  tilt?: { x: number; y: number }; // наклон в перспективе, градусы
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
  alpha?: boolean;   // прозрачный фон, WebM VP9 (рендер группы из наложений)
}
