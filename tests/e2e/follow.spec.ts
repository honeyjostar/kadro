// «Следовать за объектом»: текст поверх видео обводится за «номер», трекер ведёт — у текста ключи положения; «Отвязать».
import { expect, test, type Page } from '@playwright/test';
import { faceVideo, importAt, launch, project, seekAndSettle, store, waitAssetsReady, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
test.beforeAll(async () => { K = await launch(); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

test('текст едет за номером, «Отвязать» — снова на месте', async () => {
  await importAt(win, [faceVideo()], 'main', 0);
  await waitAssetsReady(win);
  await win.evaluate(() => {
    const k = (window as any).__kadro;
    k.useStore.getState().commit((p: any) => { const r = k.timeline.addText(p, 0, 'Номер'); return k.timeline.updateClip(r.project, r.clipId, { duration: 3 }); });
  });
  const p = await project(win);
  const text = p.tracks.flatMap((t) => t.clips).find((c: any) => c.type === 'text') as any;
  expect(text).toBeTruthy();
  await store(win, 'select', [text.id]);
  await seekAndSettle(win, 1);
  await win.getByText('Анимация', { exact: true }).click();
  await win.getByTestId('follow-draw').click();
  await expect(win.getByTestId('blur-draw')).toBeVisible();
  // «номер» в 1 с: x 480..576, y 120..152 в кадре 640×360, кадр вписан в проект
  const { width: W, height: H } = p.settings;
  const k = Math.min(W / 640, H / 360), ox = (W - 640 * k) / 2, oy = (H - 360 * k) / 2;
  const box = (await win.getByTestId('preview').boundingBox())!;
  const at = (x: number, y: number) => [box.x + ((ox + x * k) / W) * box.width, box.y + ((oy + y * k) / H) * box.height] as const;
  const [x0, y0] = at(480, 120), [x1, y1] = at(576, 152);
  await win.mouse.move(x0, y0);
  await win.mouse.down();
  await win.mouse.move(x1, y1, { steps: 6 });
  await win.mouse.up();
  await expect(win.getByTestId('follow-on')).toBeVisible({ timeout: 60_000 });
  const t1 = (await project(win)).tracks.flatMap((t) => t.clips).find((c: any) => c.id === text.id) as any;
  expect(t1.follow.target).toBeTruthy();
  const ys = t1.keyframes.y as { t: number; v: number }[];
  // номер едет вниз на 60 точек кадра в секунду: у текста y растёт с той же скоростью (в долях холста)
  const v = (t: number) => {
    if (t <= ys[0].t) return ys[0].v;
    for (let i = 1; i < ys.length; i++) if (ys[i].t >= t) { const a = ys[i - 1], b = ys[i]; return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t); }
    return ys[ys.length - 1].v;
  };
  const rate = (v(2) - v(1)) / 1;
  expect(rate).toBeGreaterThan((60 * k / H) * 0.8);
  expect(rate).toBeLessThan((60 * k / H) * 1.2);
  expect(Math.abs(v(1) - text.y)).toBeLessThan(0.01); // в момент обводки — на своём месте
  await win.getByTestId('follow-off').click();
  const t2 = (await project(win)).tracks.flatMap((t) => t.clips).find((c: any) => c.id === text.id) as any;
  expect(t2.follow).toBeUndefined();
  expect(t2.keyframes?.y).toBeUndefined();
});
