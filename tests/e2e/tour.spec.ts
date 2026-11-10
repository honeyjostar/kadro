// Экскурсия по окну и подсветка нужной кнопки: тем, кто ещё не проходил обучение, Kadro предлагает его
// (и после обновления, не только при первом запуске); экскурсия подсвечивает части окна по очереди.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launch, store } from './kadro';

test.setTimeout(120_000);

test('предложение, экскурсия по 8 частям окна и маячок у нужной кнопки', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-tour-'));
  const K = await launch({ data, env: { KADRO_NO_COACH: '' } });
  const win = K.win;
  await expect(win.getByTestId('coach-offer')).toBeVisible();
  await win.getByTestId('coach-tour').click();
  const card = win.getByTestId('tour-card');
  await expect(card).toContainText('1 / 8');
  // подсветка — ровно вокруг части окна
  const targets = ['.rail', 'aside.panel', '.stage', '[data-testid=timeline]', '[data-testid=inspector]', '[data-testid=export-open]', '[data-testid=topbar-settings]', '[data-testid=topbar-keys]'];
  for (let i = 0; i < targets.length; i++) {
    await expect(card).toContainText(`${i + 1} / 8`);
    await expect.poll(() => win.evaluate((sel) => {
      const t = document.querySelector(sel)!.getBoundingClientRect();
      const h = document.querySelector('.tour-hole')!.getBoundingClientRect();
      return Math.abs(h.left - (t.left - 6)) < 2 && Math.abs(h.width - (t.width + 12)) < 2;
    }, targets[i])).toBe(true);
    // подсказка — на экране целиком
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1480);
    expect(box.y + box.height).toBeLessThanOrEqual(920);
    await win.getByTestId('tour-next').click();
  }
  await expect(win.getByTestId('tour')).toHaveCount(0);
  // экскурсия не закрыла предложение — дальше «Первый ролик за 3 шага» с маячком
  await win.getByTestId('coach-start').click();
  await expect(win.getByTestId('coach')).toBeVisible();
  await store(win, 'setLeftTab', 'audio');
  await expect.poll(() => win.evaluate(() => {
    const b = document.querySelector('[data-testid=beacon]')?.getBoundingClientRect();
    const t = document.querySelector('[data-testid=tab-media]')!.getBoundingClientRect();
    return !!b && Math.abs(b.left - (t.left - 4)) < 2;
  })).toBe(true);
  await win.getByTestId('tab-media').click();
  await expect.poll(() => win.evaluate(() => {
    const b = document.querySelector('[data-testid=beacon]')?.getBoundingClientRect();
    const t = document.querySelector('[data-testid=import-btn]')!.getBoundingClientRect();
    return !!b && Math.abs(b.top - (t.top - 4)) < 2;
  })).toBe(true);
  // Esc закрывает экскурсию
  await win.getByTestId('coach-tour').click();
  await expect(win.getByTestId('tour')).toBeVisible();
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('tour')).toHaveCount(0);
  expect(K.errors).toEqual([]);
  await K.app.close();
});
