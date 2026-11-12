// Слежение за обведённым предметом по всему клипу: от кадра, где обвели, вперёд до конца и назад до начала.
import { ObjectTracker, type Gray, type PxBox } from '../../shared/objTrack';
import type { BlurBox } from '../../shared/types';
import { eachFrame, grabFrames } from './frames';

export interface TrackJob {
  src: string; in: number; out: number; at: number;
  box: { x: number; y: number; w: number; h: number }; // доли кадра
  width: number; height: number;
  onProgress?: (p: number) => void; signal?: AbortSignal;
}

export const trackFps = (dur: number): number => (dur > 120 ? 8 : 12);

/** Рамки предмета (время исходника, доли кадра) — пока трекер его узнаёт. */
export async function trackBox(j: TrackJob): Promise<BlurBox[]> {
  const k = 480 / Math.max(j.width, j.height);
  const W = Math.max(8, Math.round((j.width * Math.min(1, k)) / 2) * 2), H = Math.max(8, Math.round((j.height * Math.min(1, k)) / 2) * 2);
  const fps = trackFps(j.out - j.in);
  const vf = `scale=${W}:${H}:flags=area`;
  const toPx = (b: { x: number; y: number; w: number; h: number }): PxBox => ({ x: b.x * W, y: b.y * H, w: Math.max(4, b.w * W), h: Math.max(4, b.h * H) });
  const toBox = (t: number, b: PxBox): BlurBox => ({ t: Math.round(t * 1000) / 1000, x: b.x / W, y: b.y / H, w: b.w / W, h: b.h / H });
  const fwdDur = Math.max(0, j.out - j.at);
  const backDur = Math.max(0, j.at - j.in);
  const total = Math.max(1, (fwdDur + backDur) * fps);
  let done = 0;
  const tick = () => { done++; j.onProgress?.(Math.min(0.999, done / total)); };
  const maxMiss = Math.round(fps * 0.6);
  const fwd: BlurBox[] = [];
  const st0: { first: Gray | null; lost: boolean } = { first: null, lost: false };
  let tr: ObjectTracker | null = null;
  const ac = new AbortController();
  const stop = () => ac.abort();
  j.signal?.addEventListener('abort', stop, { once: true });
  try {
    await eachFrame({ src: j.src, ss: j.at, dur: Math.max(1 / fps, fwdDur), fps, vf, w: W, h: H, pix: 'gray', signal: ac.signal }, (fr, i) => {
      if (st0.lost) return;
      const g: Gray = { data: new Uint8Array(fr.buffer, fr.byteOffset, fr.length), w: W, h: H };
      const t = j.at + i / fps;
      tick();
      if (!tr) { st0.first = { ...g, data: g.data.slice() }; tr = new ObjectTracker(g, toPx(j.box), maxMiss); fwd.push(toBox(t, toPx(j.box))); return; }
      const st = tr.update(g);
      if (st.lost) { st0.lost = true; ac.abort(); return; }
      if (st.score > 0.45) fwd.push(toBox(t, st.box));
    });
  } catch (e) {
    if (!st0.lost || j.signal?.aborted) throw e; // остановили сами — предмет потерян, дальше не нужно
  }
  const firstFrame = st0.first;
  if (!firstFrame) return fwd;
  // назад: кусками по 3 секунды, каждый — задом наперёд
  const back: BlurBox[] = [];
  const btr = new ObjectTracker(firstFrame, toPx(j.box), maxMiss);
  const step = 1 / fps;
  let end = j.at; // не включая
  outer: while (end - j.in > step * 0.5) {
    if (j.signal?.aborted) throw new Error('aborted');
    const n = Math.max(1, Math.min(Math.round(3 * fps), Math.floor((end - j.in) / step + 1e-6)));
    const ss = end - n * step;
    const frames = await grabFrames({ src: j.src, ss: Math.max(0, ss), dur: n * step - step * 0.25, fps, vf, w: W, h: H, pix: 'gray', signal: j.signal });
    for (let i = Math.min(frames.length, n) - 1; i >= 0; i--) {
      tick();
      const g: Gray = { data: new Uint8Array(frames[i].buffer, frames[i].byteOffset, frames[i].length), w: W, h: H };
      const st = btr.update(g);
      if (st.lost) break outer;
      if (st.score > 0.45) back.push(toBox(ss + i * step, st.box));
    }
    end = ss;
    if (frames.length === 0) break;
  }
  j.signal?.removeEventListener('abort', stop);
  return [...back.reverse(), ...fwd];
}
