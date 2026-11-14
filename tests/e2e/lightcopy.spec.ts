// Лёгкие копии для 2K и 4K: на слабом компьютере (GTX 1060) плеер играет копию 720p, экспорт берёт оригинал;
// на сильном (RTX 5060) и с настройкой «Нет» — копий нет.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { importAt, launch, MEDIA, project, store, type Kadro } from './kadro';

const HW = (gpu: string, vram: number, threads: number) => JSON.stringify({ cpu: 'Test CPU', threads, ramGb: 16, gpus: [{ name: gpu, vendor: 'nvidia', vramGb: vram }], encoders: [] });
const GTX1060 = HW('NVIDIA GeForce GTX 1060 6GB', 6, 8);
const RTX5060 = HW('NVIDIA GeForce RTX 5060', 8, 16);

function qhd(): string {
  const f = path.join(MEDIA, 'qhd-2560x1440.mp4');
  if (!fs.existsSync(f)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=2560x1440:r=30:d=2', '-f', 'lavfi', '-i', 'sine=440:d=2',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f]);
  return f;
}
const asset = async (K: Kadro) => (await project(K.win)).assets[0];

test('GTX 1060: видео 2K — лёгкая копия 720p для плеера, оригинал не тронут', async () => {
  const K = await launch({ env: { KADRO_TEST_HW: GTX1060 } });
  await importAt(K.win, [qhd()], 'main', 0);
  await expect.poll(async () => (await asset(K)).proxy, { timeout: 120_000 }).toBe('ready');
  const a = await asset(K);
  expect(a.path).toBe(qhd());
  expect(a.previewPath).not.toBe(a.path);
  expect([a.width, a.height]).toEqual([2560, 1440]);
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', a.previewPath], { encoding: 'utf8' }).trim();
  expect(probe).toBe('1280,720');
  await K.app.close();
});

test('RTX 5060 — копий нет; настройка «Всегда» — есть, «Нет» — нет', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-lc-'));
  let K = await launch({ data, env: { KADRO_TEST_HW: RTX5060 } });
  await importAt(K.win, [qhd()], 'main', 0);
  await K.win.waitForTimeout(1500);
  expect((await asset(K)).proxy).toBe('none');
  await store(K.win, 'setSettingsOpen', true);
  await K.win.getByTestId('light-copy').locator('[data-value=on]').click();
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8')).lightCopy).toBe('on');
  await store(K.win, 'setSettingsOpen', false);
  await K.win.evaluate(() => (window as any).__kadro.actions.newProjectAction());
  await importAt(K.win, [qhd()], 'main', 0);
  await expect.poll(async () => (await asset(K)).proxy, { timeout: 120_000 }).toBe('ready');
  await K.app.close();
  // перезапуск: настройка помнится
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8')), lightCopy: 'off' }));
  K = await launch({ data, env: { KADRO_TEST_HW: GTX1060 } });
  await K.win.evaluate(() => (window as any).__kadro.actions.newProjectAction()); // черновик прошлого запуска — в сторону
  await importAt(K.win, [qhd()], 'main', 0);
  await K.win.waitForTimeout(1500);
  expect((await asset(K)).proxy).toBe('none');
  await K.app.close();
});
