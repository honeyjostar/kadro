// Анимированная кнопка «Подписаться» с колокольчиком — рисуется кодом (свой рисунок, без чужих логотипов).
// 0–0,35 с — выскакивает; 0,6–1,15 — подлетает курсор; 1,2 — нажатие; дальше «Вы подписаны» и звенит колокольчик;
// в конце — исчезает. Тот же код рисует и в плеере, и в экспорте.
import { tx } from './i18n';
import type { TextClip } from './types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const SUBSCRIBE_DUR = 3.4;
export const SUBSCRIBE_COLORS: { id: string; color: string; label: string }[] = [
  { id: 'red', color: '#ff2142', label: tx('Красная') },
  { id: 'pink', color: '#ff3d7f', label: tx('Розовая') },
  { id: 'blue', color: '#2f6bff', label: tx('Синяя') },
  { id: 'black', color: '#16141a', label: tx('Чёрная') },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const backOut = (p: number) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

export interface SubscribeGeom { cx: number; cy: number; w: number; h: number }

/** Размер кнопки: высота — от размера шрифта, ширина — по надписи. */
export function subscribeGeom(ctx: Ctx, c: TextClip, W: number, H: number, x = c.x, y = c.y): SubscribeGeom {
  const k = Math.min(W, H) / 1080;
  const fs = c.style.size * k;
  ctx.save();
  ctx.font = `800 ${fs}px "${c.style.font}", Onest, sans-serif`;
  const label = (c.text || tx('ПОДПИСАТЬСЯ')).toUpperCase();
  const done = tx('ВЫ ПОДПИСАНЫ');
  const tw = Math.max(ctx.measureText(label).width, ctx.measureText(done).width + fs * 1.2);
  ctx.restore();
  const h = fs * 1.9;
  const w = tw + h * 1.25 + fs * 1.4; // значок слева + отступы
  return { cx: x * W, cy: y * H, w, h };
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Колокольчик с центром (x, y) высотой s; angle — покачивание. */
function bell(ctx: Ctx, x: number, y: number, s: number, angle: number, color: string): void {
  ctx.save();
  ctx.translate(x, y - s * 0.45);
  ctx.rotate(angle);
  ctx.translate(0, s * 0.45);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-s * 0.42, s * 0.28);
  ctx.quadraticCurveTo(-s * 0.36, s * 0.12, -s * 0.34, -s * 0.08);
  ctx.bezierCurveTo(-s * 0.32, -s * 0.42, s * 0.32, -s * 0.42, s * 0.34, -s * 0.08);
  ctx.quadraticCurveTo(s * 0.36, s * 0.12, s * 0.42, s * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.arc(0, s * 0.38, s * 0.1, 0, Math.PI * 2); ctx.fill();   // язычок
  ctx.beginPath(); ctx.arc(0, -s * 0.42, s * 0.07, 0, Math.PI * 2); ctx.fill(); // ушко
  ctx.restore();
}

/** Курсор-стрелка, остриё в (x, y). */
function cursor(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 24, s / 24);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(15, 10); ctx.lineTo(8.5, 11.2); ctx.lineTo(12, 18); ctx.lineTo(9, 19.4); ctx.lineTo(5.7, 12.6); ctx.lineTo(0, 17); ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Нарисовать кнопку в момент local (сек от начала клипа). opacity/scale/x/y — из общего состояния текста. */
export function drawSubscribe(ctx: Ctx, c: TextClip, W: number, H: number, local: number | undefined, st: { x: number; y: number; scale: number; opacity: number; rotation: number }): void {
  const t = local ?? 1.6; // без времени — «нажатое» состояние посередине
  const D = c.duration;
  const g = subscribeGeom(ctx, c, W, H, st.x, st.y);
  const appear = backOut(clamp01(t / 0.35));
  const leave = clamp01((D - t) / 0.3);
  const press = t >= 1.2 && t < 1.38 ? 0.94 : 1;
  const sc = st.scale * Math.max(0.01, 0.3 + 0.7 * appear) * press * (0.85 + 0.15 * leave);
  const alpha = st.opacity * clamp01(t / 0.12) * leave;
  if (alpha <= 0.001) return;
  const done = t >= 1.3;
  const k = Math.min(W, H) / 1080;
  const fs = c.style.size * k;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.translate(g.cx, g.cy);
  if (st.rotation) ctx.rotate((st.rotation * Math.PI) / 180);
  ctx.scale(sc, sc);
  const x0 = -g.w / 2;
  const y0 = -g.h / 2;
  // тень и плашка
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = fs * 0.5;
  ctx.shadowOffsetY = fs * 0.12;
  roundRect(ctx, x0, y0, g.w, g.h, g.h / 2);
  ctx.fillStyle = done ? '#3b3742' : c.style.bgColor || SUBSCRIBE_COLORS[0].color;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // значок слева: круг с колокольчиком
  const icx = x0 + g.h * 0.55;
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.arc(icx, 0, g.h * 0.36, 0, Math.PI * 2); ctx.fill();
  const ring = done ? Math.sin((t - 1.3) * 26) * 0.45 * Math.exp(-(t - 1.3) * 2.4) : 0;
  bell(ctx, icx, g.h * 0.02, g.h * 0.42, ring, '#ffffff');
  if (done && t - 1.3 < 1.1) {
    // «звон» — дужки у колокольчика
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1, fs * 0.07);
    ctx.lineCap = 'round';
    const a = 1 - (t - 1.3) / 1.1;
    ctx.globalAlpha = Math.min(1, alpha) * a;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(icx, 0, g.h * 0.44, side < 0 ? Math.PI * 1.1 : -Math.PI * 0.35, side < 0 ? Math.PI * 1.35 : -Math.PI * 0.1);
      ctx.stroke();
    }
    ctx.globalAlpha = Math.min(1, alpha);
  }
  // надпись
  ctx.font = `800 ${fs}px "${c.style.font}", Onest, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  const tx0 = x0 + g.h * 1.1;
  if (done) {
    // галочка + «Вы подписаны»
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = fs * 0.16;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(tx0, fs * 0.02); ctx.lineTo(tx0 + fs * 0.3, fs * 0.3); ctx.lineTo(tx0 + fs * 0.8, -fs * 0.3);
    ctx.stroke();
    ctx.fillText(tx('ВЫ ПОДПИСАНЫ'), tx0 + fs * 1.2, fs * 0.04);
  } else {
    // надпись — по центру свободного места справа от значка
    const label = (c.text || tx('ПОДПИСАТЬСЯ')).toUpperCase();
    const room = x0 + g.w - fs * 0.7 - tx0;
    ctx.fillText(label, tx0 + Math.max(0, (room - ctx.measureText(label).width) / 2), fs * 0.04);
  }
  ctx.restore();
  // курсор: подлетает снизу справа к кнопке, нажимает, уходит
  if (t > 0.55 && t < D - 0.35) {
    const fly = easeInOut(clamp01((t - 0.6) / 0.55));
    const away = easeInOut(clamp01((t - 1.75) / 0.5));
    const tx1 = g.cx + g.w * 0.18 * st.scale;
    const ty1 = g.cy + g.h * 0.1 * st.scale;
    const sx = tx1 + g.w * 0.55;
    const sy = ty1 + g.h * 2.2;
    const cxp = sx + (tx1 - sx) * fly + (g.w * 0.4) * away;
    const cyp = sy + (ty1 - sy) * fly + (g.h * 1.6) * away;
    const cs = fs * 1.7 * (t >= 1.2 && t < 1.38 ? 0.85 : 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, st.opacity * clamp01((t - 0.55) / 0.15) * (1 - away));
    cursor(ctx, cxp, cyp, cs);
    ctx.restore();
  }
}
