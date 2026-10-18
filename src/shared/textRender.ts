// Отрисовка текста на холсте. Одна функция для превью и для экспорта (PNG-кадры),
// поэтому текст в готовом ролике выглядит ровно как в плеере — с анимациями и подсветкой слов.
import { hasAnim, textPropsAt } from './anim';
import { unitScale } from './geometry';
import type { TextAnim, TextClip, Word } from './types';

export interface TextLayout {
  lines: string[];
  font: string;
  px: number;
  lineH: number;
  widths: number[];
  blockW: number;
  blockH: number;
  cx: number;
  cy: number;
  padX: number;
  padY: number;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function fontString(clip: TextClip, px: number): string {
  const s = clip.style;
  return `${s.italic ? 'italic ' : ''}${s.bold ? 700 : 400} ${px}px "${s.font}", "Onest", sans-serif`;
}

function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = `${line} ${words[i]}`;
      if (ctx.measureText(test).width <= maxW) line = test;
      else { out.push(line); line = words[i]; }
    }
    out.push(line);
  }
  return out;
}

/** Раскладка текста (без анимаций): строки, размеры, центр. x, y — центр в долях холста. */
export function layoutText(ctx: Ctx, clip: TextClip, W: number, H: number, x = clip.x, y = clip.y): TextLayout {
  const k = unitScale(W, H);
  const px = Math.max(4, clip.style.size * k);
  const font = fontString(clip, px);
  ctx.font = font;
  const raw = clip.style.uppercase ? clip.text.toUpperCase() : clip.text;
  const lines = wrap(ctx, raw, clip.style.maxWidth * W);
  const widths = lines.map((l) => ctx.measureText(l).width);
  const lineH = px * 1.22;
  const blockW = Math.max(1, ...widths);
  const blockH = lineH * lines.length;
  return { lines, font, px, lineH, widths, blockW, blockH, cx: x * W, cy: y * H, padX: px * 0.32, padY: px * 0.16 };
}

// ---------- состояние текста во времени ----------
export interface TextState {
  x: number;           // центр, доли холста (с учётом ключей и сдвигов анимации)
  y: number;
  scale: number;
  rotation: number;    // градусы
  opacity: number;
  reveal: number;      // сколько символов видно (печатная машинка), Infinity — все
  wipe: number;        // 0..1 — видимая доля ширины слева
  blur: number;        // размытие в «пикселях 1080»
  active: number;      // индекс произносимого слова (-1 — нет)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const backOut = (p: number) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

function applyAnim(st: TextState, a: TextAnim, e: number, chars: number): void {
  // e: 0 — текст ещё не появился (или уже исчез), 1 — полностью виден
  switch (a.type) {
    case 'fade': st.opacity *= e; break;
    case 'slideUp': st.y += (1 - easeOut(e)) * 0.06; st.opacity *= e; break;
    case 'slideDown': st.y -= (1 - easeOut(e)) * 0.06; st.opacity *= e; break;
    case 'slideLeft': st.x += (1 - easeOut(e)) * 0.08; st.opacity *= e; break;
    case 'slideRight': st.x -= (1 - easeOut(e)) * 0.08; st.opacity *= e; break;
    case 'pop': st.scale *= 0.4 + 0.6 * backOut(e); st.opacity *= clamp01(e * 3); break;
    case 'zoom': st.scale *= 1 + 0.6 * (1 - easeOut(e)); st.opacity *= e; break;
    case 'typewriter': st.reveal = Math.min(st.reveal, Math.floor(e * chars + 1e-6)); break;
    case 'blur': st.blur += (1 - e) * 24; st.opacity *= e; break;
    case 'wipe': st.wipe = Math.min(st.wipe, easeInOut(e)); break;
  }
}

export function activeWordAt(words: Word[] | undefined, local: number): number {
  if (!words?.length) return -1;
  let a = -1;
  for (let i = 0; i < words.length; i++) if (words[i].start <= local + 1e-6) a = i;
  return a;
}

/** Есть ли у текста что-то, меняющееся во времени (тогда экспорт рисует его по кадрам). */
export function isTextAnimated(c: TextClip): boolean {
  const hl = c.style.highlight && c.style.highlight.mode !== 'none' && (c.words?.length ?? 0) > 0;
  return hasAnim(c.keyframes) || !!c.anim?.in || !!c.anim?.out || !!hl;
}

/** Состояние текста в момент local (сек от начала клипа). Без local — «спокойное» состояние. */
export function textStateAt(c: TextClip, local?: number): TextState {
  const t = local ?? Math.min(c.duration / 2, 0.5);
  const p = textPropsAt(c, t);
  const st: TextState = { ...p, reveal: Infinity, wipe: 1, blur: 0, active: -1 };
  if (local === undefined) return st;
  const chars = c.text.replace(/\s+/g, '').length;
  const ain = c.anim?.in;
  const aout = c.anim?.out;
  if (ain && ain.dur > 0) applyAnim(st, ain, clamp01(t / ain.dur), chars);
  if (aout && aout.dur > 0) applyAnim(st, aout, clamp01((c.duration - t) / aout.dur), chars);
  if (c.style.highlight && c.style.highlight.mode !== 'none') st.active = activeWordAt(c.words, t);
  return st;
}

/** Ключ состояния — одинаковые кадры экспорта не рисуются заново. */
export function textStateKey(s: TextState): string {
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  return [r(s.x), r(s.y), r(s.scale), r(s.rotation), r(s.opacity), s.reveal === Infinity ? 'all' : s.reveal, r(s.wipe), r(s.blur), s.active].join('|');
}

/** Прямоугольник текста до поворота (центр, размеры) — для рамки в плеере. */
export function textBounds(ctx: Ctx, clip: TextClip, W: number, H: number, local?: number): { cx: number; cy: number; w: number; h: number; rotation: number } {
  const st = textStateAt(clip, local);
  const L = layoutText(ctx, clip, W, H, st.x, st.y);
  return { cx: L.cx, cy: L.cy, w: (L.blockW + 2 * L.padX) * st.scale, h: (L.blockH + 2 * L.padY) * st.scale, rotation: st.rotation };
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

interface Piece { text: string; x: number; w: number; word: number; line: number }

/** Слова строк с координатами; word — номер слова по всему тексту (для подсветки). */
function pieces(ctx: Ctx, L: TextLayout, xOf: (i: number) => number): Piece[] {
  const out: Piece[] = [];
  let word = 0;
  const space = ctx.measureText(' ').width;
  L.lines.forEach((line, li) => {
    let x = xOf(li);
    for (const w of line.split(' ')) {
      if (!w) continue;
      const ww = ctx.measureText(w).width;
      out.push({ text: w, x, w: ww, word: word++, line: li });
      x += ww + space;
    }
  });
  return out;
}

/**
 * Рисует текст. local — время от начала клипа (анимации, ключи, подсветка слова);
 * без local — статичная картинка.
 */
export function drawText(ctx: Ctx, clip: TextClip, W: number, H: number, local?: number): void {
  const s = clip.style;
  const k = unitScale(W, H);
  const st = textStateAt(clip, local);
  if (st.opacity <= 0.001 || st.reveal <= 0 || st.wipe <= 0.0001) return;
  const L = layoutText(ctx, clip, W, H, st.x, st.y);
  ctx.save();
  // поворот и масштаб вокруг центра блока
  ctx.translate(L.cx, L.cy);
  if (st.rotation) ctx.rotate((st.rotation * Math.PI) / 180);
  if (st.scale !== 1) ctx.scale(st.scale, st.scale);
  ctx.translate(-L.cx, -L.cy);
  ctx.globalAlpha = Math.min(1, st.opacity);
  if (st.blur > 0.01) ctx.filter = `blur(${st.blur * k}px)`;
  ctx.font = L.font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const top = L.cy - L.blockH / 2;
  const xOf = (i: number) => {
    if (s.align === 'left') return L.cx - L.blockW / 2;
    if (s.align === 'right') return L.cx + L.blockW / 2 - L.widths[i];
    return L.cx - L.widths[i] / 2;
  };
  const yOf = (i: number) => top + i * L.lineH + L.lineH / 2;
  if (st.wipe < 1) {
    ctx.beginPath();
    ctx.rect(L.cx - L.blockW / 2 - L.padX * 2, top - L.padY * 2, (L.blockW + L.padX * 4) * st.wipe, L.blockH + L.padY * 4);
    ctx.clip();
  }

  const hl = s.highlight && s.highlight.mode !== 'none' && clip.words?.length ? s.highlight : undefined;
  const ps = pieces(ctx, L, xOf);
  const mapped = hl && ps.length === clip.words!.length; // подсветка возможна, если слова совпадают с текстом
  // печатная машинка: сколько букв каждого слова видно
  let budget = st.reveal;
  const visibleText = (p: Piece) => {
    if (budget === Infinity) return p.text;
    const n = Math.max(0, Math.min(p.text.length, budget));
    budget -= p.text.length;
    return p.text.slice(0, n);
  };
  const shown = ps.map((p) => ({ ...p, vis: visibleText(p) }))
    .filter((p) => p.vis.length > 0)
    .filter((p) => !(mapped && hl!.mode === 'reveal' && p.word > st.active));

  // плашка под строкой
  if (s.bgOpacity > 0) {
    ctx.fillStyle = hexToRgba(s.bgColor, s.bgOpacity);
    L.lines.forEach((_, i) => {
      const lp = shown.filter((p) => p.line === i);
      if (!lp.length) return;
      const x0 = lp[0].x;
      const x1 = lp[lp.length - 1].x + ctx.measureText(lp[lp.length - 1].vis).width;
      roundRect(ctx, x0 - L.padX, top + i * L.lineH - L.padY * 0.2, x1 - x0 + 2 * L.padX, L.lineH + L.padY * 0.4, L.px * 0.18);
      ctx.fill();
    });
  }
  // подсветка слова плашкой
  if (mapped && hl!.mode === 'box') {
    const p = shown.find((x) => x.word === st.active);
    if (p) {
      ctx.fillStyle = hl!.color;
      roundRect(ctx, p.x - L.px * 0.14, yOf(p.line) - L.lineH * 0.5 + L.px * 0.02, ctx.measureText(p.vis).width + L.px * 0.28, L.lineH - L.px * 0.04, L.px * 0.16);
      ctx.fill();
    }
  }
  const shadow = () => {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10 * k;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4 * k;
  };
  const noShadow = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };
  const colorOf = (p: Piece) => {
    if (!mapped) return s.color;
    if (hl!.mode === 'color' && p.word === st.active) return hl!.color;
    if (hl!.mode === 'karaoke' && p.word <= st.active) return hl!.color;
    if (hl!.mode === 'pop' && p.word === st.active) return hl!.color;
    return s.color;
  };
  const drawPiece = (p: Piece & { vis: string }, stroke: boolean) => {
    const pop = mapped && hl!.mode === 'pop' && p.word === st.active;
    const y = yOf(p.line);
    if (pop) {
      const w = ctx.measureText(p.vis).width;
      ctx.save();
      ctx.translate(p.x + w / 2, y);
      ctx.scale(1.18, 1.18);
      ctx.translate(-(p.x + w / 2), -y);
    }
    if (stroke) ctx.strokeText(p.vis, p.x, y);
    else { ctx.fillStyle = colorOf(p); ctx.fillText(p.vis, p.x, y); }
    if (pop) ctx.restore();
  };
  // обычные слова, потом «выскочившее» — поверх
  const order = [...shown].sort((a, b) => Number(mapped && hl!.mode === 'pop' && a.word === st.active) - Number(mapped && hl!.mode === 'pop' && b.word === st.active));
  if (s.strokeWidth > 0) {
    if (s.shadow) shadow();
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = s.strokeWidth * k * 2; // обводка рисуется по центру контура — половина наружу
    ctx.strokeStyle = s.strokeColor;
    for (const p of order) drawPiece(p, true);
    noShadow();
  } else if (s.shadow) {
    shadow();
  }
  for (const p of order) drawPiece(p, false);
  ctx.restore();
}
