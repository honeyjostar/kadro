// Отрисовка текста на холсте. Одна функция для превью и для экспорта (PNG-слои),
// поэтому текст в готовом ролике выглядит ровно как в плеере.
import { unitScale } from './geometry';
import type { TextClip } from './types';

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

export function layoutText(ctx: Ctx, clip: TextClip, W: number, H: number): TextLayout {
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
  return { lines, font, px, lineH, widths, blockW, blockH, cx: clip.x * W, cy: clip.y * H, padX: px * 0.32, padY: px * 0.16 };
}

/** Прямоугольник, который занимает текст (для перетаскивания в плеере). */
export function textBounds(ctx: Ctx, clip: TextClip, W: number, H: number): { x: number; y: number; w: number; h: number } {
  const L = layoutText(ctx, clip, W, H);
  return { x: L.cx - L.blockW / 2 - L.padX, y: L.cy - L.blockH / 2 - L.padY, w: L.blockW + 2 * L.padX, h: L.blockH + 2 * L.padY };
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

export function drawText(ctx: Ctx, clip: TextClip, W: number, H: number): void {
  const s = clip.style;
  const k = unitScale(W, H);
  const L = layoutText(ctx, clip, W, H);
  ctx.save();
  ctx.font = L.font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const top = L.cy - L.blockH / 2;
  const xOf = (i: number) => {
    if (s.align === 'left') return L.cx - L.blockW / 2;
    if (s.align === 'right') return L.cx + L.blockW / 2 - L.widths[i];
    return L.cx - L.widths[i] / 2;
  };
  // плашка под текстом: по строке, со скруглением
  if (s.bgOpacity > 0) {
    ctx.fillStyle = hexToRgba(s.bgColor, s.bgOpacity);
    L.lines.forEach((_, i) => {
      if (!L.widths[i]) return;
      roundRect(ctx, xOf(i) - L.padX, top + i * L.lineH - L.padY * 0.2, L.widths[i] + 2 * L.padX, L.lineH + L.padY * 0.4, L.px * 0.18);
      ctx.fill();
    });
  }
  const shadow = () => {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10 * k;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4 * k;
  };
  const noShadow = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };
  if (s.strokeWidth > 0) {
    if (s.shadow) shadow();
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = s.strokeWidth * k * 2; // обводка рисуется по центру контура — половина наружу
    ctx.strokeStyle = s.strokeColor;
    L.lines.forEach((l, i) => ctx.strokeText(l, xOf(i), top + i * L.lineH + L.lineH / 2));
    noShadow();
  } else if (s.shadow) {
    shadow();
  }
  ctx.fillStyle = s.color;
  L.lines.forEach((l, i) => ctx.fillText(l, xOf(i), top + i * L.lineH + L.lineH / 2));
  ctx.restore();
}
