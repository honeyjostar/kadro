// «Первый ролик за 3 шага»: с главного экрана — в пустой проект, шаги отмечаются сами
// (кадры Kadro на таймлайне, надпись, экспорт), в конце — «Спасибо, дальше сам». Скрыть и вернуть — в настройках.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launch, store, waitAssetsReady } from './kadro';

test.setTimeout(240_000);

test('три шага от главного экрана до готового ролика', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-coach-'));
  const out = path.join(data, 'first.mp4');
  const K = await launch({ data, env: { KADRO_SKIP_HOME: '', KADRO_TEST_EXPORT: out } });
  const win = K.win;
  const settings = () => JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8'));
  await store(win, 'setCoach', 'active');
  await expect.poll(() => settings().coach).toBe('active');
  await expect(win.getByTestId('home-coach')).toBeVisible();
  await win.getByTestId('home-coach-start').click();
  const coach = win.getByTestId('coach');
  await expect(coach).toBeVisible();
  await expect(win.getByTestId('coach-step-video')).toHaveClass(/now/);
  await win.getByTestId('coach-demo').click();
  await expect(win.getByTestId('coach-step-video')).toHaveClass(/done/, { timeout: 60_000 });
  await waitAssetsReady(win);
  await win.getByTestId('coach-text').click();
  await expect(win.getByTestId('coach-step-text')).toHaveClass(/done/);
  await win.keyboard.press('Escape');
  await win.getByTestId('coach-export').click();
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-show')).toBeVisible({ timeout: 180_000 });
  await win.keyboard.press('Escape');
  await expect(coach).toContainText('Первый ролик готов');
  await win.getByTestId('coach-done').click();
  await expect(coach).toHaveCount(0);
  await expect.poll(() => settings().coach).toBe('done');
  // вернуть из настроек
  await store(win, 'setSettingsOpen', true);
  await win.getByTestId('coach-again').click();
  await expect(win.getByTestId('coach')).toBeVisible();
  await win.getByTestId('coach-close').click();
  await expect.poll(() => settings().coach).toBe('off');
  expect(K.errors).toEqual([]);
  await K.app.close();
});
