// «Улучшить качество»: маленькое видео → 1080p («Быстро»), копия сразу в превью; «Выключить» — обратно к оригиналу.
import { expect, test, type Page } from '@playwright/test';
import { ff, importAt, launch, media, project, store, waitAssetsReady, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { K = await launch(); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

const small = () => media('small320.mp4', (f) => ff(['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=25:d=2', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', f]));
const clip = async () => (await project(win)).tracks[0].clips[0] as any;

test('«Быстро»: 320×180 → 1920×1080, «Выключить» — оригинал', async () => {
  await importAt(win, [small()], 'main', 0);
  await waitAssetsReady(win);
  await store(win, 'select', [(await clip()).id]);
  await win.getByTestId('itab-ai').click();
  const card = win.getByTestId('enhance-card');
  await expect(card.getByTestId('enhance-size')).toHaveText('320×180 → 1920×1080');
  await expect(card.getByTestId('enhance-ai')).toBeEnabled();
  await card.getByTestId('enhance-fast').click();
  await expect(card.getByTestId('enhance-ready')).toBeVisible({ timeout: 60_000 });
  const c = await clip();
  expect(c.enhance.status).toBe('ready');
  expect(c.enhance.size).toEqual([1920, 1080]);
  expect(c.enhance.range).toEqual([c.in, c.out]);
  await expect(win.locator('.toast').filter({ hasText: 'Качество улучшено: 1920×1080' })).toBeVisible();
  // плеер показывает улучшенную копию
  const shownWidth = () => win.evaluate(() => {
    const e = (window as any).__kadroEngine;
    const v = [...e.media.values()].find((x: any) => x.kind === 'video' && x.ready)?.el as HTMLVideoElement | undefined;
    return v?.videoWidth ?? 0;
  });
  await expect.poll(shownWidth, { timeout: 15_000 }).toBe(1920);
  await card.getByTestId('enhance-off').click();
  expect((await clip()).enhance.enabled).toBe(false);
  await expect(card.getByTestId('enhance-fast')).toBeVisible();
  await expect.poll(shownWidth, { timeout: 15_000 }).toBe(320);
});
