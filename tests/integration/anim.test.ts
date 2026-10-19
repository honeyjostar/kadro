// Экспорт анимации по ключевым кадрам: положение, масштаб, поворот, прозрачность, текст по кадрам.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { addAsset, addFree, addToMain, mainTrack, setKeyframe, updateClip } from '../../src/shared/timeline';
import type { MediaClip, Project } from '../../src/shared/types';
import { FFMPEG, assetFromFile, ff, makeSolid, probe, runExport, tmpDir } from '../helpers/media';

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

describe('видеоэффекты в экспорте', () => {
  const fx = async () => import('../../src/shared/effects');
  function lrImage(): string {
    if (!fs.existsSync(f('lr.png'))) ff(['-f', 'lavfi', '-i', 'color=c=red:s=100x200,format=rgb24', '-f', 'lavfi', '-i', 'color=c=blue:s=100x200,format=rgb24', '-filter_complex', '[0][1]hstack', '-frames:v', '1', f('lr.png')]);
    return f('lr.png');
  }
  function onMain(effects: { type: string; amount: number }[], file = lrImage()): Project {
    let p = newProject('fx', '1:1');
    p = addAsset(p, assetFromFile('lr', file, 'image'));
    p = addToMain(p, 'lr', 0).project;
    return updateClip(p, mainTrack(p).clips[0].id, { effects: effects as never });
  }
  const px = (buf: Buffer, w: number, x: number, y: number) => [...buf.subarray((y * w + x) * 3, (y * w + x) * 3 + 3)];

  it('зеркало, негатив, RGB-сдвиг, вспышка', async () => {
    runExport(onMain([{ type: 'mirror', amount: 1 }]), f('fx_mirror.mp4'), { width: 400, height: 400 });
    let b = frame2(f('fx_mirror.mp4'), 1, 400, 400);
    // картинка 200×200 растянута до 400×400: справа теперь отражение левой (красной) половины
    expect(px(b, 400, 350, 200)[0]).toBeGreaterThan(200);
    expect(px(b, 400, 350, 200)[2]).toBeLessThan(50);
    runExport(onMain([{ type: 'invert', amount: 1 }]), f('fx_inv.mp4'), { width: 400, height: 400 });
    b = frame2(f('fx_inv.mp4'), 1, 400, 400);
    expect(px(b, 400, 50, 200)[1]).toBeGreaterThan(200); // красный → голубой
    expect(px(b, 400, 50, 200)[0]).toBeLessThan(50);
    runExport(onMain([{ type: 'flash', amount: 1 }]), f('fx_flash.mp4'), { width: 400, height: 400 });
    expect(px(frame2(f('fx_flash.mp4'), 0, 400, 400), 400, 50, 200).every((v) => v > 240)).toBe(true);
    expect(px(frame2(f('fx_flash.mp4'), 1, 400, 400), 400, 50, 200)[1]).toBeLessThan(40);
    const { rgbShiftAt } = await fx();
    runExport(onMain([{ type: 'rgbsplit', amount: 1 }]), f('fx_rgb.mp4'), { width: 400, height: 400 });
    b = frame2(f('fx_rgb.mp4'), 1, 400, 400);
    const s = rgbShiftAt([{ type: 'rgbsplit', amount: 1 }], 400, 0);
    // красный уезжает влево, синий вправо: на стыке (x=200) открывается тёмная щель шириной 2·d
    expect(s.rh).toBe(-8);
    expect(Math.max(...px(b, 400, 200, 200))).toBeLessThan(50);
    expect(px(b, 400, 180, 200)[0]).toBeGreaterThan(200);
    expect(px(b, 400, 220, 200)[2]).toBeGreaterThan(200);
  });

  it('виньетка по той же формуле, что в превью', async () => {
    if (!fs.existsSync(f('white2.png'))) ff(['-f', 'lavfi', '-i', 'color=c=white:s=200x200,format=rgb24', '-frames:v', '1', f('white2.png')]);
    const { vignetteBytes } = await fx();
    runExport(onMain([{ type: 'vignette', amount: 0.8 }], f('white2.png')), f('fx_vig.mp4'), { width: 400, height: 400 });
    const b = frame2(f('fx_vig.mp4'), 1, 400, 400);
    const v = vignetteBytes(400, 400, 0.8);
    for (const [x, y] of [[200, 200], [40, 40], [100, 300], [380, 200], [10, 390]]) {
      expect(Math.abs(px(b, 400, x, y)[0] - v[y * 400 + x]), `(${x},${y})`).toBeLessThan(8);
    }
  });

  it('тряска и пульс: смещение по той же формуле', async () => {
    const { fxGeometry } = await fx();
    let p = newProject('sh', '9:16');
    p = addAsset(p, assetFromFile('blk', f('black.mp4'), 'video'));
    p = addAsset(p, assetFromFile('rect', f('rect.png'), 'image'));
    p = addToMain(p, 'blk', 0).project;
    p = addFree(p, 'rect', 0).project;
    const id = overlayId(p);
    const effects = [{ type: 'shake' as const, amount: 1 }, { type: 'pulse' as const, amount: 1 }];
    p = updateClip(p, id, { effects, transform: { scale: 0.3, x: 0, y: 0, rotation: 0 } });
    runExport(p, f('fx_shake.mp4'), { width: W, height: H });
    for (const t of [0.1, 0.5, 1.2, 2.3]) {
      const g = fxGeometry(effects, Math.round(t * 30) / 30);
      const b = redBox(frame(f('fx_shake.mp4'), t));
      expect(Math.abs(b.cx - (W / 2 + g.dx * W)), `t=${t} x`).toBeLessThan(3);
      expect(Math.abs(b.cy - (H / 2 + g.dy * H)), `t=${t} y`).toBeLessThan(3);
    }
  });

  it('радуга и глитч по кадрам', async () => {
    const { hueMatrix, rainbowAngle } = await fx();
    runExport(onMain([{ type: 'rainbow', amount: 0.5 }]), f('fx_rb.mp4'), { width: 400, height: 400, fps: 30 });
    for (const t of [0.5, 1.5]) {
      const m = hueMatrix(rainbowAngle({ type: 'rainbow', amount: 0.5 }, t));
      const exp = [0, 1, 2].map((i) => Math.min(255, Math.max(0, m[i][0] * 254)));
      const got = px(frame2(f('fx_rb.mp4'), t, 400, 400), 400, 50, 200);
      for (let i = 0; i < 3; i++) expect(Math.abs(got[i] - exp[i]), `t=${t} ${got} vs ${exp}`).toBeLessThan(12);
    }
    runExport(onMain([{ type: 'glitch', amount: 1 }, { type: 'pixelate', amount: 0.3 }, { type: 'vhs', amount: 0.5 }, { type: 'grain', amount: 0.3 }, { type: 'blur', amount: 0.3 }]), f('fx_mix.mp4'), { width: 400, height: 400 });
    expect(probe(f('fx_mix.mp4')).duration).toBeGreaterThan(2.9);
  });
});

function frame2(file: string, t: number, w: number, h: number): Buffer {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 << 20 });
  if (r.status !== 0 || r.stdout.length < w * h * 3) throw new Error(String(r.stderr));
  return r.stdout;
}

describe('кривые, HSL, LUT в экспорте', () => {
  it('цвета в файле совпадают с расчётом таблицы (как в превью)', async () => {
    const { gradeTable, applyTable, parseCube, GRADE_N } = await import('../../src/shared/grade');
    const bars = ['0xd83c3c', '0xe0c040', '0x3cb45a', '0x3c6ee0', '0x808080', '0xf0f0f0', '0x202020', '0xa040c0'];
    if (!fs.existsSync(f('bars.png'))) {
      ff([...bars.flatMap((c) => ['-f', 'lavfi', '-i', `color=c=${c}:s=50x200,format=rgb24`]), '-filter_complex', `${bars.map((_, i) => `[${i}]`).join('')}hstack=inputs=${bars.length}`, '-frames:v', '1', f('bars.png')]);
    }
    const lines = ['LUT_3D_SIZE 9'];
    for (let b = 0; b < 9; b++) for (let g = 0; g < 9; g++) for (let r = 0; r < 9; r++) lines.push(`${(b / 8) ** 0.9} ${g / 8} ${Math.min(1, (r / 8) * 1.1)}`);
    const lut = parseCube(lines.join('\n'));
    const grade = {
      curves: { all: [{ x: 0, y: 0.04 }, { x: 0.3, y: 0.22 }, { x: 0.7, y: 0.8 }, { x: 1, y: 0.97 }], b: [{ x: 0, y: 0 }, { x: 0.5, y: 0.6 }, { x: 1, y: 1 }] },
      hsl: { red: { h: 0.4, s: -0.5, l: 0.2 }, blue: { h: -0.3, s: 0.4, l: -0.3 } },
      lut: { path: '/x/test.cube', name: 'test', amount: 0.7 },
    };
    let p = newProject('gr', '16:9');
    p = addAsset(p, assetFromFile('bars', f('bars.png'), 'image'));
    p = addToMain(p, 'bars', 0).project;
    p = updateClip(p, mainTrack(p).clips[0].id, { grade: grade as never });
    runExport(p, f('grade.mp4'), { width: 800, height: 450, luts: { '/x/test.cube': lut } } as never);
    const t = gradeTable(grade as never, lut);
    const b = frame2(f('grade.mp4'), 1, 800, 450);
    // картинка 400×200 вписана в кадр 800×450 как 800×400: полосы по 100 px
    bars.forEach((c, i) => {
      const n = parseInt(c.slice(2), 16);
      const want = applyTable(t, GRADE_N, (n >> 16) & 255, (n >> 8) & 255, n & 255);
      const got = (() => { const x = Math.round((i + 0.5) * 100); const y = 225; return [...b.subarray((y * 800 + x) * 3, (y * 800 + x) * 3 + 3)]; })();
      for (let ch = 0; ch < 3; ch++) expect(Math.abs(got[ch] - want[ch]), `полоса ${c}: ${got} вместо ${want}`).toBeLessThan(7);
    });
  });
});
