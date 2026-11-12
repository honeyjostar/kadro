// Улучшение качества: маленькое видео (480p, 720p) → 1080p, резче и чище.
// «Быстро» — FFmpeg (Ланцош, лёгкое шумоподавление, адаптивная резкость CAS) на любом компьютере;
// «Нейросеть» — Real-ESRGAN (общая модель x4 v3) по кускам кадра, потом уменьшение до 1080p; нужна видеокарта.

export type EnhanceMode = 'fast' | 'ai';

/** До какого размера увеличивать: короткая сторона — 1080 (чётные стороны). Уже 1080p и больше — размер прежний. */
export function enhanceTarget(w: number, h: number, short = 1080): { w: number; h: number; up: boolean } {
  const s = Math.min(w, h);
  const k = s < short ? short / s : 1;
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  return { w: even(w * k), h: even(h * k), up: k > 1.001 };
}

/** Нейросеть — только для небольшого видео (у 1080p и больше разницы почти нет, а ждать — часы). */
export const AI_MAX_SHORT = 720;
export const aiAllowed = (w: number, h: number): boolean => Math.min(w, h) <= AI_MAX_SHORT;

/** Граф «Быстро»: [0:v] → [v]. Резкость сильнее, если видео сильно увеличивается. */
export function fastEnhanceFilter(sw: number, sh: number, tw: number, th: number): string {
  const k = Math.max(1, Math.min(tw / sw, th / sh));
  const cas = Math.min(0.9, 0.45 + 0.15 * (k - 1)).toFixed(2);
  return `[0:v]hqdn3d=1.2:1.2:5:5,scale=${tw}:${th}:flags=lanczos,cas=strength=${cas},format=yuv420p[v]`;
}

/** Куски кадра для нейросети: внутренняя часть (x, y, w, h — без перекрытия) и окно с запасом (px, py, pw, ph).
 *  Окна одного размера (у края сдвигаются внутрь) — видеокарте не надо перестраиваться под каждый кусок. */
export interface Tile { x: number; y: number; w: number; h: number; px: number; py: number; pw: number; ph: number }
export function tilesFor(w: number, h: number, tw = 320, th = 192, pad = 10): Tile[] {
  const out: Tile[] = [];
  const pw = Math.min(w, tw + 2 * pad), ph = Math.min(h, th + 2 * pad);
  for (let y = 0; y < h; y += th) {
    for (let x = 0; x < w; x += tw) {
      const cw = Math.min(tw, w - x), ch = Math.min(th, h - y);
      const px = Math.min(Math.max(0, x - pad), w - pw), py = Math.min(Math.max(0, y - pad), h - ph);
      out.push({ x, y, w: cw, h: ch, px, py, pw, ph });
    }
  }
  return out;
}

/** Сколько минут займёт нейросеть: секунд на кадр (по первому кадру) × число кадров. */
export const etaMinutes = (secPerFrame: number, frames: number): number => Math.max(1, Math.round((secPerFrame * frames) / 60));
