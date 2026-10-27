// Экспорт шейдеров: FFmpeg не выполняет GLSL, поэтому куски ролика, где есть переход-шейдер или
// эффект-шейдер, Kadro рисует сам — тем же движком плеера, кадр за кадром в размере экспорта, — и
// отдаёт кадры PNG главному процессу. FFmpeg накладывает их поверх собранного видео в этих местах.
import { glRanges } from '../../shared/gl/ranges';
import type { Project } from '../../shared/types';
import { loadGlCatalog } from '../glRegistry';
import { api } from '../store';
import { preloadLuts } from './grade';
import { PreviewEngine } from './preview';

export { glRanges };

export interface GlRender { token: string; segments: { start: number; frames: number }[] }

function toPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (b) => {
      if (!b) { reject(new Error('Не удалось нарисовать кадр')); return; }
      resolve(new Uint8Array(await b.arrayBuffer()));
    }, 'image/png');
  });
}

/**
 * Нарисовать все куски с шейдерами. null — шейдеров в проекте нет. onProgress(доля, «кадр k из n»);
 * cancelled() — пользователь нажал «Отмена».
 */
export async function renderGlSegments(p: Project, W: number, H: number, fps: number,
  onProgress?: (frac: number, done: number, total: number) => void, cancelled?: () => boolean): Promise<GlRender | null> {
  const ranges = glRanges(p, fps);
  if (!ranges.length) return null;
  await loadGlCatalog(); // каталог переходов мог ещё не догрузиться
  const total = ranges.reduce((n, r) => n + r.frames, 0);
  const token = await api.glFramesBegin();
  const canvas = document.createElement('canvas');
  const engine = new PreviewEngine(canvas, api.mediaUrl, api.readLut, true);
  try {
    engine.setSize(W, H);
    engine.setProject(p);
    const luts = p.tracks.flatMap((t) => t.clips).flatMap((c) => (c.type === 'media' && c.grade?.lut?.path ? [c.grade.lut.path] : []));
    await preloadLuts(luts, api.readLut);
    let done = 0;
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      for (let k = 0; k < r.frames; k++) {
        if (cancelled?.()) throw new DOMException('Экспорт отменён', 'AbortError');
        // чуть позже начала кадра: тот же кадр видео, что берёт FFmpeg
        await engine.renderAt(r.start + k / fps + 1e-4);
        await api.glFrame(token, i, k, await toPng(canvas));
        done++;
        onProgress?.(done / total, done, total);
      }
    }
    return { token, segments: ranges.map((r) => ({ start: r.start, frames: r.frames })) };
  } catch (e) {
    api.glFramesDrop(token); // отмена или ошибка — нарисованные кадры не нужны
    throw e;
  } finally {
    engine.destroy();
  }
}
