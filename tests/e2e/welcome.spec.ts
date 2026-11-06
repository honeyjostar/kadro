// Первый запуск: окно приветствия с выбором языка (язык угадан по системе, выбранный запоминается),
// после «Начать» — больше не показывается; у тех, кто уже пользовался Kadro, его нет.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launch } from './kadro';

const settings = (data: string) => JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8'));

test('первый запуск: выбор языка, «Начать» — и больше не показывается', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-welcome-'));
  let K = await launch({ data, env: { KADRO_SKIP_WELCOME: '', KADRO_NO_RELAUNCH: '1' } });
  const w = K.win.getByTestId('welcome');
  await expect(w).toBeVisible();
  await expect(w).toContainText('Welcome to Kadro');
  await expect(K.win.getByTestId('welcome-lang-ru')).toHaveClass(/active/);
  expect(settings(data)).toMatchObject({ lang: 'ru', welcome: 'pending' });
  // другой язык — запоминается, Kadro перезапускается (в автотесте без перезапуска)
  await K.win.getByTestId('welcome-lang-en').click();
  await expect(K.win.getByTestId('welcome-restart')).toContainText('English');
  await expect.poll(() => settings(data).lang).toBe('en');
  await K.app.close();
  // после «перезапуска» — то же окно, уже по-английски
  K = await launch({ data, env: { KADRO_SKIP_WELCOME: '', KADRO_LANG: '' } });
  await expect(K.win.getByTestId('welcome')).toBeVisible();
  await expect(K.win.getByTestId('welcome-lang-en')).toHaveClass(/active/);
  await expect(K.win.getByTestId('welcome-go')).toHaveText('Start');
  await K.win.getByTestId('welcome-go').click();
  await expect(K.win.getByTestId('welcome')).toHaveCount(0);
  expect(settings(data)).toMatchObject({ lang: 'en', welcome: 'done' });
  await K.app.close();
  K = await launch({ data, env: { KADRO_SKIP_WELCOME: '', KADRO_LANG: '' } });
  await expect(K.win.getByTestId('timeline')).toBeVisible();
  await expect(K.win.getByTestId('welcome')).toHaveCount(0);
  await K.app.close();
});

test('уже пользовались Kadro (настройки есть) — приветствия нет', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-welcome-old-'));
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ lang: 'ru', recent: [] }));
  const K = await launch({ data, env: { KADRO_SKIP_WELCOME: '' } });
  await expect(K.win.getByTestId('timeline')).toBeVisible();
  await expect(K.win.getByTestId('welcome')).toHaveCount(0);
  await K.app.close();
});
