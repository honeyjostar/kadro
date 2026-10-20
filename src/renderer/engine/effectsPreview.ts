// Видеоэффекты в превью: те же параметры и порядок, что и в экспорте (shared/effects.ts).
import {
  SPLIT_EFFECTS, blurSigma, flashDuration, fxMatrixAt, glowOpacity, glowSigma, hueMatrix, leakBytes, leakOffset,
  leakOpacity, letterboxBar, lookKey, lookTable, pixelBlock, rainbowAngle, rgbShiftAt, scanlines, sortedEffects, splitLayout, vignetteBytes,
} from '../../shared/effects';
import { saturateMatrix } from '../../shared/color';
import { GRADE_N, applyTable } from '../../shared/grade';
import type { MediaClip } from '../../shared/types';

/** Как применить цветовую таблицу к слою (видеокарта); без неё — на процессоре. */
export type TableApplier = (layer: HTMLCanvasElement, key: string, table: Uint8Array) => void;
const lookCache = new Map<string, Uint8Array>();
function lookFor(key: string, c: MediaClip): Uint8Array {
  let t = lookCache.get(key);
  if (!t) { if (lookCache.size > 16) lookCache.clear(); t = lookTable(c.effects, GRADE_N); lookCache.set(key, t); }
  return t;
}
function cpuTable(layer: HTMLCanvasElement, _key: string, t: Uint8Array): void {
  const lc = layer.getContext('2d', { willReadFrequently: true })!;
  const img = lc.getImageData(0, 0, layer.width, layer.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const o = applyTable(t, GRADE_N, d[i], d[i + 1], d[i + 2]);
    d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2];
  }
  lc.putImageData(img, 0, 0);
}

/** Размытие с продлением краёв (как gblur в FFmpeg): в dst того же размера. */
function blurInto(src: HTMLCanvasElement, sg: number, dstKey: string): HTMLCanvasElement {
  const w = src.width; const h = src.height;
  const m = Math.ceil(sg * 3);
  const ext = temp(`${dstKey}:ext`, w + 2 * m, h + 2 * m);
  const ec = ctxOf(ext);
  ec.globalCompositeOperation = 'copy';
  ec.drawImage(src, m, m);
  ec.globalCompositeOperation = 'source-over';
  ec.drawImage(src, 0, 0, 1, h, 0, m, m, h);
  ec.drawImage(src, w - 1, 0, 1, h, m + w, m, m, h);
  ec.drawImage(src, 0, 0, w, 1, m, 0, w, m);
  ec.drawImage(src, 0, h - 1, w, 1, m, m + h, w, m);
  ec.drawImage(src, 0, 0, 1, 1, 0, 0, m, m);
  ec.drawImage(src, w - 1, 0, 1, 1, m + w, 0, m, m);
  ec.drawImage(src, 0, h - 1, 1, 1, 0, m + h, m, m);
  ec.drawImage(src, w - 1, h - 1, 1, 1, m + w, m + h, m, m);
  const dst = temp(dstKey, w, h);
  const dc = ctxOf(dst);
  dc.globalCompositeOperation = 'copy';
  dc.filter = `blur(${sg}px)`;
  dc.drawImage(ext, -m, -m);
  dc.filter = 'none';
  return dst;
}

const leakCache = new Map<string, HTMLCanvasElement>();
function leakCanvas(w: number, h: number): HTMLCanvasElement {
  const key = `${w}x${h}`;
  let c = leakCache.get(key);
  if (c) return c;
  if (leakCache.size > 6) leakCache.clear();
  c = document.createElement('canvas');
  c.width = 2 * w; c.height = h;
  const rgb = leakBytes(w, h);
  const img = new ImageData(2 * w, h);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) { img.data[j] = rgb[i]; img.data[j + 1] = rgb[i + 1]; img.data[j + 2] = rgb[i + 2]; img.data[j + 3] = 255; }
  c.getContext('2d')!.putImageData(img, 0, 0);
  leakCache.set(key, c);
  return c;
}

type C2D = CanvasRenderingContext2D;

const temps = new Map<string, HTMLCanvasElement>();
function temp(key: string, w: number, h: number): HTMLCanvasElement {
  let c = temps.get(key);
  if (!c) { c = document.createElement('canvas'); temps.set(key, c); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}
function ctxOf(c: HTMLCanvasElement): C2D {
  return c.getContext('2d', { willReadFrequently: true })!;
}
function copyOf(src: HTMLCanvasElement): HTMLCanvasElement {
  const t = temp('copy', src.width, src.height);
  const tc = ctxOf(t);
  tc.globalCompositeOperation = 'copy';
  tc.filter = 'none';
  tc.drawImage(src, 0, 0);
  return t;
}

/** Цветовая матрица 3×3 на пикселях (как colorchannelmixer: с обрезкой 0..255). */
function mixMatrix(d: Uint8ClampedArray, m: number[][]): void {
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]; const g = d[i + 1]; const b = d[i + 2];
    d[i] = m[0][0] * r + m[0][1] * g + m[0][2] * b;
    d[i + 1] = m[1][0] * r + m[1][1] * g + m[1][2] * b;
    d[i + 2] = m[2][0] * r + m[2][1] * g + m[2][2] * b;
  }
}
/** Сдвиг каналов (как rgbashift с edge=smear). */
function shift(d: Uint8ClampedArray, w: number, h: number, rh: number, bh: number, gv: number): void {
  if (!rh && !bh && !gv) return;
  const src = new Uint8ClampedArray(d);
  const cx = (x: number) => (x < 0 ? 0 : x >= w ? w - 1 : x);
  const cy = (y: number) => (y < 0 ? 0 : y >= h ? h - 1 : y);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      d[i] = src[(y * w + cx(x - rh)) * 4];
      d[i + 1] = src[(cy(y - gv) * w + x) * 4 + 1];
      d[i + 2] = src[(y * w + cx(x - bh)) * 4 + 2];
    }
  }
}

const vigCache = new Map<string, HTMLCanvasElement>();
function vignetteCanvas(w: number, h: number, amount: number): HTMLCanvasElement {
  const key = `${w}x${h}:${amount.toFixed(3)}`;
  let c = vigCache.get(key);
  if (c) return c;
  if (vigCache.size > 8) vigCache.clear();
  c = document.createElement('canvas');
  c.width = w; c.height = h;
  const bytes = vignetteBytes(w, h, amount);
  const img = new ImageData(w, h);
  for (let i = 0; i < bytes.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = bytes[i]; img.data[i * 4 + 3] = 255; }
  c.getContext('2d')!.putImageData(img, 0, 0);
  vigCache.set(key, c);
  return c;
}

/** Применяет эффекты к слою (canvas размера w × h) в момент local (сек от начала клипа). */
export function applyPixelEffects(layer: HTMLCanvasElement, c: MediaClip, local: number, tableApplier: TableApplier = cpuTable, isMain = false): void {
  // у клипа основной дорожки кино-полосы рисуются по краям кадра (drawMainBars), а не слоя
  const list = sortedEffects(c.effects).filter((e) => !(isMain && e.type === 'letterbox'));
  if (!list.length) return;
  let lookDone = false;
  let matrixDone = false;
  const w = layer.width;
  const h = layer.height;
  const lc = ctxOf(layer);
  lc.save();
  const glitch = list.find((e) => e.type === 'glitch');
  for (const e of list) {
    const a = e.amount;
    switch (e.type) {
      case 'mirror': {
        const t = copyOf(layer);
        const half = Math.floor(w / 2);
        lc.globalCompositeOperation = 'copy';
        lc.drawImage(t, 0, 0);
        lc.globalCompositeOperation = 'source-over';
        lc.save();
        lc.beginPath(); lc.rect(half, 0, w - half, h); lc.clip();
        lc.clearRect(half, 0, w - half, h);
        lc.translate(w, 0); lc.scale(-1, 1);
        lc.drawImage(t, 0, 0);
        lc.restore();
        break;
      }
      case 'mirrorv': {
        const t = copyOf(layer);
        const half = Math.floor(h / 2);
        lc.globalCompositeOperation = 'copy';
        lc.drawImage(t, 0, 0);
        lc.globalCompositeOperation = 'source-over';
        lc.save();
        lc.beginPath(); lc.rect(0, half, w, h - half); lc.clip();
        lc.clearRect(0, half, w, h - half);
        lc.translate(0, h); lc.scale(1, -1);
        lc.drawImage(t, 0, 0);
        lc.restore();
        break;
      }
      case 'kaleido': {
        const t = copyOf(layer);
        const qw = Math.floor(w / 2);
        const qh = Math.floor(h / 2);
        lc.globalCompositeOperation = 'copy';
        lc.drawImage(t, 0, 0);
        lc.globalCompositeOperation = 'source-over';
        // правая половина — левая, отражённая; нижняя — верхняя, отражённая
        const quad = (dx: number, dy: number, dw: number, dh: number, fx: boolean, fy: boolean) => {
          lc.save();
          lc.beginPath(); lc.rect(dx, dy, dw, dh); lc.clip();
          lc.clearRect(dx, dy, dw, dh);
          lc.translate(fx ? w : 0, fy ? h : 0);
          lc.scale(fx ? -1 : 1, fy ? -1 : 1);
          lc.drawImage(t, 0, 0);
          lc.restore();
        };
        quad(qw, 0, w - qw, qh, true, false);
        quad(0, qh, qw, h - qh, false, true);
        quad(qw, qh, w - qw, h - qh, true, true);
        break;
      }
      case 'split2': case 'split3': case 'split4': case 'split9': {
        if (list.some((x) => SPLIT_EFFECTS.includes(x.type) && x !== e && SPLIT_EFFECTS.indexOf(x.type) < SPLIT_EFFECTS.indexOf(e.type))) break; // только одна сетка
        const L = splitLayout(e.type, w, h, a);
        const t = copyOf(layer);
        const tile = temp('splittile', L.tw, L.th);
        const tc = ctxOf(tile);
        tc.globalCompositeOperation = 'copy';
        tc.imageSmoothingQuality = 'high';
        tc.drawImage(t, 0, 0, w, h, -L.cx, -L.cy, L.sw, L.sh);
        const grid = temp('splitgrid', L.cols * L.tw, L.rows * L.th);
        const gc = ctxOf(grid);
        gc.globalCompositeOperation = 'copy';
        for (let j = 0; j < L.rows; j++) for (let i = 0; i < L.cols; i++) {
          gc.drawImage(tile, i * L.tw, j * L.th);
          gc.globalCompositeOperation = 'source-over';
        }
        lc.globalCompositeOperation = 'copy';
        lc.imageSmoothingQuality = 'high';
        lc.drawImage(grid, 0, 0, grid.width, grid.height, 0, 0, w, h);
        if (L.gapF > 0.05) {
          lc.globalCompositeOperation = 'source-over';
          lc.fillStyle = '#000';
          for (let i = 1; i < L.cols; i++) lc.fillRect(i * L.tw - L.gapF / 2, 0, L.gapF, h);
          for (let j = 1; j < L.rows; j++) lc.fillRect(0, j * L.th - L.gapF / 2, w, L.gapF);
        }
        break;
      }
      case 'oldfilm': case 'comic': case 'duotone': case 'noir': case 'cyber': case 'thermal': case 'nightvision': case 'solarize': {
        if (lookDone) break;
        lookDone = true;
        const key = `look:${lookKey(c.effects)}`;
        tableApplier(layer, key, lookFor(key, c));
        break;
      }
      case 'colorpulse': case 'bwflash': case 'strobe': case 'flicker': {
        if (matrixDone) break;
        matrixDone = true;
        const m = fxMatrixAt(c.effects, local);
        if (!m) break;
        const img = lc.getImageData(0, 0, w, h);
        mixMatrix(img.data, m);
        lc.putImageData(img, 0, 0);
        break;
      }
      case 'glow': {
        const t = copyOf(layer);
        const bl = blurInto(t, glowSigma(w), 'glow');
        lc.globalCompositeOperation = 'screen';
        lc.globalAlpha = glowOpacity(a);
        lc.drawImage(bl, 0, 0);
        lc.globalAlpha = 1;
        lc.globalCompositeOperation = 'destination-in';
        lc.drawImage(t, 0, 0);
        break;
      }
      case 'lightleak': {
        const t = copyOf(layer);
        lc.globalCompositeOperation = 'screen';
        lc.globalAlpha = leakOpacity(a);
        lc.drawImage(leakCanvas(w, h), leakOffset(w, local), 0, w, h, 0, 0, w, h);
        lc.globalAlpha = 1;
        lc.globalCompositeOperation = 'destination-in';
        lc.drawImage(t, 0, 0);
        break;
      }
      case 'letterbox': {
        const bar = letterboxBar(h, a);
        lc.globalCompositeOperation = 'source-over';
        lc.fillStyle = '#000';
        lc.fillRect(0, 0, w, bar);
        lc.fillRect(0, h - bar, w, bar);
        break;
      }
      case 'pixelate': {
        const b = pixelBlock(w, a);
        const sw = Math.ceil(w / b);
        const sh = Math.ceil(h / b);
        const s = temp('pix', sw, sh);
        const sc = ctxOf(s);
        sc.globalCompositeOperation = 'copy';
        sc.imageSmoothingEnabled = true;
        sc.imageSmoothingQuality = 'high';
        sc.clearRect(0, 0, sw, sh);
        sc.drawImage(layer, 0, 0, w, h, 0, 0, w / b, h / b);
        lc.globalCompositeOperation = 'copy';
        lc.imageSmoothingEnabled = false;
        lc.drawImage(s, 0, 0, w / b, h / b, 0, 0, w, h);
        lc.imageSmoothingEnabled = true;
        break;
      }
      case 'blur': {
        const sg = blurSigma(w, a);
        if (sg < 0.1) break;
        // края продлеваем, как FFmpeg (иначе в превью края темнеют)
        const bl = blurInto(layer, sg, 'blur');
        lc.globalCompositeOperation = 'copy';
        lc.drawImage(bl, 0, 0);
        break;
      }
      case 'invert': {
        const t = copyOf(layer);
        lc.globalCompositeOperation = 'copy';
        lc.filter = `invert(${a})`;
        lc.drawImage(t, 0, 0);
        lc.filter = 'none';
        break;
      }
      case 'rainbow': {
        const img = lc.getImageData(0, 0, w, h);
        mixMatrix(img.data, hueMatrix(rainbowAngle(e, local)));
        lc.putImageData(img, 0, 0);
        break;
      }
      case 'vhs': {
        const img = lc.getImageData(0, 0, w, h);
        mixMatrix(img.data, saturateMatrix(1 - 0.35 * a));
        const d = Math.max(1, Math.round(w * 0.004 * (0.5 + a)));
        shift(img.data, w, h, -d, d, 0);
        lc.putImageData(img, 0, 0);
        lc.globalCompositeOperation = 'source-atop';
        lc.fillStyle = `rgba(0,0,0,${0.3 * a})`;
        const sl = scanlines(h);
        for (let y = 0; y < h; y += sl.period) lc.fillRect(0, y, w, sl.thick);
        break;
      }
      case 'rgbsplit':
      case 'glitch': {
        if (e.type === 'rgbsplit' && glitch) break;
        const s = rgbShiftAt(c.effects, w, glitch ? Math.floor(local * 30 + 1e-6) : 0);
        const img = lc.getImageData(0, 0, w, h);
        shift(img.data, w, h, s.rh, s.bh, s.gv);
        lc.putImageData(img, 0, 0);
        break;
      }
      case 'vignette': {
        const t = copyOf(layer);
        lc.globalCompositeOperation = 'multiply';
        lc.drawImage(vignetteCanvas(w, h, a), 0, 0);
        lc.globalCompositeOperation = 'destination-in';
        lc.drawImage(t, 0, 0);
        break;
      }
      case 'grain': {
        const st = Math.max(1, Math.round(18 * a));
        const img = lc.getImageData(0, 0, w, h);
        const dd = img.data;
        for (let i = 0; i < dd.length; i += 4) {
          dd[i] += (Math.random() * 2 - 1) * st;
          dd[i + 1] += (Math.random() * 2 - 1) * st;
          dd[i + 2] += (Math.random() * 2 - 1) * st;
        }
        lc.putImageData(img, 0, 0);
        break;
      }
      case 'flash': {
        const D = flashDuration(a);
        if (local >= D) break;
        lc.globalCompositeOperation = 'source-atop';
        lc.fillStyle = `rgba(255,255,255,${1 - Math.max(0, local) / D})`;
        lc.fillRect(0, 0, w, h);
        break;
      }
    }
    lc.globalCompositeOperation = 'source-over';
  }
  lc.restore();
}

/** Кино-полосы клипа основной дорожки — по краям кадра (как в экспорте): при заполнении кадра края слоя обрезаны. */
export function drawMainBars(ctx: CanvasRenderingContext2D, c: MediaClip, W: number, H: number): void {
  const lb = c.effects?.find((e) => e.type === 'letterbox' && e.amount > 0);
  if (!lb) return;
  const bar = letterboxBar(H, lb.amount);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
  ctx.restore();
}
