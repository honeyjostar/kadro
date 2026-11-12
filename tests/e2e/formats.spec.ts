// Экспорт «ещё форматы»: из вертикального ролика сразу 16:9, 1:1 и кружок Telegram — файлами рядом с основным;
// формат проекта (9:16) недоступен как «ещё»; кружок — квадрат 640 и не длиннее 60 секунд.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { act, importAt, launch, solidVideo, store, waitAssetsReady } from './kadro';

function info(f: string) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', f], { encoding: 'utf8' }));
  const v = j.streams.find((s: any) => s.codec_type === 'video');
  return { w: v.width, h: v.height, dur: Number(j.format.duration), audio: j.streams.some((s: any) => s.codec_type === 'audio') };
}

test('9:16 → ещё 16:9, 1:1 и кружок Telegram', async () => {
  test.setTimeout(240_000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-fmt-'));
  const K = await launch({ env: { KADRO_TEST_EXPORT: path.join(dir, 'ролик.mp4') } });
  const win = K.win;
  await act(win, 'newProjectAction', '9:16');
  await importAt(win, [solidVideo('red5.mp4', 'red', 5)], 'main', 0);
  await waitAssetsReady(win);
  await store(win, 'setExportOpen', true);
  await win.getByTestId('export-dialog').locator('[data-value="720"]').click();
  await expect(win.getByTestId('extra-v916')).toBeDisabled();
  for (const id of ['h169', 'sq11', 'tgcircle']) await win.getByTestId(`extra-${id}`).click();
  await expect(win.getByTestId('extra-circle-note')).toBeVisible();
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-show')).toBeVisible({ timeout: 200_000 });
  await expect(win.getByTestId('export-extra-done').locator('li')).toHaveCount(3);
  expect(info(path.join(dir, 'ролик.mp4'))).toMatchObject({ w: 720, h: 1280, audio: true });
  expect(info(path.join(dir, 'ролик · 16x9.mp4'))).toMatchObject({ w: 1280, h: 720, audio: true });
  expect(info(path.join(dir, 'ролик · 1x1.mp4'))).toMatchObject({ w: 720, h: 720 });
  const c = info(path.join(dir, 'ролик · кружок.mp4'));
  expect(c).toMatchObject({ w: 640, h: 640, audio: true });
  expect(c.dur).toBeLessThan(5.2);
  // проект не поменял формат
  expect(await win.evaluate(() => (window as any).__kadro.useStore.getState().project.settings.aspect)).toBe('9:16');
  expect(K.errors).toEqual([]);
  await K.app.close();
});

test('кружок длиннее минуты обрезается до 60 секунд', async () => {
  test.setTimeout(300_000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-fmt-'));
  const K = await launch({ env: { KADRO_TEST_EXPORT: path.join(dir, 'long.mp4') } });
  const win = K.win;
  await act(win, 'newProjectAction', '1:1');
  await importAt(win, [solidVideo('blue70.mp4', 'blue', 70)], 'main', 0);
  await waitAssetsReady(win);
  await store(win, 'setExportOpen', true);
  await win.getByTestId('export-dialog').locator('[data-value="720"]').click();
  await win.getByTestId('extra-tgcircle').click();
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-show')).toBeVisible({ timeout: 280_000 });
  const c = info(path.join(dir, 'long · кружок.mp4'));
  expect(c.w).toBe(640);
  expect(c.dur).toBeGreaterThan(59.5);
  expect(c.dur).toBeLessThan(60.5);
  expect(info(path.join(dir, 'long.mp4')).dur).toBeGreaterThan(69);
  expect(K.errors).toEqual([]);
  await K.app.close();
});
