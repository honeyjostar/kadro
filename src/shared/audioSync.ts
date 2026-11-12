// Синхронизация камер по звуку: две записи одного события слышат одно и то же — ищем сдвиг, при котором
// «всплески» громкости (хлопок, слово, удар) совпадают лучше всего. Звук сравнивается целиком, через БПФ.

/** Точек огибающей в секунду (шаг 5 мс) — точнее кадра при 30 и 60 кадрах/с. */
export const ENV_RATE = 200;

/** Огибающая «начал звуков»: рост лог-энергии в окне 10 мс с шагом 1/rate с; среднее 0, разброс 1. */
export function onsetEnvelope(samples: Float32Array, sr: number, rate = ENV_RATE): Float32Array {
  const hop = Math.max(1, Math.round(sr / rate));
  const win = hop * 2;
  const n = samples.length >= win ? Math.floor((samples.length - win) / hop) + 1 : 0;
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * hop;
    for (let j = 0; j < win; j++) { const v = samples[o + j]; s += v * v; }
    e[i] = Math.log10(s / win + 1e-9);
  }
  const out = new Float32Array(n);
  for (let i = 1; i < n; i++) out[i] = Math.max(0, e[i] - e[i - 1]);
  return standardize(out);
}

function standardize(x: Float32Array): Float32Array {
  if (!x.length) return x;
  let m = 0;
  for (const v of x) m += v;
  m /= x.length;
  let sd = 0;
  for (const v of x) sd += (v - m) ** 2;
  sd = Math.sqrt(sd / x.length) || 1;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = (x[i] - m) / sd;
  return out;
}

/** Быстрое преобразование Фурье на месте (длина — степень двойки). inverse — обратное, без деления на n. */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI) / len * (inverse ? 1 : -1);
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

export interface SyncResult {
  /** Сдвиг в секундах: то, что в записи a звучит в момент t, в записи b звучит в t + lag. */
  lag: number;
  /** Насколько пик совпадения выше остальных сдвигов, в стандартных отклонениях (общего звука нет — около 4–5). */
  confidence: number;
  /** Сама корреляция в пике (0..1). */
  corr: number;
}

/** Ищет сдвиг между огибающими a и b (одной частоты rate). maxLag — в секундах, по умолчанию любой. */
export function findLag(a: Float32Array, b: Float32Array, rate = ENV_RATE, maxLag = Infinity): SyncResult | null {
  if (a.length < rate || b.length < rate) return null; // меньше секунды — не с чем сравнивать
  let n = 1;
  while (n < a.length + b.length) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(a); br.set(b);
  fft(ar, ai, false);
  fft(br, bi, false);
  // взаимная корреляция: conj(A)·B → c[k] = Σ a[t]·b[t+k]
  for (let i = 0; i < n; i++) {
    const r = ar[i] * br[i] + ai[i] * bi[i];
    const m = ar[i] * bi[i] - ai[i] * br[i];
    ar[i] = r; ai[i] = m;
  }
  fft(ar, ai, true);
  const lim = Math.min(Math.floor(maxLag * rate), n / 2 - 1);
  // нормированная корреляция (как коэффициент Пирсона) на участке, где записи перекрываются:
  // не зависит ни от длины перекрытия, ни от громкости
  const pa = new Float64Array(a.length + 1), pa2 = new Float64Array(a.length + 1);
  for (let i = 0; i < a.length; i++) { pa[i + 1] = pa[i] + a[i]; pa2[i + 1] = pa2[i] + a[i] * a[i]; }
  const pb = new Float64Array(b.length + 1), pb2 = new Float64Array(b.length + 1);
  for (let i = 0; i < b.length; i++) { pb[i + 1] = pb[i] + b[i]; pb2[i + 1] = pb2[i] + b[i] * b[i]; }
  const minOverlap = Math.max(2 * rate, Math.round(0.2 * Math.min(a.length, b.length)));
  const ncc = (k: number): number => {
    const t0 = Math.max(0, -k), t1 = Math.min(a.length, b.length - k);
    const m = t1 - t0;
    if (m < minOverlap) return NaN;
    const sa = pa[t1] - pa[t0], saa = pa2[t1] - pa2[t0];
    const sb = pb[t1 + k] - pb[t0 + k], sbb = pb2[t1 + k] - pb2[t0 + k];
    const sab = ar[(k + n) % n] / n;
    const den = Math.sqrt(Math.max(1e-12, (saa - (sa * sa) / m) * (sbb - (sb * sb) / m)));
    return (sab - (sa * sb) / m) / den;
  };
  const k0 = -Math.min(lim, a.length), k1 = Math.min(lim, b.length);
  const vals = new Float64Array(k1 - k0 + 1);
  let best = 0, bestS = -Infinity, sum = 0, sum2 = 0, cnt = 0;
  for (let k = k0; k <= k1; k++) {
    const v = ncc(k);
    vals[k - k0] = v;
    if (Number.isNaN(v)) continue;
    sum += v; sum2 += v * v; cnt++;
    if (v > bestS) { bestS = v; best = k; }
  }
  if (!cnt || !Number.isFinite(bestS)) return null;
  // уверенность — насколько пик выше «шума» корреляции на остальных сдвигах (в стандартных отклонениях)
  const mean = sum / cnt;
  const sd = Math.sqrt(Math.max(1e-12, sum2 / cnt - mean * mean));
  // уточнение между точками: парабола через три соседние
  const y0 = vals[best - 1 - k0], y1 = bestS, y2 = vals[best + 1 - k0];
  let frac = 0;
  if (Number.isFinite(y0) && Number.isFinite(y2) && y0 - 2 * y1 + y2 < 0) frac = Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2)));
  return { lag: (best + frac) / rate, confidence: (bestS - mean) / sd, corr: bestS };
}

/** Порог уверенности (в стандартных отклонениях): ниже — считаем, что общего звука нет.
 *  У двух записей одного события пик обычно в 20–40 раз выше разброса, у чужих записей — до 13. */
export const SYNC_MIN_CONFIDENCE = 14;

/**
 * Куда поставить клип b, чтобы его звук совпал с клипом a (обе скорости — 1).
 * Если для этого b пришлось бы начаться раньше нуля — обрезаем его начало (in), start = 0.
 */
export function syncedPlacement(a: { start: number; in: number }, b: { in: number; out: number }, lag: number): { start: number; in: number } | null {
  const start = a.start - a.in + b.in - lag;
  if (start >= 0) return { start, in: b.in };
  const inT = b.in - start;
  if (inT >= b.out - 0.1) return null; // всё нужное — раньше начала ролика
  return { start: 0, in: inT };
}
