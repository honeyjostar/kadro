// Поиск долей такта в музыке: огибающая атак (спектральный поток) → темп (автокорреляция) →
// сетка долей динамическим программированием (метод Эллиса). Без внешних библиотек.

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang); const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1; let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar; im[i + k] += ai;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

function normalizeRise(env: Float64Array, sr: number, hop: number): Float64Array {
  // вычитаем местное среднее (≈0.4 с) и оставляем только рост
  const frames = env.length;
  const w = Math.max(1, Math.round((0.4 * sr) / hop));
  const out = new Float64Array(frames);
  let acc = 0;
  for (let i = 0; i < frames; i++) {
    acc += env[i];
    if (i >= w) acc -= env[i - w];
    const mean = acc / Math.min(i + 1, w);
    out[i] = Math.max(0, env[i] - mean);
  }
  let mx = 0;
  for (const v of out) mx = Math.max(mx, v);
  if (mx > 0) for (let i = 0; i < frames; i++) out[i] /= mx;
  return out;
}

/**
 * Огибающая атак. Смешиваем широкополосную (точный темп) и низкочастотную до ~180 Гц:
 * доли в музыке обычно отмечены бочкой и басом, а хэт на «восьмых» не должен сбивать фазу.
 */
export function onsetEnvelope(pcm: Float32Array, sr: number, hop = 256, size = 1024): Float64Array {
  const frames = Math.max(0, Math.floor((pcm.length - size) / hop) + 1);
  const win = new Float64Array(size).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  const bins = size / 2;
  const lowBins = Math.max(2, Math.round((180 * size) / sr));
  const weight = new Float64Array(bins).map((_, b) => 700 / (700 + (b * sr) / size));
  let prev = new Float64Array(bins);
  const full = new Float64Array(frames);
  const low = new Float64Array(frames);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < size; i++) { re[i] = pcm[f * hop + i] * win[i]; im[i] = 0; }
    fft(re, im);
    const cur = new Float64Array(bins);
    let fl = 0;
    let lo = 0;
    for (let b = 1; b < bins; b++) {
      cur[b] = Math.log1p(10 * Math.hypot(re[b], im[b]));
      const d = cur[b] - prev[b];
      if (d > 0) { fl += d * weight[b]; if (b <= lowBins) lo += d; }
    }
    full[f] = fl;
    low[f] = lo;
    prev = cur;
  }
  const a = normalizeRise(full, sr, hop);
  const l = normalizeRise(low, sr, hop);
  const out = new Float64Array(frames);
  for (let i = 0; i < frames; i++) out[i] = 0.35 * a[i] + 0.65 * l[i];
  return out;
}

/** Доли такта (сек) и темп (удары в минуту). */
export function detectBeats(pcm: Float32Array, sr: number): { beats: number[]; bpm: number } {
  const hop = 256;
  const env = onsetEnvelope(pcm, sr, hop);
  const fr = sr / hop; // кадров огибающей в секунду
  if (env.length < fr * 2) return { beats: [], bpm: 0 };
  // темп: автокорреляция с мягким предпочтением 120 уд/мин
  let best = 0; let bestLag = Math.round((fr * 60) / 120);
  for (let bpm = 60; bpm <= 200; bpm += 0.5) {
    const lag = (fr * 60) / bpm;
    const l0 = Math.floor(lag); const fl = lag - l0;
    let s = 0;
    for (let i = l0 + 1; i < env.length; i++) s += env[i] * (env[i - l0] * (1 - fl) + env[i - l0 - 1] * fl);
    s /= env.length - l0;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    if (s * prior > best) { best = s * prior; bestLag = lag; }
  }
  const P = bestLag;
  // динамическое программирование: доли — на атаках и через ровный шаг
  const n = env.length;
  const score = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  const alpha = 400;
  for (let t = 0; t < n; t++) {
    let bestPrev = 0; let arg = -1;
    const lo = Math.max(0, Math.round(t - 2 * P));
    const hi = Math.round(t - P / 2);
    for (let u = lo; u <= hi; u++) {
      const pen = Math.log((t - u) / P);
      const v = score[u] - alpha * pen * pen;
      if (arg < 0 || v > bestPrev) { bestPrev = v; arg = u; }
    }
    score[t] = env[t] + (arg >= 0 ? Math.max(0, bestPrev) : 0);
    back[t] = arg >= 0 && bestPrev > 0 ? arg : -1;
  }
  // конец — лучший счёт в последнем периоде
  let end = n - 1;
  for (let t = Math.max(0, Math.round(n - P)); t < n; t++) if (score[t] > score[end]) end = t;
  const beats: number[] = [];
  for (let t = end; t >= 0; t = back[t]) {
    beats.push((t * hop + 512) / sr); // центр окна анализа
    if (back[t] < 0) break;
  }
  beats.reverse();
  return { beats: beats.map((b) => Math.round(b * 1000) / 1000), bpm: Math.round(((fr * 60) / P) * 10) / 10 };
}

/** Форма музыки: громкость по времени (0..1), «дропы» (музыка резко становится громче и плотнее) и сильная доля. */
export interface MusicShape {
  step: number;        // сек на значение energy
  energy: number[];    // 0 — самое тихое место песни, 1 — самое громкое
  drops: number[];     // сек — на долях
  phase: number;       // какая из первых четырёх долей — сильная (начало такта), 0..3
}

const MS_STEP = 0.2;

/** Громкость, дропы и сильная доля по звуку (моно, sr) и найденным долям. */
export function musicShape(pcm: Float32Array, sr: number, beats: number[]): MusicShape {
  const hop = Math.max(1, Math.round(sr * MS_STEP));
  const n = Math.floor(pcm.length / hop);
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * hop; k < (i + 1) * hop; k++) s += pcm[k] * pcm[k];
    raw[i] = 10 * Math.log10(s / hop + 1e-9);
  }
  const sorted = [...raw].sort((a, b) => a - b);
  const q = (x: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * x)))] ?? 0;
  const lo = q(0.08); const hi = q(0.98);
  const norm = [...raw].map((v) => Math.min(1, Math.max(0, (v - lo) / Math.max(1, hi - lo))));
  // сглаживаем на ~0,6 с: громкость «раздела», а не отдельных ударов
  const w = 1;
  const energy = norm.map((_, i) => {
    let s = 0; let c = 0;
    for (let k = i - w; k <= i + w; k++) if (k >= 0 && k < n) { s += norm[k]; c++; }
    return Math.round((s / Math.max(1, c)) * 100) / 100;
  });
  const at = (t: number) => energy[Math.min(n - 1, Math.max(0, Math.round(t / MS_STEP)))] ?? 0;
  const mean = (a: number, b: number) => {
    let s = 0; let c = 0;
    for (let t = a; t < b; t += MS_STEP) { s += at(t); c++; }
    return c ? s / c : 0;
  };
  // дроп: после доли заметно громче, чем было 4 секунды до неё, и это громкий раздел песни
  const cands: { t: number; v: number }[] = [];
  for (const b of beats) {
    if (b < 3 || b > n * MS_STEP - 2) continue;
    const pre = mean(b - 4, b - 0.2);
    const post = mean(b + 0.1, b + 3);
    const jump = post - pre;
    if (jump > 0.2 && post > 0.62) cands.push({ t: b, v: jump });
  }
  const drops: number[] = [];
  for (const c of cands.sort((a, b) => b.v - a.v)) {
    if (drops.length >= 4) break;
    if (drops.every((d) => Math.abs(d - c.t) > 10)) drops.push(c.t);
  }
  drops.sort((a, b) => a - b);
  // сильная доля: где в такте из четырёх долей атаки (бочка) обычно сильнее
  // (доля из detectBeats — центр окна анализа: кадр огибающей = (b·sr − 512) / 256)
  const env = onsetEnvelope(pcm, sr);
  const peaks: number[] = []; const rms: number[] = [];
  for (const b of beats) {
    const f = Math.round((b * sr - 512) / 256);
    let m = 0;
    for (let k = f - 2; k <= f + 2; k++) if (k >= 0 && k < env.length) m = Math.max(m, env[k]);
    peaks.push(m);
    let e = 0; let c = 0;
    for (let k = Math.max(0, Math.floor((b - 0.03) * sr)); k < Math.min(pcm.length, Math.floor((b + 0.07) * sr)); k++) { e += pcm[k] * pcm[k]; c++; }
    rms.push(Math.sqrt(e / Math.max(1, c)));
  }
  // громкость удара — относительно соседних долей (песня то тише, то громче)
  const rel = rms.map((v, i) => {
    let s = 0; let c = 0;
    for (let k = i - 4; k <= i + 4; k++) if (k >= 0 && k < rms.length) { s += rms[k]; c++; }
    return v / Math.max(1e-6, s / c);
  });
  const sums = [0, 0, 0, 0]; const cnt = [0, 0, 0, 0];
  beats.forEach((_, i) => { sums[i % 4] += peaks[i] + rel[i]; cnt[i % 4]++; });
  let phase = 0;
  for (let k = 1; k < 4; k++) if (sums[k] / Math.max(1, cnt[k]) > sums[phase] / Math.max(1, cnt[phase]) * 1.04) phase = k;
  return { step: MS_STEP, energy, drops: drops.map((d) => Math.round(d * 1000) / 1000), phase };
}
