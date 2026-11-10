// Заставка при запуске: играет, пока грузится программа, пропускается клавишей (клавиша не доходит до программы),
// выключается в настройках; на слабом компьютере Kadro один раз предлагает её выключить.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launch } from './kadro';

test.setTimeout(120_000);
const settings = (data: string) => JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8'));
const played = (win: import('@playwright/test').Page) => win.evaluate(() => document.documentElement.dataset.introPlayed === '1');

test('играет, пока грузится, и пропускается клавишей', async () => {
  const K = await launch({ env: { KADRO_NO_INTRO: '', KADRO_INTRO_MS: '60000' } });
  const intro = K.win.getByTestId('intro');
  await expect(intro).toBeVisible();
  expect(await played(K.win)).toBe(true);
  // значок того цвета, что выбран в настройках, — картинка на месте
  expect(await intro.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await K.win.keyboard.press('Space');
  await expect(intro).toHaveCount(0, { timeout: 5000 });
  // пробел пропустил заставку, а не запустил воспроизведение
  expect(await K.win.evaluate(() => (window as any).__kadro.useStore.getState().playing)).toBe(false);
  expect(K.errors).toEqual([]);
  await K.app.close();
});

test('доигрывает сама; выключается в настройках', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-intro-'));
  let K = await launch({ data, env: { KADRO_NO_INTRO: '' } });
  expect(await played(K.win)).toBe(true);
  await expect(K.win.getByTestId('intro')).toHaveCount(0, { timeout: 10_000 });
  await K.win.evaluate(() => (window as any).__kadro.useStore.getState().setSettingsOpen(true));
  const toggle = K.win.getByTestId('intro-toggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect.poll(() => settings(data).intro).toBe(false);
  await K.app.close();
  K = await launch({ data, env: { KADRO_NO_INTRO: '' } });
  expect(await played(K.win)).toBe(false);
  await K.app.close();
});

test('слабый компьютер: один раз предлагает выключить', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-intro-'));
  let K = await launch({ data, env: { KADRO_NO_INTRO: '', KADRO_WEAK_PC: '1' } });
  await expect(K.win.getByTestId('intro-offer')).toBeVisible({ timeout: 10_000 });
  await K.win.getByTestId('intro-keep').click();
  await expect(K.win.getByTestId('intro-offer')).toHaveCount(0);
  await expect.poll(() => settings(data).introAsked).toBe(true);
  expect(settings(data).intro).not.toBe(false);
  await K.app.close();
  K = await launch({ data, env: { KADRO_NO_INTRO: '', KADRO_WEAK_PC: '1' } });
  expect(await played(K.win)).toBe(true);
  await K.win.waitForTimeout(2500);
  await expect(K.win.getByTestId('intro-offer')).toHaveCount(0);
  await K.app.close();
});
