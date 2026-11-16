// Каталог живых фонов («Шаблоны» → «Фоны»): готовые настройки шейдеров gl:bg_* (src/shared/gl/backgrounds.ts).
// Что заходит в TikTok как фон: ночное небо и падающие звёзды, мягкие переливы для цитат и голоса, синтвейв и неон
// под биты, «залипалки» и бесконечный забег для разделённого экрана. Всё нарисовано Kadro — без чужих видео и прав.
import { tx } from './i18n';
import type { Effect } from './types';

export type BgGroup = 'calm' | 'neon' | 'split';
export interface BgPreset {
  id: string;
  label: string;
  hint: string;
  group: BgGroup;
  effect: Effect;
  /** как выглядит карточка (CSS) — пока не подгрузился живой предпросмотр */
  swatch: string;
}

const fx = (key: string, params: Record<string, number> = {}): Effect => ({ type: `gl:${key}`, amount: 1, params });

export const BG_GROUPS: { id: BgGroup; label: string }[] = [
  { id: 'calm', label: tx('Спокойные') },
  { id: 'neon', label: tx('Неон и биты') },
  { id: 'split', label: tx('Для разделённого экрана') },
];

export const BG_PRESETS: BgPreset[] = [
  { id: 'stars', label: tx('Звёздное небо'), hint: tx('Мерцающие звёзды, Млечный Путь и падающие звёзды'), group: 'calm', effect: fx('bg_stars'), swatch: 'radial-gradient(circle at 30% 30%,#fff 0 1px,transparent 2px),radial-gradient(circle at 70% 60%,#fff 0 1px,transparent 2px),linear-gradient(#03040f,#2a1442)' },
  { id: 'stars-pink', label: tx('Розовая ночь'), hint: tx('То же небо в розово-сиреневых тонах'), group: 'calm', effect: fx('bg_stars', { hue: 0.15, meteors: 0.8 }), swatch: 'radial-gradient(circle at 60% 25%,#fff 0 1px,transparent 2px),linear-gradient(#12031a,#5a1a4a)' },
  { id: 'aurora', label: tx('Северное сияние'), hint: tx('Волны сияния над горами'), group: 'calm', effect: fx('bg_aurora'), swatch: 'linear-gradient(#020812 10%,#1aff8c55 40%,#8a3dff44 60%,#030a12 85%)' },
  { id: 'mesh', label: tx('Переливы: закат'), hint: tx('Мягкий градиент для цитат и «говорящей головы»'), group: 'calm', effect: fx('bg_mesh'), swatch: 'linear-gradient(135deg,#ff8c9e,#fbc78c,#8c99ff)' },
  { id: 'mesh-ocean', label: tx('Переливы: океан'), hint: tx('Бирюзово-синий градиент'), group: 'calm', effect: fx('bg_mesh', { palette: 1 }), swatch: 'linear-gradient(135deg,#5fe3c9,#6aa8ff,#8f7bff)' },
  { id: 'gradient', label: tx('Живой градиент'), hint: tx('Два своих цвета перетекают друг в друга — цвета меняются во вкладке «Эффекты»'), group: 'calm', effect: fx('bg_gradient'), swatch: 'linear-gradient(135deg,#ff3d80,#4059ff)' },
  { id: 'snow', label: tx('Снегопад'), hint: tx('Зимняя ночь, снег и огни города — для новогодних роликов'), group: 'calm', effect: fx('bg_snow'), swatch: 'radial-gradient(circle at 30% 40%,#fff 0 2px,transparent 3px),radial-gradient(circle at 70% 20%,#fff 0 1px,transparent 2px),linear-gradient(#030612,#141a33)' },
  { id: 'clouds', label: tx('Пастельные облака'), hint: tx('Розово-голубое небо с облаками'), group: 'calm', effect: fx('bg_clouds'), swatch: 'linear-gradient(#ffb8c6,#8db3ff)' },
  { id: 'bokeh', label: tx('Огоньки'), hint: tx('Тёплые размытые огни плывут вверх'), group: 'calm', effect: fx('bg_bokeh'), swatch: 'radial-gradient(circle at 30% 60%,#ff9f40aa 0 12%,transparent 13%),radial-gradient(circle at 70% 30%,#ff5a5a88 0 9%,transparent 10%),#1b0a06' },
  { id: 'synth', label: tx('Синтвейв'), hint: tx('Закат 80-х: солнце в полоску и неоновая сетка'), group: 'neon', effect: fx('bg_synth'), swatch: 'linear-gradient(#14052e 0,#f24d8c 55%,#0d0019 58%,#33003f)' },
  { id: 'tunnel', label: tx('Неоновый тоннель'), hint: tx('Полёт сквозь светящиеся кольца — под биты и фонк'), group: 'neon', effect: fx('bg_tunnel'), swatch: 'radial-gradient(circle,#000 0 15%,#ff2fd5 16% 19%,#000 20% 34%,#2fd5ff 35% 38%,#000 39%)' },
  { id: 'matrix', label: tx('Цифровой дождь'), hint: tx('Зелёные символы стекают по экрану'), group: 'neon', effect: fx('bg_matrix'), swatch: 'repeating-linear-gradient(90deg,#001a05 0 6px,#18ff59 6px 7px,#001a05 7px 14px)' },
  { id: 'lava', label: tx('Лава-лампа'), hint: tx('Капли сливаются и расходятся'), group: 'split', effect: fx('bg_lava'), swatch: 'radial-gradient(circle at 40% 40%,#ffb43a 0 18%,transparent 19%),radial-gradient(circle at 65% 70%,#ff5a3f 0 14%,transparent 15%),#2a0838' },
  { id: 'orbit', label: tx('Залипалка'), hint: tx('Точки кружат по орбитам и складываются в узоры'), group: 'split', effect: fx('bg_orbit'), swatch: 'radial-gradient(circle,#ff5ab4 0 3%,transparent 4% 20%,#5ad2ff 21% 22%,transparent 23% 40%,#b45aff 41% 42%,transparent 43%),#05040c' },
  { id: 'runner', label: tx('Неоновая трасса'), hint: tx('Бесконечный забег — «геймплей» под видео с голосом'), group: 'split', effect: fx('bg_runner'), swatch: 'linear-gradient(#210047 0 45%,#06010e 46%),conic-gradient(from 180deg at 50% 46%,transparent 160deg,#00e5ff 170deg,transparent 175deg 185deg,#00e5ff 190deg,transparent 200deg)' },
];
export const bgPreset = (id: string): BgPreset | undefined => BG_PRESETS.find((b) => b.id === id);
/** Длина фона по умолчанию (короткий ролик). */
export const BG_DURATION = 15;
