// Скрыть лица и номера на настоящем видео: YuNet находит лицо, трекер ведёт номер, экспорт размывает по маске.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { detectFaces } from '../../src/main/ai/faces';
import { trackBox } from '../../src/main/ai/track';
import { makeBlurMasks } from '../../src/main/blurMask';
import { boxAt, linkTracks, newRegion, padFace } from '../../src/shared/blur';
import { newProject } from '../../src/shared/defaults';
import { addAsset, addToMain, mainTrack, updateClip } from '../../src/shared/timeline';
import type { BlurRegion, MediaClip, Project } from '../../src/shared/types';
import { assetFromFile, ff, FFMPEG, runExport, tmpDir } from '../helpers/media';

const D = tmpDir('blur');
const f = (n: string) => path.join(D, n);
const FACE = path.resolve('tests/fixtures/astronaut.jpg'); // NASA, общественное достояние

beforeAll(() => {
  if (!fs.existsSync(f('walk.mp4'))) {
    // лицо (фото астронавта) едет по серому кадру слева направо за 2 с
    ff(['-f', 'lavfi', '-i', 'color=c=0x707070:s=640x360:r=25:d=2', '-loop', '1', '-i', FACE,
      '-filter_complex', "[1]scale=200:200[p];[0][p]overlay=x='20+200*t':y=80:shortest=1,format=yuv420p",
      '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', f('walk.mp4')]);
  }
  if (!fs.existsSync(f('plate.mp4'))) {
    // «номер» (кусок таблицы testsrc) едет по шумному фону: x от 60 до 420 за 3 с, чуть вверх-вниз
    ff(['-f', 'lavfi', '-i', 'color=c=0x5a6070:s=640x360:r=25:d=3', '-f', 'lavfi', '-i', 'testsrc=s=96x32:r=25:d=3',
      '-filter_complex', "[0]noise=alls=18:allf=t[bg];[bg][1]overlay=x='60+120*t':y='160+20*sin(2*t)':shortest=1,format=yuv420p",
      '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', f('plate.mp4')]);
  }
  if (!fs.existsSync(f('detail.mp4'))) {
    // мелкий узор (шум) во весь кадр — по нему видно, размыто или нет
    ff(['-f', 'lavfi', '-i', 'color=c=gray:s=640x360:r=25:d=2', '-vf', 'noise=alls=70:allf=t,format=yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '14', f('detail.mp4')]);
  }
});

describe('лица', () => {
  it('YuNet находит лицо на фото', async () => {
    const r = await detectFaces({ src: FACE, ss: 0, dur: 1, width: 512, height: 512, image: true });
    expect(r).toHaveLength(1);
    expect(r[0].dets).toHaveLength(1);
    const d = r[0].dets[0];
    expect(d.score).toBeGreaterThan(0.8);
    expect(d.x).toBeGreaterThan(0.35); expect(d.x).toBeLessThan(0.55);
    expect(d.y).toBeGreaterThan(0.15); expect(d.y).toBeLessThan(0.32);
  });

  it('лицо едет — одна дорожка, рамка едет следом', async () => {
    const frames = await detectFaces({ src: f('walk.mp4'), ss: 0, dur: 2, width: 640, height: 360 });
    expect(frames.length).toBeGreaterThanOrEqual(15);
    const tracks = linkTracks(frames);
    expect(tracks).toHaveLength(1);
    const reg = newRegion('f', 'face', tracks[0].map(padFace));
    const a = boxAt(reg, 0.2)!, b = boxAt(reg, 1.6)!;
    // лицо на фото — у x≈0.44 картинки 200 px: в кадре 20 + 200t + 88
    expect(Math.abs(a.x * 640 - (20 + 200 * 0.2 + 88))).toBeLessThan(18);
    expect(Math.abs(b.x * 640 - (20 + 200 * 1.6 + 88))).toBeLessThan(18);
  });
});

describe('номер', () => {
  it('трекер ведёт обведённый номер вперёд и назад от кадра, где обвели', async () => {
    const at = 1.2;
    const cx = (t: number) => (60 + 120 * t + 48) / 640, cy = (t: number) => (160 + 20 * Math.sin(2 * t) + 16) / 360;
    const boxes = await trackBox({ src: f('plate.mp4'), in: 0, out: 3, at, box: { x: cx(at), y: cy(at), w: 96 / 640, h: 32 / 360 }, width: 640, height: 360 });
    expect(boxes[0].t).toBeLessThan(0.15);
    expect(boxes[boxes.length - 1].t).toBeGreaterThan(2.8);
    const reg = newRegion('o', 'object', boxes);
    for (const t of [0.2, 0.8, 1.6, 2.5]) {
      const b = boxAt(reg, t)!;
      expect(Math.abs(b.x - cx(t)) * 640).toBeLessThan(6);
      expect(Math.abs(b.y - cy(t)) * 360).toBeLessThan(6);
    }
  });
});

/** Насколько «пёстрый» кусок кадра: среднее отличие соседних точек (по яркости). */
function detail(file: string, t: number, x: number, y: number, w: number, h: number): number {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `crop=${w}:${h}:${x}:${y},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  const d = r.stdout as Buffer;
  let s = 0, n = 0;
  for (let j = 0; j < h; j++) for (let i = 1; i < w; i++) { s += Math.abs(d[j * w + i] - d[j * w + i - 1]); n++; }
  return s / n;
}
function grayAt(file: string, t: number, x: number, y: number): number {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `crop=1:1:${x}:${y},format=gray`, '-f', 'rawvideo', '-']);
  return (r.stdout as Buffer)[0];
}

describe('экспорт со скрытием', () => {
  const project = (reg: BlurRegion): Project => {
    let p = newProject('t', '16:9');
    p = { ...p, settings: { ...p.settings, width: 640, height: 360 } };
    p = addAsset(p, assetFromFile('d', f('detail.mp4'), 'video'));
    p = addToMain(p, 'd', 0).project;
    const c = mainTrack(p).clips[0] as MediaClip;
    return updateClip(p, c.id, { blurs: [reg] });
  };
  // область едет: в 0 с — центр (0.3, 0.5), в 2 с — (0.7, 0.5)
  const moving = (style: BlurRegion['style']): BlurRegion => ({ ...newRegion('r', 'object', [{ t: 0, x: 0.3, y: 0.5, w: 0.25, h: 0.4 }, { t: 2, x: 0.7, y: 0.5, w: 0.25, h: 0.4 }]), style });

  it('размытие едет вместе с областью, остальной кадр не тронут', async () => {
    const p = project(moving('blur'));
    const masks = await makeBlurMasks(p, D, 25);
    expect(Object.keys(masks)).toHaveLength(1);
    runExport(p, f('blur.mp4'), { width: 640, height: 360, fps: 25, blurMasks: masks });
    // t = 0.5: центр области — x = 0.4·640 = 256
    const inside = detail(f('blur.mp4'), 0.5, 236, 160, 40, 40);
    const orig = detail(f('detail.mp4'), 0.5, 236, 160, 40, 40);
    expect(inside).toBeLessThan(orig * 0.35);
    // там, куда область ещё не доехала (x = 0.7) — как было
    const later = detail(f('blur.mp4'), 0.5, 428, 160, 40, 40);
    expect(later).toBeGreaterThan(detail(f('detail.mp4'), 0.5, 428, 160, 40, 40) * 0.8);
    // t = 1.5: область уже там (x = 0.6·640 = 384)
    expect(detail(f('blur.mp4'), 1.5, 364, 160, 40, 40)).toBeLessThan(detail(f('detail.mp4'), 1.5, 364, 160, 40, 40) * 0.35);
  });

  it('плашка закрашивает чёрным, мозаика — крупными квадратами', async () => {
    const pb = project(moving('black'));
    runExport(pb, f('black.mp4'), { width: 640, height: 360, fps: 25, blurMasks: await makeBlurMasks(pb, D, 25) });
    expect(grayAt(f('black.mp4'), 1, 320, 180)).toBeLessThan(25);
    expect(grayAt(f('black.mp4'), 1, 40, 40)).toBeGreaterThan(30); // угол кадра — не чёрный
    const pp = project(moving('pixel'));
    runExport(pp, f('pixel.mp4'), { width: 640, height: 360, fps: 25, blurMasks: await makeBlurMasks(pp, D, 25) });
    const px = detail(f('pixel.mp4'), 1, 300, 160, 40, 40);
    expect(px).toBeLessThan(detail(f('detail.mp4'), 1, 300, 160, 40, 40) * 0.6);
  });
});
