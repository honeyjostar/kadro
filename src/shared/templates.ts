// Шаблоны: готовый монтаж с «окошками» под свои видео и фото — длительности, переходы, эффекты, цвет, тексты с анимацией.
// Встроенные шаблоны — собственные (придуманы для Kadro). Свой шаблон можно сохранить из текущего проекта.
import { ASPECTS, DEFAULT_COLOR, DEFAULT_TRANSFORM, TEXT_PRESETS, newMediaClip, newProject, newTextClip, newTrack } from './defaults';
import { clipDuration, layoutMain, mainTrack } from './timeline';
import type {
  AspectKey, ColorAdjust, Effect, Grade, MediaAsset, MediaClip, Project, TextAnim, TextClip, TextStyle, Transition,
} from './types';

export interface TemplateSlot {
  duration: number;
  effects?: Effect[];
  color?: Partial<ColorAdjust>;
  grade?: Grade;
  zoom?: [number, number];        // масштаб в начале и в конце окошка (плавный наезд/отъезд)
  transitionOut?: Transition;
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
}

const tr = (type: Transition['type'], duration: number): Transition => ({ type, duration });

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: 'trip', name: 'Путешествие', hint: '6 кадров, наезды, тёплый цвет', aspect: '9:16',
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
      { start: 0.3, duration: 2.2, text: 'В ДОРОГУ', preset: 'outline', style: { size: 120, font: 'Unbounded', bold: true }, anim: { in: { type: 'pop', dur: 0.45 }, out: { type: 'fade', dur: 0.3 } }, y: 0.42 },
      { start: -2.4, duration: 2.4, text: 'ещё вернёмся', preset: 'classic', style: { size: 72, italic: true }, anim: { in: { type: 'typewriter', dur: 0.9 } }, y: 0.78 },
    ],
  },
  {
    id: 'pulse', name: 'Ритм', hint: '8 быстрых склеек, глитч и тряска', aspect: '9:16',
    swatch: 'repeating-linear-gradient(115deg,#151225 0 14px,#ff3d7f 14px 18px,#151225 18px 30px,#46e0d0 30px 33px)',
    slots: Array.from({ length: 8 }, (_, i): TemplateSlot => ({
      duration: i === 7 ? 1.4 : 0.7,
      effects: i % 2 === 0 ? [{ type: 'rgbsplit', amount: 0.35 }, { type: 'shake', amount: 0.4 }] : [{ type: 'glitch', amount: 0.6 }],
      color: { preset: 'neon', presetAmount: 0.6 },
      zoom: i % 2 === 0 ? [1.08, 1] : [1, 1.08],
      transitionOut: i === 3 ? tr('fadewhite', 0.2) : undefined,
    })),
    texts: [
      { start: 0, duration: 1.4, text: 'ПОГНАЛИ', preset: 'yellow', style: { size: 130, font: 'Russo One' }, anim: { in: { type: 'zoom', dur: 0.25 }, out: { type: 'pop', dur: 0.2 } }, y: 0.5 },
    ],
  },
  {
    id: 'vlog', name: 'Влог дня', hint: '4 сцены, мягкие переходы, подпись', aspect: '9:16',
    swatch: 'linear-gradient(180deg,#e9e3d5 0 55%,#c9b79c 55% 100%)',
    slots: [
      { duration: 3, zoom: [1, 1.06], color: { preset: 'warm', presetAmount: 0.6 }, transitionOut: tr('fade', 0.5) },
      { duration: 3, zoom: [1.06, 1], color: { preset: 'warm', presetAmount: 0.6 }, transitionOut: tr('fade', 0.5) },
      { duration: 3, zoom: [1, 1.06], color: { preset: 'warm', presetAmount: 0.6 }, transitionOut: tr('fade', 0.5) },
      { duration: 3.5, zoom: [1.06, 1], color: { preset: 'warm', presetAmount: 0.6 } },
    ],
    texts: [
      { start: 0.2, duration: 2.6, text: 'мой день', preset: 'boxwhite', style: { size: 70, font: 'Rubik', bold: true }, anim: { in: { type: 'slideUp', dur: 0.4 }, out: { type: 'fade', dur: 0.3 } }, y: 0.8 },
      { start: -2.4, duration: 2.4, text: 'до завтра', preset: 'boxwhite', style: { size: 64 }, anim: { in: { type: 'wipe', dur: 0.5 } }, y: 0.8 },
    ],
  },
  {
    id: 'slides', name: 'Слайд-шоу', hint: '6 фото, плавный наезд, шторки', aspect: '1:1',
    swatch: 'linear-gradient(90deg,#4a6da6 0 33%,#d9963a 33% 66%,#5f9e6e 66%)',
    slots: Array.from({ length: 6 }, (_, i): TemplateSlot => ({
      duration: 2.5,
      zoom: i % 2 === 0 ? [1, 1.15] : [1.15, 1],
      transitionOut: i < 5 ? tr(i % 2 === 0 ? 'wipeleft' : 'wiperight', 0.6) : undefined,
    })),
    texts: [
      { start: 0.4, duration: 2.6, text: 'Наши моменты', preset: 'classic', style: { size: 96, font: 'PT Serif', italic: true }, anim: { in: { type: 'blur', dur: 0.7 }, out: { type: 'fade', dur: 0.4 } }, y: 0.5 },
    ],
  },
  {
    id: 'retro', name: 'Кассета', hint: 'VHS, зерно, дата в углу', aspect: '16:9',
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
    id: 'cinema', name: 'Кино', hint: '3 длинных плана, затемнения, титр', aspect: '16:9',
    swatch: 'linear-gradient(180deg,#000 0 18%,#2b3a4a 18% 82%,#000 82%)',
    slots: [
      { duration: 4, zoom: [1, 1.05], color: { preset: 'drama', presetAmount: 0.7 }, effects: [{ type: 'vignette', amount: 0.5 }], transitionOut: tr('fadeblack', 0.8) },
      { duration: 4, zoom: [1.05, 1], color: { preset: 'drama', presetAmount: 0.7 }, effects: [{ type: 'vignette', amount: 0.5 }], transitionOut: tr('fadeblack', 0.8) },
      { duration: 4.5, zoom: [1, 1.08], color: { preset: 'drama', presetAmount: 0.7 }, effects: [{ type: 'vignette', amount: 0.5 }] },
    ],
    texts: [
      { start: 0.8, duration: 3, text: 'ГЛАВА ПЕРВАЯ', preset: 'classic', style: { size: 64, font: 'PT Serif', bold: false }, anim: { in: { type: 'fade', dur: 0.8 }, out: { type: 'fade', dur: 0.8 } }, y: 0.5 },
    ],
  },
];

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
export function applyTemplate(base: Project, t: Template, assets: MediaAsset[]): Project {
  const media = assets.filter((a) => a.kind === 'video' || a.kind === 'image');
  if (!media.length) throw new Error('Нужны видео или фото');
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
      const start = Math.min(free, free * 0.12 + n * len);
      c.in = Math.round(start * 1000) / 1000;
      c.out = Math.round((start + len) * 1000) / 1000;
    } else {
      c.out = s.duration;
    }
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
  if (t.texts.length) {
    const tt = newTrack('text');
    for (const x of t.texts) {
      const preset = TEXT_PRESETS.find((q) => q.id === x.preset)?.style ?? {};
      const start = Math.max(0, x.start < 0 ? total + x.start : x.start);
      if (start >= total - 0.2) continue;
      const c: TextClip = newTextClip(start, x.text, { ...preset, ...x.style });
      c.duration = Math.round(Math.min(x.duration, total - start) * 1000) / 1000;
      if (x.y !== undefined) c.y = x.y;
      if (x.anim) c.anim = structuredClone(x.anim);
      tt.clips.push(c);
    }
    tt.clips.sort((a, b) => a.start - b.start);
    p.tracks.push(tt);
  }
  return p;
}

/** Свой шаблон из проекта: основная дорожка → окошки (длительность, цвет, эффекты, переходы, наезд), текст — как есть. */
export function projectToTemplate(p: Project, name: string, thumb?: string): Template {
  const main = mainTrack(p).clips.filter((c): c is MediaClip => c.type === 'media');
  if (!main.length) throw new Error('На основной дорожке нет клипов — из чего делать шаблон?');
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
    id: `my_${Date.now().toString(36)}`, name: name.trim() || 'Мой шаблон', hint: `${slots.length} окошек`,
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
