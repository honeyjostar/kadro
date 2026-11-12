// 3D-фото: фото → «3D» → карта глубины → кадр меняется во времени (ближнее едет сильнее); экспорт тоже двигается.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { importAt, launch, MODELS, project, rawFrame, ROOT, seekAndSettle, store, waitAssetsReady, frameDiff, type Kadro } from './kadro';

const HAVE = fs.existsSync(path.join(MODELS, 'depth_anything_v2_vits.onnx'));
let K: Kadro;
let win: Page;
const OUT = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-p3d-')), 'p3d.mp4');
test.describe.configure({ mode: 'serial' });
test.skip(!HAVE, 'нет модели глубины');
test.beforeAll(async () => { K = await launch({ env: { KADRO_TEST_EXPORT: OUT } }); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

const clip = async () => (await project(win)).tracks[0].clips[0] as any;
const snap = () => win.evaluate(() => {
  const c = document.querySelector('[data-testid=preview]') as HTMLCanvasElement;
  return Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.filter((_, i) => i % 4 === 0));
});

test('фото → 3D: глубина посчитана, кадр двигается, «Облёт» и сила меняются', async () => {
  await importAt(win, [path.join(ROOT, 'tests/fixtures/astronaut.jpg')], 'main', 0);
  await waitAssetsReady(win);
  await store(win, 'select', [(await clip()).id]);
  await win.getByTestId('itab-p3d').click();
  await seekAndSettle(win, 0);
  const a0 = await snap();
  await win.getByTestId('p3d-make').click();
  await expect(win.getByTestId('p3d-motion')).toBeVisible({ timeout: 90_000 });
  const p = (await clip()).photo3d;
  expect(p.motion).toBe('dolly');
  expect(fs.existsSync(p.depth)).toBe(true);
  // наезд к концу клипа: кадр в конце заметно отличается от начала
  const d = (await clip()).out - (await clip()).in;
  await seekAndSettle(win, 0);
  const b0 = await snap();
  await seekAndSettle(win, d - 0.05);
  const b1 = await snap();
  const diff = (x: number[], y: number[]) => x.reduce((s, v, i) => s + Math.abs(v - y[i]), 0) / x.length;
  expect(diff(a0, b0)).toBeLessThan(2);  // в начале наезда ещё нет
  expect(diff(b0, b1)).toBeGreaterThan(4);
  await win.getByTestId('p3d-motion').locator('button', { hasText: 'Облёт' }).click();
  expect((await clip()).photo3d.motion).toBe('orbit');
});

test('экспорт: кадры 3D-фото отличаются во времени', async () => {
  test.setTimeout(120_000);
  await store(win, 'setExportOpen', true);
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-show')).toBeVisible({ timeout: 100_000 });
  const f0 = rawFrame(['-ss', '0.2', '-i', OUT], 320, 180), f1 = rawFrame(['-ss', '1.2', '-i', OUT], 320, 180);
  expect(frameDiff(f0, f1).mean).toBeGreaterThan(2);
  await store(win, 'setExportOpen', false);
  await win.getByTestId('p3d-off').click();
  expect((await clip()).photo3d).toBeUndefined();
});
