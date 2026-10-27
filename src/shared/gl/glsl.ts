// Шейдеры Kadro: переходы gl-transitions и эффекты-плагины на GLSL (WebGL).
// Здесь — чистые функции: разбор заголовка шейдера, параметры, обёртка в полный фрагментный шейдер,
// русские названия и разделы. Рисует их renderer/engine/gl.ts, экспорт — тот же движок по кадрам.

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
      if (!PARAM_TYPES.has(type)) { meta.errors.push(`Параметр ${name}: тип ${type} не поддерживается`); pendingRange = null; continue; }
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
  return new RegExp(`vec4\\s+${fn}\\s*\\(\\s*vec2\\s+\\w+\\s*\\)`).test(glsl) ? null : `Нет функции vec4 ${fn}(vec2 uv)`;
}

// ---------- разделы и названия ----------
/**
 * Разделы для переходов-шейдеров. Сдвиги, шторки, фигуры и растворения попадают в те же разделы, что и
 * встроенные переходы (move, wipe, shape, basic); новые разделы — только для того, чего раньше не было.
 */
export const GL_TRANSITION_CATS: { id: string; label: string; tags: string[] }[] = [
  { id: 'gl3d', label: '3D', tags: ['3d', 'cube', 'page', 'curl', 'fold', 'doors', 'swap', 'roll', 'flip', 'cards'] },
  { id: 'glglitch', label: 'Глитч и ретро', tags: ['glitch', 'static', 'datamosh', 'scanlines', 'retro'] },
  { id: 'glzoom', label: 'Зум и вращение', tags: ['zoom', 'rotate', 'spin', 'swirl', 'pinwheel'] },
  { id: 'glwarp', label: 'Искажения и огонь', tags: ['distort', 'warp', 'wave', 'ripple', 'kaleidoscope', 'chromatic', 'displace', 'morph', 'lens', 'psychedelic', 'melt', 'burn', 'fire', 'shatter'] },
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
  BlockDissolve: 'Блоки', BookFlip: 'Листание книги', Bounce: 'Падение с отскоком', BowTie: 'Бабочка', BowTieHorizontal: 'Бабочка по горизонтали',
  BowTieVertical: 'Бабочка по вертикали', Box: 'Коробка', BurnThrough: 'Прожигание', ButterflyWaveScrawler: 'Волны-каракули', Chessboard: 'Шахматы',
  CircleIris: 'Круг через цвет', CircleOpen: 'Мягкий круг', ClockWipe: 'Часы', ColorCoords: 'Цветовой сдвиг', ColorDistance: 'По цвету',
  ColorPhase: 'Каналы по очереди', ColorWrap: 'Психоделика', CrazyParametricFun: 'Безумная спираль', CrossWarp: 'Перекрёстный зум', CrossZoom: 'Зум-размытие',
  Crosshatch: 'Штриховка', Cube: 'Куб', DefocusBlur: 'Расфокус', Directional: 'Толчок', DirectionalEased: 'Толчок плавный',
  DirectionalScaled: 'Толчок с уменьшением', DirectionalWarp: 'Диагональ с размытием', DirectionalWipe: 'Мягкая диагональ', DoomMelt: 'Таяние Doom', Doorway: 'Двери',
  Dreamy: 'Сон', DreamyZoom: 'Сон с зумом', EdgeGlow: 'Светящиеся края', Fade: 'Растворение (GL)', FadeColor: 'Через цвет',
  FadeGrayscale: 'Через ч/б', FilmBurn: 'Засвет плёнки', FlashFade: 'Вспышка цвета', FlowerWipe: 'Цветок', FlyEye: 'Глаз мухи',
  Fold: 'Сгиб', GlitchBands: 'Глитч-полосы', GlitchDisplace: 'Глитч-сдвиг', GlitchFlicker: 'Глитч-мерцание', GlitchMemories: 'Глитч-воспоминания',
  GlowDissolve: 'Горячий край', GridFlip: 'Плитки-перевёртыши', HeartWipe: 'Сердце', Hexagonalize: 'Шестиугольники', HorizontalClose: 'Сверху и снизу',
  HorizontalOpen: 'Из середины вверх и вниз', HsvFade: 'Через радугу', InvertedPageCurl: 'Загиб страницы', Kaleidoscope: 'Калейдоскоп', LeafWipe: 'Лист',
  LeftRight: 'Уезд влево', LinearBlur: 'Размытие', LissajousTiles: 'Плитки-фигуры', LuminanceMelt: 'Таяние по яркости', Morph: 'Морфинг',
  Mosaic: 'Мозаика-панорама', MosaicBlend: 'Крупная мозаика', MosaicFade: 'Мозаика', MultiplyBlend: 'Умножение', NoiseDissolve: 'Шум',
  Overexposure: 'Пересвет', PerlinDissolve: 'Пятна', Pinwheel: 'Вертушка', Pixelize: 'Пиксели (GL)', PolkaDotsCurtain: 'Горошек',
  PowerKaleido: 'Калейдоскоп-вихрь', RadialWipe: 'Стрелка часов', RandomSquares: 'Случайные квадраты', RectangleCover: 'Прямоугольник', RectangleIris: 'Окошко',
  Revolve: 'Вихрь с зумом', Ripple: 'Рябь', Rolls: 'Перекат', RotateFade: 'Поворот', RotateScaleFade: 'Поворот с зумом',
  RotateScaleVanish: 'Улёт в точку', ScaleIn: 'Наплыв', Shatter: 'Осколки', SimpleFlip: 'Переворот', SimpleZoom: 'Зум в кадр',
  SimpleZoomOut: 'Зум из кадра', SlideAwayRight: 'Уезд вправо', Slides: 'Слайды', SplitSlideInHorizontal: 'Половинки въезжают', SplitSlideInOutHorizontal: 'Половинки меняются',
  SplitSlideInOutVertical: 'Половинки меняются вертикально', SplitSlideInVertical: 'Половинки въезжают вертикально', SplitSlideOutHorizontal: 'Половинки разъезжаются', SplitSlideOutVertical: 'Половинки разъезжаются вертикально', SquaresWipe: 'Квадраты по диагонали',
  Squeeze: 'Сжатие в линию', StarWipe: 'Звезда', StaticFade: 'Помехи', StaticWipe: 'Шторка-помехи', StereoViewer: 'Стереоскоп',
  StripDatamoshGlitch: 'Датамош', Swap: 'Обмен в 3D', Swirl: 'Водоворот', TangentMotionBlur: 'Бросок', TilesWave: 'Волна плиток',
  TopBottom: 'Уезд вверх', TvLostSignal: 'Пропал сигнал', TvStatic: 'Телевизор', UndulatingBurnOut: 'Огненный круг', VerticalClose: 'Слева и справа',
  VerticalOpen: 'Из середины в стороны', WaterDrop: 'Капля', Wind: 'Ветер (GL)', WindowBlinds: 'Жалюзи', WindowSlices: 'Ломтики',
  WipeDown: 'Шторка вниз (GL)', WipeLeft: 'Шторка влево (GL)', WipeRight: 'Шторка вправо (GL)', WipeUp: 'Шторка вверх (GL)', ZoomInCircles: 'Кольца',
  ZoomInOut: 'Зум туда-обратно', ZoomWipeLeft: 'Зум и шторка влево', ZoomWipeRight: 'Зум и шторка вправо',
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
