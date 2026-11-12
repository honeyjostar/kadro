// 3D-фото на настоящем экспорте: карты сдвига → displace; модель глубины — если скачана.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.KADRO_MODELS = process.env.KADRO_MODELS || path.join(os.homedir(), '.cache', 'kadro-models');

import { depthReady, estimateDepth } from '../../src/main/ai/depth';
import { makePhoto3dMaps } from '../../src/main/photo3dMaps';
import { newProject } from '../../src/shared/defaults';
import { addAsset, addToMain, mainTrack, updateClip } from '../../src/shared/timeline';
import type { MediaClip } from '../../src/shared/types';
import { assetFromFile, ff, FFMPEG, runExport, tmpDir } from '../helpers/media';

const D = tmpDir('photo3d');
const f = (n: string) => path.join(D, n);

beforeAll(() => {
  // фото: вертикальные полосы (по ним видно сдвиг), глубина: правая половина — близко
  if (!fs.existsSync(f('stripes.png'))) ff(['-f', 'lavfi', '-i', "color=c=gray:s=640x360,geq=lum='if(lt(mod(X\\,40)\\,20)\\,40\\,220)':cb=128:cr=128", '-frames:v', '1', '-update', '1', f('stripes.png')]);
  if (!fs.existsSync(f('depth.png'))) ff(['-f', 'lavfi', '-i', "color=c=black:s=640x360,format=gray,geq=lum='if(gte(X\\,320)\\,255\\,0)'", '-frames:v', '1', '-update', '1', f('depth.png')]);
});

function row(file: string, t: number, y: number): Uint8Array {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `crop=640:1:0:${y},format=gray`, '-f', 'rawvideo', '-']);
  return new Uint8Array(r.stdout as Buffer);
}
/** На сколько точек сдвинулись полосы в куске [a, b) между двумя строками (лучшее совпадение). */
function shift(r0: Uint8Array, r1: Uint8Array, a: number, b: number): number {
  let best = 0, err = Infinity;
  for (let s = -19; s <= 19; s++) {
    let e = 0;
    for (let x = a; x < b; x++) e += Math.abs(r1[x] - r0[Math.min(639, Math.max(0, x + s))]);
    if (e < err) { err = e; best = s; }
  }
  return best;
}

describe('3D-фото: экспорт', () => {
  it('«Проплыть»: ближняя половина едет в одну сторону, дальняя — в другую', async () => {
    let p = newProject('t', '16:9');
    p = { ...p, settings: { ...p.settings, width: 640, height: 360 } };
    p = addAsset(p, assetFromFile('s', f('stripes.png'), 'image'));
    p = addToMain(p, 's', 0).project;
    const c = mainTrack(p).clips[0] as MediaClip;
    p = updateClip(p, c.id, { out: c.in + 2, photo3d: { depth: f('depth.png'), w: 640, h: 360, motion: 'swing', amount: 0.5 } });
    const maps = await makePhoto3dMaps(p, D, 25);
    expect(Object.keys(maps)).toHaveLength(1);
    runExport(p, f('out.mp4'), { width: 640, height: 360, fps: 25, photo3dMaps: maps });
    const a = row(f('out.mp4'), 0.1, 180), b = row(f('out.mp4'), 1.9, 180);
    const far = shift(a, b, 60, 260), near = shift(a, b, 380, 580);
    // сдвиг карты: (d − 0.5)·px·W, px от −0.025 до 0.025 → у дальнего от +8 до −8: картинка уезжает на 16 влево,
    // у ближнего — на 16 вправо (полосы через 40 точек — сдвиг меньше половины периода)
    expect(far).toBeLessThan(-12);
    expect(near).toBeGreaterThan(12);
  });
});

describe.skipIf(!depthReady())('3D-фото: модель глубины', () => {
  it('на фото астронавта шлем ближе стены', async () => {
    const r = await estimateDepth(path.resolve('tests/fixtures/astronaut.jpg'), 512, 512, f('astro-depth.png'));
    expect([r.w, r.h]).toEqual([512, 512]);
    const px = (x: number, y: number) => {
      const o = spawnSync(FFMPEG, ['-v', 'error', '-i', r.path, '-vf', `crop=1:1:${x}:${y},format=gray`, '-f', 'rawvideo', '-']);
      return (o.stdout as Buffer)[0];
    };
    expect(px(400, 440)).toBeGreaterThan(px(470, 60) + 100); // шлем внизу справа — близко, стена вверху справа — далеко
  });
});
