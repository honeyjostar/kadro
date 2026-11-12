// Запись экрана и веб-камеры: экран со звуком микрофона — в конец основной дорожки, камера — отдельным файлом
// кружком поверх; «только камера» — камера на основную дорожку. Файлы — MP4 в папке записей.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { launch, project, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
let dir: string;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-srec-'));
  K = await launch({ env: { KADRO_TEST_RECORDINGS: dir } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

const probe = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', f], { encoding: 'utf8' }));

async function openDialog() {
  await win.getByTestId('tab-media').click();
  await win.getByTestId('media-screenrec').click();
  await expect(win.getByTestId('srec-dialog')).toBeVisible();
}

test('экран + микрофон + камера: два файла, камера кружком поверх', async () => {
  await openDialog();
  await expect(win.getByTestId('srec-source').first()).toBeVisible({ timeout: 20_000 });
  await win.getByTestId('srec-source').first().click();
  const camVal = await win.getByTestId('srec-cam').locator('option').nth(1).getAttribute('value');
  await win.getByTestId('srec-cam').selectOption(camVal!);
  await win.locator('.toggle').filter({ hasText: 'Свернуть Kadro' }).click(); // в тестах окно не сворачиваем
  await win.getByTestId('srec-start').click();
  await expect(win.getByTestId('srec-live')).toBeVisible({ timeout: 20_000 });
  await win.waitForTimeout(2500);
  await win.getByTestId('srec-stop').click();
  await expect(win.getByTestId('srec-dialog')).toHaveCount(0, { timeout: 60_000 });
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mp4'));
  expect(files).toHaveLength(2);
  const screen = files.find((f) => !f.includes('камера'))!;
  const cam = files.find((f) => f.includes('камера'))!;
  const ps = probe(path.join(dir, screen));
  expect(ps.streams.map((s: any) => s.codec_type).sort()).toEqual(['audio', 'video']);
  expect(Number(ps.format.duration)).toBeGreaterThan(1.5);
  expect(probe(path.join(dir, cam)).streams.map((s: any) => s.codec_type)).toEqual(['video']);
  const p = await project(win);
  const main = p.tracks.find((t) => t.kind === 'main')!.clips as any[];
  const over = p.tracks.filter((t) => t.kind === 'video').flatMap((t) => t.clips) as any[];
  expect(main).toHaveLength(1);
  expect(over).toHaveLength(1);
  expect(over[0].start).toBe(main[0].start);
  expect(over[0].mask?.shape).toBe('circle');
  expect(over[0].transform.scale).toBeLessThan(1);
});

test('только камера — на основную дорожку; отмена записи не оставляет файлов', async () => {
  const before = fs.readdirSync(dir).length;
  await openDialog();
  await win.getByTestId('srec-cam-only').click();
  await expect(win.getByTestId('srec-start')).toBeDisabled();
  const camVal = await win.getByTestId('srec-cam').locator('option').nth(1).getAttribute('value');
  await win.getByTestId('srec-cam').selectOption(camVal!);
  await win.getByTestId('srec-start').click();
  await expect(win.getByTestId('srec-live')).toBeVisible({ timeout: 20_000 });
  await win.waitForTimeout(800);
  await win.getByTestId('srec-cancel').click();
  await expect(win.getByTestId('srec-start')).toBeVisible();
  expect(fs.readdirSync(dir).length).toBe(before);
  await win.getByTestId('srec-start').click();
  await expect(win.getByTestId('srec-live')).toBeVisible({ timeout: 20_000 });
  await win.waitForTimeout(1500);
  await win.getByTestId('srec-stop').click();
  await expect(win.getByTestId('srec-dialog')).toHaveCount(0, { timeout: 60_000 });
  const main = (await project(win)).tracks.find((t) => t.kind === 'main')!.clips;
  expect(main).toHaveLength(2);
});
