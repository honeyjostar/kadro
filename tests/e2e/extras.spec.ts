// Мелочи к Kadro 1.0: просьба о звезде после экспорта, экспорт в GIF и MP3, логотип на всё видео,
// кадр в PNG из плеера, клавиши J / K / L.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { act, colorsVideo, ff, importAt, launch, media, near, previewPixel, probe, rawFrame, seekAndSettle, solidVideo, state, store, waitAssetsReady } from './kadro';

test.setTimeout(180_000);
const tmp = (p: string) => fs.mkdtempSync(path.join(os.tmpdir(), `kadro-${p}-`));
const settings = (data: string) => JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8'));
const logoPng = () => media('logo-yellow.png', (f) => ff(['-f', 'lavfi', '-i', 'color=c=yellow:s=200x100,format=rgba', '-frames:v', '1', f]));

async function exportNow(win: Page, format?: 'mp4' | 'gif' | 'mp3', pick?: () => Promise<void>): Promise<void> {
  await store(win, 'setExportOpen', true);
  await expect(win.getByTestId('export-dialog')).toBeVisible();
  if (format) await win.getByTestId('export-format').locator(`[data-value=${format}]`).click();
  if (pick) await pick();
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-show').or(win.locator('[data-testid=export-dialog] .warn'))).toBeVisible({ timeout: 120_000 });
  const warn = win.locator('[data-testid=export-dialog] .warn');
  if (await warn.count()) throw new Error(`экспорт: ${await warn.innerText()}`);
}
const closeExport = async (win: Page) => { await win.keyboard.press('Escape'); await expect(win.getByTestId('export-dialog')).toHaveCount(0); };

test('звезда после первого экспорта; GIF и MP3', async () => {
  const data = tmp('star');
  const out = path.join(tmp('out'), 'ролик.mp4');
  const K = await launch({ data, env: { KADRO_TEST_EXPORT: out, KADRO_NO_OPEN: '1' } });
  const win = K.win;
  await act(win, 'newProjectAction', '16:9');
  await importAt(win, [solidVideo('red3.mp4', 'red', 3)], 'main', 0);
  await waitAssetsReady(win);

  // первый экспорт — просьба о звезде; «Поставить звезду» — спасибо и больше не просим
  await exportNow(win);
  await expect(win.getByTestId('star-ask')).toBeVisible();
  await win.getByTestId('star-yes').click();
  await expect(win.getByTestId('star-thanks')).toBeVisible();
  await expect.poll(() => settings(data).star).toBe('done');
  expect(settings(data).exportsDone).toBe(1);
  await closeExport(win);

  // GIF: 360p, без звука, по кругу; звезду больше не просим
  await exportNow(win, 'gif', async () => {
    await expect(win.getByTestId('export-gif-size')).toBeVisible();
    await win.getByTestId('export-gif-size').locator('[data-value="360"]').click();
    await expect(win.getByTestId('preflight')).toHaveCount(0);
  });
  await expect(win.getByTestId('star-ask')).toHaveCount(0);
  const gif = out.replace(/\.mp4$/, '.gif');
  const g = probe(gif);
  expect([g.width, g.height]).toEqual([640, 360]);
  expect(g.hasAudio).toBe(false);
  expect(g.duration).toBeGreaterThan(2.5);
  expect(near([...rawFrame(['-i', gif], 1, 1)], [255, 0, 0], 40)).toBe(true);
  await closeExport(win);

  // MP3: только звук, 128 кбит/с
  await exportNow(win, 'mp3', async () => { await win.getByTestId('export-mp3-kbps').locator('[data-value="128"]').click(); });
  const mp3 = out.replace(/\.mp4$/, '.mp3');
  const m = probe(mp3);
  expect(m.hasAudio).toBe(true);
  expect(m.width).toBeUndefined();
  expect(Math.abs(m.duration - 3)).toBeLessThan(0.3);
  await closeExport(win);
  // окно экспорта помнит формат
  await store(win, 'setExportOpen', true);
  await expect(win.getByTestId('export-format').locator('[data-value=mp3]')).toHaveClass(/active/);
  await closeExport(win);
  expect(settings(data).exportsDone).toBe(3);
  expect(K.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  await K.app.close();
});

test('«Не сейчас» — просьба прячется до 10-го экспорта', async () => {
  const data = tmp('star2');
  const out = path.join(tmp('out'), 'v.mp4');
  const K = await launch({ data, env: { KADRO_TEST_EXPORT: out, KADRO_NO_OPEN: '1' } });
  await act(K.win, 'newProjectAction', '16:9');
  await importAt(K.win, [solidVideo('red3.mp4', 'red', 3)], 'main', 0);
  await waitAssetsReady(K.win);
  await exportNow(K.win, 'mp3');
  await expect(K.win.getByTestId('star-ask')).toBeVisible();
  await K.win.getByTestId('star-later').click();
  await expect(K.win.getByTestId('star-ask')).toHaveCount(0);
  await closeExport(K.win);
  expect(settings(data).star).toBe('later');
  await exportNow(K.win, 'mp3');
  await expect(K.win.getByTestId('star-ask')).toHaveCount(0);
  await K.app.close();
});

test('логотип на всё видео — в плеере и в экспорте', async () => {
  const out = path.join(tmp('logo'), 'logo.mp4');
  const K = await launch({ env: { KADRO_TEST_EXPORT: out, KADRO_TEST_LOGO: logoPng() } });
  const win = K.win;
  await act(win, 'newProjectAction', '16:9');
  await importAt(win, [solidVideo('blue3.mp4', 'blue', 3)], 'main', 0);
  await waitAssetsReady(win);
  await store(win, 'select', []);
  await win.getByTestId('logo-pick').click();
  await expect(win.getByTestId('logo-settings')).toBeVisible();
  const logo = (await state<any>(win, '(s) => s.project.settings.logo'));
  expect(logo).toMatchObject({ corner: 'tr', ar: 2, name: 'logo-yellow.png' });
  // правый верхний угол: 1920×1080, ширина 16% короткой стороны (172), высота 86, отступ 43
  const at = (x: number, y: number) => [x / 1920, y / 1080] as const;
  const yellowish = [217, 217, 38];
  await seekAndSettle(win, 1);
  expect(near(await previewPixel(win, ...at(1705 + 86, 43 + 43)), yellowish, 30)).toBe(true);
  // левый нижний
  await win.getByTestId('logo-corner').locator('[data-value=bl]').click();
  await seekAndSettle(win, 1);
  expect(near(await previewPixel(win, ...at(1705 + 86, 43 + 43)), [0, 0, 255], 30)).toBe(true);
  expect(near(await previewPixel(win, ...at(43 + 86, 1080 - 43 - 43)), yellowish, 30)).toBe(true);
  // в готовом видео — там же
  await exportNow(win);
  const f = rawFrame(['-ss', '1', '-i', out], 192, 108);
  const px = (x: number, y: number) => [...f.subarray((y * 192 + x) * 3, (y * 192 + x) * 3 + 3)];
  expect(near(px(13, 99), yellowish, 40)).toBe(true);
  expect(near(px(179, 8), [0, 0, 255], 40)).toBe(true);
  await closeExport(win);
  // убрать
  await win.getByTestId('logo-remove').click();
  await expect(win.getByTestId('logo-pick')).toBeVisible();
  expect(await state(win, '(s) => s.project.settings.logo ?? null')).toBeNull();
  expect(K.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  await K.app.close();
});

test('кадр в PNG — кнопкой и Shift+E, в полном размере', async () => {
  const dir = tmp('frames');
  const K = await launch({ env: { KADRO_TEST_FRAME: dir } });
  const win = K.win;
  await act(win, 'newProjectAction', '16:9');
  await importAt(win, [colorsVideo()], 'main', 0);
  await waitAssetsReady(win);
  const name = (await state<string>(win, '(s) => s.project.name'));
  await seekAndSettle(win, 1.5);
  await win.getByTestId('save-frame').click();
  const f1 = path.join(dir, `${name} 00-01.png`);
  await expect.poll(() => fs.existsSync(f1)).toBe(true);
  const p1 = probe(f1);
  expect([p1.width, p1.height]).toEqual([1920, 1080]);
  expect(near([...rawFrame(['-i', f1], 1, 1)], [0, 255, 0], 30)).toBe(true);
  await seekAndSettle(win, 2.5);
  await win.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  await win.keyboard.press('Shift+E');
  const f2 = path.join(dir, `${name} 00-02.png`);
  await expect.poll(() => fs.existsSync(f2)).toBe(true);
  expect(near([...rawFrame(['-i', f2], 1, 1)], [0, 0, 255], 30)).toBe(true);
  // плеер вернулся к своему размеру
  const cw = await win.evaluate(() => (document.querySelector('[data-testid=preview]') as HTMLCanvasElement).width);
  expect(cw).toBeLessThan(1920);
  expect(K.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  await K.app.close();
});

test('J / K / L: вперёд быстрее, назад, пауза — и в русской раскладке', async () => {
  const K = await launch();
  const win = K.win;
  await act(win, 'newProjectAction', '16:9');
  await importAt(win, [solidVideo('red12.mp4', 'red', 12)], 'main', 0);
  await waitAssetsReady(win);
  await seekAndSettle(win, 0);
  await win.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  const s = () => state<{ playing: boolean; playRate: number; playhead: number }>(win, '(s) => ({ playing: s.playing, playRate: s.playRate, playhead: s.playhead })');
  await win.keyboard.press('l');
  expect(await s()).toMatchObject({ playing: true, playRate: 1 });
  await expect(win.getByTestId('play-rate')).toHaveCount(0);
  await win.keyboard.press('l');
  await expect(win.getByTestId('play-rate')).toHaveText('2×');
  // русская раскладка: «д» на месте L
  await win.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'д', code: 'KeyL', bubbles: true })));
  await win.keyboard.press('l');
  expect((await s()).playRate).toBe(8);
  await expect(win.getByTestId('play-rate')).toHaveText('8×');
  const t0 = (await s()).playhead;
  await win.waitForTimeout(500);
  expect((await s()).playhead - t0).toBeGreaterThan(2); // 8× за полсекунды — секунды
  await win.keyboard.press('k');
  expect(await s()).toMatchObject({ playing: false, playRate: 1 });
  await expect(win.getByTestId('play-rate')).toHaveCount(0);
  // назад
  await store(win, 'setPlayhead', 8);
  await win.keyboard.press('j');
  expect(await s()).toMatchObject({ playing: true, playRate: -1 });
  await expect(win.getByTestId('play-rate')).toHaveText('◀ 1×');
  await win.keyboard.press('j');
  await win.waitForTimeout(600);
  const back = await s();
  expect(back.playRate).toBe(-2);
  expect(back.playhead).toBeLessThan(7.5);
  // до начала — стоп
  await win.keyboard.press('j');
  await win.keyboard.press('j');
  await expect.poll(async () => (await s()).playing, { timeout: 5000 }).toBe(false);
  expect((await s()).playhead).toBe(0);
  // пробел после J/L — обычная скорость
  await win.keyboard.press('Space');
  expect(await s()).toMatchObject({ playing: true, playRate: 1 });
  await win.keyboard.press('Space');
  expect(K.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  await K.app.close();
});

test('полоска прогресса — в плеере и в экспорте растёт по ходу ролика', async () => {
  const out = path.join(tmp('bar'), 'bar.mp4');
  const K = await launch({ env: { KADRO_TEST_EXPORT: out } });
  const win = K.win;
  await act(win, 'newProjectAction', '16:9');
  await importAt(win, [solidVideo('blue3.mp4', 'blue', 3)], 'main', 0);
  await waitAssetsReady(win);
  await store(win, 'select', []);
  await win.getByTestId('progress-toggle').click();
  await expect(win.getByTestId('progress-settings')).toBeVisible();
  const pink = [255, 61, 127];
  await seekAndSettle(win, 1.5); // половина ролика
  expect(near(await previewPixel(win, 0.25, 0.997), pink, 40)).toBe(true);
  expect(near(await previewPixel(win, 0.75, 0.997), [0, 0, 255], 40)).toBe(true);
  await win.getByTestId('progress-place').locator('[data-value=top]').click();
  await seekAndSettle(win, 1.5);
  expect(near(await previewPixel(win, 0.25, 0.003), pink, 40)).toBe(true);
  await exportNow(win);
  const f = rawFrame(['-ss', '2.25', '-i', out], 192, 108);
  const px = (x: number, y: number) => [...f.subarray((y * 192 + x) * 3, (y * 192 + x) * 3 + 3)];
  expect(near(px(100, 0), pink, 60)).toBe(true);   // 75% ролика — полоса дальше середины
  expect(near(px(180, 0), [0, 0, 255], 60)).toBe(true);
  expect(K.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  await K.app.close();
});
