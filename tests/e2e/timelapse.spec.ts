// Таймлапс: клип → «Скорость» → 4×…60× — копия фрагмента в N раз короче, без звука, кадры смешаны;
// «Обычная скорость» — обратно к исходнику; смена ускорения считается от исходника.
import { expect, test, type Page } from '@playwright/test';
import { colorsVideo, importAt, launch, project, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { K = await launch(); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

const clip = async () => (await project(win)).tracks[0].clips[0] as any;
const dur = (c: any) => (c.out - c.in) / c.speed;

test('4× → клип в 4 раза короче, без звука; 8× — от исходника; «Обычная скорость» — назад', async () => {
  await importAt(win, [colorsVideo()], 'main', 0);
  const c0 = await clip();
  expect(dur(c0)).toBeCloseTo(4, 1);
  await store(win, 'select', [c0.id]);
  await win.getByTestId('itab-speed').click();
  await win.getByTestId('tl-4').click();
  await expect.poll(async () => (await clip()).retime?.timelapse, { timeout: 60_000 }).toBe(4);
  const c1 = await clip();
  expect(dur(c1)).toBeCloseTo(1, 1);
  const a1 = (await project(win)).assets.find((a) => a.id === c1.assetId)!;
  expect(a1.hasAudio).toBe(false);
  await expect(win.getByTestId('tl-4')).toHaveClass(/active/);
  await expect(win.locator('.toast').filter({ hasText: 'Таймлапс 4×' })).toBeVisible();
  // другое ускорение — снова из исходных 4 секунд
  await win.getByTestId('tl-8').click();
  await expect.poll(async () => (await clip()).retime?.timelapse, { timeout: 60_000 }).toBe(8);
  expect(dur(await clip())).toBeCloseTo(0.5, 1);
  await win.getByTestId('tl-off').click();
  await expect.poll(async () => (await clip()).retime, { timeout: 60_000 }).toBeUndefined();
  const c3 = await clip();
  expect(c3.assetId).toBe(c0.assetId);
  expect(dur(c3)).toBeCloseTo(4, 1);
});
