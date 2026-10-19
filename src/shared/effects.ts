// Видеоэффекты клипа. Здесь — математика, общая для превью (canvas) и экспорта (FFmpeg):
// параметры в долях размера слоя, а всё, что меняется во времени, считается от номера кадра или времени клипа.
import type { Effect, EffectType } from './types';

export type EffectCat = 'motion' | 'light' | 'retro' | 'frame' | 'particles';
export const EFFECT_CATS: { id: EffectCat; label: string }[] = [
  { id: 'motion', label: 'Движение' },
  { id: 'light', label: 'Свет и цвет' },
  { id: 'retro', label: 'Стиль' },
  { id: 'frame', label: 'Кадр' },
  { id: 'particles', label: 'Частицы' },
];

/** toggle — эффект без силы (только вкл/выкл). */
export const EFFECTS: { type: EffectType; label: string; hint: string; cat: EffectCat; toggle?: boolean }[] = [
  { type: 'shake', label: 'Тряска', hint: 'Камера дрожит', cat: 'motion' },
  { type: 'quake', label: 'Землетрясение', hint: 'Сильная тряска с качкой', cat: 'motion' },
  { type: 'pulse', label: 'Пульс', hint: 'Ритмичный «удар» масштабом', cat: 'motion' },
  { type: 'heartbeat', label: 'Сердцебиение', hint: 'Двойной удар, как пульс сердца', cat: 'motion' },
  { type: 'zoomin', label: 'Наезд', hint: 'Камера плавно приближается за весь клип', cat: 'motion' },
  { type: 'zoomout', label: 'Отъезд', hint: 'Камера плавно отдаляется за весь клип', cat: 'motion' },
  { type: 'sway', label: 'Качание', hint: 'Кадр покачивается из стороны в сторону', cat: 'motion' },
  { type: 'bounce', label: 'Прыжки', hint: 'Кадр подпрыгивает', cat: 'motion' },
  { type: 'drift', label: 'Плывущая камера', hint: 'Мягкое движение, как с рук', cat: 'motion' },
  { type: 'spin', label: 'Вращение', hint: 'Кадр крутится', cat: 'motion' },
  { type: 'flash', label: 'Вспышка', hint: 'Белая вспышка в начале клипа', cat: 'light' },
  { type: 'strobe', label: 'Стробоскоп', hint: 'Свет мигает, как в клубе', cat: 'light' },
  { type: 'flicker', label: 'Мерцание', hint: 'Свет дрожит, как у старой лампы', cat: 'light' },
  { type: 'colorpulse', label: 'Цветовой пульс', hint: 'Цвета то ярче, то спокойнее', cat: 'light' },
  { type: 'bwflash', label: 'Ч/б вспышки', hint: 'Кадр то и дело становится чёрно-белым', cat: 'light' },
  { type: 'rainbow', label: 'Радуга', hint: 'Цвета переливаются по кругу', cat: 'light' },
  { type: 'glow', label: 'Сияние', hint: 'Светлые места мягко светятся', cat: 'light' },
  { type: 'lightleak', label: 'Засветка', hint: 'Тёплые блики плывут по кадру', cat: 'light' },
  { type: 'vignette', label: 'Виньетка', hint: 'Затемнение краёв', cat: 'light' },
  { type: 'invert', label: 'Негатив', hint: 'Обращение цветов', cat: 'light' },
  { type: 'vhs', label: 'VHS', hint: 'Старая видеокассета', cat: 'retro' },
  { type: 'oldfilm', label: 'Старое кино', hint: 'Сепия и выцветшие тени', cat: 'retro' },
  { type: 'grain', label: 'Зерно', hint: 'Плёночный шум', cat: 'retro' },
  { type: 'glitch', label: 'Глитч', hint: 'Цифровые сбои цвета', cat: 'retro' },
  { type: 'rgbsplit', label: 'RGB-сдвиг', hint: 'Каналы цвета разъезжаются', cat: 'retro' },
  { type: 'comic', label: 'Комикс', hint: 'Мало цветов, сочно, как в комиксе', cat: 'retro' },
  { type: 'duotone', label: 'Дуотон', hint: 'Два цвета: фиолетовый и золотой', cat: 'retro' },
  { type: 'noir', label: 'Нуар', hint: 'Контрастное чёрно-белое кино', cat: 'retro' },
  { type: 'cyber', label: 'Киберпанк', hint: 'Бирюзовые тени, розовый свет', cat: 'retro' },
  { type: 'thermal', label: 'Тепловизор', hint: 'Цвета как у тепловой камеры', cat: 'retro' },
  { type: 'nightvision', label: 'Ночное видение', hint: 'Зелёный прибор ночного видения', cat: 'retro' },
  { type: 'solarize', label: 'Соляризация', hint: 'Светлые места выворачиваются', cat: 'retro' },
  { type: 'split2', label: 'Два экрана', hint: 'Кадр повторяется сверху и снизу', cat: 'frame' },
  { type: 'split3', label: 'Три экрана', hint: 'Три полосы с одним кадром', cat: 'frame' },
  { type: 'split4', label: 'Четыре экрана', hint: 'Кадр 2 × 2', cat: 'frame' },
  { type: 'split9', label: 'Девять экранов', hint: 'Кадр 3 × 3', cat: 'frame' },
  { type: 'mirror', label: 'Зеркало ↔', hint: 'Левая половина отражается вправо', cat: 'frame', toggle: true },
  { type: 'mirrorv', label: 'Зеркало ↕', hint: 'Верхняя половина отражается вниз', cat: 'frame', toggle: true },
  { type: 'kaleido', label: 'Калейдоскоп', hint: 'Четверть кадра отражается в четыре стороны', cat: 'frame', toggle: true },
  { type: 'letterbox', label: 'Кино-полосы', hint: 'Чёрные полосы сверху и снизу', cat: 'frame' },
  { type: 'blur', label: 'Размытие', hint: 'Мягкий фокус', cat: 'frame' },
  { type: 'pixelate', label: 'Пиксели', hint: 'Мозаика', cat: 'frame' },
  { type: 'snow', label: 'Снег', hint: 'Падающие снежинки поверх кадра', cat: 'particles' },
  { type: 'rain', label: 'Дождь', hint: 'Косые струи дождя', cat: 'particles' },
  { type: 'confetti', label: 'Конфетти', hint: 'Цветные бумажки падают и кружатся', cat: 'particles' },
  { type: 'hearts', label: 'Сердечки', hint: 'Сердечки поднимаются снизу', cat: 'particles' },
  { type: 'sparkles', label: 'Блёстки', hint: 'Мерцающие звёздочки', cat: 'particles' },
  { type: 'bubbles', label: 'Пузыри', hint: 'Мыльные пузыри всплывают', cat: 'particles' },
];

export const LOOK_EFFECTS: EffectType[] = ['oldfilm', 'comic', 'duotone', 'noir', 'cyber', 'thermal', 'nightvision', 'solarize'];
export const PARTICLE_EFFECTS: EffectType[] = ['snow', 'rain', 'confetti', 'hearts', 'sparkles', 'bubbles'];
export const MATRIX_EFFECTS: EffectType[] = ['colorpulse', 'bwflash', 'strobe', 'flicker'];
export const SPLIT_EFFECTS: EffectType[] = ['split2', 'split3', 'split4', 'split9'];

/** Порядок применения эффектов к картинке слоя — одинаковый в превью и экспорте (частицы — отдельный слой). */
export const EFFECT_ORDER: EffectType[] = [
  'mirror', 'mirrorv', 'kaleido', 'split2', 'split3', 'split4', 'split9',
  'pixelate', 'blur',
  'oldfilm', 'comic', 'duotone', 'noir', 'cyber', 'thermal', 'nightvision', 'solarize', // одной таблицей
  'invert', 'rainbow', 'colorpulse', 'bwflash',
  'vhs', 'rgbsplit', 'glitch', 'glow', 'lightleak', 'vignette', 'grain',
  'strobe', 'flicker', 'flash', 'letterbox',
];

export function sortedEffects(list: Effect[] | undefined): Effect[] {
  return (list ?? []).filter((e) => e.amount > 0.001 && EFFECT_ORDER.includes(e.type))
    .sort((a, b) => EFFECT_ORDER.indexOf(a.type) - EFFECT_ORDER.indexOf(b.type));
}
export function effectOf(list: Effect[] | undefined, type: EffectType): Effect | undefined {
  return list?.find((e) => e.type === type && e.amount > 0.001);
}
export function particleEffects(list: Effect[] | undefined): Effect[] {
  return (list ?? []).filter((e) => e.amount > 0.001 && PARTICLE_EFFECTS.includes(e.type));
}

/** Детерминированный «случай» для номера кадра (одинаков в JS и в выражениях FFmpeg). */
export function hash01(n: number): number {
  const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// ---------- геометрия: тряска, пульс, наезды, качание… ----------
const TAU = Math.PI * 2;
export interface FxGeometry { dx: number; dy: number; drot: number; scale: number }
const sstep = (u: number) => { const x = Math.min(1, Math.max(0, u)); return x * x * (3 - 2 * x); };

/** local — время от начала клипа, dur — длина клипа (для наезда/отъезда). */
export function fxGeometry(list: Effect[] | undefined, local: number, dur = 1): FxGeometry {
  const g: FxGeometry = { dx: 0, dy: 0, drot: 0, scale: 1 };
  const t = local;
  const sh = effectOf(list, 'shake');
  if (sh) {
    const a = sh.amount;
    g.dx += 0.02 * a * (0.6 * Math.sin(TAU * 7.3 * t + 1.1) + 0.4 * Math.sin(TAU * 13.1 * t + 0.3));
    g.dy += 0.02 * a * (0.6 * Math.sin(TAU * 6.1 * t + 2.3) + 0.4 * Math.sin(TAU * 11.7 * t + 0.7));
    g.drot += 1.5 * a * Math.sin(TAU * 5.7 * t + 2.0);
    g.scale *= 1 + 0.05 * a; // чуть крупнее — края не открываются
  }
  const qk = effectOf(list, 'quake');
  if (qk) {
    const a = qk.amount;
    g.dx += 0.045 * a * (0.6 * Math.sin(TAU * 3.1 * t + 0.4) + 0.4 * Math.sin(TAU * 5.3 * t + 1.9));
    g.dy += 0.045 * a * (0.6 * Math.sin(TAU * 2.7 * t + 2.2) + 0.4 * Math.sin(TAU * 4.9 * t + 0.8));
    g.drot += 2.5 * a * Math.sin(TAU * 2.3 * t + 1.0);
    g.scale *= 1 + 0.12 * a;
  }
  const pu = effectOf(list, 'pulse');
  if (pu) g.scale *= 1 + 0.1 * pu.amount * Math.exp(-((t % 0.5) / 0.08));
  const hb = effectOf(list, 'heartbeat');
  if (hb) {
    const x = t % 0.9;
    const x2 = x - 0.25;
    g.scale *= 1 + 0.08 * hb.amount * (Math.exp(-x / 0.07) + (x2 >= 0 ? 0.7 * Math.exp(-x2 / 0.07) : 0));
  }
  const zi = effectOf(list, 'zoomin');
  if (zi) g.scale *= 1 + 0.3 * zi.amount * sstep(t / Math.max(0.01, dur));
  const zo = effectOf(list, 'zoomout');
  if (zo) g.scale *= 1 + 0.3 * zo.amount * (1 - sstep(t / Math.max(0.01, dur)));
  const sw = effectOf(list, 'sway');
  if (sw) { g.drot += 4 * sw.amount * Math.sin(TAU * 0.8 * t); g.scale *= 1 + 0.07 * sw.amount; }
  const bo = effectOf(list, 'bounce');
  if (bo) g.dy -= 0.035 * bo.amount * Math.abs(Math.sin((Math.PI * t) / 0.6));
  const dr = effectOf(list, 'drift');
  if (dr) {
    const a = dr.amount;
    g.dx += 0.015 * a * Math.sin(TAU * 0.23 * t + 0.5);
    g.dy += 0.012 * a * Math.sin(TAU * 0.17 * t + 1.3);
    g.drot += 0.8 * a * Math.sin(TAU * 0.13 * t);
    g.scale *= 1 + 0.05 * a;
  }
  const sp = effectOf(list, 'spin');
  if (sp) g.drot += 180 * sp.amount * t;
  return g;
}
export function fxMaxScale(list: Effect[] | undefined): number {
  let s = 1;
  const k = (t: EffectType, f: (a: number) => number) => { const e = effectOf(list, t); if (e) s *= f(e.amount); };
  k('shake', (a) => 1 + 0.05 * a);
  k('quake', (a) => 1 + 0.12 * a);
  k('pulse', (a) => 1 + 0.1 * a);
  k('heartbeat', (a) => 1 + 0.08 * a * 1.7);
  k('zoomin', (a) => 1 + 0.3 * a);
  k('zoomout', (a) => 1 + 0.3 * a);
  k('sway', (a) => 1 + 0.07 * a);
  k('drift', (a) => 1 + 0.05 * a);
  return s;
}
const GEOMETRY: EffectType[] = ['shake', 'quake', 'pulse', 'heartbeat', 'zoomin', 'zoomout', 'sway', 'bounce', 'drift', 'spin'];
export function fxMoves(list: Effect[] | undefined): boolean {
  return GEOMETRY.some((t) => !!effectOf(list, t));
}

/** То же для выражений FFmpeg: tv — время от начала клипа (запятые экранированы для графа фильтров). */
export function fxGeometryExpr(list: Effect[] | undefined, tv: string, dur = 1): { dx: string; dy: string; drot: string; scale: string } {
  const f = (n: number) => String(Math.round(n * 1e6) / 1e6);
  const dx: string[] = [];
  const dy: string[] = [];
  const drot: string[] = [];
  const scale: string[] = [];
  const sin = (k: number, ph: number) => `sin(${f(TAU * k)}*${tv}+${f(ph)})`;
  const sh = effectOf(list, 'shake');
  if (sh) {
    const a = sh.amount;
    dx.push(`(${f(0.02 * a)}*(0.6*${sin(7.3, 1.1)}+0.4*${sin(13.1, 0.3)}))`);
    dy.push(`(${f(0.02 * a)}*(0.6*${sin(6.1, 2.3)}+0.4*${sin(11.7, 0.7)}))`);
    drot.push(`(${f(1.5 * a)}*${sin(5.7, 2.0)})`);
    scale.push(f(1 + 0.05 * a));
  }
  const qk = effectOf(list, 'quake');
  if (qk) {
    const a = qk.amount;
    dx.push(`(${f(0.045 * a)}*(0.6*${sin(3.1, 0.4)}+0.4*${sin(5.3, 1.9)}))`);
    dy.push(`(${f(0.045 * a)}*(0.6*${sin(2.7, 2.2)}+0.4*${sin(4.9, 0.8)}))`);
    drot.push(`(${f(2.5 * a)}*${sin(2.3, 1.0)})`);
    scale.push(f(1 + 0.12 * a));
  }
  const pu = effectOf(list, 'pulse');
  if (pu) scale.push(`(1+${f(0.1 * pu.amount)}*exp(-(mod(${tv}\\,0.5)/0.08)))`);
  const hb = effectOf(list, 'heartbeat');
  if (hb) {
    const x = `mod(${tv}\\,0.9)`;
    scale.push(`(1+${f(0.08 * hb.amount)}*(exp(-${x}/0.07)+if(gte(${x}-0.25\\,0)\\,0.7*exp(-(${x}-0.25)/0.07)\\,0)))`);
  }
  const ss = (u: string) => `(clip(${u}\\,0\\,1)*clip(${u}\\,0\\,1)*(3-2*clip(${u}\\,0\\,1)))`;
  const u = `(${tv}/${f(Math.max(0.01, dur))})`;
  const zi = effectOf(list, 'zoomin');
  if (zi) scale.push(`(1+${f(0.3 * zi.amount)}*${ss(u)})`);
  const zo = effectOf(list, 'zoomout');
  if (zo) scale.push(`(1+${f(0.3 * zo.amount)}*(1-${ss(u)}))`);
  const sw = effectOf(list, 'sway');
  if (sw) { drot.push(`(${f(4 * sw.amount)}*${sin(0.8, 0)})`); scale.push(f(1 + 0.07 * sw.amount)); }
  const bo = effectOf(list, 'bounce');
  if (bo) dy.push(`(-${f(0.035 * bo.amount)}*abs(sin(${f(Math.PI / 0.6)}*${tv})))`);
  const dr = effectOf(list, 'drift');
  if (dr) {
    const a = dr.amount;
    dx.push(`(${f(0.015 * a)}*${sin(0.23, 0.5)})`);
    dy.push(`(${f(0.012 * a)}*${sin(0.17, 1.3)})`);
    drot.push(`(${f(0.8 * a)}*${sin(0.13, 0)})`);
    scale.push(f(1 + 0.05 * a));
  }
  const sp = effectOf(list, 'spin');
  if (sp) drot.push(`(${f(180 * sp.amount)}*${tv})`);
  const sum = (xs: string[]) => (xs.length ? `(${xs.join('+')})` : '0');
  return { dx: sum(dx), dy: sum(dy), drot: sum(drot), scale: scale.length ? `(${scale.join('*')})` : '1' };
}

// ---------- свет во времени: одна матрица 3×3 на кадр ----------
function satMatrix(s: number): number[][] {
  const lr = 0.2126; const lg = 0.7152; const lb = 0.0722;
  return [
    [lr * (1 - s) + s, lg * (1 - s), lb * (1 - s)],
    [lr * (1 - s), lg * (1 - s) + s, lb * (1 - s)],
    [lr * (1 - s), lg * (1 - s), lb * (1 - s) + s],
  ];
}
function mul3(a: number[][], b: number[][]): number[][] {
  return a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
}
/** Цветовой пульс, ч/б вспышки, стробоскоп, мерцание — в момент local. null — ничего из этого нет. */
export function fxMatrixAt(list: Effect[] | undefined, local: number): number[][] | null {
  let m: number[][] | null = null;
  const apply = (x: number[][]) => { m = m ? mul3(x, m) : x; };
  const cp = effectOf(list, 'colorpulse');
  if (cp) apply(satMatrix(1 + cp.amount * (0.5 + 0.5 * Math.sin(TAU * 1.5 * local))));
  const bw = effectOf(list, 'bwflash');
  if (bw) apply(satMatrix(local % 0.8 < 0.2 ? 1 - bw.amount : 1));
  let k = 1;
  const st = effectOf(list, 'strobe');
  if (st && Math.floor(local * 8 + 1e-6) % 2 === 1) k *= 1 - 0.85 * st.amount;
  const fl = effectOf(list, 'flicker');
  if (fl) k *= 1 - 0.3 * fl.amount * hash01(Math.floor(local * 20 + 1e-6) + 7);
  if (k !== 1) apply([[k, 0, 0], [0, k, 0], [0, 0, k]]);
  return m;
}

// ---------- образы: одна цветовая таблица ----------
type RGB = [number, number, number];
const luma = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp3 = (c: RGB): RGB => [Math.min(1, Math.max(0, c[0])), Math.min(1, Math.max(0, c[1])), Math.min(1, Math.max(0, c[2]))];
function palette(stops: [number, RGB][], t: number): RGB {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) { const [p0, c0] = stops[i - 1]; const [p1, c1] = stops[i]; return lerp3(c0, c1, (x - p0) / (p1 - p0)); }
  }
  return stops[stops.length - 1][1];
}
const LOOKS: Partial<Record<EffectType, (c: RGB) => RGB>> = {
  oldfilm: (c) => {
    const s: RGB = [0.393 * c[0] + 0.769 * c[1] + 0.189 * c[2], 0.349 * c[0] + 0.686 * c[1] + 0.168 * c[2], 0.272 * c[0] + 0.534 * c[1] + 0.131 * c[2]];
    const v = clamp3(s);
    return [0.08 + 0.84 * v[0], 0.07 + 0.84 * v[1], 0.06 + 0.82 * v[2]];
  },
  comic: (c) => {
    const y = luma(c);
    const sat = clamp3([y + (c[0] - y) * 1.5, y + (c[1] - y) * 1.5, y + (c[2] - y) * 1.5]);
    return [Math.round(sat[0] * 3) / 3, Math.round(sat[1] * 3) / 3, Math.round(sat[2] * 3) / 3];
  },
  duotone: (c) => lerp3([0.13, 0.04, 0.36], [1.0, 0.78, 0.36], sstep(luma(c))),
  noir: (c) => { const y = sstep((luma(c) - 0.08) / 0.84); return [y, y, y]; },
  cyber: (c) => {
    const y = luma(c);
    const tone = lerp3([0.0, 0.5, 0.62], [1.0, 0.3, 0.78], y);
    return clamp3([c[0] * 0.45 + tone[0] * (0.25 + 0.6 * y), c[1] * 0.45 + tone[1] * (0.25 + 0.6 * y), c[2] * 0.45 + tone[2] * (0.25 + 0.6 * y)]);
  },
  thermal: (c) => palette([[0, [0.02, 0.0, 0.15]], [0.25, [0.32, 0.0, 0.7]], [0.5, [0.9, 0.05, 0.4]], [0.75, [1.0, 0.55, 0.0]], [1, [1.0, 1.0, 0.7]]], luma(c)),
  nightvision: (c) => { const y = Math.min(1, Math.pow(luma(c), 0.7) * 1.15); return [0.12 * y, y, 0.18 * y]; },
  solarize: (c) => [c[0] < 0.5 ? c[0] * 2 : (1 - c[0]) * 2, c[1] < 0.5 ? c[1] * 2 : (1 - c[1]) * 2, c[2] < 0.5 ? c[2] * 2 : (1 - c[2]) * 2],
};
/** Образы клипа одной таблицей N³ (как у кривых/HSL): применение — haldclut в экспорте, та же таблица в превью. */
export function lookActive(list: Effect[] | undefined): boolean {
  return LOOK_EFFECTS.some((t) => !!effectOf(list, t));
}
export function lookKey(list: Effect[] | undefined): string {
  return LOOK_EFFECTS.map((t) => effectOf(list, t)?.amount.toFixed(3) ?? '-').join('|');
}
export function lookPixel(list: Effect[] | undefined, c: RGB): RGB {
  let v: RGB = [c[0], c[1], c[2]];
  for (const t of LOOK_EFFECTS) {
    const e = effectOf(list, t);
    if (!e) continue;
    const o = clamp3(LOOKS[t]!(v));
    v = lerp3(v, o, e.amount);
  }
  return clamp3(v);
}
export function lookTable(list: Effect[] | undefined, N: number): Uint8Array {
  const out = new Uint8Array(N * N * N * 3);
  let i = 0;
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const o = lookPixel(list, [r / (N - 1), g / (N - 1), b / (N - 1)]);
    out[i++] = Math.round(o[0] * 255); out[i++] = Math.round(o[1] * 255); out[i++] = Math.round(o[2] * 255);
  }
  return out;
}

// ---------- кадр: сетки, калейдоскоп, полосы ----------
export function splitGrid(t: EffectType): { cols: number; rows: number } {
  return t === 'split2' ? { cols: 1, rows: 2 } : t === 'split3' ? { cols: 1, rows: 3 } : t === 'split4' ? { cols: 2, rows: 2 } : { cols: 3, rows: 3 };
}
/** Плитка сетки: кадр вписан «с обрезкой» в tw × th. */
export function splitLayout(t: EffectType, w: number, h: number, amount: number) {
  const { cols, rows } = splitGrid(t);
  const tw = Math.floor(w / cols);
  const th = Math.floor(h / rows);
  const s = Math.max(tw / w, th / h);
  const sw = Math.max(tw, Math.round(w * s));
  const sh = Math.max(th, Math.round(h * s));
  const cx = Math.floor((sw - tw) / 2);
  const cy = Math.floor((sh - th) / 2);
  const gapF = Math.min(w, h) * 0.012 * amount; // в превью — с долями пикселя (маленький холст)
  const gap = Math.round(gapF);
  return { cols, rows, tw, th, sw, sh, cx, cy, gap, gapF };
}
export function letterboxBar(h: number, amount: number): number {
  return Math.round(h * (0.06 + 0.08 * amount));
}

// ---------- свечение и засветка ----------
export function glowSigma(w: number): number { return w * 0.02; }
export function glowOpacity(amount: number): number { return 0.75 * amount; }
export function leakOpacity(amount: number): number { return 0.85 * amount; }
export const LEAK_PERIOD = 4; // сек: блики проходят ширину кадра
/** Сдвиг окна засветки (пиксели) в момент local. */
export function leakOffset(w: number, local: number): number {
  const u = local / LEAK_PERIOD;
  return Math.floor(w * (u - Math.floor(u)));
}
/** Текстура засветки 2w × h (RGB): тёплые пятна, по горизонтали повторяется с периодом w. */
export function leakBytes(w: number, h: number): Uint8Array {
  const out = new Uint8Array(2 * w * h * 3);
  const blobs: { x: number; y: number; r: number; c: RGB }[] = [
    { x: 0.15, y: 0.25, r: 0.45, c: [1.0, 0.45, 0.12] },
    { x: 0.55, y: 0.75, r: 0.38, c: [1.0, 0.25, 0.35] },
    { x: 0.85, y: 0.15, r: 0.32, c: [1.0, 0.8, 0.35] },
  ];
  const m = Math.min(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0; let g = 0; let b = 0;
      for (const bl of blobs) {
        // по горизонтали — ближайшая копия пятна (текстура зациклена)
        let ddx = Math.abs(x / w - bl.x); ddx = Math.min(ddx, 1 - ddx);
        const d = Math.hypot((ddx * w) / m, (y / h - bl.y) * (h / m)) / bl.r;
        const k = Math.max(0, 1 - d);
        const v = k * k;
        r += bl.c[0] * v; g += bl.c[1] * v; b += bl.c[2] * v;
      }
      const px = [Math.min(255, Math.round(r * 255)), Math.min(255, Math.round(g * 255)), Math.min(255, Math.round(b * 255))];
      for (const xx of [x, x + w]) { const i = (y * 2 * w + xx) * 3; out[i] = px[0]; out[i + 1] = px[1]; out[i + 2] = px[2]; }
    }
  }
  return out;
}

// ---------- параметры по кадрам ----------
/** RGB-сдвиг (пиксели слоя шириной w) для эффектов rgbsplit / glitch в кадре n. */
export function rgbShiftAt(list: Effect[] | undefined, w: number, n: number): { rh: number; bh: number; gv: number } {
  let rh = 0; let bh = 0; let gv = 0;
  const rs = effectOf(list, 'rgbsplit');
  if (rs) { const d = Math.max(1, Math.round(w * 0.02 * rs.amount)); rh -= d; bh += d; }
  const gl = effectOf(list, 'glitch');
  if (gl) {
    const base = Math.max(1, Math.round(w * 0.006 * gl.amount));
    const spike = hash01(n) > 0.72;
    const k = spike ? 2 + Math.round(hash01(n + 0.37) * 4) : 1;
    const dir = hash01(n + 0.71) > 0.5 ? 1 : -1;
    rh -= dir * base * k; bh += dir * base * k;
    if (spike) gv = Math.round((hash01(n + 0.13) - 0.5) * w * 0.02 * gl.amount);
  }
  return { rh, bh, gv };
}

/** Матрица поворота оттенка (как feColorMatrix hueRotate). */
export function hueMatrix(deg: number): number[][] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
    [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283],
    [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
  ];
}
/** Угол радуги в момент local (градусы). */
export function rainbowAngle(e: Effect, local: number): number {
  return (local * 360 * (0.2 + 0.8 * e.amount)) % 360;
}

/** Виньетка: множитель яркости 0..255 для каждой точки слоя (формула как у фильтра vignette FFmpeg). */
export function vignetteBytes(w: number, h: number, amount: number): Uint8Array {
  const angle = (amount * Math.PI) / 2;
  const out = new Uint8Array(w * h);
  const dmax = Math.hypot(w / 2, h / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) / dmax;
      const c = Math.cos(angle * Math.min(1, d));
      out[y * w + x] = Math.round(c * c * c * c * 255);
    }
  }
  return out;
}

export function pixelBlock(w: number, amount: number): number {
  return Math.max(2, Math.round(w * (0.006 + 0.044 * amount)));
}
export function blurSigma(w: number, amount: number): number {
  return w * 0.015 * amount;
}
/** Полосы VHS: период и толщина чётные — при сжатии в yuv420p цвет соседних строк не смешивается. */
export function scanlines(h: number): { period: number; thick: number } {
  const period = 4 * Math.max(1, Math.round(h / 480));
  return { period, thick: period / 2 };
}
export function flashDuration(amount: number): number {
  return 0.15 + 0.35 * amount;
}
