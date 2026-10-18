// Видеоэффекты в превью: те же параметры и порядок, что и в экспорте (shared/effects.ts).
import { blurSigma, flashDuration, hueMatrix, pixelBlock, rainbowAngle, rgbShiftAt, scanlineStep, sortedEffects, vignetteBytes } from '../../shared/effects';
import { saturateMatrix } from '../../shared/color';
import type { MediaClip } from '../../shared/types';

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
export function applyPixelEffects(layer: HTMLCanvasElement, c: MediaClip, local: number): void {
  const list = sortedEffects(c.effects);
  if (!list.length) return;
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
        const m = Math.ceil(sg * 3);
        const ext = temp('blurext', w + 2 * m, h + 2 * m);
        const ec = ctxOf(ext);
        ec.globalCompositeOperation = 'copy';
        ec.drawImage(layer, m, m);
        ec.globalCompositeOperation = 'source-over';
        ec.drawImage(layer, 0, 0, 1, h, 0, m, m, h);
        ec.drawImage(layer, w - 1, 0, 1, h, m + w, m, m, h);
        ec.drawImage(layer, 0, 0, w, 1, m, 0, w, m);
        ec.drawImage(layer, 0, h - 1, w, 1, m, m + h, w, m);
        ec.drawImage(layer, 0, 0, 1, 1, 0, 0, m, m);
        ec.drawImage(layer, w - 1, 0, 1, 1, m + w, 0, m, m);
        ec.drawImage(layer, 0, h - 1, 1, 1, 0, m + h, m, m);
        ec.drawImage(layer, w - 1, h - 1, 1, 1, m + w, m + h, m, m);
        lc.globalCompositeOperation = 'copy';
        lc.filter = `blur(${sg}px)`;
        lc.drawImage(ext, -m, -m);
        lc.filter = 'none';
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
        const step = scanlineStep(h);
        for (let y = 0; y < h; y += step) lc.fillRect(0, y, w, 1);
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
