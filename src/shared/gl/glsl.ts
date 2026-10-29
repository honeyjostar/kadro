// Шейдеры Kadro: переходы gl-transitions и эффекты-плагины на GLSL (WebGL).
// Здесь — чистые функции: разбор заголовка шейдера, параметры, обёртка в полный фрагментный шейдер,
// русские названия и разделы. Рисует их renderer/engine/gl.ts, экспорт — тот же движок по кадрам.
import { tx } from '../i18n';

export type GlParamType = 'float' | 'int' | 'bool' | 'vec2' | 'vec3' | 'vec4' | 'ivec2' | 'ivec3' | 'ivec4';
export type GlValue = number | boolean | number[];
export interface GlParam { name: string; type: GlParamType; value: GlValue; min?: number; max?: number; label?: string }

/** Шейдер-переход или шейдер-эффект: встроенный или плагин из папки пользователя. */
export interface GlDef {
  id: string;            // gl:<имя> — встроенный, plug:<файл> — плагин пользователя
  kind: 'transition' | 'effect';
  name: string;          // название для интерфейса
  author?: string;
  license?: string;
  description?: string;
  tags: string[];
  cat: string;           // раздел в интерфейсе
  params: GlParam[];
  glsl: string;          // тело: функция transition(uv) или effect(uv)
  source?: string;       // путь к файлу плагина
}

export const isGlType = (t: string | undefined | null): t is `gl:${string}` | `plug:${string}` => !!t && (t.startsWith('gl:') || t.startsWith('plug:'));

const PARAM_TYPES = new Set<GlParamType>(['float', 'int', 'bool', 'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4']);
/** Встроенные переменные, которые Kadro передаёт сам, — не параметры. */
const BUILTIN = new Set(['progress', 'ratio', 'time', 'amount', 'resolution', 'from', 'to', 'image']);

function parseValue(type: GlParamType, raw: string): GlValue | undefined {
  const s = raw.trim().replace(/;$/, '');
  if (type === 'bool') return /^(true|1)$/i.test(s) ? true : /^(false|0)$/i.test(s) ? false : undefined;
  // vec2(0.5, 0.25): имя типа перед скобкой — не число
  const nums = (s.replace(/^[a-z]+\d*\s*\(/i, '(').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  if (type === 'float' || type === 'int') return nums.length ? (type === 'int' ? Math.round(nums[0]) : nums[0]) : undefined;
  const n = Number(type.slice(-1));
  if (!nums.length) return undefined;
  const v = nums.length === 1 ? Array(n).fill(nums[0]) : nums.slice(0, n);
  return v.length === n ? (type.startsWith('i') ? v.map(Math.round) : v) : undefined;
}

export function defaultValue(type: GlParamType): GlValue {
  if (type === 'bool') return false;
  if (type === 'float' || type === 'int') return 0;
  return Array(Number(type.slice(-1))).fill(0);
}

export interface GlMeta { name?: string; author?: string; license?: string; description?: string; tags: string[]; params: GlParam[]; errors: string[] }

/**
 * Заголовок шейдера в формате gl-transitions:
 *   // Name: Хроматическая аберрация     // Author: …   // License: MIT   // Description: …   // Tags: glitch, color
 *   // @range(0, 1) Подпись
 *   uniform float strength; // = 0.5
 */
export function parseGlsl(src: string): GlMeta {
  const meta: GlMeta = { tags: [], params: [], errors: [] };
  const lines = src.split(/\r?\n/);
  let pendingRange: { min: number; max: number; label?: string } | null = null;
  for (const line of lines) {
    const h = /^\s*\/\/\s*(Name|Название|Author|Автор|License|Лицензия|Description|Описание|Tags|Теги)\s*:\s*(.+?)\s*$/i.exec(line);
    if (h) {
      const k = h[1].toLowerCase();
      const v = h[2];
      if (k === 'name' || k === 'название') meta.name ??= v;
      else if (k === 'author' || k === 'автор') meta.author ??= v;
      else if (k === 'license' || k === 'лицензия') meta.license ??= v;
      else if (k === 'description' || k === 'описание') meta.description ??= v;
      else meta.tags.push(...v.split(/[,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean));
      continue;
    }
    const r = /^\s*\/\/\s*@range\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)\s*(.*)$/.exec(line);
    if (r) { pendingRange = { min: Number(r[1]), max: Number(r[2]), label: r[3].trim() || undefined }; continue; }
    const u = /^\s*uniform\s+(\w+)\s+(\w+)\s*;\s*(?:\/\/\s*=\s*(.+?))?\s*$/.exec(line);
    if (u) {
      const type = u[1] as GlParamType;
      const name = u[2];
      if (BUILTIN.has(name) || type.startsWith('sampler')) { pendingRange = null; continue; }
      if (!PARAM_TYPES.has(type)) { meta.errors.push(tx('Параметр {0}: тип {1} не поддерживается', name, type)); pendingRange = null; continue; }
      const value = u[3] !== undefined ? parseValue(type, u[3]) : undefined;
      meta.params.push({ name, type, value: value ?? defaultValue(type), ...(pendingRange ?? {}) });
      pendingRange = null;
      continue;
    }
    if (line.trim() && !line.trim().startsWith('//')) pendingRange = null;
  }
  return meta;
}

/** Параметры из готового описания gl-transitions (defaultParams + paramsTypes) с подсказками @range из кода. */
export function paramsFromJson(defaults: Record<string, unknown>, types: Record<string, string>, glsl: string): GlParam[] {
  const parsed = parseGlsl(glsl).params;
  const out: GlParam[] = [];
  for (const [name, type] of Object.entries(types)) {
    if (!PARAM_TYPES.has(type as GlParamType)) continue;
    const t = type as GlParamType;
    const d = defaults[name];
    const value: GlValue = typeof d === 'number' || typeof d === 'boolean' || Array.isArray(d) ? (d as GlValue) : defaultValue(t);
    const p = parsed.find((x) => x.name === name);
    out.push({ name, type: t, value, min: p?.min, max: p?.max, label: p?.label });
  }
  return out;
}

const HEADER = `precision highp float;
varying vec2 _uv;
uniform float progress;
uniform float ratio;
`;

/** Полный фрагментный шейдер перехода (тот же договор, что у gl-transitions). */
export function transitionFragment(glsl: string): string {
  return `${HEADER}uniform sampler2D from;
uniform sampler2D to;
vec4 getFromColor(vec2 uv) { return texture2D(from, uv); }
vec4 getToColor(vec2 uv) { return texture2D(to, uv); }
#line 1
${glsl}
void main() { gl_FragColor = transition(_uv); }
`;
}

/** Полный фрагментный шейдер эффекта: getColor(uv) — кадр клипа; time, progress, amount, resolution — от Kadro. */
export function effectFragment(glsl: string): string {
  return `${HEADER}uniform sampler2D image;
uniform float time;
uniform float amount;
uniform vec2 resolution;
vec4 getColor(vec2 uv) { return texture2D(image, uv); }
#line 1
${glsl}
void main() {
  vec4 c = effect(_uv);
  gl_FragColor = c;
}
`;
}

/** Проверка до компиляции: нужная функция есть. */
export function checkBody(kind: GlDef['kind'], glsl: string): string | null {
  const fn = kind === 'transition' ? 'transition' : 'effect';
  return new RegExp(`vec4\\s+${fn}\\s*\\(\\s*vec2\\s+\\w+\\s*\\)`).test(glsl) ? null : tx('Нет функции vec4 {0}(vec2 uv)', fn);
}

// ---------- разделы и названия ----------
/**
 * Разделы для переходов-шейдеров. Сдвиги, шторки, фигуры и растворения попадают в те же разделы, что и
 * встроенные переходы (move, wipe, shape, basic); новые разделы — только для того, чего раньше не было.
 */
export const GL_TRANSITION_CATS: { id: string; label: string; tags: string[] }[] = [
  { id: 'gl3d', label: '3D', tags: ['3d', 'cube', 'page', 'curl', 'fold', 'doors', 'swap', 'roll', 'flip', 'cards'] },
  { id: 'glglitch', label: tx('Глитч и ретро'), tags: ['glitch', 'static', 'datamosh', 'scanlines', 'retro'] },
  { id: 'glzoom', label: tx('Зум и вращение'), tags: ['zoom', 'rotate', 'spin', 'swirl', 'pinwheel'] },
  { id: 'glwarp', label: tx('Искажения и огонь'), tags: ['distort', 'warp', 'wave', 'ripple', 'kaleidoscope', 'chromatic', 'displace', 'morph', 'lens', 'psychedelic', 'melt', 'burn', 'fire', 'shatter'] },
];
const SHARED_CATS: { id: string; tags: string[] }[] = [
  { id: 'move', tags: ['slide', 'push', 'split', 'bounce', 'motion-blur'] },
  { id: 'wipe', tags: ['wipe', 'blinds', 'slices', 'clock', 'radial'] },
  { id: 'shape', tags: ['shape', 'iris', 'circle', 'box', 'squares', 'grid', 'tiles', 'dots', 'star', 'heart', 'pattern'] },
];

export function glCategory(tags: string[]): string {
  for (const c of GL_TRANSITION_CATS) if (c.tags.some((t) => tags.includes(t))) return c.id;
  for (const c of SHARED_CATS) if (c.tags.some((t) => tags.includes(t))) return c.id;
  return 'basic';
}

/** «BookFlip» → «Book Flip» (для плагинов без перевода). */
export function prettyName(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
}

/** Русские названия переходов gl-transitions. */
export const GL_RU: Record<string, string> = {
  BlockDissolve: tx('Блоки'), BookFlip: tx('Листание книги'), Bounce: tx('Падение с отскоком'), BowTie: tx('Бабочка'), BowTieHorizontal: tx('Бабочка по горизонтали'),
  BowTieVertical: tx('Бабочка по вертикали'), Box: tx('Коробка'), BurnThrough: tx('Прожигание'), ButterflyWaveScrawler: tx('Волны-каракули'), Chessboard: tx('Шахматы'),
  CircleIris: tx('Круг через цвет'), CircleOpen: tx('Мягкий круг'), ClockWipe: tx('Часы'), ColorCoords: tx('Цветовой сдвиг'), ColorDistance: tx('По цвету'),
  ColorPhase: tx('Каналы по очереди'), ColorWrap: tx('Психоделика'), CrazyParametricFun: tx('Безумная спираль'), CrossWarp: tx('Перекрёстный зум'), CrossZoom: tx('Зум-размытие'),
  Crosshatch: tx('Штриховка'), Cube: tx('Куб'), DefocusBlur: tx('Расфокус'), Directional: tx('Толчок'), DirectionalEased: tx('Толчок плавный'),
  DirectionalScaled: tx('Толчок с уменьшением'), DirectionalWarp: tx('Диагональ с размытием'), DirectionalWipe: tx('Мягкая диагональ'), DoomMelt: tx('Таяние Doom'), Doorway: tx('Двери'),
  Dreamy: tx('Сон'), DreamyZoom: tx('Сон с зумом'), EdgeGlow: tx('Светящиеся края'), Fade: tx('Растворение (GL)'), FadeColor: tx('Через цвет'),
  FadeGrayscale: tx('Через ч/б'), FilmBurn: tx('Засвет плёнки'), FlashFade: tx('Вспышка цвета'), FlowerWipe: tx('Цветок'), FlyEye: tx('Глаз мухи'),
  Fold: tx('Сгиб'), GlitchBands: tx('Глитч-полосы'), GlitchDisplace: tx('Глитч-сдвиг'), GlitchFlicker: tx('Глитч-мерцание'), GlitchMemories: tx('Глитч-воспоминания'),
  GlowDissolve: tx('Горячий край'), GridFlip: tx('Плитки-перевёртыши'), HeartWipe: tx('Сердце'), Hexagonalize: tx('Шестиугольники'), HorizontalClose: tx('Сверху и снизу'),
  HorizontalOpen: tx('Из середины вверх и вниз'), HsvFade: tx('Через радугу'), InvertedPageCurl: tx('Загиб страницы'), Kaleidoscope: tx('Калейдоскоп'), LeafWipe: tx('Лист'),
  LeftRight: tx('Уезд влево'), LinearBlur: tx('Размытие'), LissajousTiles: tx('Плитки-фигуры'), LuminanceMelt: tx('Таяние по яркости'), Morph: tx('Морфинг'),
  Mosaic: tx('Мозаика-панорама'), MosaicBlend: tx('Крупная мозаика'), MosaicFade: tx('Мозаика'), MultiplyBlend: tx('Умножение'), NoiseDissolve: tx('Шум'),
  Overexposure: tx('Пересвет'), PerlinDissolve: tx('Пятна'), Pinwheel: tx('Вертушка'), Pixelize: tx('Пиксели (GL)'), PolkaDotsCurtain: tx('Горошек'),
  PowerKaleido: tx('Калейдоскоп-вихрь'), RadialWipe: tx('Стрелка часов'), RandomSquares: tx('Случайные квадраты'), RectangleCover: tx('Прямоугольник'), RectangleIris: tx('Окошко'),
  Revolve: tx('Вихрь с зумом'), Ripple: tx('Рябь'), Rolls: tx('Перекат'), RotateFade: tx('Поворот'), RotateScaleFade: tx('Поворот с зумом'),
  RotateScaleVanish: tx('Улёт в точку'), ScaleIn: tx('Наплыв'), Shatter: tx('Осколки'), SimpleFlip: tx('Переворот'), SimpleZoom: tx('Зум в кадр'),
  SimpleZoomOut: tx('Зум из кадра'), SlideAwayRight: tx('Уезд вправо'), Slides: tx('Слайды'), SplitSlideInHorizontal: tx('Половинки въезжают'), SplitSlideInOutHorizontal: tx('Половинки меняются'),
  SplitSlideInOutVertical: tx('Половинки меняются вертикально'), SplitSlideInVertical: tx('Половинки въезжают вертикально'), SplitSlideOutHorizontal: tx('Половинки разъезжаются'), SplitSlideOutVertical: tx('Половинки разъезжаются вертикально'), SquaresWipe: tx('Квадраты по диагонали'),
  Squeeze: tx('Сжатие в линию'), StarWipe: tx('Звезда'), StaticFade: tx('Помехи'), StaticWipe: tx('Шторка-помехи'), StereoViewer: tx('Стереоскоп'),
  StripDatamoshGlitch: tx('Датамош'), Swap: tx('Обмен в 3D'), Swirl: tx('Водоворот'), TangentMotionBlur: tx('Бросок'), TilesWave: tx('Волна плиток'),
  TopBottom: tx('Уезд вверх'), TvLostSignal: tx('Пропал сигнал'), TvStatic: tx('Телевизор'), UndulatingBurnOut: tx('Огненный круг'), VerticalClose: tx('Слева и справа'),
  VerticalOpen: tx('Из середины в стороны'), WaterDrop: tx('Капля'), Wind: tx('Ветер (GL)'), WindowBlinds: tx('Жалюзи'), WindowSlices: tx('Ломтики'),
  WipeDown: tx('Шторка вниз (GL)'), WipeLeft: tx('Шторка влево (GL)'), WipeRight: tx('Шторка вправо (GL)'), WipeUp: tx('Шторка вверх (GL)'), ZoomInCircles: tx('Кольца'),
  ZoomInOut: tx('Зум туда-обратно'), ZoomWipeLeft: tx('Зум и шторка влево'), ZoomWipeRight: tx('Зум и шторка вправо'),
};

export interface GlTransitionJson {
  name: string; author?: string; license?: string; description?: string; tags?: string[];
  defaultParams?: Record<string, unknown>; paramsTypes?: Record<string, string>; glsl: string;
}

/** Встроенные переходы gl-transitions → описания Kadro. */
export function builtinTransitions(list: GlTransitionJson[]): GlDef[] {
  return list.map((t) => {
    const tags = t.tags ?? [];
    return {
      id: `gl:${t.name}`, kind: 'transition', name: GL_RU[t.name] ?? prettyName(t.name), author: t.author, license: t.license,
      description: t.description, tags, cat: glCategory(tags),
      params: paramsFromJson(t.defaultParams ?? {}, t.paramsTypes ?? {}, t.glsl), glsl: t.glsl,
    };
  });
}

/** Плагин из файла: заголовок → описание; ошибки разбора — в errors. */
export function pluginDef(kind: GlDef['kind'], file: string, src: string): { def: GlDef | null; error?: string } {
  const stem = file.replace(/^.*[\\/]/, '').replace(/\.(glsl|frag|txt)$/i, '');
  const meta = parseGlsl(src);
  const bad = checkBody(kind, src);
  if (bad) return { def: null, error: `${stem}: ${bad}` };
  return {
    def: {
      id: `plug:${kind === 'transition' ? 't' : 'e'}/${stem}`, kind, name: meta.name ?? prettyName(stem), author: meta.author, license: meta.license,
      description: meta.description, tags: meta.tags, cat: 'plugins', params: meta.params, glsl: src, source: file,
    },
    error: meta.errors.length ? `${stem}: ${meta.errors.join('; ')}` : undefined,
  };
}
