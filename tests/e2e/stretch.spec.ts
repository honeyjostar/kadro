// Растянуть по ширине и высоте: боковые ручки рамки в плеере и ползунки; в плеере и в готовом видео одинаково.
// 3D-объект — растяжение по своим осям.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { act, importAt, launch, media, near, previewPixel, project, rawFrame, seekAndSettle, store, waitAssetsReady } from './kadro';

test.setTimeout(240_000);

test('видео: боковая ручка растягивает по ширине, плеер и экспорт совпадают', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-st-'));
  const K = await launch();
  const win = K.win;
  await act(win, 'newProjectAction', '16:9');
  // фон под видео — чёрный (не размытая копия), чтобы поля по бокам было видно
  await win.evaluate(() => { const k = (window as any).__kadro; k.useStore.getState().commit((p: any) => k.timeline.setSettings(p, { background: 'black' })); });
  // жёлтое квадратное видео в кадре 16:9 — по бокам чёрные поля
  const sq = media('yellow-square.mp4', (f) => { execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=yellow:s=360x360:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', f]); });
  await importAt(win, [sq], 'main', 0);
  await waitAssetsReady(win);
  const id = (await project(win)).tracks[0].clips[0].id;
  await seekAndSettle(win, 0.5);
  const side: [number, number] = [0.08, 0.5];
  expect(near(await previewPixel(win, ...side), [0, 0, 0], 30)).toBe(true);
  // тянем правую ручку вправо — по ширине вдвое
  await store(win, 'select', [id]);
  const h = (await win.getByTestId('edge-e').boundingBox())!;
  const box = (await win.getByTestId('sel-box').boundingBox())!;
  await win.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await win.mouse.down();
  await win.mouse.move(h.x + h.width / 2 + box.width / 2, h.y + h.height / 2, { steps: 8 });
  await win.mouse.up();
  await expect.poll(async () => ((await project(win)).tracks[0].clips[0] as any).stretch?.x ?? 1).toBeGreaterThan(1.5);
  const c = (await project(win)).tracks[0].clips[0] as any;
  expect(c.stretch.y).toBe(1);
  // ширина ограничена кадром (вписывание), поля по бокам стали жёлтыми
  await seekAndSettle(win, 0.5);
  expect(near(await previewPixel(win, ...side), [255, 255, 0], 50)).toBe(true);
  // ползунок «По высоте» и сброс
  await win.getByTestId('itab-basic').click();
  await expect(win.getByTestId('stretch-x')).toBeVisible();
  const out = path.join(dir, 's.mp4');
  const r = await act(win, 'exportTo', out, 360, 30);
  expect(r.ok, r.error).toBe(true);
  const fr = rawFrame(['-ss', '0.5', '-i', out], 64, 36);
  const px = (fx: number, fy: number) => { const i = (Math.round(fy * 35) * 64 + Math.round(fx * 63)) * 3; return [fr[i], fr[i + 1], fr[i + 2]]; };
  expect(near(px(...side), [255, 255, 0], 60)).toBe(true);
  await win.getByTestId('stretch-reset').click();
  await expect.poll(async () => ((await project(win)).tracks[0].clips[0] as any).stretch).toBeUndefined();
  expect(K.errors).toEqual([]);
  await K.app.close();
});

test('3D: растяжение по осям объекта — объект шире', async () => {
  const K = await launch({ env: { KADRO_SWIFTSHADER: '1' } });
  const win = K.win;
  await win.getByTestId('tab-3d').click();
  await win.getByTestId('m3d-cube').click();
  const dlg = win.getByTestId('m3d-dialog');
  await expect(dlg).toBeVisible();
  // ширина нарисованного объекта по средней строке холста
  const width = () => win.evaluate(() => {
    const c = document.querySelector('[data-testid=m3d-canvas]') as HTMLCanvasElement;
    const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
    const x = t.getContext('2d')!; x.drawImage(c, 0, 0);
    const row = x.getImageData(0, Math.floor(c.height / 2), c.width, 1).data;
    let n = 0; for (let i = 3; i < row.length; i += 4) if (row[i] > 128) n++;
    return n / c.width;
  });
  await expect.poll(width, { timeout: 30_000 }).toBeGreaterThan(0.1);
  await dlg.getByTestId('m3d-motion-still').click().catch(() => undefined);
  await win.waitForTimeout(1500);
  const w0 = await width();
  await dlg.getByTestId('m3d-stretch-x').evaluate((el: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '2');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await win.waitForTimeout(1500);
  expect(await width()).toBeGreaterThan(w0 * 1.3);
  await K.app.close();
});
