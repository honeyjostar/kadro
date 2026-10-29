// Окно «Горячие клавиши» (F1, Ctrl+/, кнопки) и прослушивание звука до таймлайна: в списке «Аудио»
// (кнопка, щелчок по волне — с этого места) и в библиотеке; запуск ролика останавливает прослушивание.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { act, launch, store, toneMp3, waitAssetsReady, type Kadro } from './kadro';

const LIB = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-listen-'));
let K: Kadro;
let win: Page;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  fs.copyFileSync(toneMp3(), path.join(LIB, 'песня.mp3'));
  K = await launch({ env: { KADRO_TEST_FOLDER: LIB } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

test('F1, Ctrl+/ и кнопка вверху открывают окно клавиш; поиск; Esc закрывает', async () => {
  await win.keyboard.press('F1');
  const dlg = win.getByTestId('keys-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('Горячие клавиши');
  const rows = await win.getByTestId('keys-row').count();
  expect(rows).toBeGreaterThan(30);
  await win.getByTestId('keys-search').fill('маркер');
  await expect(win.getByTestId('keys-row')).toHaveCount(4);
  await expect(dlg).toContainText('поставить маркер у курсора');
  await win.getByTestId('keys-search').fill('ctrl+shift+c');
  await expect(win.getByTestId('keys-row')).toHaveCount(1);
  await expect(dlg).toContainText('скопировать параметры клипа');
  await win.getByTestId('keys-search').fill('йцукен');
  await expect(dlg).toContainText('Ничего не нашлось');
  await win.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  // Esc закрыл только окно — выделение и прочее не тронуты, окно снова открывается сочетанием и кнопкой
  await win.keyboard.press('Control+Slash');
  await expect(dlg).toBeVisible();
  await win.keyboard.press('F1');
  await expect(dlg).toHaveCount(0);
  await win.getByTestId('topbar-keys').click();
  await expect(dlg).toBeVisible();
  await dlg.locator('.modal-head .icon-btn').click();
  await expect(dlg).toHaveCount(0);
});

const playing = () => win.locator('.preview-wave.playing');

test('«Аудио»: послушать до таймлайна, пауза, с середины по волне; пуск ролика останавливает', async () => {
  await act(win, 'importAudio', [toneMp3()]);
  await waitAssetsReady(win);
  await win.getByTestId('tab-audio').click();
  const btn = win.getByTestId('audio-preview');
  await expect(btn).toHaveCount(1);
  const clipsNow = () => win.evaluate(() => (window as any).__kadro.useStore.getState().project.tracks.flatMap((t: any) => t.clips).length);
  const before = await clipsNow();
  await btn.click();
  await expect(playing()).toHaveCount(1);
  await expect(win.locator('.preview-pos')).toHaveCount(1, { timeout: 5000 });
  const p1 = await win.locator('.preview-pos').evaluate((el) => parseFloat((el as HTMLElement).style.left));
  await win.waitForTimeout(600);
  const p2 = await win.locator('.preview-pos').evaluate((el) => parseFloat((el as HTMLElement).style.left));
  expect(p2).toBeGreaterThan(p1);
  // на таймлайн ничего не добавилось
  expect(await clipsNow()).toBe(before);
  await btn.click();
  await expect(playing()).toHaveCount(0);
  // щелчок по волне ближе к концу — играет с этого места
  const track = win.locator('.preview-track');
  const box = (await track.boundingBox())!;
  await win.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
  await expect(playing()).toHaveCount(1);
  await expect.poll(() => win.locator('.preview-pos').evaluate((el) => parseFloat((el as HTMLElement).style.left))).toBeGreaterThan(70);
  // запустили ролик — прослушивание остановилось
  await store(win, 'setPlaying', true);
  await expect(playing()).toHaveCount(0);
  await store(win, 'setPlaying', false);
});

test('библиотека: кнопка «Послушать» у музыки, проект не меняется', async () => {
  await win.getByTestId('tab-media').click();
  await win.getByTestId('media-view-library').click();
  await win.getByTestId('lib-add').click();
  const file = win.getByTestId('lib-file').filter({ hasText: 'песня.mp3' });
  await expect(file).toHaveCount(1);
  await file.hover();
  const listen = file.getByTestId('lib-listen');
  await listen.click();
  await expect(listen).toHaveClass(/on/);
  await expect.poll(() => listen.evaluate((el) => (el as HTMLElement).style.background)).toContain('conic-gradient');
  await listen.click();
  await expect(listen).not.toHaveClass(/on/);
  const assets = await win.evaluate(() => (window as any).__kadro.useStore.getState().project.assets.filter((a: any) => !a.derived).length);
  expect(assets).toBe(1); // только тот звук, что импортировали раньше
});
