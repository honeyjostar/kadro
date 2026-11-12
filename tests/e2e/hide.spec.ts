// «Скрыть»: лица находятся сами и размываются, номер обводится мышью и едет за трекером; в превью и в готовом видео.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { faceVideo, importAt, launch, project, rawFrame, seekAndSettle, store, waitAssetsReady, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
const OUT = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-hide-')), 'hide.mp4');
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { K = await launch({ env: { KADRO_TEST_EXPORT: OUT } }); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

const clip = async () => (await project(win)).tracks[0].clips[0] as any;
/** Точка кадра видео 640×360 → доли холста проекта (кадр вписан целиком). */
async function frameToCanvas(): Promise<(x: number, y: number) => [number, number]> {
  const { width: W, height: H } = (await project(win)).settings;
  const k = Math.min(W / 640, H / 360), ox = (W - 640 * k) / 2, oy = (H - 360 * k) / 2;
  return (x, y) => [(ox + x * k) / W, (oy + y * k) / H];
}

/** Пестрота куска превью (доли кадра): среднее отличие соседних точек. */
const previewDetail = (x: number, y: number, w: number, h: number): Promise<number> => win.evaluate(([x, y, w, h]) => {
  const c = document.querySelector('[data-testid=preview]') as HTMLCanvasElement;
  const X = Math.round(x * c.width), Y = Math.round(y * c.height), Wd = Math.max(2, Math.round(w * c.width)), Hd = Math.max(1, Math.round(h * c.height));
  const d = c.getContext('2d')!.getImageData(X, Y, Wd, Hd).data;
  let s = 0, n = 0;
  for (let j = 0; j < Hd; j++) for (let i = 1; i < Wd; i++) { const p = (j * Wd + i) * 4; s += Math.abs(d[p] - d[p - 4]) + Math.abs(d[p + 1] - d[p - 3]); n++; }
  return s / n;
}, [x, y, w, h]);

test('«Скрыть лица»: лицо найдено, рамка на плеере, в превью размыто', async () => {
  await importAt(win, [faceVideo()], 'main', 0);
  await waitAssetsReady(win);
  const c = await clip();
  await store(win, 'select', [c.id]);
  await win.getByTestId('itab-hide').click();
  // лицо в 1 с: фото 200 px с x = 100, лицо — у 0.44 и 0.23 фото
  const fc = await frameToCanvas();
  const [ax, ay] = fc(100 + 88 - 22, 60 + 46 - 18), [bx, by] = fc(100 + 88 + 22, 60 + 46 + 18);
  const faceDetail = () => previewDetail(ax, ay, bx - ax, by - ay);
  await seekAndSettle(win, 1);
  const before = await faceDetail();
  expect(before).toBeGreaterThan(3);
  await win.getByTestId('hide-faces').click();
  await expect(win.getByTestId('blur-row')).toHaveCount(1, { timeout: 60_000 });
  await expect(win.getByTestId('blur-row')).toContainText('Лицо 1');
  const b = (await clip()).blurs[0];
  expect(b.kind).toBe('face');
  expect(b.boxes.length).toBeGreaterThan(1);
  await expect(win.getByTestId('blur-outline')).toHaveCount(1);
  await seekAndSettle(win, 1);
  const after = await faceDetail();
  expect(after).toBeLessThan(before * 0.6);
  // «показать как есть» — на время, потом снова скрыть
  await win.getByTestId('blur-eye').click();
  expect((await clip()).blurs[0].off).toBe(true);
  await seekAndSettle(win, 1);
  expect(await faceDetail()).toBeGreaterThan(before * 0.8);
  await win.getByTestId('blur-eye').click();
  // закрасить
  await win.getByTestId('blur-style').locator('button', { hasText: 'Закрасить' }).click();
  expect((await clip()).blurs[0].style).toBe('black');
});

test('«Обвести предмет»: рамка мышью, трекер ведёт номер по всему клипу', async () => {
  await seekAndSettle(win, 1);
  await win.getByTestId('hide-object').click();
  await expect(win.getByTestId('blur-draw')).toBeVisible();
  // номер в 1 с: x 480..576, y 120..152 (кадр 640×360)
  const box = (await win.getByTestId('preview').boundingBox())!;
  const fc = await frameToCanvas();
  const at = (x: number, y: number) => { const [u, v] = fc(x, y); return [box.x + u * box.width, box.y + v * box.height] as const; };
  const [x0, y0] = at(480, 120), [x1, y1] = at(576, 152);
  await win.mouse.move(x0, y0);
  await win.mouse.down();
  await win.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 });
  await win.mouse.move(x1, y1, { steps: 4 });
  await win.mouse.up();
  await expect(win.getByTestId('blur-row')).toHaveCount(2, { timeout: 60_000 });
  await expect(win.getByTestId('blur-draw')).toHaveCount(0);
  const o = (await clip()).blurs[1];
  expect(o.kind).toBe('object');
  expect(o.shape).toBe('rect');
  expect(o.boxes[0].t).toBeLessThan(0.2);
  expect(o.boxes[o.boxes.length - 1].t).toBeGreaterThan(2.7);
  // в 2.5 с номер ниже: y центра = 60 + 150 + 16 = 226
  const last = o.boxes[o.boxes.length - 1];
  expect(Math.abs(last.y * 360 - (60 + 60 * last.t + 16))).toBeLessThan(8);
  await expect(win.locator('.toast').filter({ hasText: 'Предмет скрыт на весь клип' })).toBeVisible();
});

test('экспорт: лицо закрашено, номер размыт там, куда он уехал', async () => {
  test.setTimeout(180_000);
  await store(win, 'setExportOpen', true);
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-show')).toBeVisible({ timeout: 150_000 });
  const p = await project(win);
  const W = p.settings.width, H = p.settings.height;
  // кадр 640×360 вписан в проект; переводим точки кадра в точки ролика
  const k = Math.min(W / 640, H / 360), ox = (W - 640 * k) / 2, oy = (H - 360 * k) / 2;
  const fr = rawFrame(['-ss', '2', '-i', OUT], W, H);
  const px = (x: number, y: number) => { const i = (Math.round(oy + y * k) * W + Math.round(ox + x * k)) * 3; return [fr[i], fr[i + 1], fr[i + 2]]; };
  // лицо в 2 с: x = 20 + 160 + 88 = 268, y = 106 — чёрное
  expect(Math.max(...px(268, 106))).toBeLessThan(30);
  // номер в 2 с: y = 180..212 — размыт: соседние точки почти одинаковые
  let d = 0;
  for (let x = 490; x < 566; x++) d += Math.abs(px(x, 196)[0] - px(x + 1, 196)[0]);
  expect(d / 76).toBeLessThan(6);
});
