// Готовит слои текста для экспорта: каждый текстовый клип — PNG размера экспорта
// (рисуется той же функцией, что и в плеере).
import { drawText, fontString } from '../../shared/textRender';
import type { TextLayerReq } from '../../shared/ipc';
import type { Project, TextClip } from '../../shared/types';

function toPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (b) => {
      if (!b) { reject(new Error('Не удалось нарисовать текст')); return; }
      resolve(new Uint8Array(await b.arrayBuffer()));
    }, 'image/png');
  });
}

/** Дожидается загрузки всех шрифтов, которые используются в проекте. */
export async function loadProjectFonts(p: Project): Promise<void> {
  const fonts = new Set<string>();
  for (const t of p.tracks) for (const c of t.clips) if (c.type === 'text') fonts.add(fontString(c, 40));
  await Promise.all([...fonts].map((f) => document.fonts.load(f, 'АБВабвABCabc').catch(() => undefined)));
  await document.fonts.ready;
}

export async function renderTextLayers(p: Project, W: number, H: number, onProgress?: (p: number) => void): Promise<{ layers: TextLayerReq[]; blank: Uint8Array }> {
  await loadProjectFonts(p);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const blank = await toPng(canvas);
  const tracks = p.tracks.filter((t) => t.kind === 'text' && !t.hidden && t.clips.length);
  const total = tracks.reduce((n, t) => n + t.clips.length, 0) || 1;
  let done = 0;
  const layers: TextLayerReq[] = [];
  for (const t of tracks) {
    const clips: TextLayerReq['clips'] = [];
    for (const c of t.clips as TextClip[]) {
      ctx.clearRect(0, 0, W, H);
      drawText(ctx, c, W, H);
      clips.push({ start: c.start, duration: c.duration, png: await toPng(canvas) });
      done++;
      onProgress?.(done / total);
    }
    layers.push({ trackId: t.id, clips });
  }
  return { layers, blank };
}
