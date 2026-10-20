// Настройки: тема, цвет акцента, значок программы, размер интерфейса, своё оформление (custom.css и theme.json
// подхватываются на лету), всё сохраняется между запусками.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ff, launch, media, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-settings-'));
const iconSrc = () => media('my_icon.png', (f) => ff(['-f', 'lavfi', '-i', 'testsrc=s=320x200', '-frames:v', '1', f]));
const env = () => ({ KADRO_SKIP_HOME: '', KADRO_NO_OPEN: '1', KADRO_TEST_ICON: iconSrc() });
const settingsFile = () => JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8'));
const cssVar = (name: string) => win.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const dialog = () => win.getByTestId('settings');

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);
test.beforeAll(async () => { K = await launch({ data, env: env() }); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

test('настройки с главного экрана: цвет акцента в обеих темах', async () => {
  await expect(win.getByTestId('home')).toBeVisible();
  await win.getByTestId('home-settings').click();
  await expect(dialog()).toBeVisible();
  expect(await cssVar('--accent')).toBe('#ff3d7f');
  await win.getByTestId('accent-violet').click();
  await expect.poll(() => win.evaluate(() => document.documentElement.dataset.accent)).toBe('violet');
  expect(await cssVar('--accent')).toBe('#9d7cff');
  await store(win, 'setThemePref', 'light');
  await expect.poll(() => cssVar('--accent')).toBe('#6a42f5');
  await win.getByTestId('accent-mono').click();
  await expect.poll(() => cssVar('--accent')).toBe('#17151c');
  expect(await cssVar('--on-accent')).toBe('#ffffff');
  await store(win, 'setThemePref', 'dark');
  await expect.poll(() => cssVar('--accent')).toBe('#f2eff6');
  expect(await cssVar('--on-accent')).toBe('#15131a'); // на белой кнопке — тёмный текст
  expect(settingsFile().appearance.accent).toBe('mono');
});

test('значок программы: готовые цвета и своя картинка', async () => {
  await win.getByTestId('icon-pink').click();
  await expect(win.getByTestId('icon-note')).toBeVisible();
  expect(settingsFile().appearance.icon).toBe('pink');
  // логотип в программе — того же цвета
  await expect.poll(() => win.evaluate(() => document.querySelector('.home-top .logo-mark rect')?.getAttribute('fill'))).toBe('#ff3d7f');
  await win.getByTestId('icon-custom').click();
  await expect.poll(() => settingsFile().appearance.icon).toBe('custom');
  const ico = settingsFile().appearance.iconFile as string;
  expect(ico.startsWith(path.join(data, 'icons'))).toBe(true);
  const head = fs.readFileSync(ico).subarray(0, 4);
  expect([...head]).toEqual([0, 0, 1, 0]); // заголовок .ico
  expect(fs.existsSync(ico.replace(/\.ico$/, '.png'))).toBe(true);
  await expect(win.locator('.home-top img.logo-mark')).toHaveCount(1);
  await win.getByTestId('icon-black').click();
  await expect.poll(() => settingsFile().appearance.icon).toBe('black');
});

test('размер интерфейса', async () => {
  await dialog().getByRole('button', { name: '125%' }).click();
  await expect.poll(() => win.evaluate(() => window.innerWidth)).toBeLessThan(1220); // 1480 / 1.25 = 1184
  await dialog().getByRole('button', { name: '100%' }).click();
  await expect.poll(() => win.evaluate(() => window.innerWidth)).toBeGreaterThan(1460);
});

test('своё оформление: файлы-заготовки, изменения на лету, ошибка в theme.json, выключение', async () => {
  await win.getByTestId('custom-open').click();
  const dir = path.join(data, 'custom');
  await expect(win.getByTestId('custom-dir')).toHaveText(dir);
  for (const f of ['custom.css', 'theme.json', 'README.txt']) expect(fs.existsSync(path.join(dir, f)), f).toBe(true);
  fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify({ dark: { '--accent': '#00d1c1' }, all: { '--radius-m': '17px' } }));
  fs.writeFileSync(path.join(dir, 'custom.css'), '.home-start h1 { color: rgb(1, 2, 3); }');
  await win.getByTestId('custom-toggle').click();
  await expect.poll(() => cssVar('--accent')).toBe('#00d1c1'); // свой цвет сильнее выбранного акцента
  expect(await cssVar('--radius-m')).toBe('17px');
  const h1 = () => win.evaluate(() => getComputedStyle(document.querySelector('.home-start h1')!).color);
  await expect.poll(h1).toBe('rgb(1, 2, 3)');
  // правка файла — сразу в окне
  fs.writeFileSync(path.join(dir, 'custom.css'), '.home-start h1 { color: rgb(4, 5, 6); }');
  await expect.poll(h1, { timeout: 10_000 }).toBe('rgb(4, 5, 6)');
  // ошибка в theme.json — сообщение, а custom.css продолжает работать
  fs.writeFileSync(path.join(dir, 'theme.json'), '{ "dark": { "--accent": "#123456", } }');
  await expect(dialog().locator('.warn')).toContainText('theme.json', { timeout: 10_000 });
  await expect.poll(h1).toBe('rgb(4, 5, 6)');
  K.errors.length = 0; // сообщение об ошибке в файле — ожидаемое
  fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify({ dark: { '--accent': '#00d1c1' } }));
  await expect(dialog().locator('.warn')).toHaveCount(0, { timeout: 10_000 });
  // выключили — всё как было
  await win.getByTestId('custom-toggle').click();
  await expect.poll(h1).not.toBe('rgb(4, 5, 6)');
  expect(await cssVar('--accent')).toBe('#f2eff6');
  await win.getByTestId('custom-toggle').click(); // снова включаем — проверим после перезапуска
  await expect.poll(h1).toBe('rgb(4, 5, 6)');
});

test('из редактора — шестерёнка вверху; после перезапуска всё на месте', async () => {
  await win.keyboard.press('Escape');
  await expect(dialog()).toHaveCount(0);
  await win.getByTestId('home-new-9-16').click();
  await win.getByTestId('topbar-settings').click();
  await expect(dialog()).toBeVisible();
  await win.getByTestId('accent-blue').click();
  await expect.poll(() => win.evaluate(() => document.documentElement.dataset.accent)).toBe('blue');
  await K.app.close();
  K = await launch({ data, env: env() });
  win = K.win;
  await expect.poll(() => win.evaluate(() => document.documentElement.dataset.accent)).toBe('blue');
  // своё оформление включено — подключилось при запуске
  await expect.poll(() => cssVar('--accent')).toBe('#00d1c1');
  await expect.poll(() => win.evaluate(() => getComputedStyle(document.querySelector('.home-start h1')!).color)).toBe('rgb(4, 5, 6)');
});
