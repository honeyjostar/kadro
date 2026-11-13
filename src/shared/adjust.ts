// Корректирующий слой: клип на дорожке наложений без картинки — его цвет, фильтр, кривые, эффекты и маска
// действуют на всё, что под ним, пока он идёт. Прозрачность слоя — сила.
import { DEFAULT_TRANSFORM } from './defaults';
import { tx } from './i18n';
import { addAsset, addFree, edit } from './timeline';
import type { MediaAsset, MediaClip, Project } from './types';

export const isAdjust = (a: Pick<MediaAsset, 'adjust'> | undefined | null): boolean => !!a?.adjust;

/** Файл-заглушка для слоя: без пути, скрыт в медиатеке. */
export function adjustAsset(id: string, p: Project): MediaAsset {
  return {
    id, kind: 'image', path: '', previewPath: '', name: tx('Корректирующий слой'), duration: 0,
    width: p.settings.width, height: p.settings.height, fps: p.settings.fps, hasVideo: true, hasAudio: false,
    size: 0, rotation: 0, proxy: 'none', thumbs: [], derived: true, adjust: true,
  } as MediaAsset;
}

/** Положить корректирующий слой с момента at на dur секунд (своя дорожка поверх). */
export function addAdjustLayer(p: Project, assetId: string, at: number, dur: number): { project: Project; clipId: string } {
  const q = addAsset(p, adjustAsset(assetId, p));
  const r = addFree(q, assetId, at);
  const project = edit(r.project, (d) => {
    for (const t of d.tracks) for (const c of t.clips) {
      if (c.id !== r.clipId || c.type !== 'media') continue;
      c.transform = { ...DEFAULT_TRANSFORM };
      c.fit = 'cover';
      c.out = c.in + Math.max(0.5, dur);
    }
  });
  return { project, clipId: r.clipId };
}

/** Слой всегда на весь кадр: положение, растяжение и перспектива к нему не применяются. */
export function adjustClipForRender(c: MediaClip): MediaClip {
  const k = c.keyframes?.opacity ? { opacity: c.keyframes.opacity } : undefined;
  return { ...c, fit: 'cover', transform: { ...DEFAULT_TRANSFORM }, keyframes: k, stretch: undefined, pin: undefined, tilt: undefined, chroma: undefined, blurs: undefined, photo3d: undefined };
}
