// 3D-объекты: готовая фигура и своя модель (OBJ) → живое превью → видео с прозрачным фоном на дорожке наложений,
// правка уже добавленного 3D, экспорт. Нужен WebGL — запускаем на программной видеокарте (SwiftShader).
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { act, launch, MEDIA, probe, project, reset, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
const OBJ = path.join(MEDIA, 'кубик.obj');

function cubeObj(): void {
  fs.mkdirSync(MEDIA, { recursive: true });
  const v = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  const f = [[1, 2, 3, 4], [5, 8, 7, 6], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 8, 4], [5, 1, 4, 8]];
  fs.writeFileSync(OBJ, [...v.map((p) => `v ${p.join(' ')}`), ...f.map((q) => `f ${q.join(' ')}`)].join('\n'));
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);
test.beforeAll(async () => {
  cubeObj();
  K = await launch({ env: { KADRO_SWIFTSHADER: '1', KADRO_TEST_MODEL: OBJ } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

/** Есть ли нарисованное (непрозрачное) в середине холста превью 3D. */
const stageDrawn = () => win.evaluate(() => {
  const c = document.querySelector('[data-testid=m3d-canvas]') as HTMLCanvasElement;
  const t = document.createElement('canvas');
  t.width = c.width; t.height = c.height;
  const ctx = t.getContext('2d')!;
  ctx.drawImage(c, 0, 0);
  const d = ctx.getImageData(c.width / 2 - 2, c.height / 2 - 2, 4, 4).data;
  const corner = ctx.getImageData(2, 2, 1, 1).data;
  return { center: d[3], corner: corner[3] };
});

test('готовая фигура: живое превью, видео с прозрачностью на дорожке наложений', async () => {
  await reset(win);
  await win.getByTestId('tab-3d').click();
  await win.getByTestId('m3d-heart').click();
  await expect(win.getByTestId('m3d-dialog')).toBeVisible();
  await expect.poll(async () => (await stageDrawn()).center, { timeout: 30_000 }).toBeGreaterThan(200);
  expect((await stageDrawn()).corner).toBe(0); // фон прозрачный
  await win.getByTestId('m3d-motion-float').click();
  await win.getByTestId('m3d-mat-metal').click();
  await win.getByTestId('m3d-place').click();
  await expect(win.getByTestId('m3d-dialog')).toHaveCount(0, { timeout: 200_000 });
  const p = await project(win);
  const ov = p.tracks.filter((t) => t.kind === 'video').flatMap((t) => t.clips) as any[];
  expect(ov).toHaveLength(1);
  expect(ov[0].model3d).toMatchObject({ name: 'Сердце', motion: 'float', material: 'metal' });
  const a = p.assets.find((x) => x.id === ov[0].assetId)!;
  expect(a.path.endsWith('.webm')).toBe(true);
  expect(a.derived).toBe(true);
  expect(Math.abs(a.duration - 5)).toBeLessThan(0.2);
});

test('изменить добавленный 3D: материал меняется, клип остаётся на месте', async () => {
  const p0 = await project(win);
  const clip0 = p0.tracks.find((t) => t.kind === 'video')!.clips[0] as any;
  await store(win, 'select', [clip0.id]);
  await win.getByTestId('itab-basic').click();
  await win.getByTestId('m3d-edit').click();
  await expect(win.getByTestId('m3d-dialog')).toBeVisible();
  await win.getByTestId('m3d-mat-neon').click();
  await win.getByTestId('m3d-place').click();
  await expect(win.getByTestId('m3d-dialog')).toHaveCount(0, { timeout: 200_000 });
  const clip = (await project(win)).tracks.find((t) => t.kind === 'video')!.clips[0] as any;
  expect(clip.id).toBe(clip0.id);
  expect(clip.model3d.material).toBe('neon');
  expect(clip.assetId).not.toBe(clip0.assetId);
  // экспорт: в середине кадра объект, в углу — чёрный фон
  const out = path.join(MEDIA, 'm3d_out.mp4');
  fs.rmSync(out, { force: true });
  const r = await act(win, 'exportTo', out, 360, 30);
  expect(r.ok, r.error).toBe(true);
  expect(probe(out).duration).toBeGreaterThan(4.5);
});

test('своя модель (OBJ): открывается, получает материал и встаёт на таймлайн', async () => {
  await reset(win);
  await win.getByTestId('tab-3d').click();
  await win.getByTestId('m3d-open-file').click();
  await expect(win.getByTestId('m3d-dialog')).toBeVisible();
  await expect(win.getByTestId('m3d-dialog')).toContainText('кубик');
  await expect.poll(async () => (await stageDrawn()).center, { timeout: 30_000 }).toBeGreaterThan(200);
  await win.getByTestId('m3d-motion-still').click();
  await win.getByTestId('m3d-place').click();
  await expect(win.getByTestId('m3d-dialog')).toHaveCount(0, { timeout: 200_000 });
  const ov = (await project(win)).tracks.filter((t) => t.kind === 'video').flatMap((t) => t.clips) as any[];
  expect(ov[0].model3d).toMatchObject({ name: 'кубик', motion: 'still' });
});
