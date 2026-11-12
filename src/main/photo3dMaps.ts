// 3D-фото в экспорте: карты сдвига на каждый кадр (та же функция, что в превью) → два видео FFV1 для фильтра displace.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { displaceMaps, motionAt } from '../shared/photo3d';
import { clipDuration } from '../shared/timeline';
import type { Project } from '../shared/types';
import { ffmpegPath } from './bins';
import { ffmpegToBuffer } from './ffrun';

export interface Photo3dMaps { x: string; y: string; w: number; h: number }

function encoder(file: string, w: number, h: number, fps: number) {
  const ff = spawn(ffmpegPath(), ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${w}x${h}`, '-framerate', String(fps), '-i', '-', '-c:v', 'ffv1', '-level', '3', file], { windowsHide: true });
  let err = '';
  ff.stderr.on('data', (d: Buffer) => { err = (err + d.toString()).slice(-1500); });
  ff.stdin.on('error', () => undefined);
  const done = new Promise<void>((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `ffmpeg ${code}`))));
  });
  const write = async (b: Uint8Array) => { if (!ff.stdin.write(Buffer.from(b))) await new Promise((r) => ff.stdin.once('drain', r)); };
  return { write, end: async () => { ff.stdin.end(); await done; }, kill: () => ff.kill('SIGKILL') };
}

export async function makePhoto3dMaps(p: Project, dir: string, fps: number, signal?: AbortSignal): Promise<Record<string, Photo3dMaps>> {
  const out: Record<string, Photo3dMaps> = {};
  let n = 0;
  for (const t of p.tracks) {
    if (t.kind !== 'main' && t.kind !== 'video') continue;
    for (const c of t.clips) {
      if (c.type !== 'media' || !c.photo3d || !fs.existsSync(c.photo3d.depth)) continue;
      const { w, h, motion, amount } = c.photo3d;
      const raw = await ffmpegToBuffer(['-v', 'error', '-i', c.photo3d.depth, '-frames:v', '1', '-vf', `scale=${w}:${h},format=gray`, '-f', 'rawvideo', '-'], signal);
      const depth = new Uint8Array(raw.buffer, raw.byteOffset, w * h);
      const D = clipDuration(c);
      const frames = Math.ceil(D * fps) + 2;
      const fx = path.join(dir, `p3x${n}.mkv`), fy = path.join(dir, `p3y${n++}.mkv`);
      const ex = encoder(fx, w, h, fps), ey = encoder(fy, w, h, fps);
      const bx = new Uint8Array(w * h), by = new Uint8Array(w * h);
      try {
        for (let i = 0; i < frames; i++) {
          if (signal?.aborted) throw new Error('aborted');
          displaceMaps(depth, w, h, motionAt(motion, amount, Math.min(1, i / Math.max(1, D * fps))), bx, by);
          await ex.write(bx);
          await ey.write(by);
        }
        await Promise.all([ex.end(), ey.end()]);
      } catch (e) { ex.kill(); ey.kill(); throw e; }
      out[c.id] = { x: fx, y: fy, w, h };
    }
  }
  return out;
}
