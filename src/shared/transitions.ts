// Переходы для превью — точная копия формул FFmpeg xfade (libavfilter/vf_xfade.c).
// В xfade progress идёт от 1 к 0; здесь p = доля прошедшего перехода (0..1), P = 1 - p.
import type { TransitionType } from './types';

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

type Img = CanvasImageSource;

/**
 * Рисует кадр перехода на ctx (размер W×H). a — уходящий кадр, b — входящий (оба уже W×H).
 * scratch — служебный холст W×H для масок.
 */
export function drawTransition(
  ctx: CanvasRenderingContext2D, type: TransitionType, p: number, a: Img, b: Img, W: number, H: number,
  scratch: HTMLCanvasElement | OffscreenCanvas,
): void {
  const P = 1 - Math.min(1, Math.max(0, p));
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  switch (type) {
    case 'fade': {
      ctx.drawImage(a, 0, 0, W, H);
      ctx.globalAlpha = 1 - P;
      ctx.drawImage(b, 0, 0, W, H);
      break;
    }
    case 'fadeblack':
    case 'fadewhite': {
      const s1 = smoothstep(0.8, 1, P);
      const s2 = smoothstep(0.2, 1, P);
      const wa = s1 * P;
      const wb = (1 - s2) * (1 - P);
      const wbg = 1 - wa - wb;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = wa;
      ctx.drawImage(a, 0, 0, W, H);
      ctx.globalAlpha = wb;
      ctx.drawImage(b, 0, 0, W, H);
      if (type === 'fadewhite' && wbg > 0) {
        ctx.globalAlpha = wbg;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);
      }
      break;
    }
    case 'slideleft': {
      // z = trunc(-P·W): пиксель x показывает B[x+z] при 0 ≤ x+z < W, иначе A[x+z+W]
      const off = Math.trunc(-P * W);
      ctx.drawImage(a, -(W + off), 0, W, H);
      ctx.drawImage(b, -off, 0, W, H);
      break;
    }
    case 'slideright': {
      const z = Math.trunc(P * W);
      ctx.drawImage(a, W - z, 0, W, H);
      ctx.drawImage(b, -z, 0, W, H);
      break;
    }
    case 'slideup': {
      const off = Math.trunc(-P * H);
      ctx.drawImage(a, 0, -(H + off), W, H);
      ctx.drawImage(b, 0, -off, W, H);
      break;
    }
    case 'slidedown': {
      const z = Math.trunc(P * H);
      ctx.drawImage(a, 0, H - z, W, H);
      ctx.drawImage(b, 0, -z, W, H);
      break;
    }
    case 'wipeleft': {
      const z = Math.trunc(W * P);
      ctx.drawImage(a, 0, 0, W, H);
      ctx.beginPath();
      ctx.rect(z + 1, 0, W - z - 1, H);
      ctx.clip();
      ctx.drawImage(b, 0, 0, W, H);
      break;
    }
    case 'wiperight': {
      const z = Math.trunc(W * (1 - P));
      ctx.drawImage(a, 0, 0, W, H);
      ctx.beginPath();
      ctx.rect(0, 0, z + 1, H);
      ctx.clip();
      ctx.drawImage(b, 0, 0, W, H);
      break;
    }
    case 'circleopen': {
      // A·m + B·(1-m), m = smoothstep(0,1, dist/z + (P-0.5)·3)
      const z = Math.hypot(W / 2, H / 2);
      const k = (P - 0.5) * 3;
      ctx.drawImage(a, 0, 0, W, H);
      const sctx = scratch.getContext('2d') as CanvasRenderingContext2D;
      sctx.save();
      sctx.globalCompositeOperation = 'source-over';
      sctx.globalAlpha = 1;
      sctx.clearRect(0, 0, W, H);
      sctx.drawImage(b, 0, 0, W, H);
      sctx.globalCompositeOperation = 'destination-in';
      const g = sctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, z);
      const STOPS = 24;
      for (let i = 0; i <= STOPS; i++) {
        const r = i / STOPS; // dist/z
        const m = smoothstep(0, 1, r + k);
        g.addColorStop(r, `rgba(0,0,0,${(1 - m).toFixed(4)})`);
      }
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, W, H);
      sctx.restore();
      ctx.drawImage(scratch as CanvasImageSource, 0, 0, W, H);
      break;
    }
    case 'zoomin': {
      const zf = Math.max(0.0001, smoothstep(0.5, 1, P));
      const s = smoothstep(0, 0.5, P);
      // A увеличен в 1/zf раз вокруг центра
      const sw = W * zf;
      const sh = H * zf;
      ctx.drawImage(a, (W - sw) / 2, (H - sh) / 2, sw, sh, 0, 0, W, H);
      ctx.globalAlpha = 1 - s;
      ctx.drawImage(b, 0, 0, W, H);
      break;
    }
    default:
      ctx.drawImage(b, 0, 0, W, H);
  }
  ctx.restore();
}
