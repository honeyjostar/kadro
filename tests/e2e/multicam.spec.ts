// Синхронизация камер по звуку: два ракурса одной сцены, второй включили на 1,5 с позже —
// после «Синхронизировать по звуку» его клип встаёт на 1,5 с правее; чужая запись не двигается.
import { expect, test, type Page } from '@playwright/test';
import { clapVideo, importAt, launch, project, reset, solidVideo, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { K = await launch(); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

const byTrack = async (kind: string) => (await project(win)).tracks.filter((t) => t.kind === kind).flatMap((t) => t.clips) as any[];

test('второй ракурс встаёт так, что звук совпадает (точнее кадра)', async () => {
  await importAt(win, [clapVideo('camA.mp4', 'red', 0)], 'main', 0);
  await importAt(win, [clapVideo('camB.mp4', 'blue', 1.5)], 'overlay', 0);
  const [a] = await byTrack('main');
  const [b] = await byTrack('video');
  expect(b.start).toBe(0);
  await store(win, 'select', [a.id, b.id]);
  await expect(win.getByTestId('multi-sync')).toBeVisible();
  await win.getByTestId('sync-audio').click();
  await expect(win.locator('.toast').filter({ hasText: 'Синхронизировано по звуку: 1' })).toBeVisible({ timeout: 30_000 });
  const [b2] = await byTrack('video');
  expect(Math.abs(b2.start - 1.5)).toBeLessThan(1 / 30);
  expect(b2.in).toBe(0);
  // одним Ctrl+Z
  await win.keyboard.press('Control+z');
  expect((await byTrack('video'))[0].start).toBe(0);
});

test('ракурс, который начался раньше основного, обрезается в начале; чужая запись не двигается', async () => {
  await reset(win);
  await importAt(win, [clapVideo('camD.mp4', 'red', 2, 6)], 'main', 0);       // основную камеру включили на 2 с позже
  await importAt(win, [clapVideo('camA.mp4', 'green', 0)], 'overlay', 0);      // а эту — раньше всех
  const [a] = await byTrack('main');
  const [c] = await byTrack('video');
  await store(win, 'select', [a.id, c.id]);
  await win.getByTestId('sync-audio').click();
  await expect.poll(async () => (await byTrack('video'))[0].in, { timeout: 30_000 }).toBeGreaterThan(1);
  const [c2] = await byTrack('video');
  expect(c2.start).toBe(0);
  expect(Math.abs(c2.in - 2)).toBeLessThan(1 / 30);
  // чужой звук (ровный тон) — не синхронизируется
  await importAt(win, [solidVideo('tone5.mp4', 'gray', 5)], 'overlay', 9);
  const t = (await byTrack('video')).find((x) => x.start >= 9)!;
  await store(win, 'select', [a.id, t.id]);
  await win.getByTestId('sync-audio').click();
  await expect(win.locator('.toast').filter({ hasText: 'Не нашёл общего звука' })).toBeVisible({ timeout: 30_000 });
  expect((await byTrack('video')).find((x) => x.id === t.id).start).toBe(9);
});
