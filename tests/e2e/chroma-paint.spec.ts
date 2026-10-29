// Ластик для хромакея: стереть то, что хромакей оставил, вернуть то, что он съел. Кисть — на весь клип,
// плеер и экспорт совпадают; отмена штриха в окне не трогает отмену проекта; «Убрать кисть».
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { act, clipIds, greenVideo, importAt, launch, MEDIA, near, previewPixel, project, seekAndSettle, solidVideo, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { K = await launch(); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

const BLUE = [0, 0, 255];
const RED = [255, 0, 0];
const GREEN = [0, 177, 64];
let gid = '';

const chroma = async () => ((await project(win)).tracks.flatMap((t) => t.clips).find((c) => c.id === gid) as any).chroma;

/** Провести кистью по кадру в окне: точки — доли ширины и высоты кадра. */
async function stroke(pts: [number, number][]): Promise<void> {
  const box = (await win.getByTestId('chroma-paint-canvas').boundingBox())!;
  const at = ([x, y]: [number, number]) => [box.x + x * box.width, box.y + y * box.height] as const;
  await win.mouse.move(...at(pts[0]));
  await win.mouse.down();
  for (const p of pts.slice(1)) await win.mouse.move(...at(p), { steps: 6 });
  await win.mouse.up();
}

/** Пиксель кадра готового видео (доли кадра). */
function videoPixel(file: string, t: number, fx: number, fy: number): number[] {
  const pr = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim().split(',').map(Number);
  const [w, h] = pr;
  const raw = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 }).stdout;
  const i = (Math.round(fy * (h - 1)) * w + Math.round(fx * (w - 1))) * 3;
  return [raw[i], raw[i + 1], raw[i + 2]];
}

test('кисть: стёртое прозрачно, возвращённое видно — в плеере', async () => {
  await win.evaluate(() => { const k = (window as any).__kadro; k.useStore.getState().commit((p: any) => k.timeline.setSettings(p, { aspect: '16:9', width: 1920, height: 1080 })); });
  await importAt(win, [solidVideo('blue3.mp4', 'blue', 3)], 'main', 0);
  const [green] = await act(win, 'importPaths', [greenVideo()]);
  await act(win, 'addAssetToTimeline', green, 'overlay', 0);
  gid = (await clipIds(win, 'video'))[0];
  await store(win, 'select', [gid]);
  await win.evaluate((id) => {
    const k = (window as any).__kadro;
    k.useStore.getState().commit((p: any) => k.timeline.updateClip(p, id, { transform: { scale: 1, x: 0, y: 0, rotation: 0 }, chroma: { color: '#00b140', similarity: 0.12, smoothness: 0.05 } }));
  }, gid);
  await seekAndSettle(win, 1);
  expect(near(await previewPixel(win, 0.4, 0.5), RED, 40)).toBe(true);   // красный квадрат остался
  expect(near(await previewPixel(win, 0.15, 0.15), BLUE, 40)).toBe(true); // зелёный фон убран — под ним синее видео

  await win.getByTestId('itab-mask').click();
  await win.getByTestId('chroma-paint').click();
  const dlg = win.getByTestId('chroma-paint-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('.cpaint-wait')).toHaveCount(0);
  // стереть левую часть красного квадрата
  await stroke([[0.37, 0.5], [0.45, 0.5]]);
  // вернуть кусок зелёного фона слева сверху
  await dlg.locator('.seg button[data-value=restore]').click();
  await stroke([[0.1, 0.15], [0.2, 0.15]]);
  // «Где кисть» показывает карту
  await dlg.locator('.seg button[data-value=map]').click();
  await win.getByTestId('chroma-paint-done').click();
  await expect(dlg).toHaveCount(0);
  await expect(win.locator('.toast').filter({ hasText: 'Кисть хромакея применена' })).toBeVisible();
  const ck = await chroma();
  expect(ck.paint.w).toBe(640);
  expect(ck.paint.h).toBe(360);
  expect(fs.existsSync(ck.paint.path)).toBe(true);
  await expect(win.getByTestId('chroma-paint-on')).toBeVisible();

  await seekAndSettle(win, 1);
  expect(near(await previewPixel(win, 0.41, 0.5), BLUE, 40)).toBe(true);   // стёрто — синее видео
  expect(near(await previewPixel(win, 0.6, 0.5), RED, 40)).toBe(true);     // нетронутое — как было
  expect(near(await previewPixel(win, 0.15, 0.15), GREEN, 45)).toBe(true); // возвращённый зелёный
  expect(near(await previewPixel(win, 0.8, 0.85), BLUE, 40)).toBe(true);
  // кисть — на весь клип: в другой момент то же самое
  await seekAndSettle(win, 2.5);
  expect(near(await previewPixel(win, 0.41, 0.5), BLUE, 40)).toBe(true);
});

test('экспорт совпадает с плеером', async () => {
  const out = path.join(MEDIA, 'chroma-paint.mp4');
  const r = await act(win, 'exportTo', out, 360, 30);
  expect(r.ok, r.error).toBe(true);
  expect(near(videoPixel(out, 1, 0.41, 0.5), BLUE, 50)).toBe(true);
  expect(near(videoPixel(out, 1, 0.6, 0.5), RED, 50)).toBe(true);
  expect(near(videoPixel(out, 1, 0.15, 0.15), GREEN, 50)).toBe(true);
  expect(near(videoPixel(out, 1, 0.8, 0.85), BLUE, 50)).toBe(true);
  expect(near(videoPixel(out, 2.5, 0.41, 0.5), BLUE, 50)).toBe(true);
});

test('в окне Ctrl+Z отменяет штрих, а не правку проекта; «Отмена» ничего не меняет; «Убрать кисть»', async () => {
  const before = await chroma();
  const undoLen = await win.evaluate(() => (window as any).__kadro.useStore.getState().past?.length ?? -1);
  await win.getByTestId('chroma-paint').click();
  const dlg = win.getByTestId('chroma-paint-dialog');
  await expect(dlg).toBeVisible();
  await stroke([[0.55, 0.3], [0.65, 0.3]]);
  await win.keyboard.press('Control+z');
  await win.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  expect(await chroma()).toEqual(before);
  expect(await win.evaluate(() => (window as any).__kadro.useStore.getState().past?.length ?? -1)).toBe(undoLen);
  // «Очистить» и «Готово» — кисть снимается совсем
  await win.getByTestId('chroma-paint').click();
  await win.getByTestId('chroma-paint-clear-all').click();
  await win.getByTestId('chroma-paint-done').click();
  expect((await chroma()).paint).toBeUndefined();
  // Ctrl+Z возвращает кисть, «Убрать кисть» снимает её
  await win.keyboard.press('Control+z');
  await expect.poll(async () => !!(await chroma()).paint).toBe(true);
  await win.getByTestId('chroma-paint-off').click();
  expect((await chroma()).paint).toBeUndefined();
  await seekAndSettle(win, 1);
  expect(near(await previewPixel(win, 0.41, 0.5), RED, 40)).toBe(true);
});
