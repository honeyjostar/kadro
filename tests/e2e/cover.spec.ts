// Обложка в один клик: окно само находит кадры, заголовок — название проекта; PNG 1280×720 и 1080×1920.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { act, colorsVideo, importAt, launch, patternImage, store, waitAssetsReady } from './kadro';

test('кадры-кандидаты, заголовок, стиль, сохранение обеих обложек', async () => {
  test.setTimeout(120_000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-cover-'));
  const K = await launch({ env: { KADRO_TEST_FRAME: dir } });
  const win = K.win;
  await act(win, 'newProjectAction', '9:16');
  await importAt(win, [colorsVideo(), patternImage()], 'main', 0);
  await waitAssetsReady(win);
  await win.evaluate(() => (window as any).__kadro.useStore.getState().commit((p: any) => ({ ...p, name: 'Мой первый монтаж' })));
  await win.keyboard.press('Control+k');
  await win.getByTestId('search-input').fill('обложка');
  await win.keyboard.press('Enter');
  const dlg = win.getByTestId('cover-dialog');
  await expect(dlg).toBeVisible();
  await expect(win.getByTestId('cover-frame').first()).toBeVisible({ timeout: 30_000 });
  expect(await win.getByTestId('cover-frame').count()).toBeGreaterThanOrEqual(2);
  await expect(win.getByTestId('cover-title')).toHaveValue('Мой первый монтаж');
  // вертикальный проект — вертикальная обложка по умолчанию
  expect(await win.getByTestId('cover-canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([1080, 1920]);
  await win.getByTestId('cover-format').locator('[data-value="youtube"]').click();
  expect(await win.getByTestId('cover-canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([1280, 720]);
  await win.getByTestId('cover-title').fill('Как я *смонтировал* ролик');
  await win.getByTestId('cover-style').locator('[data-value="plate"]').click();
  await win.getByTestId('cover-frame').nth(1).click();
  await expect(win.getByTestId('cover-frame').nth(1)).toHaveClass(/active/);
  // в кадре есть заголовок: светлые пиксели текста внизу
  const bright = await win.getByTestId('cover-canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, c.height * 0.55, c.width, c.height * 0.4).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) n++;
    return n;
  });
  expect(bright).toBeGreaterThan(500);
  await win.getByTestId('cover-save-both').click();
  await expect.poll(() => fs.readdirSync(dir).filter((f) => f.endsWith('.png')).length, { timeout: 20_000 }).toBe(2);
  const sizeOf = (f: string) => { const b = fs.readFileSync(path.join(dir, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  const files = fs.readdirSync(dir);
  expect(sizeOf(files.find((f) => f.includes('YouTube'))!)).toEqual([1280, 720]);
  expect(sizeOf(files.find((f) => f.includes('TikTok'))!)).toEqual([1080, 1920]);
  expect(K.errors).toEqual([]);
  await K.app.close();
});

test('после экспорта — кнопка «Обложка»', async () => {
  test.setTimeout(120_000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-cover-'));
  const K = await launch({ env: { KADRO_TEST_EXPORT: path.join(dir, 'v.mp4') } });
  const win = K.win;
  await importAt(win, [colorsVideo()], 'main', 0);
  await waitAssetsReady(win);
  await store(win, 'setExportOpen', true);
  await win.getByTestId('export-dialog').locator('[data-value="720"]').click();
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-cover')).toBeVisible({ timeout: 90_000 });
  await win.getByTestId('export-cover').click();
  await expect(win.getByTestId('cover-dialog')).toBeVisible();
  await expect(win.getByTestId('export-dialog')).toHaveCount(0);
  expect(K.errors).toEqual([]);
  await K.app.close();
});
