// Шаблоны: готовый монтаж с «окошками» под свои видео и фото — длительности, переходы, эффекты, цвет, тексты с анимацией.
// Встроенные шаблоны — собственные (придуманы для Kadro). Свой шаблон можно сохранить из текущего проекта.
import { tx } from './i18n';
import { ASPECTS, DEFAULT_COLOR, DEFAULT_TRANSFORM, TEXT_PRESETS, newMediaClip, newProject, newTextClip, newTrack } from './defaults';
import { clipDuration, layoutMain, mainTrack } from './timeline';
import type {
  AspectKey, ClipAnim, ColorAdjust, Effect, Grade, MediaAsset, MediaClip, Project, TextAnim, TextClip, TextStyle, Transition,
} from './types';
import { pickWindows, type Highlights } from './autoEdit';

export interface TemplateSlot {
  duration: number;
  effects?: Effect[];
  color?: Partial<ColorAdjust>;
  grade?: Grade;
  zoom?: [number, number];        // масштаб в начале и в конце окошка (плавный наезд/отъезд)
  transitionOut?: Transition;
  anim?: { in?: ClipAnim; out?: ClipAnim }; // проявление из чёрного / уход в чёрное
}
export interface TemplateText {
  start: number;                  // секунды от начала; отрицательное — от конца ролика
  duration: number;
  text: string;
  preset?: string;                // id из TEXT_PRESETS
  style?: Partial<TextStyle>;
  anim?: { in?: TextAnim; out?: TextAnim };
  y?: number;
}
export interface Template {
  id: string;
  name: string;
  hint: string;
  aspect: AspectKey;
  slots: TemplateSlot[];
  texts: TemplateText[];
  swatch?: string;                // CSS-фон карточки
  thumb?: string;                 // картинка (для своих шаблонов), data: URL
  custom?: boolean;
  demo?: DemoScene[];             // какие демо-ролики подставить в «Попробовать на примере» и в превью
  cat?: TemplateCat;
  poster?: number;                // секунда превью, которая видна до наведения (по умолчанию 1.2)
  music?: { path: string };       // своя музыка шаблона (у шаблона «по ролику» — звук образца)
}
export type DemoScene = 'sunset' | 'city' | 'ocean' | 'synth' | 'space' | 'mountains' | 'liquid';
export const DEMO_SCENES: DemoScene[] = ['sunset', 'city', 'ocean', 'synth', 'space', 'mountains', 'liquid'];
export type TemplateCat = 'trend' | 'mood' | 'holiday' | 'youtube';
export const TEMPLATE_CATS: { id: TemplateCat; label: string }[] = [
  { id: 'trend', label: tx('В тренде') },
  { id: 'mood', label: tx('Настроение') },
  { id: 'holiday', label: tx('Праздники') },
  { id: 'youtube', label: tx('YouTube и 16:9') },
];

const tr = (type: Transition['type'], duration: number): Transition => ({ type, duration });

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: 'trip', name: tx('Путешествие'), hint: tx('6 кадров, наезды, тёплый цвет'), aspect: '9:16', cat: 'trend', demo: ['sunset', 'ocean', 'mountains', 'city', 'synth', 'space'],
    swatch: 'linear-gradient(160deg,#f7b267 0%,#f4845f 45%,#5b6c8f 100%)',
    slots: [
      { duration: 2.2, zoom: [1.12, 1], color: { preset: 'sunset', presetAmount: 0.7 }, effects: [{ type: 'flash', amount: 0.5 }], transitionOut: tr('zoomin', 0.4) },
      { duration: 1.6, zoom: [1, 1.1], color: { preset: 'sunset', presetAmount: 0.7 }, transitionOut: tr('slideleft', 0.35) },
      { duration: 1.6, zoom: [1.1, 1], color: { preset: 'sunset', presetAmount: 0.7 }, transitionOut: tr('slideleft', 0.35) },
      { duration: 1.6, zoom: [1, 1.1], color: { preset: 'sunset', presetAmount: 0.7 }, transitionOut: tr('zoomin', 0.4) },
      { duration: 1.6, zoom: [1.1, 1], color: { preset: 'sunset', presetAmount: 0.7 }, transitionOut: tr('fade', 0.4) },
      { duration: 2.6, zoom: [1, 1.15], color: { preset: 'sunset', presetAmount: 0.7 }, effects: [{ type: 'vignette', amount: 0.4 }] },
    ],
    texts: [
      { start: 0.3, duration: 2.2, text: tx('В ДОРОГУ'), preset: 'outline', style: { size: 96, font: 'Unbounded', bold: true }, anim: { in: { type: 'pop', dur: 0.45 }, out: { type: 'fade', dur: 0.3 } }, y: 0.42 },
      { start: -2.4, duration: 2.4, text: tx('ещё вернёмся'), preset: 'classic', style: { size: 72, italic: true }, anim: { in: { type: 'typewriter', dur: 0.9 } }, y: 0.66 },
    ],
  },
  {
    id: 'pulse', name: tx('Ритм'), poster: 0.4, hint: tx('8 быстрых склеек, глитч и тряска'), aspect: '9:16', cat: 'trend', demo: ['synth', 'city', 'liquid', 'space'],
    swatch: 'repeating-linear-gradient(115deg,#151225 0 14px,#ff3d7f 14px 18px,#151225 18px 30px,#46e0d0 30px 33px)',
    slots: Array.from({ length: 8 }, (_, i): TemplateSlot => ({
      duration: i === 7 ? 1.4 : 0.7,
      effects: i % 2 === 0 ? [{ type: 'rgbsplit', amount: 0.35 }, { type: 'shake', amount: 0.4 }] : [{ type: 'glitch', amount: 0.6 }],
      color: { preset: 'neon', presetAmount: 0.6 },
      zoom: i % 2 === 0 ? [1.08, 1] : [1, 1.08],
      transitionOut: i === 3 ? tr('fadewhite', 0.2) : undefined,
    })),
    texts: [
      { start: 0, duration: 1.4, text: tx('ПОГНАЛИ'), preset: 'yellow', style: { size: 130, font: 'Russo One' }, anim: { in: { type: 'zoom', dur: 0.25 }, out: { type: 'pop', dur: 0.2 } }, y: 0.5 },
    ],
  },
  {
    id: 'vlog', name: tx('Влог дня'), hint: tx('4 сцены, мягкие переходы, подпись'), aspect: '9:16', cat: 'mood', demo: ['ocean', 'sunset', 'city', 'mountains'],
    swatch: 'linear-gradient(180deg,#e9e3d5 0 55%,#c9b79c 55% 100%)',
    slots: [
      { duration: 3, zoom: [1, 1.06], color: { preset: 'warm', presetAmount: 0.6 }, transitionOut: tr('fade', 0.5) },
      { duration: 3, zoom: [1.06, 1], color: { preset: 'warm', presetAmount: 0.6 }, transitionOut: tr('fade', 0.5) },
      { duration: 3, zoom: [1, 1.06], color: { preset: 'warm', presetAmount: 0.6 }, transitionOut: tr('fade', 0.5) },
      { duration: 3.5, zoom: [1.06, 1], color: { preset: 'warm', presetAmount: 0.6 } },
    ],
    texts: [
      { start: 0.2, duration: 2.6, text: tx('мой день'), preset: 'boxwhite', style: { size: 70, font: 'Rubik', bold: true }, anim: { in: { type: 'slideUp', dur: 0.4 }, out: { type: 'fade', dur: 0.3 } }, y: 0.64 },
      { start: -2.4, duration: 2.4, text: tx('до завтра'), preset: 'boxwhite', style: { size: 64 }, anim: { in: { type: 'wipe', dur: 0.5 } }, y: 0.64 },
    ],
  },
  {
    id: 'slides', name: tx('Слайд-шоу'), hint: tx('6 фото, плавный наезд, шторки'), aspect: '1:1', cat: 'mood', demo: ['mountains', 'ocean', 'sunset', 'space', 'liquid', 'city'],
    swatch: 'linear-gradient(90deg,#4a6da6 0 33%,#d9963a 33% 66%,#5f9e6e 66%)',
    slots: Array.from({ length: 6 }, (_, i): TemplateSlot => ({
      duration: 2.5,
      zoom: i % 2 === 0 ? [1, 1.15] : [1.15, 1],
      transitionOut: i < 5 ? tr(i % 2 === 0 ? 'wipeleft' : 'wiperight', 0.6) : undefined,
    })),
    texts: [
      { start: 0.4, duration: 2.6, text: tx('Наши моменты'), preset: 'classic', style: { size: 96, font: 'PT Serif', italic: true }, anim: { in: { type: 'blur', dur: 0.7 }, out: { type: 'fade', dur: 0.4 } }, y: 0.5 },
    ],
  },
  {
    id: 'retro', name: tx('Кассета'), hint: tx('VHS, зерно, дата в углу'), aspect: '16:9', cat: 'youtube', demo: ['sunset', 'ocean', 'city', 'synth'],
    swatch: 'repeating-linear-gradient(180deg,#5f6f8a 0 3px,#3d4a60 3px 6px)',
    slots: Array.from({ length: 4 }, (): TemplateSlot => ({
      duration: 2.5, effects: [{ type: 'vhs', amount: 0.7 }, { type: 'grain', amount: 0.35 }, { type: 'vignette', amount: 0.3 }],
      color: { preset: 'film', presetAmount: 0.8 }, transitionOut: tr('fadeblack', 0.3),
    })).map((s, i, a) => (i === a.length - 1 ? { ...s, transitionOut: undefined } : s)),
    texts: [
      { start: 0, duration: 999, text: 'PLAY  14.07.1998', preset: 'classic', style: { size: 34, font: 'Press Start 2P', color: '#f2f2f2' }, y: 0.9 },
    ],
  },
  {
    id: 'cinema', name: tx('Кино'), poster: 2, hint: tx('3 длинных плана, полосы, затемнения, титр'), aspect: '16:9', cat: 'youtube', demo: ['mountains', 'ocean', 'space'],
    swatch: 'linear-gradient(180deg,#000 0 18%,#2b3a4a 18% 82%,#000 82%)',
    slots: [
      { duration: 4, zoom: [1, 1.05], color: { preset: 'tealorange', presetAmount: 0.8 }, effects: [{ type: 'vignette', amount: 0.5 }, { type: 'letterbox', amount: 0.5 }], transitionOut: tr('fadeblack', 0.8) },
      { duration: 4, zoom: [1.05, 1], color: { preset: 'tealorange', presetAmount: 0.8 }, effects: [{ type: 'vignette', amount: 0.5 }, { type: 'letterbox', amount: 0.5 }], transitionOut: tr('fadeblack', 0.8) },
      { duration: 4.5, zoom: [1, 1.08], color: { preset: 'tealorange', presetAmount: 0.8 }, effects: [{ type: 'vignette', amount: 0.5 }, { type: 'letterbox', amount: 0.5 }] },
    ],
    texts: [
      { start: 0.8, duration: 3, text: tx('ГЛАВА ПЕРВАЯ'), preset: 'classic', style: { size: 50, font: 'PT Serif', bold: false }, anim: { in: { type: 'fade', dur: 0.8 }, out: { type: 'fade', dur: 0.8 } }, y: 0.95 },
    ],
  },
  {
    id: 'birthday', name: tx('С днём рождения'), hint: tx('конфетти, яркий цвет, пузырчатый титр'), aspect: '9:16', cat: 'holiday', demo: ['liquid', 'synth', 'city', 'sunset', 'space'],
    swatch: 'linear-gradient(135deg,#ff5e87,#ffc857)',
    slots: [
      { duration: 2.4, zoom: [1.12, 1], color: { preset: 'candy', presetAmount: 0.8 }, effects: [{ type: 'confetti', amount: 0.7 }], transitionOut: tr('circleopen', 0.4) },
      { duration: 1.8, zoom: [1, 1.1], color: { preset: 'candy', presetAmount: 0.8 }, effects: [{ type: 'pulse', amount: 0.5 }], transitionOut: tr('pixelize', 0.4) },
      { duration: 1.8, zoom: [1.1, 1], color: { preset: 'candy', presetAmount: 0.8 }, effects: [{ type: 'sparkles', amount: 0.6 }], transitionOut: tr('coverup', 0.35) },
      { duration: 1.8, zoom: [1, 1.1], color: { preset: 'candy', presetAmount: 0.8 }, effects: [{ type: 'heartbeat', amount: 0.5 }], transitionOut: tr('circleopen', 0.4) },
      { duration: 2.8, zoom: [1, 1.12], color: { preset: 'candy', presetAmount: 0.8 }, effects: [{ type: 'confetti', amount: 0.9 }] },
    ],
    texts: [
      { start: 0.2, duration: 2.6, text: tx('С ДНЁМ РОЖДЕНИЯ!'), preset: 'outline', style: { size: 104, font: 'Rubik Bubbles', color: '#ffe14d' }, anim: { in: { type: 'pop', dur: 0.5 }, out: { type: 'zoom', dur: 0.3 } }, y: 0.45 },
      { start: -2.6, duration: 2.6, text: tx('загадай желание'), preset: 'classic', style: { size: 68, font: 'Caveat', bold: true }, anim: { in: { type: 'typewriter', dur: 1 } }, y: 0.66 },
    ],
  },
  {
    id: 'love', name: tx('Любовь'), poster: 1.8, hint: tx('сердечки, розовый цвет, мягкие переходы'), aspect: '9:16', cat: 'holiday', demo: ['sunset', 'liquid', 'ocean', 'city'],
    swatch: 'linear-gradient(160deg,#ffafbd,#ffc3a0)',
    slots: [
      { duration: 2.6, zoom: [1, 1.08], color: { preset: 'rose', presetAmount: 0.9 }, effects: [{ type: 'hearts', amount: 0.5 }, { type: 'glow', amount: 0.4 }], transitionOut: tr('fadeslow', 0.6) },
      { duration: 2.4, zoom: [1.08, 1], color: { preset: 'rose', presetAmount: 0.9 }, effects: [{ type: 'glow', amount: 0.4 }], transitionOut: tr('smoothleft', 0.6) },
      { duration: 2.4, zoom: [1, 1.08], color: { preset: 'rose', presetAmount: 0.9 }, effects: [{ type: 'glow', amount: 0.4 }], transitionOut: tr('fadeslow', 0.6) },
      { duration: 3, zoom: [1.08, 1], color: { preset: 'rose', presetAmount: 0.9 }, effects: [{ type: 'hearts', amount: 0.8 }, { type: 'glow', amount: 0.4 }] },
    ],
    texts: [
      { start: 0.4, duration: 3, text: tx('ты и я'), preset: 'outline', style: { size: 160, font: 'Marck Script', strokeColor: '#b0124f', strokeWidth: 6 }, anim: { in: { type: 'blur', dur: 0.8 }, out: { type: 'fade', dur: 0.5 } }, y: 0.5 },
      { start: -2.8, duration: 2.8, text: tx('навсегда'), preset: 'outline', style: { size: 120, font: 'Marck Script', strokeColor: '#b0124f', strokeWidth: 5 }, anim: { in: { type: 'fade', dur: 0.8 } }, y: 0.62 },
    ],
  },
  {
    id: 'winter', name: tx('Зимняя сказка'), hint: tx('снег, холодный цвет, белые вспышки'), aspect: '9:16', cat: 'holiday', demo: ['mountains', 'space', 'city', 'ocean'],
    swatch: 'linear-gradient(180deg,#d7e8f7,#8fb4d8)',
    slots: [
      { duration: 3, zoom: [1.1, 1], color: { preset: 'winter', presetAmount: 0.9 }, effects: [{ type: 'snow', amount: 0.7 }], transitionOut: tr('fadewhite', 0.5) },
      { duration: 2.5, zoom: [1, 1.08], color: { preset: 'winter', presetAmount: 0.9 }, effects: [{ type: 'snow', amount: 0.7 }], transitionOut: tr('fadewhite', 0.5) },
      { duration: 2.5, zoom: [1.08, 1], color: { preset: 'winter', presetAmount: 0.9 }, effects: [{ type: 'snow', amount: 0.7 }], transitionOut: tr('fadewhite', 0.5) },
      { duration: 3, zoom: [1, 1.1], color: { preset: 'winter', presetAmount: 0.9 }, effects: [{ type: 'snow', amount: 1 }, { type: 'sparkles', amount: 0.4 }] },
    ],
    texts: [
      { start: 0.3, duration: 2.8, text: tx('ЗИМА'), preset: 'classic', style: { size: 150, font: 'Unbounded', bold: true }, anim: { in: { type: 'blur', dur: 0.8 }, out: { type: 'fade', dur: 0.4 } }, y: 0.42 },
      { start: -3, duration: 3, text: tx('С Новым годом'), preset: 'classic', style: { size: 90, font: 'Lobster' }, anim: { in: { type: 'slideUp', dur: 0.6 } }, y: 0.64 },
    ],
  },
  {
    id: 'party', name: tx('Вечеринка'), poster: 0.35, hint: tx('8 вспышек под бит, стробоскоп, неон'), aspect: '9:16', cat: 'trend', demo: ['synth', 'city', 'liquid', 'space'],
    swatch: 'linear-gradient(135deg,#12002b,#ff2fa0 60%,#3dd6ff)',
    slots: Array.from({ length: 8 }, (_, i): TemplateSlot => ({
      duration: i === 7 ? 1.6 : 0.65,
      color: { preset: 'electric', presetAmount: 0.8 },
      effects: i % 2 === 0 ? [{ type: 'strobe', amount: 0.5 }, { type: 'glow', amount: 0.5 }] : [{ type: 'colorpulse', amount: 0.7 }, { type: 'rgbsplit', amount: 0.4 }],
      zoom: i % 2 === 0 ? [1.1, 1] : [1, 1.1],
      transitionOut: i === 3 ? tr('squeezeh', 0.25) : undefined,
    })),
    texts: [
      { start: 0, duration: 1.3, text: tx('ВЕЧЕРИНКА'), preset: 'classic', style: { size: 96, font: 'Rubik Glitch', color: '#ff4fd8' }, anim: { in: { type: 'zoom', dur: 0.25 }, out: { type: 'pop', dur: 0.2 } }, y: 0.5 },
    ],
  },
  {
    id: 'sport', name: tx('Энергия'), poster: 0.75, hint: tx('землетрясение, наезды, вспышки, крупный титр'), aspect: '9:16', cat: 'trend', demo: ['synth', 'mountains', 'city', 'space', 'ocean'],
    swatch: 'linear-gradient(135deg,#111,#e01e37)',
    slots: [
      { duration: 1.6, zoom: [1.15, 1], color: { preset: 'drama', presetAmount: 0.8 }, effects: [{ type: 'flash', amount: 0.6 }, { type: 'quake', amount: 0.4 }], transitionOut: tr('zoomin', 0.3) },
      { duration: 1.3, color: { preset: 'drama', presetAmount: 0.8 }, effects: [{ type: 'zoomin', amount: 0.8 }], transitionOut: tr('slideup', 0.25) },
      { duration: 1.3, color: { preset: 'drama', presetAmount: 0.8 }, effects: [{ type: 'zoomout', amount: 0.8 }], transitionOut: tr('slideup', 0.25) },
      { duration: 1.3, color: { preset: 'drama', presetAmount: 0.8 }, effects: [{ type: 'quake', amount: 0.5 }], transitionOut: tr('zoomin', 0.3) },
      { duration: 2.2, zoom: [1, 1.12], color: { preset: 'drama', presetAmount: 0.8 }, effects: [{ type: 'flash', amount: 0.6 }] },
    ],
    texts: [
      { start: 0.1, duration: 1.5, text: tx('НЕ СДАВАЙСЯ'), preset: 'yellow', style: { size: 84, font: 'Russo One' }, anim: { in: { type: 'slideUp', dur: 0.25 }, out: { type: 'zoom', dur: 0.2 } }, y: 0.5 },
      { start: -2, duration: 2, text: tx('ТОЛЬКО ВПЕРЁД'), preset: 'yellow', style: { size: 76, font: 'Russo One' }, anim: { in: { type: 'pop', dur: 0.3 } }, y: 0.5 },
    ],
  },
  {
    id: 'aesthetic', name: tx('Эстетика'), poster: 2, hint: tx('полароид, зерно, медленный отъезд'), aspect: '9:16', cat: 'mood', demo: ['liquid', 'sunset', 'ocean', 'mountains'],
    swatch: 'linear-gradient(180deg,#efe6dd,#cdb4a6)',
    slots: [
      { duration: 3, color: { preset: 'polaroid', presetAmount: 1 }, effects: [{ type: 'grain', amount: 0.35 }, { type: 'zoomout', amount: 0.5 }], transitionOut: tr('fadeslow', 0.7) },
      { duration: 3, color: { preset: 'polaroid', presetAmount: 1 }, effects: [{ type: 'grain', amount: 0.35 }, { type: 'drift', amount: 0.6 }], transitionOut: tr('fadeslow', 0.7) },
      { duration: 3, color: { preset: 'polaroid', presetAmount: 1 }, effects: [{ type: 'grain', amount: 0.35 }, { type: 'zoomout', amount: 0.5 }], transitionOut: tr('fadeslow', 0.7) },
      { duration: 3.5, color: { preset: 'polaroid', presetAmount: 1 }, effects: [{ type: 'grain', amount: 0.35 }, { type: 'lightleak', amount: 0.4 }] },
    ],
    texts: [
      { start: 0.5, duration: 3, text: tx('мои дни'), preset: 'classic', style: { size: 140, font: 'Cormorant Garamond', italic: true, bold: true, color: '#3a2626', shadow: false }, anim: { in: { type: 'blur', dur: 0.9 }, out: { type: 'fade', dur: 0.6 } }, y: 0.5 },
    ],
  },
  {
    id: 'neonnight', name: tx('Неоновая ночь'), hint: tx('ночной город, сияние, ветер'), aspect: '9:16', cat: 'mood', demo: ['city', 'synth', 'space', 'liquid'],
    swatch: 'linear-gradient(160deg,#0b0b2a,#5b2a86 60%,#ff38c8)',
    slots: [
      { duration: 2.6, zoom: [1.1, 1], color: { preset: 'nightcity', presetAmount: 0.9 }, effects: [{ type: 'glow', amount: 0.6 }], transitionOut: tr('hlwind', 0.5) },
      { duration: 2.2, zoom: [1, 1.08], color: { preset: 'nightcity', presetAmount: 0.9 }, effects: [{ type: 'glow', amount: 0.6 }, { type: 'rgbsplit', amount: 0.25 }], transitionOut: tr('hlwind', 0.5) },
      { duration: 2.2, zoom: [1.08, 1], color: { preset: 'nightcity', presetAmount: 0.9 }, effects: [{ type: 'glow', amount: 0.6 }], transitionOut: tr('hlwind', 0.5) },
      { duration: 2.8, zoom: [1, 1.1], color: { preset: 'nightcity', presetAmount: 0.9 }, effects: [{ type: 'glow', amount: 0.6 }, { type: 'lightleak', amount: 0.4 }] },
    ],
    texts: [
      { start: 0.3, duration: 2.4, text: tx('НОЧЬ'), preset: 'neon', style: { size: 160, font: 'Tektur', bold: true }, anim: { in: { type: 'wipe', dur: 0.5 }, out: { type: 'fade', dur: 0.4 } }, y: 0.45 },
    ],
  },
  {
    id: 'collage', name: tx('Коллаж'), hint: tx('экраны 2×2 и полосы, сочный цвет'), aspect: '9:16', cat: 'trend', demo: ['ocean', 'sunset', 'synth', 'mountains', 'city'],
    swatch: 'conic-gradient(#ff5e87 0 25%,#ffc857 0 50%,#3dd6ff 0 75%,#7cff6b 0)',
    slots: [
      { duration: 1.8, color: { preset: 'pop', presetAmount: 0.7 }, effects: [{ type: 'split4', amount: 0.6 }], transitionOut: tr('coverleft', 0.35) },
      { duration: 1.8, color: { preset: 'pop', presetAmount: 0.7 }, effects: [{ type: 'split3', amount: 0.6 }], transitionOut: tr('coverleft', 0.35) },
      { duration: 1.8, color: { preset: 'pop', presetAmount: 0.7 }, effects: [{ type: 'split9', amount: 0.5 }], transitionOut: tr('coverleft', 0.35) },
      { duration: 1.8, color: { preset: 'pop', presetAmount: 0.7 }, effects: [{ type: 'split2', amount: 0.6 }], transitionOut: tr('coverleft', 0.35) },
      { duration: 2.2, zoom: [1, 1.1], color: { preset: 'pop', presetAmount: 0.7 } },
    ],
    texts: [
      { start: -2.2, duration: 2.2, text: tx('ВОТ ЭТО ДЕНЬ'), preset: 'boxwhite', style: { size: 84, font: 'Montserrat', bold: true }, anim: { in: { type: 'pop', dur: 0.35 } }, y: 0.66 },
    ],
  },
  {
    id: 'beforeafter', name: tx('До и после'), poster: 2.65, hint: tx('ч/б → цвет, шторка между ними'), aspect: '9:16', cat: 'trend', demo: ['sunset'],
    swatch: 'linear-gradient(90deg,#777 50%,#ff8a3d 50%)',
    slots: [
      { duration: 2.5, color: { preset: 'hardbw', presetAmount: 1 }, transitionOut: tr('wipeleft', 0.5) },
      { duration: 3, zoom: [1, 1.08], color: { preset: 'vivid', presetAmount: 1 }, effects: [{ type: 'sparkles', amount: 0.4 }] },
    ],
    texts: [
      { start: 0.1, duration: 2.2, text: tx('ДО'), preset: 'boxwhite', style: { size: 96, font: 'Unbounded', bold: true }, anim: { in: { type: 'pop', dur: 0.3 } }, y: 0.2 },
      { start: 2.3, duration: 2.7, text: tx('ПОСЛЕ'), preset: 'box', style: { size: 96, font: 'Unbounded', bold: true }, anim: { in: { type: 'pop', dur: 0.3 } }, y: 0.2 },
    ],
  },
  {
    id: 'countdown', name: tx('Обратный отсчёт'), hint: tx('3, 2, 1 — и показ'), aspect: '9:16', cat: 'trend', demo: ['space', 'synth', 'city', 'liquid'],
    swatch: 'radial-gradient(circle,#ffe35a 0 20%,#15131a 21%)',
    slots: [
      { duration: 0.9, color: { preset: 'bw', presetAmount: 1 }, effects: [{ type: 'pulse', amount: 0.8 }] },
      { duration: 0.9, color: { preset: 'bw', presetAmount: 1 }, effects: [{ type: 'pulse', amount: 0.8 }] },
      { duration: 0.9, color: { preset: 'bw', presetAmount: 1 }, effects: [{ type: 'pulse', amount: 0.8 }], transitionOut: tr('fadewhite', 0.3) },
      { duration: 3, zoom: [1.15, 1], color: { preset: 'vivid', presetAmount: 0.8 }, effects: [{ type: 'flash', amount: 0.8 }, { type: 'confetti', amount: 0.5 }] },
    ],
    texts: [
      { start: 0, duration: 0.9, text: '3', preset: 'classic', style: { size: 300, font: 'Unbounded', bold: true }, anim: { in: { type: 'zoom', dur: 0.2 } }, y: 0.5 },
      { start: 0.9, duration: 0.9, text: '2', preset: 'classic', style: { size: 300, font: 'Unbounded', bold: true }, anim: { in: { type: 'zoom', dur: 0.2 } }, y: 0.5 },
      { start: 1.8, duration: 0.9, text: '1', preset: 'classic', style: { size: 300, font: 'Unbounded', bold: true }, anim: { in: { type: 'zoom', dur: 0.2 } }, y: 0.5 },
      { start: 2.75, duration: 2.5, text: tx('ПОЕХАЛИ!'), preset: 'yellow', style: { size: 120, font: 'Russo One' }, anim: { in: { type: 'pop', dur: 0.35 } }, y: 0.5 },
    ],
  },
  {
    id: 'gaming', name: tx('Геймер'), poster: 1.5, hint: tx('глитч, пиксели, 80-е, пиксельный шрифт'), aspect: '16:9', cat: 'youtube', demo: ['synth', 'space', 'city'],
    swatch: 'repeating-linear-gradient(90deg,#1a0033 0 8px,#3dd6ff 8px 10px,#1a0033 10px 18px,#ff2fa0 18px 20px)',
    slots: [
      { duration: 2, zoom: [1.1, 1], color: { preset: 'eighties', presetAmount: 0.9 }, effects: [{ type: 'glitch', amount: 0.6 }], transitionOut: tr('pixelize', 0.5) },
      { duration: 2, zoom: [1, 1.1], color: { preset: 'eighties', presetAmount: 0.9 }, effects: [{ type: 'rgbsplit', amount: 0.5 }, { type: 'vhs', amount: 0.4 }], transitionOut: tr('pixelize', 0.5) },
      { duration: 2.6, zoom: [1.1, 1], color: { preset: 'eighties', presetAmount: 0.9 }, effects: [{ type: 'glitch', amount: 0.6 }] },
    ],
    texts: [
      { start: 0.3, duration: 2.5, text: 'LEVEL UP', preset: 'outline', style: { size: 90, font: 'Press Start 2P', color: '#7cff6b' }, anim: { in: { type: 'typewriter', dur: 0.6 }, out: { type: 'fade', dur: 0.3 } }, y: 0.5 },
      { start: -2, duration: 2, text: 'GAME OVER?', preset: 'outline', style: { size: 70, font: 'Press Start 2P', color: '#ff4fd8' }, anim: { in: { type: 'pop', dur: 0.3 } }, y: 0.5 },
    ],
  },
  {
    id: 'memories', name: tx('Воспоминания'), poster: 1.8, hint: tx('сепия, старое кино, печатная машинка'), aspect: '1:1', cat: 'mood', demo: ['sunset', 'ocean', 'mountains', 'city'],
    swatch: 'linear-gradient(180deg,#d9c4a1,#7a5c3a)',
    slots: [
      { duration: 3, zoom: [1, 1.08], color: { preset: 'sepia', presetAmount: 1 }, effects: [{ type: 'grain', amount: 0.5 }, { type: 'vignette', amount: 0.5 }, { type: 'flicker', amount: 0.4 }], transitionOut: tr('fadeblack', 0.6) },
      { duration: 3, zoom: [1.08, 1], color: { preset: 'sepia', presetAmount: 1 }, effects: [{ type: 'grain', amount: 0.5 }, { type: 'vignette', amount: 0.5 }, { type: 'flicker', amount: 0.4 }], transitionOut: tr('fadeblack', 0.6) },
      { duration: 3.5, zoom: [1, 1.08], color: { preset: 'sepia', presetAmount: 1 }, effects: [{ type: 'grain', amount: 0.5 }, { type: 'vignette', amount: 0.5 }, { type: 'flicker', amount: 0.4 }] },
    ],
    texts: [
      { start: 0.5, duration: 3, text: tx('помнишь?'), preset: 'classic', style: { size: 90, font: 'PT Serif', italic: true }, anim: { in: { type: 'typewriter', dur: 1 }, out: { type: 'fade', dur: 0.5 } }, y: 0.78 },
    ],
  },
  {
    id: 'ytintro', name: tx('Интро для YouTube'), poster: 2, hint: tx('кино-полосы, бирюза и оранж, название канала'), aspect: '16:9', cat: 'youtube', demo: ['space', 'synth', 'ocean'],
    swatch: 'linear-gradient(180deg,#000 0 15%,#1e3c50 15% 85%,#000 85%)',
    slots: [
      { duration: 2.4, zoom: [1.12, 1], color: { preset: 'blockbuster', presetAmount: 0.9 }, effects: [{ type: 'letterbox', amount: 0.4 }, { type: 'lightleak', amount: 0.3 }], transitionOut: tr('zoomin', 0.4) },
      { duration: 2.6, zoom: [1, 1.1], color: { preset: 'blockbuster', presetAmount: 0.9 }, effects: [{ type: 'letterbox', amount: 0.4 }] },
    ],
    texts: [
      { start: 0.4, duration: 4, text: tx('НАЗВАНИЕ КАНАЛА'), preset: 'classic', style: { size: 88, font: 'Montserrat', bold: true }, anim: { in: { type: 'wipe', dur: 0.6 }, out: { type: 'fade', dur: 0.4 } }, y: 0.47 },
      { start: 1.4, duration: 3, text: tx('подписывайся'), preset: 'classic', style: { size: 46, font: 'Montserrat' }, anim: { in: { type: 'slideUp', dur: 0.5 } }, y: 0.6 },
    ],
  },
];

/** Демо-проект для стартового экрана: все демо-ролики, склейки ровно на сильную долю демо-бита (112 ударов в минуту). */
export const DEMO_BPM = 112;
const BEAT = 60 / DEMO_BPM;
/** Окошко на n долей: переход съедает часть окошка, поэтому добавляем его длину — склейки остаются в такт. */
const onBeat = (n: number, t?: Transition): Pick<TemplateSlot, 'duration' | 'transitionOut'> => ({ duration: n * BEAT + (t?.duration ?? 0), transitionOut: t });
const bar = (k: number) => k * 4 * BEAT + 0.25;
export const DEMO_TEMPLATE: Template = {
  id: 'demo', name: tx('Демо Kadro'), hint: tx('что умеет Kadro, за 16 секунд'), aspect: '9:16',
  demo: ['sunset', 'city', 'synth', 'ocean', 'space', 'mountains', 'liquid'],
  slots: [
    { ...onBeat(4, tr('circleopen', 0.4)), zoom: [1.15, 1], color: { preset: 'golden', presetAmount: 0.8 }, effects: [{ type: 'flash', amount: 0.6 }] },
    { ...onBeat(4, tr('pixelize', 0.35)), zoom: [1, 1.1], color: { preset: 'nightcity', presetAmount: 0.9 }, effects: [{ type: 'glow', amount: 0.6 }] },
    { ...onBeat(4, tr('hlslice', 0.4)), color: { preset: 'electric', presetAmount: 0.8 }, effects: [{ type: 'glitch', amount: 0.5 }, { type: 'heartbeat', amount: 0.6 }] },
    { ...onBeat(4, tr('smoothup', 0.4)), zoom: [1.1, 1], color: { preset: 'ocean', presetAmount: 0.9 }, effects: [{ type: 'sparkles', amount: 0.5 }] },
    { ...onBeat(4, tr('fadewhite', 0.4)), color: { preset: 'cinema', presetAmount: 0.8 }, effects: [{ type: 'zoomin', amount: 0.8 }] },
    { ...onBeat(4, tr('radial', 0.5)), zoom: [1, 1.1], color: { preset: 'winter', presetAmount: 0.9 }, effects: [{ type: 'snow', amount: 0.8 }] },
    { ...onBeat(6), zoom: [1.1, 1], color: { preset: 'candy', presetAmount: 0.8 }, effects: [{ type: 'confetti', amount: 0.7 }] },
  ],
  texts: [
    { start: 0.2, duration: 1.9, text: 'KADRO', preset: 'classic', style: { size: 136, font: 'Unbounded', bold: true }, anim: { in: { type: 'pop', dur: 0.45 }, out: { type: 'zoom', dur: 0.3 } }, y: 0.42 },
    { start: 0.6, duration: 1.5, text: tx('бесплатный видеоредактор'), preset: 'classic', style: { size: 44, font: 'Montserrat', bold: true }, anim: { in: { type: 'slideUp', dur: 0.4 } }, y: 0.55 },
    { start: bar(1), duration: 1.8, text: tx('58 переходов'), preset: 'boxwhite', style: { size: 66, font: 'Rubik', bold: true }, anim: { in: { type: 'pop', dur: 0.3 } }, y: 0.66 },
    { start: bar(2), duration: 1.8, text: tx('48 эффектов'), preset: 'box', style: { size: 66, font: 'Rubik', bold: true }, anim: { in: { type: 'pop', dur: 0.3 } }, y: 0.66 },
    { start: bar(3), duration: 1.8, text: tx('47 фильтров'), preset: 'boxwhite', style: { size: 66, font: 'Rubik', bold: true }, anim: { in: { type: 'pop', dur: 0.3 } }, y: 0.66 },
    { start: bar(4), duration: 1.8, text: tx('122 шрифта'), preset: 'box', style: { size: 60, font: 'Press Start 2P' }, anim: { in: { type: 'typewriter', dur: 0.5 } }, y: 0.66 },
    { start: bar(5), duration: 1.8, text: tx('ИИ без интернета'), preset: 'boxwhite', style: { size: 66, font: 'Rubik', bold: true }, anim: { in: { type: 'pop', dur: 0.3 } }, y: 0.66 },
    { start: bar(6), duration: 2.9, text: tx('Сделай свой ролик'), preset: 'yellow', style: { size: 64, font: 'Russo One' }, anim: { in: { type: 'zoom', dur: 0.4 } }, y: 0.5 },
  ],
};


/** Сколько длится шаблон (с учётом переходов). */
export function templateDuration(t: Template): number {
  let d = 0;
  t.slots.forEach((s, i) => { d += s.duration - (i < t.slots.length - 1 ? s.transitionOut?.duration ?? 0 : 0); });
  return Math.round(d * 100) / 100;
}

/**
 * Собирает проект по шаблону. assets — видео и фото пользователя по порядку; если их меньше, чем окошек, идут по кругу.
 * Из видео берётся кусок ближе к началу (не с самого первого кадра).
 */
export interface ApplyOpts {
  /** Разбор видео: куски берутся из лучших мест (как в авто-ролике), а не подряд с начала. */
  hl?: Map<string, Highlights | null>;
  /** Музыка шаблона — на звуковую дорожку с начала ролика. */
  music?: MediaAsset | null;
  /** Звук своих видео: оставить, тише или выключить (когда есть музыка). */
  videoSound?: 'off' | 'quiet' | 'on';
}
export function applyTemplate(base: Project, t: Template, assets: MediaAsset[], o: ApplyOpts = {}): Project {
  const media = assets.filter((a) => a.kind === 'video' || a.kind === 'image');
  if (!media.length) throw new Error(tx('Нужны видео или фото'));
  const asp = ASPECTS[t.aspect];
  const p: Project = {
    ...structuredClone(base),
    settings: { ...base.settings, aspect: t.aspect, width: asp.w, height: asp.h },
    tracks: [newTrack('main')],
    updatedAt: Date.now(),
  };
  for (const a of media) if (!p.assets.some((x) => x.id === a.id)) p.assets.push(a);
  const main = mainTrack(p);
  const used = new Map<string, number>(); // для повторов одного видео — следующий кусок
  // с разбором — лучшие места видео по порядку, без наложений (если видео хватает на все его окошки)
  const best = new Map<string, number[]>();
  if (o.hl) {
    for (const a of media) {
      if (a.kind !== 'video' || best.has(a.id)) continue;
      const needs = t.slots.filter((_, i) => media[i % media.length].id === a.id).map((s) => s.duration);
      const edge = Math.min(0.2, a.duration * 0.05);
      if (needs.reduce((x, y) => x + y, 0) <= a.duration - 2 * edge) best.set(a.id, pickWindows(o.hl.get(a.id) ?? null, needs, edge, a.duration - edge));
    }
  }
  t.slots.forEach((s, i) => {
    const a = media[i % media.length];
    const c: MediaClip = newMediaClip(a);
    c.fit = 'cover';
    c.transform = { ...DEFAULT_TRANSFORM };
    if (a.kind === 'video') {
      const n = used.get(a.id) ?? 0;
      used.set(a.id, n + 1);
      const len = Math.min(s.duration, a.duration);
      const free = Math.max(0, a.duration - len);
      const pick = best.get(a.id)?.[n];
      const start = pick !== undefined ? Math.min(free, pick) : Math.min(free, free * 0.12 + n * len);
      c.in = Math.round(start * 1000) / 1000;
      c.out = Math.round((start + len) * 1000) / 1000;
      if (len < s.duration - 1e-3) c.speed = Math.max(0.25, Math.round((len / s.duration) * 1e4) / 1e4); // видео короче окошка — чуть медленнее
      if (o.music && o.videoSound === 'off') { c.muted = true; c.volume = 0; } else if (o.music && o.videoSound === 'quiet') c.volume = 0.3;
      if (c.speed < 0.999) c.muted = true;
    } else {
      c.out = s.duration;
    }
    if (s.anim && (s.anim.in || s.anim.out)) c.anim = structuredClone(s.anim);
    if (s.color) c.color = { ...DEFAULT_COLOR, ...s.color };
    if (s.grade) c.grade = structuredClone(s.grade);
    if (s.effects?.length) c.effects = structuredClone(s.effects);
    if (s.zoom && Math.abs(s.zoom[0] - s.zoom[1]) > 1e-3) {
      c.keyframes = { scale: [{ t: c.in, v: s.zoom[0], ease: 'smooth' }, { t: c.out, v: s.zoom[1], ease: 'smooth' }] };
      c.transform.scale = s.zoom[0];
    } else if (s.zoom) c.transform.scale = s.zoom[0];
    if (s.transitionOut && i < t.slots.length - 1) c.transitionOut = { ...s.transitionOut };
    main.clips.push(c);
  });
  layoutMain(p);
  const last = main.clips[main.clips.length - 1];
  const total = last.start + clipDuration(last);
  if (o.music) {
    const m = o.music;
    if (!p.assets.some((x) => x.id === m.id)) p.assets.push(m);
    const mc = newMediaClip(m, 0);
    mc.in = 0;
    mc.out = Math.min(m.duration || total, total);
    if ((m.duration || 0) > total + 0.1) mc.fadeOut = Math.round(Math.min(1.5, total * 0.1) * 100) / 100;
    const tr2 = newTrack('audio', tx('Музыка'));
    tr2.clips.push(mc);
    p.tracks.push(tr2);
  }
  if (t.texts.length) {
    // надписи, которые идут одновременно, — на разных дорожках (одна дорожка — одна надпись в момент времени)
    const lanes: ReturnType<typeof newTrack>[] = [];
    const laneFor = (c: TextClip) => {
      let lane = lanes.find((l) => l.clips.every((o) => o.start >= c.start + c.duration - 1e-6 || o.start + clipDuration(o) <= c.start + 1e-6));
      if (!lane) { lane = newTrack('text'); lanes.push(lane); }
      return lane;
    };
    for (const x of t.texts) {
      const preset = TEXT_PRESETS.find((q) => q.id === x.preset)?.style ?? {};
      const start = Math.max(0, x.start < 0 ? total + x.start : x.start);
      if (start >= total - 0.2) continue;
      const c: TextClip = newTextClip(start, x.text, { ...preset, ...x.style });
      c.duration = Math.round(Math.min(x.duration, total - start) * 1000) / 1000;
      if (x.y !== undefined) c.y = x.y;
      if (x.anim) c.anim = structuredClone(x.anim);
      laneFor(c).clips.push(c);
    }
    for (const l of lanes) { l.clips.sort((a, b) => a.start - b.start); p.tracks.push(l); }
  }
  return p;
}

/** Свой шаблон из проекта: основная дорожка → окошки (длительность, цвет, эффекты, переходы, наезд), текст — как есть. */
export function projectToTemplate(p: Project, name: string, thumb?: string): Template {
  const main = mainTrack(p).clips.filter((c): c is MediaClip => c.type === 'media');
  if (!main.length) throw new Error(tx('На основной дорожке нет клипов — из чего делать шаблон?'));
  const slots: TemplateSlot[] = main.map((c, i) => {
    const sc = c.keyframes?.scale;
    const zoom: [number, number] | undefined = sc && sc.length >= 2 ? [sc[0].v, sc[sc.length - 1].v] : c.transform.scale !== 1 ? [c.transform.scale, c.transform.scale] : undefined;
    return {
      duration: Math.round(clipDuration(c) * 1000) / 1000,
      color: { ...c.color },
      grade: c.grade && structuredClone(c.grade),
      effects: c.effects && structuredClone(c.effects),
      zoom,
      transitionOut: i < main.length - 1 && c.transitionOut ? { ...c.transitionOut } : undefined,
    };
  });
  const texts: TemplateText[] = p.tracks.filter((t) => t.kind === 'text').flatMap((t) => t.clips)
    .filter((c): c is TextClip => c.type === 'text' && c.role !== 'caption')
    .map((c) => ({ start: c.start, duration: c.duration, text: c.text, style: structuredClone(c.style), anim: c.anim && structuredClone(c.anim), y: c.y }));
  return {
    id: `my_${Date.now().toString(36)}`, name: name.trim() || tx('Мой шаблон'), hint: tx('{0} окошек', slots.length),
    aspect: p.settings.aspect, slots, texts, thumb, custom: true,
  };
}

/** Проверка шаблона, прочитанного с диска (чтобы битый файл не уронил программу). */
export function isTemplate(x: unknown): x is Template {
  const t = x as Template;
  return !!t && typeof t.id === 'string' && typeof t.name === 'string' && Array.isArray(t.slots) && t.slots.length > 0 &&
    t.slots.every((s) => typeof s.duration === 'number' && s.duration > 0) && Array.isArray(t.texts) && !!ASPECTS[t.aspect];
}

export { newProject };
