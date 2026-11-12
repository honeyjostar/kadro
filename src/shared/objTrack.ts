// Слежение за предметом в кадре (номер машины, логотип, экран телефона — что обвёл человек).
// Сравнение с образцом (нормированная корреляция) в окне вокруг прошлого места: сначала грубо, потом точно,
// затем — подстройка размера (ближе/дальше). Образец понемногу обновляется, чтобы не терять предмет при повороте.

export interface Gray { data: Uint8Array; w: number; h: number }
/** Рамка в пикселях кадра: центр и размер. */
export interface PxBox { x: number; y: number; w: number; h: number }
export interface TrackStep { box: PxBox; score: number; lost: boolean }

const TPL = 40; // образец — не больше 40 точек по длинной стороне (быстро и устойчиво к шуму)

/** Кусок кадра (центр, размер) → tw × th точек (билинейно). */
function sample(f: Gray, b: PxBox, tw: number, th: number, out: Float32Array): void {
  const x0 = b.x - b.w / 2, y0 = b.y - b.h / 2;
  const sx = b.w / tw, sy = b.h / th;
  for (let j = 0; j < th; j++) {
    const fy = Math.min(f.h - 1.001, Math.max(0, y0 + (j + 0.5) * sy - 0.5));
    const iy = Math.floor(fy), ky = fy - iy;
    for (let i = 0; i < tw; i++) {
      const fx = Math.min(f.w - 1.001, Math.max(0, x0 + (i + 0.5) * sx - 0.5));
      const ix = Math.floor(fx), kx = fx - ix;
      const p = iy * f.w + ix;
      const a = f.data[p] + (f.data[p + 1] - f.data[p]) * kx;
      const c = f.data[p + f.w] + (f.data[p + f.w + 1] - f.data[p + f.w]) * kx;
      out[j * tw + i] = a + (c - a) * ky;
    }
  }
}

/** Привести к нулевому среднему и единичной норме; вернуть false, если кусок однотонный. */
function normalize(v: Float32Array): boolean {
  let m = 0;
  for (let i = 0; i < v.length; i++) m += v[i];
  m /= v.length;
  let s = 0;
  for (let i = 0; i < v.length; i++) { v[i] -= m; s += v[i] * v[i]; }
  if (s < 1e-6 * v.length) return false;
  const k = 1 / Math.sqrt(s);
  for (let i = 0; i < v.length; i++) v[i] *= k;
  return true;
}

const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

export class ObjectTracker {
  private tw = 0;
  private th = 0;
  private tpl = new Float32Array(0);
  private first = new Float32Array(0);
  private buf = new Float32Array(0);
  private box: PxBox;
  private vx = 0;
  private vy = 0;
  private miss = 0;
  /** Сколько кадров подряд можно не узнавать предмет (закрыли рукой, пролетела муха). */
  maxMiss: number;

  constructor(frame: Gray, box: PxBox, maxMiss = 8) {
    this.box = { ...box };
    this.maxMiss = maxMiss;
    const k = TPL / Math.max(box.w, box.h);
    this.tw = Math.max(6, Math.round(box.w * Math.min(1, k)));
    this.th = Math.max(6, Math.round(box.h * Math.min(1, k)));
    this.tpl = new Float32Array(this.tw * this.th);
    this.buf = new Float32Array(this.tw * this.th);
    sample(frame, this.box, this.tw, this.th, this.tpl);
    normalize(this.tpl);
    this.first = this.tpl.slice();
  }

  private score(f: Gray, b: PxBox): number {
    sample(f, b, this.tw, this.th, this.buf);
    if (!normalize(this.buf)) return -1;
    return dot(this.tpl, this.buf);
  }

  /** Следующий кадр: где теперь предмет. */
  update(f: Gray): TrackStep {
    const b = this.box;
    const px = b.w / this.tw; // одна точка образца в пикселях кадра
    const pred = { ...b, x: b.x + this.vx, y: b.y + this.vy };
    const R = Math.max(6, Math.round(0.6 * Math.max(this.tw, this.th))); // окно поиска — в точках образца
    let best = { s: -2, x: pred.x, y: pred.y };
    // грубо — через 2 точки образца
    for (let dy = -R; dy <= R; dy += 2) {
      for (let dx = -R; dx <= R; dx += 2) {
        const c = { ...pred, x: pred.x + dx * px, y: pred.y + dy * px };
        const s = this.score(f, c);
        if (s > best.s) best = { s, x: c.x, y: c.y };
      }
    }
    // точно — вокруг лучшего, по половине точки
    const cx = best.x, cy = best.y;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const c = { ...b, x: cx + dx * px * 0.5, y: cy + dy * px * 0.5 };
        const s = this.score(f, c);
        if (s > best.s) best = { s, x: c.x, y: c.y };
      }
    }
    // размер: ближе или дальше
    let size = { w: b.w, h: b.h };
    for (const k of [0.95, 1.05]) {
      const c = { x: best.x, y: best.y, w: b.w * k, h: b.h * k };
      const s = this.score(f, c);
      if (s > best.s + 0.01) { best = { s, x: best.x, y: best.y }; size = { w: c.w, h: c.h }; }
    }
    const found = best.s > 0.45;
    if (!found) {
      this.miss++;
      // не узнали — держим место по инерции (медленнее), пока не вышло время
      this.vx *= 0.7; this.vy *= 0.7;
      this.box = { ...pred, x: Math.min(f.w, Math.max(0, pred.x)), y: Math.min(f.h, Math.max(0, pred.y)) };
      return { box: { ...this.box }, score: best.s, lost: this.miss > this.maxMiss };
    }
    this.miss = 0;
    this.vx = 0.6 * this.vx + 0.4 * (best.x - b.x);
    this.vy = 0.6 * this.vy + 0.4 * (best.y - b.y);
    this.box = { x: best.x, y: best.y, w: size.w, h: size.h };
    if (best.s > 0.7) {
      // образец: 85% старый, 10% новый вид, 5% самый первый (чтобы не «уплыть» на фон)
      sample(f, this.box, this.tw, this.th, this.buf);
      if (normalize(this.buf)) {
        for (let i = 0; i < this.tpl.length; i++) this.tpl[i] = 0.85 * this.tpl[i] + 0.1 * this.buf[i] + 0.05 * this.first[i];
        normalize(this.tpl);
      }
    }
    return { box: { ...this.box }, score: best.s, lost: false };
  }
}

/** Пройти по кадрам от первого: рамки до потери предмета (первая — исходная). */
export function trackFrames(frames: Gray[], box: PxBox, maxMiss = 8): { box: PxBox; score: number }[] {
  if (!frames.length) return [];
  const tr = new ObjectTracker(frames[0], box, maxMiss);
  const out = [{ box: { ...box }, score: 1 }];
  for (let i = 1; i < frames.length; i++) {
    const st = tr.update(frames[i]);
    if (st.lost) break;
    out.push({ box: st.box, score: st.score });
  }
  // хвост из «не узнал» в конце — не нужен
  while (out.length > 1 && out[out.length - 1].score <= 0.45) out.pop();
  return out;
}
