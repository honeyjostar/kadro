// Каталог плагинов: список с GitHub (в тестах — из папки community-plugins), живые превью, установка
// в один щелчок, «Обновить», удаление; установка из файла; каталог недоступен — понятная ошибка.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { launch, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-catalog-'));
const ROOT = path.join(__dirname, '..', '..');
const CATALOG = pathToFileURL(path.join(ROOT, 'community-plugins', 'index.json')).href;
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'community-plugins', 'index.json'), 'utf8')) as { plugins: { id: string; kind: string; name: string }[] };
const own = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-own-')), 'Моя шторка.glsl');
fs.writeFileSync(own, '// Name: Моя шторка\nvec4 transition(vec2 uv) { return uv.x < progress ? getToColor(uv) : getFromColor(uv); }\n');

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);
test.beforeAll(async () => {
  K = await launch({ data, env: { KADRO_PLUGINS_URL: CATALOG, KADRO_TEST_PICK: own, KADRO_NO_OPEN: '1' } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

const glDef = (id: string) => win.evaluate((i) => (window as any).__kadro.gl.glDef(i)?.name ?? null, id);
const openCatalog = async () => {
  await store(win, 'setSettingsOpen', true);
  await win.getByTestId('plugins-catalog').click();
  await expect(win.getByTestId('plugin-catalog')).toBeVisible();
  await expect(win.getByTestId('catalog-loading')).toHaveCount(0, { timeout: 20_000 });
};

test('каталог: все плагины с превью, каждый шейдер собирается', async () => {
  await openCatalog();
  const cards = win.locator('.catalog-card');
  await expect(cards).toHaveCount(index.plugins.length);
  await expect(win.locator('.catalog-broken')).toHaveCount(0);
  const errors = await win.evaluate(() => [...(window as any).__kadro.gl.runner().errors.entries()]);
  expect(errors).toEqual([]);
  // превью — не пустая картинка: в середине карточки «Полутон» не чёрный кадр
  const px = await win.getByTestId('catalog-e/halftone').locator('canvas').evaluate((c: HTMLCanvasElement) => [...c.getContext('2d')!.getImageData(160, 90, 1, 1).data]);
  expect(px[0] + px[1] + px[2]).toBeGreaterThan(60);
  // наведение запускает анимацию — кадр меняется
  const card = win.getByTestId('catalog-t/whip-pan');
  const before = await card.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await card.hover();
  await win.waitForTimeout(500);
  expect(await card.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(before);
});

test('фильтр и поиск', async () => {
  await win.getByTestId('plugin-catalog').getByRole('button', { name: /^Переходы/ }).click();
  await expect(win.locator('.catalog-card')).toHaveCount(index.plugins.filter((p) => p.kind === 'transition').length);
  await win.getByTestId('catalog-search').fill('свет');
  await expect(win.locator('.catalog-card')).toHaveCount(1);
  await expect(win.locator('.catalog-card')).toContainText('Лучи света');
  await win.getByTestId('catalog-search').fill('');
  await win.getByTestId('plugin-catalog').getByRole('button', { name: /^Все/ }).click();
});

test('установка в один щелчок: файл в папке плагинов, плагин сразу в «Эффектах» и «Переходах»', async () => {
  await win.getByTestId('catalog-e/halftone').getByTestId('catalog-install').click();
  await expect(win.getByTestId('catalog-e/halftone')).toContainText('Установлен');
  await win.getByTestId('catalog-t/whip-pan').getByTestId('catalog-install').click();
  await expect(win.locator('.toast').filter({ hasText: '«Резкий сдвиг» установлен' })).toBeVisible();
  expect(fs.existsSync(path.join(data, 'plugins', 'effects', 'halftone.glsl'))).toBe(true);
  expect(fs.existsSync(path.join(data, 'plugins', 'transitions', 'whip-pan.glsl'))).toBe(true);
  await expect.poll(() => glDef('plug:e/halftone'), { timeout: 10_000 }).toBe('Полутон');
  await expect.poll(() => glDef('plug:t/whip-pan'), { timeout: 10_000 }).toBe('Резкий сдвиг');
  await win.keyboard.press('Escape');
  await store(win, 'setLeftTab', 'transitions');
  await win.getByTestId('trcat-plugins').click();
  await expect(win.getByTestId('tr-plug:t/whip-pan')).toContainText('Резкий сдвиг');
});

test('файл изменили — в каталоге «Обновить»; удаление из каталога', async () => {
  fs.appendFileSync(path.join(data, 'plugins', 'effects', 'halftone.glsl'), '\n// моя правка\n');
  await openCatalog();
  const card = win.getByTestId('catalog-e/halftone');
  await expect(card.getByTestId('catalog-install')).toHaveText('Обновить');
  await card.getByTestId('catalog-install').click();
  await expect(card).toContainText('Установлен');
  expect(fs.readFileSync(path.join(data, 'plugins', 'effects', 'halftone.glsl'), 'utf8')).not.toContain('моя правка');
  await expect.poll(() => glDef('plug:e/halftone'), { timeout: 10_000 }).toBe('Полутон');
  await card.getByTestId('catalog-remove').click();
  await expect(card.getByTestId('catalog-install')).toHaveText('Установить');
  expect(fs.existsSync(path.join(data, 'plugins', 'effects', 'halftone.glsl'))).toBe(false);
  await expect.poll(() => glDef('plug:e/halftone'), { timeout: 10_000 }).toBe(null);
});

test('из файла: русское имя — транслитом, вид — по тексту; неподходящий файл — понятная ошибка', async () => {
  await win.getByTestId('catalog-from-file').click();
  await expect(win.locator('.toast').filter({ hasText: '«Моя шторка» установлен — «Переходы»' })).toBeVisible();
  expect(fs.existsSync(path.join(data, 'plugins', 'transitions', 'Moya-shtorka.glsl'))).toBe(true);
  await expect.poll(() => glDef('plug:t/Moya-shtorka'), { timeout: 10_000 }).toBe('Моя шторка');
  const bad = path.join(path.dirname(own), 'bad.glsl');
  fs.writeFileSync(bad, 'void main() { gl_FragColor = vec4(1.0); }');
  const r = await win.evaluate((p) => (window as any).kadro.installPluginFiles([p, '/etc/passwd']), bad);
  expect(r.installed).toEqual([]);
  expect(r.errors).toEqual(['bad.glsl: нет функции vec4 transition(vec2 uv) или vec4 effect(vec2 uv)', 'passwd: это не шейдер .glsl']);
  await win.keyboard.press('Escape');
});

test('удаление из настроек; удалить можно только файл в папке плагинов', async () => {
  await store(win, 'setSettingsOpen', true);
  const row = win.getByTestId('plugin-plug:t/whip-pan');
  await expect(row).toBeVisible();
  await row.getByTestId('plugin-remove').click();
  await expect(row).toHaveCount(0, { timeout: 10_000 });
  expect(fs.existsSync(path.join(data, 'plugins', 'transitions', 'whip-pan.glsl'))).toBe(false);
  const r = await win.evaluate(async (p) => [await (window as any).kadro.removePlugin(p), await (window as any).kadro.removePlugin('/etc/hosts')], own);
  expect(r).toEqual([false, false]);
  expect(fs.existsSync(own)).toBe(true);
  await win.keyboard.press('Escape');
});

test('каталог недоступен — понятная ошибка и «Повторить»', async () => {
  await K.app.evaluate(() => { process.env.KADRO_PLUGINS_URL = 'file:///nonexistent/kadro/index.json'; });
  await openCatalog();
  await expect(win.getByTestId('catalog-error')).toContainText('Каталог не загрузился');
  await K.app.evaluate((_e, url) => { process.env.KADRO_PLUGINS_URL = url; }, CATALOG);
  await win.getByTestId('catalog-error').getByRole('button', { name: 'Повторить' }).click();
  await expect(win.locator('.catalog-card')).toHaveCount(index.plugins.length, { timeout: 20_000 });
  await win.keyboard.press('Escape');
});
