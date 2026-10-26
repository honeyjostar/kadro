// Выделение нескольких клипов: Ctrl+щелчок, Shift+щелчок (диапазон), рамка мышью, Ctrl+A — и перенос всех вместе.
import { expect, test, type Page } from '@playwright/test';
import { act, grayImage, importAt, launch, project, reset, solidVideo, state, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);
test.beforeAll(async () => { K = await launch(); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

const box = async (id: string) => (await win.locator(`[data-clip="${id}"]`).first().boundingBox())!;
const sel = () => state<string[]>(win, '(s) => s.selection');
async function drag(id: string, dx: number, dy = 0): Promise<void> {
  const b = await box(id);
  const x = b.x + Math.min(30, b.width / 2);
  const y = b.y + b.height / 2;
  await win.mouse.move(x, y);
  await win.mouse.down();
  for (let i = 1; i <= 8; i++) await win.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
  await win.mouse.up();
}

let main: string[] = [];
let ov: string[] = [];
test.beforeAll(async () => {
  await reset(win);
  await importAt(win, [solidVideo('red3.mp4', 'red', 3), solidVideo('blue3.mp4', 'blue', 3), solidVideo('green3.mp4', 'green', 3)], 'main', 0);
  const [img] = await act(win, 'importPaths', [grayImage()]);
  await act(win, 'addAssetToTimeline', img, 'overlay', 0.5);
  await act(win, 'addAssetToTimeline', img, 'overlay', 5);
  await store(win, 'setZoom', 60);
  const p = await project(win);
  main = p.tracks[0].clips.map((c) => c.id);
  ov = p.tracks.filter((t) => t.kind === 'video').flatMap((t) => t.clips).map((c) => c.id);
  expect(main).toHaveLength(3);
  expect(ov).toHaveLength(2);
});

test('Ctrl+щелчок — два наложения, перетаскивание двигает оба', async () => {
  await store(win, 'select', []);
  await win.locator(`[data-clip="${ov[0]}"]`).click({ modifiers: ['Control'] });
  await win.locator(`[data-clip="${ov[1]}"]`).click({ modifiers: ['Control'] });
  expect((await sel()).sort()).toEqual([...ov].sort());
  const before = (await project(win)).tracks.flatMap((t) => t.clips).filter((c) => ov.includes(c.id)).map((c) => c.start);
  await drag(ov[0], 90); // 1.5 с при 60 px/с
  const after = (await project(win)).tracks.flatMap((t) => t.clips).filter((c) => ov.includes(c.id)).map((c) => c.start);
  const d0 = after[0] - before[0];
  expect(d0).toBeGreaterThan(1);
  expect(Math.abs(after[1] - before[1] - d0)).toBeLessThan(0.02); // оба на одно и то же время
  expect((await sel()).sort()).toEqual([...ov].sort()); // выделение осталось
  // Ctrl+щелчок по выделенному — убрать его из выделения
  await win.locator(`[data-clip="${ov[1]}"]`).click({ modifiers: ['Control'] });
  expect(await sel()).toEqual([ov[0]]);
});

test('Shift+щелчок — диапазон на основной; блок из двух клипов переставляется целиком', async () => {
  await win.locator(`[data-clip="${main[0]}"]`).click();
  await win.locator(`[data-clip="${main[2]}"]`).click({ modifiers: ['Shift'] });
  expect((await sel()).sort()).toEqual([...main].sort());
  // выделяем первые два и тянем их в конец
  await win.locator(`[data-clip="${main[0]}"]`).click();
  await win.locator(`[data-clip="${main[1]}"]`).click({ modifiers: ['Control'] });
  const end = await box(main[2]);
  const b0 = await box(main[0]);
  await drag(main[0], end.x + end.width - b0.x - 10);
  const order = (await project(win)).tracks[0].clips.map((c) => c.id);
  expect(order).toEqual([main[2], main[0], main[1]]);
  // склейки без дыр: магнитная дорожка
  const cl = (await project(win)).tracks[0].clips as any[];
  expect(cl[0].start).toBe(0);
  for (let i = 1; i < cl.length; i++) expect(Math.abs(cl[i].start - (cl[i - 1].start + (cl[i - 1].out - cl[i - 1].in) / cl[i - 1].speed))).toBeLessThan(0.01);
  // отмена одним шагом
  await store(win, 'undo');
  expect((await project(win)).tracks[0].clips.map((c) => c.id)).toEqual(main);
});

test('щелчок без перетаскивания по одному из выделенных — остаётся выделен только он', async () => {
  await store(win, 'select', [...main]);
  await win.locator(`[data-clip="${main[1]}"]`).click();
  expect(await sel()).toEqual([main[1]]);
});

test('рамка мышью выделяет клипы, которых коснулась; Ctrl+A — все', async () => {
  await store(win, 'select', []);
  const a = await box(ov[0]);
  const b = await box(ov[1]);
  // от пустого места левее первого наложения до правее второго, только по дорожке наложений
  const rows = win.locator('.tl-rows');
  const r = (await rows.boundingBox())!;
  const y = a.y + a.height / 2;
  const x0 = Math.max(r.x + 4, a.x - 15);
  await win.mouse.move(x0, y);
  await win.mouse.down();
  await win.mouse.move(x0 + 40, y, { steps: 4 });
  await expect(win.getByTestId('tl-marquee')).toBeVisible();
  await win.mouse.move(b.x + b.width + 10, y + 2, { steps: 6 });
  await win.mouse.up();
  await expect(win.getByTestId('tl-marquee')).toHaveCount(0);
  expect((await sel()).sort()).toEqual([...ov].sort());
  await win.locator('.tl-rows').click({ position: { x: 5, y: 5 } });
  await win.keyboard.press('Control+a');
  expect((await sel()).length).toBe(5);
  await win.keyboard.press('Escape');
});
