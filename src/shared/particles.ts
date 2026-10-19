// Частицы поверх кадра (снег, дождь, конфетти, сердечки, блёстки, пузыри).
// Рисуются одной функцией и в плеере, и при экспорте (там — кадрами PNG, как текст), поэтому совпадают точно.
// Всё зависит только от времени клипа и номера частицы — никакой случайности.
import { hash01 } from './effects';
import type { Effect, EffectType } from './types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const TAU = Math.PI * 2;
const frac = (v: number) => v - Math.floor(v);
const h = (i: number, k: number) => hash01(i * 7.13 + k * 1.71);

const CONFETTI = ['#ff3d7f', '#ffd23d', '#3dd6ff', '#7cff6b', '#b56bff', '#ff8a3d'];

function heart(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y - s * 0.1, x - s * 0.5, y + s * 0.25);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.75, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.75, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.25);
  ctx.bezierCurveTo(x + s * 0.5, y - s * 0.1, x, y, x, y + s * 0.3);
  ctx.closePath();
  ctx.fill();
}
function star4(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.closePath();
  ctx.fill();
}

/** Рисует частицы эффекта type на холсте W×H в момент local (сек от начала клипа). */
export function drawParticleEffect(ctx: Ctx, type: EffectType, amount: number, local: number, W: number, H: number, unit?: number): void {
  const u = unit ?? Math.min(W, H) / 1080; // масштаб «пикселей 1080»
  const t = Math.max(0, local);
  ctx.save();
  switch (type) {
    case 'snow': {
      const n = Math.round(40 + 160 * amount);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < n; i++) {
        const sp = 0.06 + 0.1 * h(i, 2);
        const y = frac(h(i, 1) + sp * t) * (H + 40 * u) - 20 * u;
        const x = (h(i, 3) + 0.03 * Math.sin(TAU * (0.15 + 0.25 * h(i, 4)) * t + TAU * h(i, 5))) * W;
        ctx.globalAlpha = 0.55 + 0.4 * h(i, 6);
        ctx.beginPath();
        ctx.arc(x, y, (3 + 7 * h(i, 7)) * u, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'rain': {
      const n = Math.round(60 + 240 * amount);
      ctx.strokeStyle = '#cfe3ff';
      ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const sp = 1.2 + 0.8 * h(i, 2);
        const len = (40 + 50 * h(i, 3)) * u;
        const y = frac(h(i, 1) + sp * t) * (H + len) - len;
        const x = frac(h(i, 4) + 0.18 * sp * t) * (W + 0.2 * H) - 0.1 * H;
        ctx.globalAlpha = 0.25 + 0.35 * h(i, 5);
        ctx.lineWidth = (1.5 + 1.5 * h(i, 6)) * u;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - len * 0.18, y + len);
        ctx.stroke();
      }
      break;
    }
    case 'confetti': {
      const n = Math.round(30 + 120 * amount);
      for (let i = 0; i < n; i++) {
        const sp = 0.12 + 0.12 * h(i, 2);
        const y = frac(h(i, 1) + sp * t) * (H + 60 * u) - 30 * u;
        const x = (h(i, 3) + 0.04 * Math.sin(TAU * (0.3 + 0.4 * h(i, 4)) * t + TAU * h(i, 5))) * W;
        const rot = TAU * (h(i, 6) + (0.5 + h(i, 7)) * t);
        const w = (14 + 10 * h(i, 8)) * u;
        const flip = Math.abs(Math.cos(TAU * (0.7 + h(i, 9)) * t + h(i, 10) * TAU));
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = CONFETTI[Math.floor(h(i, 11) * CONFETTI.length) % CONFETTI.length];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.fillRect(-w / 2, (-w * 0.3 * Math.max(0.15, flip)), w, w * 0.6 * Math.max(0.15, flip));
        ctx.restore();
      }
      break;
    }
    case 'hearts': {
      const n = Math.round(10 + 40 * amount);
      for (let i = 0; i < n; i++) {
        const sp = 0.08 + 0.1 * h(i, 2);
        const life = frac(h(i, 1) + sp * t);
        const y = H + 60 * u - life * (H + 120 * u);
        const x = (h(i, 3) + 0.05 * Math.sin(TAU * 0.4 * t + TAU * h(i, 4))) * W;
        const s = (28 + 34 * h(i, 5)) * u * (1 + 0.12 * Math.sin(TAU * 2 * t + TAU * h(i, 6)));
        ctx.globalAlpha = Math.min(1, 4 * (1 - life)) * (0.7 + 0.3 * h(i, 7));
        ctx.fillStyle = h(i, 8) > 0.5 ? '#ff3d7f' : '#ff6b9a';
        heart(ctx, x, y, s);
      }
      break;
    }
    case 'sparkles': {
      const n = Math.round(20 + 80 * amount);
      for (let i = 0; i < n; i++) {
        const tw = Math.sin(TAU * (0.6 + 0.9 * h(i, 1)) * t + TAU * h(i, 2));
        const k = Math.max(0, tw) ** 3;
        if (k < 0.02) continue;
        ctx.globalAlpha = k;
        ctx.fillStyle = h(i, 3) > 0.4 ? '#fff6c8' : '#ffffff';
        star4(ctx, h(i, 4) * W, h(i, 5) * H, (10 + 22 * h(i, 6)) * u * (0.6 + 0.4 * k));
      }
      break;
    }
    case 'bubbles': {
      const n = Math.round(10 + 40 * amount);
      ctx.lineWidth = 2.5 * u;
      for (let i = 0; i < n; i++) {
        const sp = 0.06 + 0.08 * h(i, 2);
        const r = (18 + 40 * h(i, 3)) * u;
        const y = H + r - frac(h(i, 1) + sp * t) * (H + 2 * r);
        const x = (h(i, 4) + 0.03 * Math.sin(TAU * (0.3 + 0.3 * h(i, 5)) * t + TAU * h(i, 6))) * W;
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = '#e6f6ff';
        ctx.fillStyle = 'rgba(190,230,255,0.12)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.15, 0, TAU);
        ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

export function drawParticles(ctx: Ctx, list: Effect[], local: number, W: number, H: number, unit?: number): void {
  for (const e of list) drawParticleEffect(ctx, e.type, e.amount, local, W, H, unit);
}
