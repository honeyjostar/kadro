// Готовит слои текста для экспорта: каждый текстовый клип — PNG размера экспорта
// (рисуется той же функцией, что и в плеере).
import { drawText, fontString, isTextAnimated, textStateAt, textStateKey } from '../../shared/textRender';
import { particleEffects } from '../../shared/effects';
import { drawParticles } from '../../shared/particles';
import { clipEnd } from '../../shared/timeline';
import type { TextLayerReq } from '../../shared/ipc';
import type { MediaClip, Project, TextClip } from '../../shared/types';

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

export async function renderTextLayers(p: Project, W: number, H: number, fps = 30, onProgress?: (p: number) => void): Promise<{ layers: TextLayerReq[]; blank: Uint8Array }> {
  await loadProjectFonts(p);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const blank = await toPng(canvas);
  const tracks = p.tracks.filter((t) => t.kind === 'text' && !t.hidden && t.clips.length);
  // клипы с частицами (снег, конфетти…): их слой рисуется по кадрам поверх всего
  const fxClips: MediaClip[] = [];
  for (const t of p.tracks) {
    if (t.hidden || t.kind === 'audio' || t.kind === 'text') continue;
    for (const c of t.clips) if (c.type === 'media' && particleEffects(c.effects).length) fxClips.push(c);
  }
  const total = tracks.reduce((n, t) => n + t.clips.length, 0) + fxClips.length || 1;
  let done = 0;
  const layers: TextLayerReq[] = [];
  for (const t of tracks) {
    const clips: TextLayerReq['clips'] = [];
    for (const c of t.clips as TextClip[]) {
      if (!isTextAnimated(c)) {
        ctx.clearRect(0, 0, W, H);
        drawText(ctx, c, W, H);
        clips.push({ start: c.start, duration: c.duration, png: await toPng(canvas) });
      } else {
        // анимированный текст — по кадрам экспорта; одинаковые соседние кадры объединяем
        const end = c.start + c.duration;
        const n0 = Math.ceil(c.start * fps - 1e-6);
        let cur: { start: number; end: number; key: string; local: number } | null = null;
        const flush = async () => {
          if (!cur) return;
          ctx.clearRect(0, 0, W, H);
          drawText(ctx, c, W, H, cur.local);
          clips.push({ start: cur.start, duration: cur.end - cur.start, png: await toPng(canvas) });
          cur = null;
        };
        for (let n = n0; n / fps < end - 1e-6; n++) {
          const T = n / fps;
          const local = Math.max(0, T - c.start);
          const segStart = n === n0 ? c.start : T;
          const segEnd = Math.min(end, (n + 1) / fps);
          const key = textStateKey(textStateAt(c, local));
          if (cur && cur.key === key) { cur.end = segEnd; continue; }
          await flush();
          cur = { start: segStart, end: segEnd, key, local };
        }
        await flush();
      }
      done++;
      onProgress?.(done / total);
    }
    layers.push({ trackId: t.id, clips });
  }
  for (const c of fxClips) {
    const list = particleEffects(c.effects);
    const clips: TextLayerReq['clips'] = [];
    const end = clipEnd(c);
    const n0 = Math.ceil(c.start * fps - 1e-6);
    for (let n = n0; n / fps < end - 1e-6; n++) {
      const T = n / fps;
      const segStart = n === n0 ? c.start : T;
      const segEnd = Math.min(end, (n + 1) / fps);
      ctx.clearRect(0, 0, W, H);
      drawParticles(ctx, list, Math.max(0, T - c.start), W, H);
      clips.push({ start: segStart, duration: segEnd - segStart, png: await toPng(canvas) });
    }
    done++;
    onProgress?.(done / total);
    layers.push({ trackId: `fx:${c.id}`, clips });
  }
  return { layers, blank };
}
