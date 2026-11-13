// Первый запуск: приветствие в четыре шага — язык и тема, о тебе (уровень, что монтируешь, откуда узнал), основной формат,
// компьютер и модели ИИ.
// Язык угадан по системе и запоминается сразу; выбранное сохраняется; после «Начать» окно больше не показывается;
// у тех, кто уже пользовался Kadro, его нет.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launch, store } from './kadro';

const settings = (data: string) => JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8'));
const HW = JSON.stringify({ cpu: 'Intel(R) Core(TM) i5-12400F', threads: 12, ramGb: 16, gpus: [{ name: 'NVIDIA GeForce RTX 3060', vendor: 'nvidia', driver: '566.36' }], encoders: [{ id: 'nvenc', ok: true }, { id: 'mf', ok: true }] });

test('язык: другой — запоминается и перезапуск уже на нём', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-welcome-'));
  let K = await launch({ data, env: { KADRO_SKIP_WELCOME: '', KADRO_NO_RELAUNCH: '1' } });
  const w = K.win.getByTestId('welcome');
  await expect(w).toBeVisible();
  await expect(w).toContainText('Welcome to Kadro');
  await expect(K.win.getByTestId('welcome-lang-ru')).toHaveClass(/active/);
  expect(settings(data)).toMatchObject({ lang: 'ru', welcome: 'pending' });
  await K.win.getByTestId('welcome-lang-en').click();
  await expect(K.win.getByTestId('welcome-restart')).toContainText('English');
  await expect.poll(() => settings(data).lang).toBe('en');
  await K.app.close();
  // после «перезапуска» — то же окно, уже по-английски
  K = await launch({ data, env: { KADRO_SKIP_WELCOME: '', KADRO_LANG: '' } });
  await expect(K.win.getByTestId('welcome')).toBeVisible();
  await expect(K.win.getByTestId('welcome-lang-en')).toHaveClass(/active/);
  await expect(K.win.getByTestId('welcome-next')).toHaveText('Next');
  await K.win.getByTestId('welcome-skip').click();
  await expect(K.win.getByTestId('welcome')).toHaveCount(0);
  expect(settings(data)).toMatchObject({ lang: 'en', welcome: 'done' });
  await K.app.close();
});

test('тема, формат, компьютер и модели ИИ — и больше не показывается', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-welcome2-'));
  let K = await launch({ data, env: { KADRO_SKIP_WELCOME: '', KADRO_SKIP_HOME: '', KADRO_TEST_HW: HW } });
  const win = K.win;
  // шаг 1: тема меняется сразу
  await win.getByTestId('welcome-theme').locator('[data-value=light]').click();
  await expect(win.locator('html')).toHaveAttribute('data-theme', 'light');
  await win.getByTestId('welcome-next').click();
  // шаг 2: о тебе — новичку простой режим; «Видео для YouTube» подсказывает формат 16:9; согласия на отправку нет (счётчик не задан)
  await expect(win.getByTestId('welcome')).toHaveAttribute('data-step', '1');
  await win.getByTestId('welcome-level-new').click();
  await expect(win.getByTestId('welcome-mode')).toContainText('простой режим');
  await win.getByTestId('welcome-edit-youtube').click();
  await win.getByTestId('welcome-edit-games').click();
  await win.getByTestId('welcome-edit-games').click();
  await expect(win.getByTestId('welcome-edit-games')).not.toHaveClass(/on/);
  await win.getByTestId('welcome-source-tiktok').click();
  await expect(win.getByTestId('welcome-consent')).toHaveCount(0);
  await win.getByTestId('welcome-next').click();
  // шаг 3: формат — уже 16:9 (по ответу), подсвечен на главном экране
  await expect(win.getByTestId('welcome-format-16-9')).toHaveClass(/active/);
  await win.getByTestId('welcome-format-16-9').click();
  await expect(win.getByTestId('welcome-format-16-9')).toHaveClass(/active/);
  await expect(win.getByTestId('home-new-16-9')).toHaveClass(/preferred/);
  await win.getByTestId('welcome-next').click();
  // шаг 3: видеокарта и модели (в тестах модели уже скачаны — галочки «скачана»)
  await expect(win.getByTestId('hw-gpu')).toContainText('RTX 3060');
  await expect(win.getByTestId('hw-enc-nvenc')).toHaveClass(/ok/);
  await expect(win.getByTestId('welcome-asr')).toBeVisible();
  await win.getByTestId('welcome-back').click();
  await expect(win.getByTestId('welcome')).toHaveAttribute('data-step', '2');
  await win.getByTestId('welcome-next').click();
  await win.getByTestId('welcome-go').click();
  await expect(win.getByTestId('welcome')).toHaveCount(0);
  expect(settings(data)).toMatchObject({ welcome: 'done', format: '16:9', theme: 'light' });
  const about = await win.evaluate(() => JSON.parse(localStorage.getItem('kadro.about') ?? '{}'));
  expect(about).toEqual({ edit: ['youtube'], level: 'new', source: 'tiktok' });
  await expect(win.getByTestId('ui-mode').locator('[data-value=simple]')).toHaveClass(/active/);
  await K.app.close();
  // повторный запуск: окна нет, новый проект — сразу 16:9, ролик по сценарию — 16:9
  K = await launch({ data, env: { KADRO_SKIP_WELCOME: '' } });
  await expect(K.win.getByTestId('timeline')).toBeVisible();
  await expect(K.win.getByTestId('welcome')).toHaveCount(0);
  const s = await K.win.evaluate(() => (window as any).__kadro.useStore.getState().project.settings);
  expect(s.width).toBeGreaterThan(s.height);
  await store(K.win, 'setSettingsOpen', true);
  await expect(K.win.getByTestId('format-pref').locator('[data-value="16:9"]')).toHaveClass(/active/);
  await K.app.close();
});

test('ответы из установщика: «О тебе» второй раз не спрашивается, новичку — простой режим, шортсам — 9:16', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-welcome-inst-'));
  // так пишет установщик (scripts/installer-about.mjs)
  fs.writeFileSync(path.join(data, 'settings.json'), '{"lang": "ru", "welcome": "pending", "about": {"edit": ["shorts", "games", "bogus"], "level": "new", "source": "telegram", "from": "installer"}}');
  const K = await launch({ data, env: { KADRO_SKIP_WELCOME: '', KADRO_LANG: '' } });
  const win = K.win;
  await expect(win.getByTestId('welcome')).toBeVisible();
  await expect(win.locator('.welcome-steps span')).toHaveCount(3);
  await win.getByTestId('welcome-next').click();
  await expect(win.getByTestId('welcome-level')).toHaveCount(0);
  await expect(win.getByTestId('welcome-format-9-16')).toHaveClass(/active/);
  await expect(win.getByTestId('ui-mode').locator('[data-value=simple]')).toHaveClass(/active/);
  const about = await win.evaluate(() => JSON.parse(localStorage.getItem('kadro.about') ?? '{}'));
  expect(about).toEqual({ edit: ['shorts', 'games'], level: 'new', source: 'telegram', from: 'installer' });
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
