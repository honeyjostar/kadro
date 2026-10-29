// Маркеры: M — поставить, Shift+M / Ctrl+Shift+M — к соседним, щелчок — перейти, двойной — переименовать,
// потянуть — сдвинуть, правая кнопка — цвет и главы; главы — в буфер для YouTube и внутрь MP4.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { importAt, launch, project, state, store, solidVideo, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
const OUT = path.join(os.tmpdir(), 'kadro-e2e', 'markers.mp4');

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);
test.beforeAll(async () => {
  K = await launch({ env: { KADRO_TEST_EXPORT: OUT } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

const marks = async () => ((await project(win)).markers ?? []).map((m) => ({ t: m.t, label: m.label, color: m.color }));
const playhead = () => state<number>(win, '(s) => s.playhead');
const seek = (t: number) => store(win, 'setPlayhead', t);

test('M, кнопка «Маркер» и русская раскладка ставят маркеры; на тот же кадр второй не ставится', async () => {
  await importAt(win, [solidVideo('red12.mp4', 'red', 12), solidVideo('green12.mp4', 'green', 12), solidVideo('blue12.mp4', 'blue', 12)], 'main', 0);
  await win.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  await seek(0);
  await win.keyboard.press('m');
  await seek(12);
  await win.getByTestId('tl-marker').click();
  await seek(24);
  await win.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ь', code: 'KeyM', bubbles: true })));
  await win.keyboard.press('m'); // повтор на том же месте
  expect(await marks()).toEqual([
    { t: 0, label: 'Маркер 1', color: 'pink' }, { t: 12, label: 'Маркер 2', color: 'pink' }, { t: 24, label: 'Маркер 3', color: 'pink' },
  ]);
  await expect(win.getByTestId('marker')).toHaveCount(3);
});

test('переходы: Shift+M — к следующему, Ctrl+Shift+M — к предыдущему, щелчок по маркеру — к нему', async () => {
  await seek(1);
  await win.keyboard.press('Shift+M');
  expect(await playhead()).toBe(12);
  await win.keyboard.press('Shift+M');
  expect(await playhead()).toBe(24);
  await win.keyboard.press('Shift+M'); // дальше маркеров нет — стоим
  expect(await playhead()).toBe(24);
  await win.keyboard.press('Control+Shift+M');
  expect(await playhead()).toBe(12);
  await win.getByTestId('marker').first().click();
  expect(await playhead()).toBe(0);
});

test('двойной щелчок — переименовать; правая кнопка — цвет; Ctrl+Z отменяет', async () => {
  const second = win.getByTestId('marker').nth(1);
  await second.dblclick();
  const input = win.getByTestId('marker-input');
  await expect(input).toBeFocused();
  await input.fill('Тест камеры');
  await input.press('Enter');
  await expect(second).toContainText('Тест камеры');
  await win.getByTestId('marker').nth(2).click({ button: 'right' });
  await win.getByTestId('mk-color-green').click();
  expect((await marks())[2]).toEqual({ t: 24, label: 'Маркер 3', color: 'green' });
  // Esc в поле — без изменений
  await win.getByTestId('marker').first().dblclick();
  await win.getByTestId('marker-input').fill('не то');
  await win.getByTestId('marker-input').press('Escape');
  expect((await marks())[0].label).toBe('Маркер 1');
  await win.keyboard.press('Control+z');
  expect((await marks())[2].color).toBe('pink');
  await win.keyboard.press('Control+y');
  expect((await marks())[2].color).toBe('green');
});

test('маркер тянется мышью — по кадрам', async () => {
  const m = win.getByTestId('marker').nth(2);
  const box = (await m.boundingBox())!;
  const pps = await state<number>(win, '(s) => s.pxPerSec');
  await win.mouse.move(box.x + 1, box.y + 8);
  await win.mouse.down();
  await win.mouse.move(box.x + 1 + 2 * pps, box.y + 8, { steps: 6 });
  await win.mouse.up();
  const t = (await marks())[2].t;
  expect(t).toBeGreaterThan(25.5);
  expect(t).toBeLessThan(26.5);
  expect(Math.abs(t * 30 - Math.round(t * 30))).toBeLessThan(1e-6); // по кадрам
  expect(await playhead()).not.toBe(t); // это было перетаскивание, не щелчок
  // вернуть на 24 для глав
  await win.evaluate(() => { const k = (window as any).__kadro; const p = k.useStore.getState().project; k.useStore.getState().commit((q: any) => ({ ...q, markers: q.markers.map((x: any, i: number) => (i === 2 ? { ...x, t: 24 } : x)) })); void p; });
  expect((await marks())[2].t).toBe(24);
});

test('главы для YouTube: из меню линейки — в буфер обмена', async () => {
  const ruler = win.getByTestId('ruler');
  const rb = (await ruler.boundingBox())!;
  await ruler.click({ button: 'right', position: { x: rb.width / 2, y: 18 } });
  await win.getByTestId('ruler-chapters').click();
  await expect.poll(() => K.app.evaluate(({ clipboard }) => clipboard.readText())).toBe('0:00 Маркер 1\n0:12 Тест камеры\n0:24 Маркер 3');
  await expect(win.locator('.toast').filter({ hasText: 'Главы скопированы' })).toBeVisible();
});

test('экспорт: главы из маркеров внутри MP4 и кнопка «Скопировать главы» в окне готового видео', async () => {
  fs.rmSync(OUT, { force: true });
  await win.getByTestId('export-open').click();
  await win.getByTestId('export-dialog').getByRole('button', { name: '720p' }).click();
  await expect(win.getByTestId('export-dialog')).toContainText('главы из маркеров: 3');
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-chapters')).toBeVisible({ timeout: 90_000 });
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_chapters', OUT], { encoding: 'utf8' }));
  expect(j.chapters.map((c: any) => [Number(c.start_time), Number(c.end_time), c.tags.title])).toEqual([[0, 12, 'Маркер 1'], [12, 24, 'Тест камеры'], [24, 36, 'Маркер 3']]);
  await win.getByTestId('export-dialog').getByRole('button', { name: 'Закрыть' }).last().click();
});

test('удалить маркер и все маркеры — из меню', async () => {
  await win.getByTestId('marker').nth(1).click({ button: 'right' });
  await win.getByTestId('mk-delete').click();
  expect((await marks()).map((m) => m.t)).toEqual([0, 24]);
  const rb = (await win.getByTestId('ruler').boundingBox())!;
  await win.getByTestId('ruler').click({ button: 'right', position: { x: rb.width - 40, y: 18 } });
  await win.getByTestId('ruler-clear-markers').click();
  await expect(win.getByTestId('marker')).toHaveCount(0);
});
