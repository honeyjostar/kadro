// Маски скрытия лиц и номеров для экспорта: на каждый кадр клипа — где размыть (та же функция, что в превью).
// Пишется маленькое видео без потерь (FFV1, длинная сторона 320) — почти всё чёрное, поэтому весит копейки.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { blurGroups, blurMaskBytes, maskSize } from '../shared/blur';
import { blurMaskKey } from '../shared/exportGraph';
import { orientedSize } from '../shared/geometry';
import { clipDuration } from '../shared/timeline';
import type { MediaAsset, Project } from '../shared/types';
import { ffmpegPath } from './bins';

export async function makeBlurMasks(p: Project, dir: string, fps: number, signal?: AbortSignal): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let n = 0;
  for (const t of p.tracks) {
    if (t.kind !== 'main' && t.kind !== 'video') continue;
    for (const c of t.clips) {
      if (c.type !== 'media' || !c.blurs?.length) continue;
      const a = p.assets.find((x) => x.id === c.assetId) as MediaAsset | undefined;
      if (!a || a.kind === 'audio') continue;
      const o = orientedSize(a.width, a.height, 0);
      const { w, h } = maskSize(o.w, o.h);
      const frames = Math.ceil(clipDuration(c) * fps) + 2;
      for (const g of blurGroups(c.blurs)) {
        if (signal?.aborted) throw new Error('aborted');
        const file = path.join(dir, `blur${n++}.mkv`);
        await writeMask(file, w, h, fps, frames, (i, buf) => blurMaskBytes(g.regions, c.in + (i / fps) * c.speed, w, h, buf), signal);
        out[blurMaskKey(c.id, g.key)] = file;
      }
    }
  }
  return out;
}

function writeMask(file: string, w: number, h: number, fps: number, frames: number, frame: (i: number, buf: Uint8Array) => Uint8Array, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath(), ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${w}x${h}`, '-framerate', String(fps), '-i', '-', '-c:v', 'ffv1', '-level', '3', file], { windowsHide: true });
    const abort = () => ff.kill('SIGKILL');
    signal?.addEventListener('abort', abort, { once: true });
    let err = '';
    ff.stderr.on('data', (d: Buffer) => { err = (err + d.toString()).slice(-1500); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (code === 0) resolve(); else reject(new Error(err.trim() || `ffmpeg ${code}`));
    });
    const buf = new Uint8Array(w * h);
    let i = 0;
    const pump = () => {
      while (i < frames) {
        const ok = ff.stdin.write(Buffer.from(frame(i++, buf)));
        if (!ok) { ff.stdin.once('drain', pump); return; }
      }
      ff.stdin.end();
    };
    ff.stdin.on('error', () => undefined);
    pump();
  });
}
