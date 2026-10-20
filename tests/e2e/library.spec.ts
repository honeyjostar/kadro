// Библиотека папок: добавить папку, подпапки и превью, поиск, файлы на таймлайн двойным кликом,
// кнопкой и перетаскиванием, папка перетаскиванием в окно, библиотека общая для всех проектов.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { act, colorsVideo, grayImage, launch, MEDIA, project, reset, toneMp3, waitAssetsReady, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-lib-'));
const LIB = path.join(MEDIA, 'Библиотека тест', 'Поездка');
const LIB2 = path.join(MEDIA, 'Библиотека тест', 'Футажи');

function makeFolders() {
  fs.rmSync(path.join(MEDIA, 'Библиотека тест'), { recursive: true, force: true });
  fs.mkdirSync(path.join(LIB, 'День 1'), { recursive: true });
  fs.mkdirSync(path.join(LIB, '.скрытая'), { recursive: true });
  fs.mkdirSync(LIB2, { recursive: true });
  fs.copyFileSync(colorsVideo(), path.join(LIB, 'День 1', 'утро.mp4'));
  fs.copyFileSync(colorsVideo(), path.join(LIB, 'День 1', 'вечер.mp4'));
  fs.copyFileSync(grayImage(), path.join(LIB, 'фото.png'));
  fs.copyFileSync(toneMp3(), path.join(LIB, 'музыка.mp3'));
  fs.writeFileSync(path.join(LIB, 'заметки.txt'), 'не медиа');
  fs.copyFileSync(colorsVideo(), path.join(LIB2, 'огонь.mp4'));
}

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  makeFolders();
  K = await launch({ data, env: { KADRO_TEST_FOLDER: LIB } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

const files = () => win.getByTestId('lib-file');

test('добавить папку: подпапки, только медиа, превью', async () => {
  await win.getByTestId('tab-media').click();
  await win.getByTestId('media-view-library').click();
  await expect(win.getByText('Добавь один раз')).toBeVisible();
  await win.getByTestId('lib-add').click();
  // новая папка открывается сразу
  await expect(win.getByTestId('lib-subdir')).toHaveCount(1);
  await expect(win.getByTestId('lib-subdir')).toContainText('День 1');
  await expect(files()).toHaveCount(2); // фото и музыка; заметки и скрытая папка не показываются
  await expect(files().filter({ hasText: 'фото.png' }).locator('.dur')).toHaveText('Фото');
  await expect(files().filter({ hasText: 'музыка.mp3' }).locator('.dur')).toHaveText(/\d/);
  await expect.poll(() => files().filter({ hasText: 'фото.png' }).locator('.media-thumb').evaluate((el) => getComputedStyle(el).backgroundImage), { timeout: 20_000 })
    .toContain('kmedia');
});

test('видео из подпапки — на таймлайн двойным кликом и кнопкой, повторно не импортируется', async () => {
  await reset(win);
  await win.getByTestId('lib-subdir').click();
  await expect(files()).toHaveCount(2);
  await files().filter({ hasText: 'утро.mp4' }).dblclick();
  await expect.poll(async () => (await project(win)).tracks[0].clips.length).toBe(1);
  await files().filter({ hasText: 'утро.mp4' }).hover();
  await files().filter({ hasText: 'утро.mp4' }).getByTestId('lib-file-add').click();
  await expect.poll(async () => (await project(win)).tracks[0].clips.length).toBe(2);
  const p = await project(win);
  expect(p.assets.filter((a) => !a.derived)).toHaveLength(1);
  expect(p.assets[0].path).toBe(path.join(LIB, 'День 1', 'утро.mp4'));
  await expect(files().filter({ hasText: 'утро.mp4' }).locator('.used-dot')).toHaveCount(1);
  await waitAssetsReady(win);
});

test('несколько файлов с Ctrl — на таймлайн по порядку', async () => {
  await reset(win);
  await files().filter({ hasText: 'вечер.mp4' }).click();
  await files().filter({ hasText: 'утро.mp4' }).click({ modifiers: ['Control'] });
  await win.getByTestId('lib-place').click();
  await expect.poll(async () => (await project(win)).tracks[0].clips.length).toBe(2);
  const p = await project(win);
  const names = p.tracks[0].clips.map((c: any) => p.assets.find((a) => a.id === c.assetId)!.name);
  expect(names).toEqual(['вечер.mp4', 'утро.mp4']);
});

test('перетаскивание из библиотеки на таймлайн', async () => {
  await reset(win);
  // выбранные файлы перетаскиваются вместе: сначала оставляем выбранным один
  await files().filter({ hasText: 'вечер.mp4' }).click();
  await files().filter({ hasText: 'вечер.mp4' }).dragTo(win.locator('.tl-rows'), { targetPosition: { x: 200, y: 40 } });
  await expect.poll(async () => (await project(win)).tracks[0].clips.length).toBe(1);
  // а выбранные вместе — вместе
  await files().filter({ hasText: 'утро.mp4' }).click({ modifiers: ['Control'] });
  await files().filter({ hasText: 'утро.mp4' }).dragTo(win.locator('.tl-rows'), { targetPosition: { x: 600, y: 40 } });
  await expect.poll(async () => (await project(win)).tracks[0].clips.length).toBe(3);
});

test('поиск по всей папке и хлебные крошки', async () => {
  await win.locator('.lib-crumbs button', { hasText: 'Поездка' }).click();
  await win.getByTestId('lib-search').fill('веч');
  await expect(files()).toHaveCount(1);
  await expect(files()).toContainText('вечер.mp4');
  await win.getByTestId('lib-search').fill('');
  await expect(files()).toHaveCount(2);
});

test('папка, брошенная в окно, попадает в библиотеку; библиотека общая для проектов и после перезапуска', async () => {
  await act(win, 'dropPaths', [LIB2]);
  await expect(files()).toHaveCount(1);
  await expect(files()).toContainText('огонь.mp4');
  await act(win, 'newProjectAction');
  await win.getByTestId('tab-media').click();
  await win.getByTestId('lib-home').click();
  await expect(win.getByTestId('lib-folder')).toHaveCount(2);
  await K.app.close();
  K = await launch({ data, env: { KADRO_TEST_FOLDER: LIB } });
  win = K.win;
  await win.getByTestId('tab-media').click();
  await win.getByTestId('media-view-library').click();
  if (await win.getByTestId('lib-home').count()) await win.getByTestId('lib-home').click();
  await expect(win.getByTestId('lib-folder')).toHaveCount(2);
  // убрать папку из библиотеки — файлы остаются на диске
  await win.locator('.lib-folder', { hasText: 'Футажи' }).getByRole('button', { name: 'Убрать из библиотеки' }).click();
  await expect(win.getByTestId('lib-folder')).toHaveCount(1);
  expect(fs.existsSync(path.join(LIB2, 'огонь.mp4'))).toBe(true);
});
