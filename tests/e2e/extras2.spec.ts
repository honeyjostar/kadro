// Мелочи к 1.0: стикеры (эмодзи с движением по кругу), бумеранг (вперёд-назад, без звука),
// цвет как у другого клипа (LUT с переносом цвета) — в плеере и в экспорте.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { act, importAt, launch, previewPixel, project, seekAndSettle, solidVideo, store, talkVideo, waitAssetsReady, type Kadro } from './kadro';

let K: Kadro;
test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);
test.beforeAll(async () => { K = await launch(); });
test.afterAll(async () => { await K?.app.close(); });

test('стикер: эмодзи у курсора, двигается по кругу, в экспорте есть', async () => {
  const win = K.win;
  await act(win, 'newProjectAction', '9:16');
  await importAt(win, [solidVideo('grey5.mp4', 'gray', 5)], 'main', 0);
  await waitAssetsReady(win);
  await seekAndSettle(win, 1);
  await win.getByTestId('tab-text').click();
  await win.getByTestId('sticker-motion').locator('[data-value=wiggle]').click();
  await win.getByTestId('stickers').getByTestId('sticker').first().click();
  const t = (await project(win)).tracks.flatMap((x) => x.clips).find((c: any) => c.loop) as any;
  expect(t).toMatchObject({ loop: 'wiggle', start: 1, duration: 3 });
  // в разные моменты стикер повёрнут по-разному
  const rot = (local: number) => win.evaluate(([c, l]) => (window as any).__kadro.textRender.textStateAt(c, l).rotation, [t, local] as const);
  expect(Math.abs((await rot(0.4)) - (await rot(0.6)))).toBeGreaterThan(3);
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-st-')), 's.mp4');
  const r = await act(win, 'exportTo', out, 360, 30);
  expect(r.ok, r.error).toBe(true);
});

test('бумеранг: кусок вперёд, назад, вперёд, назад — без звука, одним шагом', async () => {
  const win = K.win;
  await act(win, 'newProjectAction', '16:9');
  await importAt(win, [talkVideo()], 'main', 0);
  await waitAssetsReady(win);
  await seekAndSettle(win, 0.5);
  const id = (await project(win)).tracks[0].clips[0].id;
  await store(win, 'select', [id]);
  await win.getByTestId('itab-speed').click();
  await win.getByTestId('boomerang').click();
  await expect.poll(async () => (await project(win)).tracks[0].clips.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(5);
  const clips = (await project(win)).tracks[0].clips as any[];
  const i = clips.findIndex((c) => c.start === 0.5 || Math.abs(c.start - 0.5) < 0.02);
  const seq = clips.slice(i, i + 4);
  expect(seq.map((c) => !!c.retime?.reverse)).toEqual([false, true, false, true]);
  expect(seq.every((c) => c.muted && c.speed === 1.5)).toBe(true);
  await win.locator('body').click({ position: { x: 700, y: 300 } });
  await win.keyboard.press('Control+z');
  await expect.poll(async () => (await project(win)).tracks[0].clips.length).toBe(1);
});

test('цвет как у другого клипа: синий клип становится похож на оранжевый', async () => {
  const win = K.win;
  await act(win, 'newProjectAction', '16:9');
  await importAt(win, [solidVideo('blueish3.mp4', '0x3050c0', 3), solidVideo('orange3.mp4', '0xd08040', 3)], 'main', 0);
  await waitAssetsReady(win);
  const [a, b] = (await project(win)).tracks[0].clips.map((c) => c.id);
  await store(win, 'select', [a]);
  await win.getByTestId('itab-color').click();
  await expect(win.getByTestId('match-color')).toBeVisible();
  await win.getByTestId('match-ref').selectOption(b);
  await win.getByTestId('match-run').click();
  await expect.poll(async () => ((await project(win)).tracks[0].clips[0] as any).grade?.lut?.path ?? '', { timeout: 30_000 }).toMatch(/\.cube$/);
  await seekAndSettle(win, 1);
  const px = await previewPixel(win, 0.5, 0.5);
  expect(px[0]).toBeGreaterThan(px[2] + 60); // был синий — стал тёплым
  expect(K.errors).toEqual([]);
});
