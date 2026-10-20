// Авто-ролик: разбор настоящего видео через FFmpeg (склейки, лучшие места) и экспорт собранного монтажа во всех стилях.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.KADRO_DATA = path.join(os.tmpdir(), 'kadro-tests', 'data');

import { highlights } from '../../src/main/highlights';
import { AUTO_STYLES, autoEdit, type Highlights } from '../../src/shared/autoEdit';
import { newProject } from '../../src/shared/defaults';
import { projectDuration } from '../../src/shared/timeline';
import { assetFromFile, ff, makeImage, makeTone, probe, runExport, tmpDir } from '../helpers/media';

const D = tmpDir('autoedit');
const f = (n: string) => path.join(D, n);
const VIDEO = f('trip.mp4');
const OTHER = f('bars.mp4');
const PHOTO = f('photo.png');
const MUSIC = f('music.mp3');
let hl: Highlights;

beforeAll(async () => {
  if (!fs.existsSync(VIDEO)) {
    // 0–3 с: чёткая движущаяся картинка; 3–6 с: размытая и тёмная (неудачный кусок); 6–9 с: снова чёткая, другая сцена
    ff(['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=3',
      '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=3,boxblur=12:2,eq=brightness=-0.45',
      '-f', 'lavfi', '-i', 'mandelbrot=s=320x180:r=30,trim=duration=3,setpts=PTS-STARTPTS',
      '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0,format=yuv420p[v]', '-map', '[v]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '15', VIDEO]);
  }
  if (!fs.existsSync(OTHER)) ff(['-f', 'lavfi', '-i', 'smptebars=s=180x320:r=30:d=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', OTHER]);
  if (!fs.existsSync(PHOTO)) makeImage(PHOTO, 'orange', 640, 480);
  if (!fs.existsSync(MUSIC)) makeTone(MUSIC, 330, 30);
  hl = await highlights(VIDEO, 9);
}, 120_000);

describe('авто-ролик с настоящими файлами', () => {
  it('разбор видео: склейки найдены, размытый тёмный кусок оценён ниже', () => {
    expect(hl.step).toBe(0.25);
    expect(hl.score.length).toBeGreaterThanOrEqual(35);
    expect(hl.cuts.some((c) => Math.abs(c - 3) < 0.3), `склейки: ${hl.cuts}`).toBe(true);
    expect(hl.cuts.some((c) => Math.abs(c - 6) < 0.3), `склейки: ${hl.cuts}`).toBe(true);
    const mean = (a: number, b: number) => { const s = hl.score.slice(a * 4 + 1, b * 4 - 1); return s.reduce((x, y) => x + y, 0) / s.length; };
    expect(mean(0, 3)).toBeGreaterThan(mean(3, 6) + 0.15);
    expect(mean(6, 9)).toBeGreaterThan(mean(3, 6) + 0.15);
  });

  it('повторный разбор того же файла — мгновенно (из памяти)', async () => {
    const t0 = Date.now();
    const again = await highlights(VIDEO, 9);
    expect(Date.now() - t0).toBeLessThan(50);
    expect(again).toBe(hl);
  });

  it.each(AUTO_STYLES.map((s) => [s.label, s.id] as const))('%s: экспорт собранного ролика нужной длины, без кусков через склейку', (_l, style) => {
    const music = { ...assetFromFile('music', MUSIC, 'audio'), beats: Array.from({ length: 58 }, (_, i) => 0.25 + i * 0.5), bpm: 120 };
    const video = assetFromFile('trip', VIDEO, 'video');
    const { project, summary } = autoEdit(newProject('x'), {
      media: [{ asset: video, hl }, { asset: assetFromFile('photo', PHOTO, 'image') }, { asset: assetFromFile('bars', OTHER, 'video') }],
      music, style, aspect: '9:16', length: 8, title: '', videoSound: 'off', seed: 1,
    });
    expect(summary.used).toBeGreaterThanOrEqual(2); // «Кино» — длинные кадры: в 8 с влезают не все файлы
    // куски «trip» не переходят через его внутренние склейки (3 и 6 с) и не берутся из размытого места целиком
    for (const c of project.tracks[0].clips) {
      if (c.type !== 'media' || c.assetId !== 'trip') continue;
      // (кусок длиннее любой сцены — 3 с — без склейки не взять: тогда допустимо)
      if (c.out - c.in < 2.8) for (const cut of hl.cuts) expect(c.in < cut - 0.1 && c.out > cut + 0.1, `кусок ${c.in}–${c.out} через склейку ${cut}`).toBe(false);
      expect(c.in >= 3.2 && c.out <= 5.8, `кусок ${c.in}–${c.out} из неудачного места`).toBe(false);
    }
    const out = f(`auto_${style}.mp4`);
    fs.rmSync(out, { force: true });
    runExport(project, out, { width: 270, height: 480 });
    const pr = probe(out);
    expect(Math.abs(pr.duration - projectDuration(project))).toBeLessThan(0.15);
    expect(pr.hasAudio).toBe(true);
  }, 120_000);
});
