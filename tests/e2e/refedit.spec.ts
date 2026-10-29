// «Повторить монтаж по ролику»: ролик-образец → склейки на тех же кадрах, музыка образца, шаблон в «Моих шаблонах»;
// свои видео и фото встают в окошки.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ff, launch, media, project, store, type Kadro } from './kadro';
import type { MediaClip } from '../../src/shared/types';

/** Образец 9:16: четыре разных кадра (0.8 + 1.2 + 0.6 + 1.4 с) и музыка. */
const reference = () => media('ref_sample.mp4', (f) => ff([
  '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=0.8', '-f', 'lavfi', '-i', 'smptebars=s=360x640:r=30:d=1.2',
  '-f', 'lavfi', '-i', 'mandelbrot=s=360x640:r=30,trim=duration=0.6', '-f', 'lavfi', '-i', 'rgbtestsrc=s=360x640:r=30:d=1.4',
  '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=4',
  '-filter_complex', '[0:v]setsar=1[a];[1:v]setsar=1[b];[2:v]setsar=1,setpts=PTS-STARTPTS[c];[3:v]setsar=1[d];[a][b][c][d]concat=n=4:v=1:a=0,format=yuv420p[v]',
  '-map', '[v]', '-map', '4:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '15', '-c:a', 'aac', '-t', '4', f]));
const mine = () => media('ref_mine.mp4', (f) => ff(['-f', 'lavfi', '-i', 'testsrc=s=640x360:r=30:d=8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', f]));
const photo = () => media('ref_photo.png', (f) => ff(['-f', 'lavfi', '-i', 'color=c=orange:s=400x400', '-frames:v', '1', f]));

let K: Kadro;
let win: Page;
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);
test.beforeAll(async () => { K = await launch({ env: { KADRO_TEST_PICK: [mine(), photo()].join('|') } }); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

test('образец разобран: 4 кадра, музыка, шаблон сохранён', async () => {
  await win.getByTestId('tab-templates').click();
  await expect(win.getByTestId('tpl-ref')).toBeVisible();
  await store(win, 'setRefOpen', { fresh: false, ref: reference() });
  const dlg = win.getByTestId('ref-dialog');
  await expect(dlg).toBeVisible();
  await expect(win.getByTestId('ref-info')).toBeVisible({ timeout: 60_000 });
  await expect(win.getByTestId('ref-summary')).toContainText('кадров: 4');
  await expect(win.getByTestId('ref-strip').locator('i')).toHaveCount(4);
  await expect(dlg).toContainText('музыка из ролика');
  const tplDir = path.join(K.data, 'templates');
  const saved = fs.readdirSync(tplDir);
  expect(saved.some((f) => f.endsWith('.json'))).toBe(true);
  expect(saved.some((f) => f.endsWith('.m4a'))).toBe(true);
  await expect(win.getByTestId('ref-build')).toBeDisabled();
});

test('свои файлы → монтаж с теми же склейками и музыкой образца', async () => {
  await win.getByTestId('ref-add-files').click();
  await expect(win.getByTestId('ref-file')).toHaveCount(2);
  await expect(win.getByTestId('ref-fit')).toContainText('Окошек 4, файлов 2');
  await win.getByTestId('ref-build').click();
  await expect(win.getByTestId('ref-dialog')).toHaveCount(0, { timeout: 60_000 });
  const p = await project(win);
  expect(p.settings.aspect).toBe('9:16');
  const clips = p.tracks[0].clips as MediaClip[];
  expect(clips.map((c) => Math.round(c.start * 30))).toEqual([0, 24, 60, 78]);
  const music = p.tracks.find((t) => t.kind === 'audio')!.clips[0] as MediaClip;
  expect(p.assets.find((a) => a.id === music.assetId)!.path).toMatch(/templates[\\/]ref_.*\.m4a$/);
  for (const c of clips) if (p.assets.find((a) => a.id === c.assetId)!.kind === 'video') expect(c.muted).toBe(true);
  // шаблон — в «Моих шаблонах»
  await win.getByTestId('tab-templates').click();
  await expect(win.getByText('По ролику «ref_sample»').first()).toBeVisible();
});
