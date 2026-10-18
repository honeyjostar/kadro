// Экспорт анимации по ключевым кадрам: положение, масштаб, поворот, прозрачность, текст по кадрам.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { addAsset, addFree, addToMain, mainTrack, setKeyframe, updateClip } from '../../src/shared/timeline';
import type { MediaClip, Project } from '../../src/shared/types';
import { FFMPEG, assetFromFile, ff, makeSolid, runExport, tmpDir } from '../helpers/media';

const D = tmpDir('anim');
const f = (n: string) => path.join(D, n);
const W = 540;
const H = 960;

beforeAll(() => {
  if (!fs.existsSync(f('black.mp4'))) makeSolid(f('black.mp4'), 'black', 3, 640, 360, 30, 440);
  if (!fs.existsSync(f('rect.png'))) ff(['-f', 'lavfi', '-i', 'color=c=red:s=200x100,format=rgb24', '-frames:v', '1', f('rect.png')]);
  if (!fs.existsSync(f('white.png'))) ff(['-f', 'lavfi', '-i', 'color=c=white:s=200x200,format=rgb24', '-frames:v', '1', f('white.png')]);
  if (!fs.existsSync(f('sq.png'))) ff(['-f', 'lavfi', '-i', 'color=c=red:s=400x400,format=rgb24', '-frames:v', '1', f('sq.png')]);
});

function frame(file: string, t: number): Buffer {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(String(r.stderr));
  return r.stdout;
}
/** Красные пиксели кадра: центр масс и рамка. */
function redBox(buf: Buffer) {
  let n = 0; let sx = 0; let sy = 0; let x0 = W; let x1 = -1; let y0 = H; let y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    if (buf[i] > 150 && buf[i + 1] < 90 && buf[i + 2] < 90) {
      n++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { n, cx: sx / n, cy: sy / n, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function base(): Project {
  let p = newProject('a', '9:16');
  p = addAsset(p, assetFromFile('blk', f('black.mp4'), 'video'));
  p = addAsset(p, assetFromFile('rect', f('rect.png'), 'image'));
  p = addAsset(p, assetFromFile('white', f('white.png'), 'image'));
  p = addAsset(p, assetFromFile('sq', f('sq.png'), 'image'));
  return addToMain(p, 'blk', 0).project;
}
const overlayId = (p: Project) => p.tracks.find((t) => t.kind === 'video')!.clips[0].id;

describe('ключевые кадры в экспорте', () => {
  it('движение по горизонтали: центр там же, где в превью', () => {
    let p = addFree(base(), 'rect', 0).project;
    const id = overlayId(p);
    p = updateClip(p, id, { transform: { scale: 0.3, x: 0, y: 0, rotation: 0 } }); // ширина 162 — не выходит за край
    p = setKeyframe(p, id, 'x', 0, -0.3);
    p = setKeyframe(p, id, 'x', 2, 0.3);
    p = updateClip(p, id, { keyframes: { x: (p.tracks.find((t) => t.kind === 'video')!.clips[0] as MediaClip).keyframes!.x!.map((k) => ({ ...k, ease: 'linear' as const })) } });
    runExport(p, f('move.mp4'), { width: W, height: H });
    for (const [t, x] of [[0, -0.3], [1, 0], [1.5, 0.15], [2, 0.3], [2.5, 0.3]] as const) {
      const b = redBox(frame(f('move.mp4'), t));
      expect(Math.abs(b.cx - (W / 2 + x * W)), `t=${t}: ${b.cx}`).toBeLessThan(3);
      expect(Math.abs(b.cy - H / 2)).toBeLessThan(3);
      expect(Math.abs(b.w - 162)).toBeLessThan(4);
    }
  });

  it('масштаб и поворот по ключам', () => {
    let p = addFree(base(), 'rect', 0).project;
    const id = overlayId(p);
    p = setKeyframe(p, id, 'scale', 0, 0.25);
    p = setKeyframe(p, id, 'scale', 2, 1);
    p = setKeyframe(p, id, 'rotation', 0, 0);
    p = setKeyframe(p, id, 'rotation', 2, 90);
    const lin = (c: MediaClip) => ({ scale: c.keyframes!.scale!.map((k) => ({ ...k, ease: 'linear' as const })), rotation: c.keyframes!.rotation!.map((k) => ({ ...k, ease: 'linear' as const })) });
    p = updateClip(p, id, { keyframes: lin(p.tracks.find((t) => t.kind === 'video')!.clips[0] as MediaClip) });
    runExport(p, f('scale.mp4'), { width: W, height: H });
    const b0 = redBox(frame(f('scale.mp4'), 0));
    expect(Math.abs(b0.w - 135)).toBeLessThan(4);  // 540 × 0.25
    expect(Math.abs(b0.h - 67.5)).toBeLessThan(4);
    const b2 = redBox(frame(f('scale.mp4'), 2.2));  // повёрнут на 90°: ширина и высота поменялись
    expect(Math.abs(b2.w - 270)).toBeLessThan(5);
    expect(Math.abs(b2.h - 540)).toBeLessThan(5);
    expect(Math.abs(b2.cx - W / 2)).toBeLessThan(3);
  });

  it('прозрачность: постоянная и по ключам', () => {
    let p = addFree(base(), 'white', 0).project;
    const id = overlayId(p);
    p = updateClip(p, id, { opacity: 0.5 });
    runExport(p, f('op1.mp4'), { width: W, height: H });
    const px = (file: string, t: number) => { const b = frame(file, t); const i = (480 * W + 270) * 3; return b[i]; };
    expect(Math.abs(px(f('op1.mp4'), 1) - 128)).toBeLessThan(6);
    p = setKeyframe(p, id, 'opacity', 0, 0);
    p = setKeyframe(p, id, 'opacity', 2, 1);
    p = updateClip(p, id, { keyframes: { opacity: (p.tracks.find((t) => t.kind === 'video')!.clips[0] as MediaClip).keyframes!.opacity!.map((k) => ({ ...k, ease: 'linear' as const })) } });
    runExport(p, f('op2.mp4'), { width: W, height: H });
    expect(px(f('op2.mp4'), 0)).toBeLessThan(8);
    expect(Math.abs(px(f('op2.mp4'), 1) - 128)).toBeLessThan(8);
    expect(px(f('op2.mp4'), 2.5)).toBeGreaterThan(247);
  });

  it('основная дорожка: наезд на фото (Ken Burns)', () => {
    let p = newProject('k', '9:16');
    p = addAsset(p, assetFromFile('sq', f('sq.png'), 'image'));
    p = addToMain(p, 'sq', 0).project;
    const id = mainTrack(p).clips[0].id;
    p = setKeyframe(p, id, 'scale', 0, 1);
    p = setKeyframe(p, id, 'scale', 3, 2);
    runExport(p, f('kb.mp4'), { width: W, height: H });
    const b0 = redBox(frame(f('kb.mp4'), 0));
    expect(Math.abs(b0.w - 540)).toBeLessThan(3);
    expect(Math.abs(b0.h - 540)).toBeLessThan(4);
    const b1 = redBox(frame(f('kb.mp4'), 2.9));
    expect(b1.w).toBe(540); // шире кадра — обрезано по краям
    expect(b1.h).toBeGreaterThan(1000 * 0.9 > 960 ? 959 : 900);
  });
});

describe('маски, хромакей, режимы наложения в экспорте', () => {
  it('маска круг с растушёвкой: края как в формуле превью', async () => {
    const { maskAlpha } = await import('../../src/shared/mask');
    let p = addFree(base(), 'white', 0).project; // 200×200, масштаб 0.6 → 324×324 по центру
    const id = overlayId(p);
    const mask = { shape: 'circle' as const, x: 0.1, y: 0, w: 0.6, h: 0.6, rotation: 0, feather: 0.1, invert: false };
    p = updateClip(p, id, { mask });
    runExport(p, f('mask.mp4'), { width: W, height: H });
    const b = frame(f('mask.mp4'), 1);
    const box = 324; const x0 = (W - box) / 2; const y0 = (H - box) / 2;
    for (const [u, v] of [[0.6, 0.5], [0.15, 0.5], [0.9, 0.5], [0.6, 0.2], [0.33, 0.5], [0.6, 0.79]]) {
      const px = Math.round(x0 + u * box); const py = Math.round(y0 + v * box);
      const exp = maskAlpha(mask, px - x0 + 0.5, py - y0 + 0.5, box, box) * 255;
      expect(Math.abs(b[(py * W + px) * 3] - exp), `(${u},${v}) ждали ${exp.toFixed(0)}`).toBeLessThan(10);
    }
  });

  it('хромакей: зелёный фон убран, красный предмет остался', () => {
    if (!fs.existsSync(f('green.mp4'))) {
      ff(['-f', 'lavfi', '-i', 'color=c=0x00b140:s=640x360:r=30:d=3,drawbox=x=220:y=100:w=200:h=160:color=red@1:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', f('green.mp4')]);
    }
    let p = base();
    p = addAsset(p, assetFromFile('green', f('green.mp4'), 'video'));
    p = addFree(p, 'green', 0).project;
    const id = overlayId(p);
    p = updateClip(p, id, { chroma: { color: '#00b140', similarity: 0.12, smoothness: 0.05 }, transform: { scale: 1, x: 0, y: 0, rotation: 0 } });
    runExport(p, f('chroma.mp4'), { width: W, height: H });
    const b = frame(f('chroma.mp4'), 1);
    const at = (x: number, y: number) => [...b.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)];
    // кадр 640×360 вписан в 540 по ширине: высота 304, сверху поле 328
    expect(at(30, 400).every((v) => v < 20), `фон ${at(30, 400)}`).toBe(true);
    const red = at(270, 480);
    expect(red[0] > 200 && red[1] < 60 && red[2] < 60, `предмет ${red}`).toBe(true);
  });

  it('режим наложения «умножение»', () => {
    if (!fs.existsSync(f('gray.png'))) ff(['-f', 'lavfi', '-i', 'color=c=0x808080:s=200x200,format=rgb24', '-frames:v', '1', f('gray.png')]);
    if (!fs.existsSync(f('yellowv.mp4'))) makeSolid(f('yellowv.mp4'), 'yellow', 3, 640, 360, 30, 440);
    let p = newProject('b', '9:16');
    p = addAsset(p, assetFromFile('yel', f('yellowv.mp4'), 'video'));
    p = addAsset(p, assetFromFile('gray', f('gray.png'), 'image'));
    p = addToMain(p, 'yel', 0).project;
    p = addFree(p, 'gray', 0).project;
    const id = overlayId(p);
    p = updateClip(p, id, { blend: 'multiply' });
    runExport(p, f('blend.mp4'), { width: W, height: H });
    const b = frame(f('blend.mp4'), 1);
    const i = (480 * W + 270) * 3;
    expect(Math.abs(b[i] - 128)).toBeLessThan(8);     // 255 × 128/255
    expect(Math.abs(b[i + 1] - 128)).toBeLessThan(8);
    expect(b[i + 2]).toBeLessThan(10);
    const j = (480 * W + 20) * 3; // вне картинки — жёлтый без изменений
    expect(b[j]).toBeGreaterThan(240);
  });
});
