// Корректирующий слой: кнопка в «Фильтрах» → слой поверх → его насыщенность 0 делает ч/б всё под ним; экспорт так же.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { colorsVideo, importAt, launch, previewPixel, project, rawFrame, seekAndSettle, setSlider, store, waitAssetsReady, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
const OUT = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-adj-')), 'adj.mp4');
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { K = await launch({ env: { KADRO_TEST_EXPORT: OUT } }); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });
const gray = (px: number[]) => Math.max(...px) - Math.min(...px) < 24;

test('слой из «Фильтров»: ч/б всё под ним, только пока он идёт', async () => {
  await importAt(win, [colorsVideo()], 'main', 0);
  await waitAssetsReady(win);
  await store(win, 'setPlayhead', 1);
  await win.getByTestId('tab-filters').click();
  await win.getByTestId('add-adjust').click();
  const p = await project(win);
  const adj = p.tracks.flatMap((t) => t.clips).find((c: any) => p.assets.find((a) => a.id === c.assetId)?.adjust) as any;
  expect(adj.start).toBe(1);
  expect(adj.out - adj.in).toBeCloseTo(3, 1); // до конца клипа под ним
  await expect(win.locator('.clip.adjust')).toHaveCount(1);
  await expect(win.getByTestId('adjust-basic')).toBeVisible();
  await win.getByTestId('itab-color').click();
  await setSlider(win, 'saturation', 0);
  await seekAndSettle(win, 0.5);
  expect(gray(await previewPixel(win, 0.5, 0.5))).toBe(false);
  await seekAndSettle(win, 1.5);
  expect(gray(await previewPixel(win, 0.5, 0.5))).toBe(true); // зелёная секунда стала серой
});

test('экспорт: так же', async () => {
  test.setTimeout(120_000);
  await store(win, 'setExportOpen', true);
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-show')).toBeVisible({ timeout: 100_000 });
  const px = (t: number) => { const fr = rawFrame(['-ss', String(t), '-i', OUT], 64, 64); const i = (32 * 64 + 32) * 3; return [fr[i], fr[i + 1], fr[i + 2]]; };
  expect(gray(px(0.5))).toBe(false);
  expect(gray(px(1.5))).toBe(true);
  expect(gray(px(2.5))).toBe(true);
});
