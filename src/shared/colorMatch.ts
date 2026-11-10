// «Цвет как у другого клипа»: средний цвет и контраст кадров клипа-образца переносятся на выбранный клип
// (перенос статистики в пространстве Lab, как у Рейнхарда). Результат — обычный LUT (.cube): виден в плеере,
// попадает в экспорт, сила регулируется ползунком LUT. Здесь — только чистая математика.

export interface LabStats { mean: [number, number, number]; std: [number, number, number] }

const srgbToLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linToSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const Xn = 0.95047; const Zn = 1.08883;
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const fi = (t: number) => (t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27));

/** sRGB 0..1 → Lab (D65). */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLin(r); const G = srgbToLin(g); const B = srgbToLin(b);
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / Xn;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / Zn;
  const fx = f(x); const fy = f(y); const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Lab → sRGB 0..1 (за пределами — обрезается). */
export function labToRgb(L: number, a: number, bb: number): [number, number, number] {
  const fy = (L + 16) / 116; const fx = fy + a / 500; const fz = fy - bb / 200;
  const x = fi(fx) * Xn; const y = fi(fy); const z = fi(fz) * Zn;
  const R = 3.2406 * x - 1.5372 * y - 0.4986 * z;
  const G = -0.9689 * x + 1.8758 * y + 0.0415 * z;
  const B = 0.0557 * x - 0.204 * y + 1.057 * z;
  const c = (v: number) => Math.min(1, Math.max(0, linToSrgb(Math.max(0, v))));
  return [c(R), c(G), c(B)];
}

/** Средние и разброс Lab по пикселям (RGB по 3 байта подряд). */
export function labStats(rgb: Uint8Array | number[]): LabStats {
  const n = Math.floor(rgb.length / 3);
  const s = [0, 0, 0]; const q = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const l = rgbToLab(rgb[i * 3] / 255, rgb[i * 3 + 1] / 255, rgb[i * 3 + 2] / 255);
    for (let k = 0; k < 3; k++) { s[k] += l[k]; q[k] += l[k] * l[k]; }
  }
  const mean = s.map((v) => v / Math.max(1, n)) as [number, number, number];
  const std = q.map((v, k) => Math.sqrt(Math.max(0, v / Math.max(1, n) - mean[k] * mean[k]))) as [number, number, number];
  return { mean, std };
}

/** Перенос: насколько можно растянуть или сжать разброс (чтобы серый кадр не превратился в кислотный). */
const RATIO: [number, number] = [0.6, 1.6];
const ratio = (r: number, t: number) => Math.min(RATIO[1], Math.max(RATIO[0], t > 1e-3 ? r / t : 1));

/** Цвет пикселя после переноса со статистики tgt (клип) на ref (образец). */
export function transferColor(rgb: [number, number, number], tgt: LabStats, ref: LabStats): [number, number, number] {
  const lab = rgbToLab(...rgb);
  const out = lab.map((v, k) => (v - tgt.mean[k]) * ratio(ref.std[k], tgt.std[k]) + ref.mean[k]) as [number, number, number];
  return labToRgb(...out);
}

/** LUT .cube (size³ точек, красный меняется быстрее всех), который переводит цвета клипа в цвета образца. */
export function matchLut(tgt: LabStats, ref: LabStats, title: string, size = 33): string {
  const lines = [`TITLE "${title.replace(/"/g, "'").slice(0, 60)}"`, `LUT_3D_SIZE ${size}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
  const n = size - 1;
  for (let b = 0; b <= n; b++) {
    for (let g = 0; g <= n; g++) {
      for (let r = 0; r <= n; r++) {
        const o = transferColor([r / n, g / n, b / n], tgt, ref);
        lines.push(o.map((v) => v.toFixed(5)).join(' '));
      }
    }
  }
  return `${lines.join('\n')}\n`;
}
