// Простой режим и «Про»: новичку прячутся ключевые кадры, маска, кривые, 3D, группы и маркеры; переключатель вверху окна.
import { expect, test, type Page } from '@playwright/test';
import { colorsVideo, importAt, launch, project, store, waitAssetsReady, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
test.beforeAll(async () => { K = await launch(); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

test('«Простой» прячет продвинутое, «Про» возвращает; выбор запоминается', async () => {
  await importAt(win, [colorsVideo()], 'main', 0);
  await waitAssetsReady(win);
  await store(win, 'select', [(await project(win)).tracks[0].clips[0].id]);
  await expect(win.getByTestId('itab-mask')).toBeVisible();
  await expect(win.getByTestId('tl-marker')).toBeVisible();
  await win.getByTestId('ui-mode').locator('[data-value=simple]').click();
  for (const id of ['itab-anim', 'itab-mask', 'tl-marker', 'tl-freeze', 'tl-group', 'tab-3d']) await expect(win.getByTestId(id)).toHaveCount(0);
  for (const id of ['itab-basic', 'itab-color', 'itab-hide', 'split', 'delete', 'history', 'tab-media', 'tab-templates']) await expect(win.getByTestId(id)).toHaveCount(1);
  // цвет — только основное; ромбиков ключевых кадров нет
  await win.getByTestId('itab-color').click();
  await expect(win.getByTestId('brightness')).toBeVisible();
  await expect(win.getByText('Кривые', { exact: true })).toHaveCount(0);
  await win.getByTestId('itab-basic').click();
  await expect(win.locator('.key-btn')).toHaveCount(0);
  expect(await win.evaluate(() => localStorage.getItem('kadro.uiMode'))).toBe('"simple"');
  await win.getByTestId('ui-mode').locator('[data-value=pro]').click();
  await expect(win.getByTestId('itab-mask')).toBeVisible();
  await expect(win.locator('.key-btn').first()).toBeVisible();
});
