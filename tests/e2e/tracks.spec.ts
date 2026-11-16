// Дорожки: «Соло» и «Замок» в заголовке дорожки. Замок: клип выделяется, но не двигается и не удаляется.
import { expect, test } from '@playwright/test';
import { colorsVideo, importAt, launch, project, type Kadro } from './kadro';

let K: Kadro;
test.beforeAll(async () => { K = await launch(); });
test.afterAll(async () => { await K?.app.close(); });

test('соло и замок дорожки', async () => {
  const { win } = K;
  await importAt(win, [colorsVideo()], 'main', 0);
  await importAt(win, [colorsVideo()], 'overlay', 1);
  const heads = win.locator('.track-head');
  const overlayHead = win.locator('.track-head.video');
  await overlayHead.getByTestId('track-solo').click();
  expect((await project(win)).tracks.find((t) => t.kind === 'video')!.solo).toBe(true);
  await expect(overlayHead.getByTestId('track-solo')).toHaveClass(/on/);
  await overlayHead.getByTestId('track-lock').click();
  const ov = () => project(win).then((p) => p.tracks.find((t) => t.kind === 'video')!.clips[0]);
  const before = await ov();
  // тащим закрытый клип — не сдвигается
  const clip = win.locator(`[data-clip="${before.id}"]`);
  const box = (await clip.boundingBox())!;
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await win.mouse.down();
  await win.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 8 });
  await win.mouse.up();
  expect((await ov()).start).toBeCloseTo(before.start, 3);
  // выделен, но Delete не удаляет — подсказка
  expect(await win.evaluate(() => (window as any).__kadro.useStore.getState().selection)).toEqual([before.id]);
  await win.keyboard.press('Delete');
  await expect(win.locator('.toast').filter({ hasText: 'Дорожка с замком' })).toBeVisible();
  expect((await project(win)).tracks.find((t) => t.kind === 'video')!.clips.length).toBe(1);
  // замок снят — удаляется
  await overlayHead.getByTestId('track-lock').click();
  await clip.click();
  await win.keyboard.press('Delete');
  await expect.poll(async () => (await project(win)).tracks.find((t) => t.kind === 'video')?.clips.length ?? 0).toBe(0);
  expect(await heads.count()).toBeGreaterThan(0);
  expect(K.errors).toEqual([]);
});
