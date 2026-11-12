// Обложка для YouTube и TikTok в один клик: из ролика берутся кадры, выбираются резкие, светлые и сочные,
// разные между собой; сверху — крупный заголовок, одно слово выделено цветом.

export type CoverFormat = 'youtube' | 'vertical';
export const COVER_SIZES: Record<CoverFormat, { w: number; h: number }> = {
  youtube: { w: 1280, h: 720 },   // YouTube, RuTube, Дзен, ВК Видео
  vertical: { w: 1080, h: 1920 }, // TikTok, Shorts, Reels, ВК Клипы
};

export type CoverStyle = 'bright' | 'clean' | 'plate';

export interface FrameStats {
  /** резкость: дисперсия лапласиана яркости (0..~5000) */
  sharp: number;
  /** средняя яркость 0..1 */
  light: number;
  /** контраст: разброс яркости 0..0.5 */
  contrast: number;
  /** сочность цвета (Hasler & Süsstrunk), 0..~1 */
  color: number;
  /** «отпечаток» 8×8 по яркости — чтобы не показывать почти одинаковые кадры */
  sig: number[];
}

/** Оценка кадра по пикселям RGBA (маленькая копия, ~160 px по ширине). */
export function frameStats(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): FrameStats {
  const n = w * h;
  const Y = new Float32Array(n);
  let sum = 0, sum2 = 0, rgM = 0, ybM = 0, rg2 = 0, yb2 = 0;
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4] / 255, g = rgba[i * 4 + 1] / 255, b = rgba[i * 4 + 2] / 255;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    Y[i] = y; sum += y; sum2 += y * y;
    const rg = r - g, yb = 0.5 * (r + g) - b;
    rgM += rg; ybM += yb; rg2 += rg * rg; yb2 += yb * yb;
  }
  const light = sum / n;
  const contrast = Math.sqrt(Math.max(0, sum2 / n - light * light));
  rgM /= n; ybM /= n;
  const sRg = Math.sqrt(Math.max(0, rg2 / n - rgM * rgM)), sYb = Math.sqrt(Math.max(0, yb2 / n - ybM * ybM));
  const color = Math.sqrt(sRg * sRg + sYb * sYb) + 0.3 * Math.sqrt(rgM * rgM + ybM * ybM);
  let lap = 0, lap2 = 0, m = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = (4 * Y[i] - Y[i - 1] - Y[i + 1] - Y[i - w] - Y[i + w]) * 255;
      lap += v; lap2 += v * v; m++;
    }
  }
  const sharp = m ? Math.max(0, lap2 / m - (lap / m) ** 2) : 0;
  const sig: number[] = [];
  for (let by = 0; by < 8; by++) {
    for (let bx = 0; bx < 8; bx++) {
      let s = 0, c = 0;
      for (let y = Math.floor((by * h) / 8); y < Math.floor(((by + 1) * h) / 8); y++) {
        for (let x = Math.floor((bx * w) / 8); x < Math.floor(((bx + 1) * w) / 8); x++) { s += Y[y * w + x]; c++; }
      }
      sig.push(c ? s / c : 0);
    }
  }
  return { sharp, light, contrast, color, sig };
}

/** Насколько кадр годится на обложку: резкий, не тёмный и не пересвеченный, контрастный, сочный. */
export function frameScore(s: FrameStats): number {
  const sharp = Math.log10(1 + s.sharp) / 3.5;                        // ~0..1
  const exposure = 1 - Math.min(1, Math.abs(s.light - 0.5) / 0.4);    // лучше всего — средняя яркость
  const dark = s.light < 0.12 || s.light > 0.92 ? -1 : 0;             // почти чёрный или белый кадр (затемнение, вспышка)
  return 1.2 * sharp + 0.8 * exposure + 1.5 * Math.min(0.35, s.contrast) + 0.8 * Math.min(0.6, s.color) + dark;
}

/** Различие двух кадров по «отпечатку» (средняя разница яркости 0..1). */
export function sigDistance(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

/** Лучшие n кадров, заметно отличающихся друг от друга. */
export function pickFrames<T extends { stats: FrameStats }>(frames: T[], n: number, minDiff = 0.06): T[] {
  const sorted = [...frames].sort((a, b) => frameScore(b.stats) - frameScore(a.stats));
  const out: T[] = [];
  for (const f of sorted) {
    if (out.length >= n) break;
    if (out.every((o) => sigDistance(o.stats.sig, f.stats.sig) >= minDiff)) out.push(f);
  }
  for (const f of sorted) { if (out.length >= n) break; if (!out.includes(f)) out.push(f); }
  return out;
}

/** Слово, которое выделить цветом: отмеченное *звёздочками*, иначе самое длинное (от 4 букв). */
export function accentWord(title: string): { words: string[]; accent: number } {
  const raw = title.trim().split(/\s+/).filter(Boolean);
  let accent = raw.findIndex((w) => /^\*.+\*$/.test(w));
  const words = raw.map((w) => w.replace(/^\*(.+)\*$/, '$1'));
  if (accent < 0) {
    let best = -1, len = 3;
    words.forEach((w, i) => { const l = w.replace(/[^\p{L}\p{N}]/gu, '').length; if (l > len) { len = l; best = i; } });
    accent = best;
  }
  return { words, accent };
}

/**
 * Раскладка заголовка: строки и размер шрифта, чтобы текст занял ширину maxW, не больше maxLines строк
 * и не выше maxH. measure(text, size) — ширина строки в пикселях.
 */
export function layoutTitle(words: string[], maxW: number, maxH: number, maxLines: number, measure: (t: string, size: number) => number, maxSize = 220, minSize = 24): { lines: number[][]; size: number } {
  const lineH = 1.08;
  const breakLines = (size: number): number[][] | null => {
    const lines: number[][] = [];
    let cur: number[] = [];
    for (let i = 0; i < words.length; i++) {
      const next = [...cur, i];
      if (cur.length && measure(next.map((k) => words[k]).join(' '), size) > maxW) { lines.push(cur); cur = [i]; }
      else cur = next;
      if (measure(words[i], size) > maxW) return null; // одно слово не влезает
    }
    if (cur.length) lines.push(cur);
    return lines.length <= maxLines && lines.length * size * lineH <= maxH ? lines : null;
  };
  let lo = minSize, hi = maxSize, best: number[][] | null = breakLines(minSize);
  let size = minSize;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const l = breakLines(mid);
    if (l) { lo = mid; best = l; size = mid; } else hi = mid;
  }
  if (!best) best = [words.map((_, i) => i)];
  return { lines: best, size };
}
