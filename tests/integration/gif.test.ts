// Анимированный GIF: распознаётся как видео, играет по кругу, сохраняет прозрачность — в прокси для плеера и в экспорте.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyze, makeProxy } from '../../src/main/media';
import { newProject } from '../../src/shared/defaults';
import { addAsset, addFree, addToMain, clipDuration, findClip, trimClip } from '../../src/shared/timeline';
import type { MediaClip } from '../../src/shared/types';
import { ff, makeImage, makeSolid, near, pixelAt, probe, runExport, tmpDir } from '../helpers/media';

const D = tmpDir('gif');
const f = (n: string) => path.join(D, n);
process.env.KADRO_DATA = path.join(D, 'data');

beforeAll(() => {
  // 1 секунда: 0.5 с красный, 0.5 с синий; левая половина прозрачная
  if (!fs.existsSync(f('anim.gif'))) {
    ff(['-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=10:d=0.5', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10:d=0.5',
      '-filter_complex',
      "[0:v][1:v]concat=n=2:v=1:a=0,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(X,80),0,255)',split[a][b];" +
      '[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=alpha_threshold=128',
      f('anim.gif')]);
  }
  if (!fs.existsSync(f('still.gif'))) makeImage(f('still.gif'), 'yellow', 64, 64);
  if (!fs.existsSync(f('green.mp4'))) makeSolid(f('green.mp4'), 'lime', 4, 320, 180, 30);
});

describe('GIF', () => {
  it('анимированный GIF — видео по кругу, одиночный кадр — картинка', async () => {
    const { asset, plan } = await analyze(f('anim.gif'));
    expect(asset.kind).toBe('video');
    expect(asset.loop).toBe(true);
    expect(asset.hasAudio).toBe(false);
    expect(Math.abs(asset.duration - 1)).toBeLessThan(0.15);
    expect(plan).toBe('video');
    const still = await analyze(f('still.gif'));
    expect(still.asset.kind).toBe('image');
  });

  it('прокси для плеера — WebM VP9 с прозрачностью тех же размеров', async () => {
    const { asset } = await analyze(f('anim.gif'));
    const proxy = await makeProxy(asset, 'video');
    expect(proxy.endsWith('.webm')).toBe(true);
    const pr = probe(proxy);
    expect(pr.vcodec).toBe('vp9');
    expect(pr.width).toBe(160);
    expect(pr.height).toBe(90);
    // прозрачность сохранилась: левая половина пустая, правая — красная
    const png = f('proxy0.png');
    ff(['-c:v', 'libvpx-vp9', '-ss', '0.2', '-i', proxy, '-frames:v', '1', '-pix_fmt', 'rgba', png]);
    const raw = f('proxy0.rgba');
    ff(['-i', png, '-f', 'rawvideo', '-pix_fmt', 'rgba', raw]);
    const buf = fs.readFileSync(raw);
    const at = (x: number, y: number) => [...buf.subarray((y * 160 + x) * 4, (y * 160 + x) * 4 + 4)];
    expect(at(20, 45)[3]).toBeLessThan(20);
    expect(at(140, 45)[3]).toBeGreaterThan(230);
    expect(near(at(140, 45).slice(0, 3), [254, 0, 0], 30)).toBe(true);
  });

  it('клип можно растянуть дольше GIF, и в экспорте анимация повторяется, а прозрачные места показывают низ', async () => {
    const { asset } = await analyze(f('anim.gif'));
    let p = newProject('gif', '16:9');
    p = addAsset(p, { ...asset, id: 'gif' });
    p = addAsset(p, { ...(await analyze(f('green.mp4'))).asset, id: 'bg' });
    p = addToMain(p, 'bg', 0).project;
    const r = addFree(p, 'gif', 0);
    p = r.project;
    // по умолчанию короткий GIF — 3 с (повтор), растягиваем до 3.5 с
    const c0 = findClip(p, r.clipId)!.clip as MediaClip;
    expect(clipDuration(c0)).toBeCloseTo(3, 1);
    p = trimClip(p, r.clipId, 'end', 3.5);
    expect(clipDuration(findClip(p, r.clipId)!.clip as MediaClip)).toBeCloseTo(3.5, 1);
    const out = f('loop.mp4');
    runExport(p, out, { width: 640, height: 360, fps: 30 });
    // правая половина GIF (видимая): 0.25 с — красный, 0.75 — синий, и так же через 2 круга
    const right = (t: number) => pixelAt(out, t, 400, 180);
    expect(near(right(0.25), [254, 0, 0], 40)).toBe(true);
    expect(near(right(0.75), [0, 0, 254], 40)).toBe(true);
    expect(near(right(2.25), [254, 0, 0], 40)).toBe(true);
    expect(near(right(3.25), [254, 0, 0], 40)).toBe(true);
    // левая половина GIF прозрачная — видно зелёный фон
    expect(near(pixelAt(out, 1.25, 240, 180), [0, 255, 1], 40)).toBe(true);
    expect(Math.abs(probe(out).duration - 4)).toBeLessThan(0.1);
  });
});
