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
    default: {
      if (!PIXEL_TRANSITIONS.has(type)) { ctx.drawImage(b, 0, 0, W, H); break; }
      const A = pixelsOf(a, W, H, scratch);
      const B = pixelsOf(b, W, H, scratch);
      const out = new ImageData(W, H);
      transitionPixels(type, P, A, B, out.data, W, H);
      ctx.putImageData(out, 0, 0);
    }
  }
  ctx.restore();
}

function pixelsOf(img: Img, W: number, H: number, scratch: HTMLCanvasElement | OffscreenCanvas): Uint8ClampedArray {
  const c = img as HTMLCanvasElement;
  if ((typeof HTMLCanvasElement !== 'undefined' && c instanceof HTMLCanvasElement) || (typeof OffscreenCanvas !== 'undefined' && (img as unknown) instanceof OffscreenCanvas)) {
    if (c.width === W && c.height === H) return (c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, W, H).data;
  }
  const sc = scratch.getContext('2d') as CanvasRenderingContext2D;
  sc.save();
  sc.globalCompositeOperation = 'copy';
  sc.globalAlpha = 1;
  sc.drawImage(img, 0, 0, W, H);
  sc.restore();
  return sc.getImageData(0, 0, W, H).data;
}

// ---------- переходы по пикселям: формулы libavfilter/vf_xfade.c ----------
// P — progress xfade (1 → 0). mix(a, b, m) = a·m + b·(1 − m). Кадры — RGBA, сплошные (альфа 255).

export const PIXEL_TRANSITIONS = new Set<TransitionType>([
  'fadefast', 'fadeslow', 'fadegrays', 'dissolve', 'distance', 'pixelize', 'hblur',
  'wipeup', 'wipedown', 'wipetl', 'wipetr', 'wipebl', 'wipebr',
  'smoothleft', 'smoothright', 'smoothup', 'smoothdown',
  'coverleft', 'coverright', 'coverup', 'coverdown',
  'revealleft', 'revealright', 'revealup', 'revealdown',
  'circleclose', 'circlecrop', 'rectcrop', 'radial',
  'vertopen', 'vertclose', 'horzopen', 'horzclose',
  'diagtl', 'diagtr', 'diagbl', 'diagbr',
  'hlslice', 'hrslice', 'vuslice', 'vdslice',
  'hlwind', 'hrwind', 'vuwind', 'vdwind',
  'squeezeh', 'squeezev',
]);

const f32 = Math.fround;
/** Шум xfade (float32, как sinf в C). */
export function frand(x: number, y: number): number {
  const r = f32(f32(Math.sin(f32(f32(f32(x) * f32(12.9898)) + f32(f32(y) * f32(78.233))))) * f32(43758.545));
  return f32(r - Math.floor(r));
}
const fract = (v: number) => v - Math.floor(v);
const clip01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss01 = (x: number) => { const t = clip01(x); return t * t * (3 - 2 * t); };
const trunc = Math.trunc;
const wrapOnce = (i: number, n: number) => (i < 0 ? i + n : i >= n ? i - n : i);

// BT.601, ограниченный диапазон — так FFmpeg переводит кадр в YUV перед xfade
function toYuv(r: number, g: number, b: number): [number, number, number] {
  return [
    16 + 0.256788 * r + 0.504129 * g + 0.0979059 * b,
    128 - 0.148223 * r - 0.290993 * g + 0.439216 * b,
    128 + 0.439216 * r - 0.367788 * g - 0.0714274 * b,
  ];
}
function fromYuv(y: number, u: number, v: number): [number, number, number] {
  const c = 1.164383 * (y - 16);
  return [c + 1.596027 * (v - 128), c - 0.391762 * (u - 128) - 0.812968 * (v - 128), c + 2.017232 * (u - 128)];
}

/** Вес кадра A (уходящего) в точке x, y — для переходов «маской». null — тип не маска. */
function maskWeight(type: TransitionType, P: number, W: number, H: number): ((x: number, y: number) => number) | null {
  const w = W;
  const h = H;
  switch (type) {
    case 'wipeup': { const z = trunc(H * P); return (_x, y) => (y > z ? 0 : 1); }
    case 'wipedown': { const z = trunc(H * (1 - P)); return (_x, y) => (y > z ? 1 : 0); }
    case 'wipetl': { const zw = trunc(W * P); const zh = trunc(H * P); return (x, y) => (y <= zh && x <= zw ? 1 : 0); }
    case 'wipetr': { const zw = trunc(W * (1 - P)); const zh = trunc(H * P); return (x, y) => (y <= zh && x > zw ? 1 : 0); }
    case 'wipebl': { const zw = trunc(W * P); const zh = trunc(H * (1 - P)); return (x, y) => (y > zh && x <= zw ? 1 : 0); }
    case 'wipebr': { const zh = trunc(H * (1 - P)); const zw = trunc(W * (1 - P)); return (x, y) => (y > zh && x > zw ? 1 : 0); }
    // mix(B, A, s): вес A = 1 − s
    case 'smoothleft': return (x) => 1 - ss01(1 + x / w - P * 2);
    case 'smoothright': return (x) => 1 - ss01(1 + (w - 1 - x) / w - P * 2);
    case 'smoothup': return (_x, y) => 1 - ss01(1 + y / h - P * 2);
    case 'smoothdown': return (_x, y) => 1 - ss01(1 + (h - 1 - y) / h - P * 2);
    case 'radial': return (x, y) => 1 - ss01(Math.atan2(x - trunc(W / 2), y - trunc(H / 2)) - (P - 0.5) * (Math.PI * 2.5));
    case 'circleclose': {
      const z = Math.hypot(trunc(W / 2), trunc(H / 2));
      const p = (1 - P - 0.5) * 3;
      return (x, y) => 1 - ss01(Math.hypot(x - trunc(W / 2), y - trunc(H / 2)) / z + p);
    }
    case 'vertopen': { const w2 = W / 2; return (x) => 1 - ss01(2 - Math.abs((x - w2) / w2) - P * 2); }
    case 'vertclose': { const w2 = W / 2; return (x) => 1 - ss01(1 + Math.abs((x - w2) / w2) - P * 2); }
    case 'horzopen': { const h2 = H / 2; return (_x, y) => 1 - ss01(2 - Math.abs((y - h2) / h2) - P * 2); }
    case 'horzclose': { const h2 = H / 2; return (_x, y) => 1 - ss01(1 + Math.abs((y - h2) / h2) - P * 2); }
    case 'diagtl': return (x, y) => 1 - ss01(1 + (x / w) * (y / h) - P * 2);
    case 'diagtr': return (x, y) => 1 - ss01(1 + ((w - 1 - x) / w) * (y / h) - P * 2);
    case 'diagbl': return (x, y) => 1 - ss01(1 + (x / w) * ((h - 1 - y) / h) - P * 2);
    case 'diagbr': return (x, y) => 1 - ss01(1 + ((w - 1 - x) / w) * ((h - 1 - y) / h) - P * 2);
    case 'hlslice': return (x) => { const sm = smoothstep(-0.5, 0, x / w - P * 1.5); return sm <= fract((10 * x) / w) ? 1 : 0; };
    case 'hrslice': return (x) => { const xx = (w - 1 - x) / w; const sm = smoothstep(-0.5, 0, xx - P * 1.5); return sm <= fract(10 * xx) ? 1 : 0; };
    case 'vuslice': return (_x, y) => { const sm = smoothstep(-0.5, 0, y / h - P * 1.5); return sm <= fract((10 * y) / h) ? 1 : 0; };
    case 'vdslice': return (_x, y) => { const yy = (h - 1 - y) / h; const sm = smoothstep(-0.5, 0, yy - P * 1.5); return sm <= fract(10 * yy) ? 1 : 0; };
    case 'hlwind': case 'hrwind': {
      const rows = new Float32Array(H);
      for (let y = 0; y < H; y++) rows[y] = frand(0, y);
      const left = type === 'hlwind';
      return (x, y) => {
        const fx = left ? 1 - x / W : x / W;
        return 1 - windStep(fx * 0.8 + 0.2 * rows[y] - (1 - P) * 1.2);
      };
    }
    case 'vuwind': case 'vdwind': {
      const cols = new Float32Array(W);
      for (let x = 0; x < W; x++) cols[x] = frand(x, 0);
      const up = type === 'vuwind';
      return (x, y) => {
        const fy = up ? 1 - y / H : y / H;
        return 1 - windStep(fy * 0.8 + 0.2 * cols[x] - (1 - P) * 1.2);
      };
    }
    case 'dissolve': return (x, y) => (frand(x, y) * 2 + P * 2 - 1.5 >= 0.5 ? 1 : 0);
    default: return null;
  }
}
/** smoothstep(0, −0.2, v) из xfade wind. */
function windStep(v: number): number { return ss01(v / -0.2); }

/** Кадр перехода по пикселям: a, b, out — RGBA W×H. P — progress xfade (1 — начало, 0 — конец). */
export function transitionPixels(type: TransitionType, P: number, a: Uint8ClampedArray, b: Uint8ClampedArray, out: Uint8ClampedArray, W: number, H: number): void {
  P = clip01(P);
  const mw = maskWeight(type, P, W, H);
  if (mw) {
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i += 4) {
        const m = mw(x, y);
        out[i] = a[i] * m + b[i] * (1 - m);
        out[i + 1] = a[i + 1] * m + b[i + 1] * (1 - m);
        out[i + 2] = a[i + 2] * m + b[i + 2] * (1 - m);
        out[i + 3] = 255;
      }
    }
    return;
  }
  const copyPx = (o: number, src: Uint8ClampedArray, si: number) => { out[o] = src[si]; out[o + 1] = src[si + 1]; out[o + 2] = src[si + 2]; out[o + 3] = 255; };
  switch (type) {
    case 'coverleft': case 'coverright': {
      const z = trunc((type === 'coverleft' ? -P : P) * W);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const zx = z + x;
        const o = (y * W + x) * 4;
        if (zx >= 0 && zx < W) copyPx(o, b, (y * W + wrapOnce(zx, W)) * 4); else copyPx(o, a, o);
      }
      return;
    }
    case 'coverup': case 'coverdown': {
      const z = trunc((type === 'coverup' ? -P : P) * H);
      for (let y = 0; y < H; y++) {
        const zy = z + y;
        const inB = zy >= 0 && zy < H;
        const zz = wrapOnce(zy, H);
        for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; copyPx(o, inB ? b : a, inB ? (zz * W + x) * 4 : o); }
      }
      return;
    }
    case 'revealleft': case 'revealright': {
      const z = trunc((type === 'revealleft' ? -P : P) * W);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const zx = z + x;
        const o = (y * W + x) * 4;
        if (zx >= 0 && zx < W) copyPx(o, b, o); else copyPx(o, a, (y * W + wrapOnce(zx, W)) * 4);
      }
      return;
    }
    case 'revealup': case 'revealdown': {
      const z = trunc((type === 'revealup' ? -P : P) * H);
      for (let y = 0; y < H; y++) {
        const zy = z + y;
        const inB = zy >= 0 && zy < H;
        const zz = wrapOnce(zy, H);
        for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; copyPx(o, inB ? b : a, inB ? o : (zz * W + x) * 4); }
      }
      return;
    }
    case 'squeezeh': {
      for (let y = 0; y < H; y++) {
        const z = P > 0 ? 0.5 + (y / H - 0.5) / P : -1;
        const fromB = z < 0 || z > 1;
        const yy = Math.round(z * (H - 1));
        for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; copyPx(o, fromB ? b : a, fromB ? o : (yy * W + x) * 4); }
      }
      return;
    }
    case 'squeezev': {
      for (let x = 0; x < W; x++) {
        const z = P > 0 ? 0.5 + (x / W - 0.5) / P : -1;
        const fromB = z < 0 || z > 1;
        const xx = Math.round(z * (W - 1));
        for (let y = 0; y < H; y++) { const o = (y * W + x) * 4; copyPx(o, fromB ? b : a, fromB ? o : (y * W + xx) * 4); }
      }
      return;
    }
    case 'circlecrop': case 'rectcrop': {
      const cx = trunc(W / 2);
      const cy = trunc(H / 2);
      const src = P < 0.5 ? b : a;
      const z = Math.pow(2 * Math.abs(P - 0.5), 3) * Math.hypot(cx, cy);
      const zh = trunc(Math.abs(P - 0.5) * H);
      const zw = trunc(Math.abs(P - 0.5) * W);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        const inside = type === 'circlecrop' ? !(z < Math.hypot(x - cx, y - cy)) : Math.abs(x - cx) < zw && Math.abs(y - cy) < zh;
        if (inside) copyPx(o, src, o); else { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 255; }
      }
      return;
    }
    case 'pixelize': {
      const d = Math.min(P, 1 - P);
      const dist = Math.ceil(d * 50) / 50;
      const sq = (2 * dist * Math.min(W, H)) / 20;
      for (let y = 0; y < H; y++) {
        const sy = dist > 0 ? trunc(Math.min((Math.floor(y / sq) + 0.5) * sq, H - 1)) : y;
        for (let x = 0; x < W; x++) {
          const sx = dist > 0 ? trunc(Math.min((Math.floor(x / sq) + 0.5) * sq, W - 1)) : x;
          const o = (y * W + x) * 4;
          const si = (sy * W + sx) * 4;
          out[o] = a[si] * P + b[si] * (1 - P);
          out[o + 1] = a[si + 1] * P + b[si + 1] * (1 - P);
          out[o + 2] = a[si + 2] * P + b[si + 2] * (1 - P);
          out[o + 3] = 255;
        }
      }
      return;
    }
    case 'hblur': {
      const prog = P <= 0.5 ? P * 2 : (1 - P) * 2;
      const size = trunc(1 + (trunc(W / 2)) * prog);
      for (let y = 0; y < H; y++) {
        const row = y * W * 4;
        for (let c = 0; c < 3; c++) {
          let s0 = 0;
          let s1 = 0;
          let cnt = size;
          for (let x = 0; x < size; x++) { s0 += a[row + x * 4 + c]; s1 += b[row + x * 4 + c]; }
          for (let x = 0; x < W; x++) {
            out[row + x * 4 + c] = (s0 / cnt) * P + (s1 / cnt) * (1 - P);
            if (x + size < W) { s0 += a[row + (x + size) * 4 + c] - a[row + x * 4 + c]; s1 += b[row + (x + size) * 4 + c] - b[row + x * 4 + c]; }
            else { s0 -= a[row + x * 4 + c]; s1 -= b[row + x * 4 + c]; cnt--; }
          }
        }
        for (let x = 0; x < W; x++) out[row + x * 4 + 3] = 255;
      }
      return;
    }
    case 'fadegrays': {
      const k1 = smoothstep(0.8, 1, P);
      const k2 = smoothstep(0.2, 1, P);
      for (let i = 0; i < a.length; i += 4) {
        const ga = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
        const gb = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
        for (let c = 0; c < 3; c++) {
          const left = a[i + c] * k1 + ga * (1 - k1);
          const right = gb * k2 + b[i + c] * (1 - k2);
          out[i + c] = left * P + right * (1 - P);
        }
        out[i + 3] = 255;
      }
      return;
    }
    case 'distance': {
      for (let i = 0; i < a.length; i += 4) {
        const ya = toYuv(a[i], a[i + 1], a[i + 2]);
        const yb = toYuv(b[i], b[i + 1], b[i + 2]);
        const d = Math.sqrt(((ya[0] - yb[0]) / 255) ** 2 + ((ya[1] - yb[1]) / 255) ** 2 + ((ya[2] - yb[2]) / 255) ** 2) <= P ? 1 : 0;
        for (let c = 0; c < 3; c++) {
          const inner = a[i + c] * d + b[i + c] * (1 - d);
          out[i + c] = inner * P + b[i + c] * (1 - P);
        }
        out[i + 3] = 255;
      }
      return;
    }
    case 'fadefast': case 'fadeslow': {
      const fast = type === 'fadefast';
      for (let i = 0; i < a.length; i += 4) {
        const ya = toYuv(a[i], a[i + 1], a[i + 2]);
        const yb = toYuv(b[i], b[i + 1], b[i + 2]);
        const m: number[] = [0, 0, 0];
        for (let c = 0; c < 3; c++) {
          const diff = Math.abs(ya[c] - yb[c]) / 255;
          const k = Math.pow(P, 1 + Math.log(fast ? 1 + diff : 2 - diff));
          m[c] = ya[c] * k + yb[c] * (1 - k);
        }
        const rgb = fromYuv(m[0], m[1], m[2]);
        out[i] = rgb[0]; out[i + 1] = rgb[1]; out[i + 2] = rgb[2]; out[i + 3] = 255;
      }
      return;
    }
    default:
      out.set(b);
  }
}
