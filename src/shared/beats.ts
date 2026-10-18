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
