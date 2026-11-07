// Настоящие кадры для миниатюр переходов, эффектов, фильтров и превью каталога плагинов: так сразу видно,
// что делает переход или фильтр. Это уменьшенные кадры из видео Mixkit (бесплатная лицензия), только в составе
// интерфейса. Пока картинки грузятся (доли секунды) — тёмный фон, потом миниатюры перерисовываются.
import { useEffect, useState } from 'react';
import roadUrl from './assets/sample-road.jpg';
import neonUrl from './assets/sample-neon.jpg';
import valleyUrl from './assets/sample-valley.jpg';

/** road — дорога на закате, neon — мотоциклист в неоне, valley — долина в горах. */
export type SampleId = 'road' | 'neon' | 'valley';
const URLS: Record<SampleId, string> = { road: roadUrl, neon: neonUrl, valley: valleyUrl };

const images = new Map<SampleId, HTMLImageElement>();
let loading: Promise<void> | null = null;

export function loadSamples(): Promise<void> {
  loading ??= Promise.all((Object.keys(URLS) as SampleId[]).map((id) => new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => { images.set(id, img); resolve(); };
    img.onerror = () => resolve(); // нет картинки — останется тёмный фон
    img.src = URLS[id];
  }))).then(() => undefined);
  return loading;
}

export const samplesReady = (): boolean => images.size > 0;

/** Перерисовать, когда кадры загрузятся. */
export function useSamplesReady(): boolean {
  const [ready, setReady] = useState(samplesReady());
  useEffect(() => { if (!ready) void loadSamples().then(() => setReady(true)); }, [ready]);
  return ready;
}

const cache = new Map<string, HTMLCanvasElement>();
/** Кадр-образец нужного размера (обрезан «заполнить»). */
export function sampleCanvas(id: SampleId, w: number, h: number): HTMLCanvasElement {
  const key = `${id}:${w}x${h}:${images.has(id) ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const img = images.get(id);
  if (img) {
    const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, (w - img.naturalWidth * k) / 2, (h - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
  } else {
    g.fillStyle = '#1d1b24'; g.fillRect(0, 0, w, h);
  }
  cache.set(key, c);
  return c;
}
