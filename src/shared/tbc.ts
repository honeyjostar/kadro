// Плашка-стрелка «Продолжение следует…» для мем-кнопки — рисуется кодом (свой рисунок): стрелка влево,
// тёплая заливка с обводкой, наклонная надпись. 0–0,45 с — въезжает справа, дальше стоит. Тот же код — в плеере и в экспорте.
import { tx } from './i18n';
import type { TextClip } from './types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const TBC_DUR = 3.4;

export interface TbcGeom { cx: number; cy: number; w: number; h: number }

/** Размер плашки: высота — от размера шрифта, ширина — по надписи плюс остриё стрелки. */
export function tbcGeom(ctx: Ctx, c: TextClip, W: number, H: number, x = c.x, y = c.y): TbcGeom {
  const k = Math.min(W, H) / 1080;
  const fs = c.style.size * k;
  ctx.save();
  ctx.font = `italic 800 ${fs}px "${c.style.font}", Onest, sans-serif`;
  const tw = ctx.measureText(c.text || tx('Продолжение следует…')).width;
  ctx.restore();
  const h = fs * 1.7;
  return { cx: x * W, cy: y * H, w: tw + h * 0.9 + fs * 1.2, h };
}

const easeOut = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);

export function drawTbc(ctx: Ctx, c: TextClip, W: number, H: number, local: number | undefined, st: { x: number; y: number; scale: number; opacity: number; rotation: number }): void {
  const t = local ?? 0.6;
  const g = tbcGeom(ctx, c, W, H, st.x, st.y);
  const k = Math.min(W, H) / 1080;
  const fs = c.style.size * k;
  const slide = (1 - easeOut(t / 0.45)) * (W * 0.75);
  ctx.save();
  ctx.globalAlpha *= st.opacity;
  ctx.translate(g.cx + slide, g.cy);
  ctx.rotate((st.rotation * Math.PI) / 180);
  ctx.scale(st.scale, st.scale);
  const { w, h } = g;
  const tip = h * 0.9;
  const x0 = -w / 2;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0 + tip, -h / 2);
    ctx.lineTo(w / 2 - h * 0.12, -h / 2);
    ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + h * 0.12);
    ctx.lineTo(w / 2, h / 2 - h * 0.12);
    ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - h * 0.12, h / 2);
    ctx.lineTo(x0 + tip, h / 2);
    ctx.closePath();
  };
  // тень, заливка с градиентом, толстая тёмная обводка
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 14 * k;
  ctx.shadowOffsetY = 5 * k;
  path();
  const bg = c.style.bgColor || '#e8c37a';
  const gr = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  gr.addColorStop(0, '#fff4d6');
  gr.addColorStop(0.35, bg);
  gr.addColorStop(1, '#a8743a');
  ctx.fillStyle = gr;
  ctx.fill();
  ctx.restore();
  path();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, fs * 0.12);
  ctx.strokeStyle = '#3a2412';
  ctx.stroke();
  // надпись — наклонная, с тёмной обводкой
  ctx.font = `italic 800 ${fs}px "${c.style.font}", Onest, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tx0 = x0 + tip * 0.75 + (w - tip * 0.75) / 2;
  ctx.lineWidth = Math.max(2, fs * 0.14);
  ctx.strokeStyle = '#3a2412';
  ctx.strokeText(c.text || tx('Продолжение следует…'), tx0, fs * 0.04);
  ctx.fillStyle = c.style.color || '#fffaf0';
  ctx.fillText(c.text || tx('Продолжение следует…'), tx0, fs * 0.04);
  ctx.restore();
}
