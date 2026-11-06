// Распознавание речи на видеокарте или процессоре (Настройки → Распознавание речи).
// Видеокарты и сборки с DirectML в автотестах нет: KADRO_TEST_ASR_DML=quiet — «видеокарта есть» и считает молча
// на процессоре; KADRO_TEST_ASR_DML=1 — DirectML «не включается» (как на неподходящей видеокарте);
// KADRO_TEST_ASR_CRASH — процесс речи падает при распознавании на видеокарте.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { importAt, launch, project, reset, store, talkVideo } from './kadro';

const HW = JSON.stringify({ cpu: 'Intel(R) Core(TM) i5-12400F', threads: 12, ramGb: 16, gpus: [{ name: 'NVIDIA GeForce RTX 3060', vendor: 'nvidia', driver: '566.36' }], encoders: [{ id: 'nvenc', ok: true }] });
const KEY = 'ru|NVIDIA GeForce RTX 3060@566.36';
const GPUS = 'NVIDIA GeForce RTX 3060@566.36';
const settings = (data: string) => JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8'));
const dataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-asrdev-'));

async function captions(win: Page): Promise<string> {
  await reset(win);
  await importAt(win, [talkVideo()]);
  await win.getByTestId('tab-captions').click();
  await win.locator('.model input').nth(1).check(); // GigaAM
  await win.getByTestId('make-captions').click();
  await win.waitForFunction(() => (window as any).__kadro.useStore.getState().project.tracks.some((t: any) => t.kind === 'text' && t.clips.length), undefined, { timeout: 180_000 });
  const p = await project(win);
  return p.tracks.filter((t) => t.kind === 'text').flatMap((t) => t.clips).map((c: any) => c.text).join(' ').toLowerCase();
}
async function openSettings(win: Page) {
  await store(win, 'setSettingsOpen', true);
  await expect(win.getByTestId('asr-device-sec')).toBeVisible();
}

test('без видеокарты для распознавания — процессор, так и написано', async () => {
  const K = await launch({ data: dataDir() });
  await openSettings(K.win);
  await expect(K.win.getByTestId('asr-device').locator('[data-value=auto]')).toHaveClass(/active/);
  await expect(K.win.getByTestId('asr-device-status')).toContainText('на процессоре');
  await expect(K.win.getByTestId('asr-rebench')).toHaveCount(0);
  await K.app.close();
});

test('«Авто»: сравнивает видеокарту и процессор один раз и запоминает', async () => {
  const data = dataDir();
  const K = await launch({ data, env: { KADRO_TEST_ASR_DML: 'quiet', KADRO_TEST_HW: HW } });
  await openSettings(K.win);
  await expect(K.win.getByTestId('asr-device-status')).toContainText('сравнит видеокарту и процессор');
  await store(K.win, 'setSettingsOpen', false);
  const text = await captions(K.win);
  for (const w of ['привет', 'субтитры']) expect(text, text).toContain(w);
  const b = settings(data).asrBench?.[KEY];
  expect(b, JSON.stringify(settings(data))).toBeTruthy();
  expect(b.gpuSec).toBeGreaterThan(0);
  expect(b.cpuSec).toBeGreaterThan(0);
  expect(b.speechSec).toBeGreaterThan(4);
  expect(settings(data).asrGpuFailed?.[GPUS]).toBeUndefined();
  // второй раз — без сравнения: замер тот же
  await captions(K.win);
  expect(settings(data).asrBench[KEY].at).toBe(b.at);
  await openSettings(K.win);
  await expect(K.win.getByTestId('asr-bench-ru')).toContainText('GigaAM');
  await expect(K.win.getByTestId('asr-last')).toContainText('с речи');
  // «Сравнить заново» — замер забыт
  await K.win.getByTestId('asr-rebench').click();
  await expect(K.win.getByTestId('asr-device-status')).toContainText('сравнит видеокарту и процессор');
  expect(settings(data).asrBench?.[KEY]).toBeUndefined();
  await K.app.close();
});

test('DirectML не включился — субтитры всё равно есть, «Авто» дальше на процессоре', async () => {
  const data = dataDir();
  const K = await launch({ data, env: { KADRO_TEST_ASR_DML: '1', KADRO_TEST_HW: HW } });
  await openSettings(K.win);
  await K.win.getByTestId('asr-device').locator('[data-value=gpu]').click();
  await expect(K.win.getByTestId('asr-device-status')).toContainText('Распознаю на видеокарте');
  await store(K.win, 'setSettingsOpen', false);
  const text = await captions(K.win);
  expect(text, text).toContain('привет');
  await expect.poll(() => settings(data).asrGpuFailed?.[GPUS] ?? '').toMatch(/DirectML/);
  expect(settings(data).asrDevice).toBe('gpu');
  await openSettings(K.win);
  await expect(K.win.getByTestId('asr-device-status')).toContainText('не включилась');
  await expect(K.win.getByTestId('asr-last')).toContainText('процессоре');
  await K.win.getByTestId('asr-device').locator('[data-value=auto]').click();
  await expect(K.win.getByTestId('asr-device-status')).toContainText('не подошла');
  await K.app.close();
});

test('видеокарта уронила процесс речи — распознаётся на процессоре, видеокарта больше не берётся', async () => {
  const data = dataDir();
  const K = await launch({ data, env: { KADRO_TEST_ASR_DML: 'quiet', KADRO_TEST_ASR_CRASH: '1', KADRO_TEST_HW: HW } });
  const text = await captions(K.win);
  expect(text, text).toContain('привет');
  expect(settings(data).asrGpuFailed?.[GPUS]).toMatch(/crash/);
  await openSettings(K.win);
  await expect(K.win.getByTestId('asr-device-status')).toContainText('не подошла');
  // второй раз — сразу на процессоре, без падения
  await store(K.win, 'setSettingsOpen', false);
  expect(await captions(K.win)).toContain('привет');
  expect(K.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  await K.app.close();
});

test('видеокарта зависла — процесс речи перезапускается, субтитры на процессоре', async () => {
  const data = dataDir();
  const K = await launch({ data, env: { KADRO_TEST_ASR_DML: 'quiet', KADRO_TEST_ASR_HANG: '1', KADRO_TEST_GPU_HANG_MS: '4000', KADRO_TEST_HW: HW } });
  const text = await captions(K.win);
  expect(text, text).toContain('привет');
  expect(settings(data).asrGpuFailed?.[GPUS]).toBe('hang');
  await K.app.close();
});

test('«Процессор» — без сравнения и видеокарты', async () => {
  const data = dataDir();
  const K = await launch({ data, env: { KADRO_TEST_ASR_DML: 'quiet', KADRO_TEST_ASR_CRASH: '1', KADRO_TEST_HW: HW } });
  await openSettings(K.win);
  await K.win.getByTestId('asr-device').locator('[data-value=cpu]').click();
  await expect(K.win.getByTestId('asr-device-status')).toHaveText('Распознаю на процессоре.');
  await store(K.win, 'setSettingsOpen', false);
  expect(await captions(K.win)).toContain('привет'); // с KADRO_TEST_ASR_CRASH видеокарта уронила бы процесс
  const s = settings(data);
  expect(s.asrDevice).toBe('cpu');
  expect(s.asrBench).toBeUndefined();
  expect(s.asrGpuFailed).toBeUndefined();
  await K.app.close();
});
