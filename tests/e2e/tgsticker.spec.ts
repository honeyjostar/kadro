// Видеостикер Telegram: WebM VP9 без звука, 512 px по длинной стороне, не длиннее 3 с, до 256 КБ;
// прозрачный фон — где нет кадра (здесь: надпись на пустой основной дорожке поверх пустоты).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { act, importAt, launch, personVideo, project, solidVideo, store, waitAssetsReady } from './kadro';

test.setTimeout(240_000);

function info(file: string) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' }));
  const v = j.streams.find((s: any) => s.codec_type === 'video');
  return { codec: v.codec_name, w: v.width, h: v.height, dur: Number(j.format.duration), audio: j.streams.some((s: any) => s.codec_type === 'audio'), size: fs.statSync(file).size, alpha: v.tags?.alpha_mode ?? v.tags?.ALPHA_MODE };
}
/** Альфа первого кадра в точке (декодер libvpx — встроенный теряет прозрачность). */
function alphaAt(file: string, fx: number, fy: number, w: number, h: number): number {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-c:v', 'libvpx-vp9', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 64 << 20 });
  const x = Math.round(fx * (w - 1)); const y = Math.round(fy * (h - 1));
  return r.stdout[(y * w + x) * 4 + 3];
}

test('стикер из ролика: 512 px, 3 с, без звука, до 256 КБ', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-tg-'));
  const K = await launch({ env: { KADRO_TEST_EXPORT: path.join(dir, 's.mp4') } });
  const win = K.win;
  await act(win, 'newProjectAction', '9:16');
  await importAt(win, [solidVideo('red5.mp4', 'red', 5)], 'main', 0);
  await waitAssetsReady(win);
  await store(win, 'setExportOpen', true);
  await win.getByTestId('export-format').locator('[data-value=sticker]').click();
  await expect(win.getByTestId('export-sticker-long')).toBeVisible();
  await win.getByTestId('export-sticker-bg').locator('[data-value=frame]').click();
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-show')).toBeVisible({ timeout: 120_000 });
  const f = path.join(dir, 's.webm');
  const i = info(f);
  expect(i).toMatchObject({ codec: 'vp9', w: 288, h: 512, audio: false });
  expect(i.dur).toBeLessThanOrEqual(3.05);
  expect(i.size).toBeLessThanOrEqual(256 * 1024);
  expect(K.errors).toEqual([]);
  await K.app.close();
});

test('прозрачный фон: плашка с надписью есть, вокруг — пусто', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-tg-'));
  const K = await launch({ env: { KADRO_TEST_EXPORT: path.join(dir, 't.mp4') } });
  const win = K.win;
  await act(win, 'newProjectAction', '1:1');
  await win.evaluate(() => {
    const k = (window as any).__kadro;
    const r = k.timeline.addText(k.useStore.getState().project, 0, 'ОГОНЬ', { size: 220, color: '#ffffff', bgColor: '#ffcc00', bgOpacity: 1, strokeWidth: 0, shadow: false });
    k.useStore.getState().commit(() => k.timeline.updateClip(r.project, r.clipId, { duration: 2 }));
  });
  await store(win, 'setExportOpen', true);
  await win.getByTestId('export-format').locator('[data-value=sticker]').click();
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-show')).toBeVisible({ timeout: 120_000 });
  const f = path.join(dir, 't.webm');
  const i = info(f);
  expect(i).toMatchObject({ codec: 'vp9', w: 512, h: 512, audio: false });
  expect(alphaAt(f, 0.03, 0.03, 512, 512)).toBeLessThan(20);   // угол — прозрачный
  expect(alphaAt(f, 0.5, 0.5, 512, 512)).toBeGreaterThan(200); // плашка — плотная
  await K.app.close();
});

test('вырезанный человек на основной дорожке — без фона', async () => {
  const person = personVideo();
  test.skip(!person, 'нет тестового фото человека');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-tg-'));
  const K = await launch({ env: { KADRO_TEST_EXPORT: path.join(dir, 'p.mp4') } });
  const win = K.win;
  await act(win, 'newProjectAction', '1:1');
  await importAt(win, [person!], 'main', 0);
  await waitAssetsReady(win);
  await act(win, 'removeBackground', (await project(win)).tracks[0].clips[0].id);
  await store(win, 'setExportOpen', true);
  await win.getByTestId('export-format').locator('[data-value=sticker]').click();
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-show')).toBeVisible({ timeout: 120_000 });
  const f = path.join(dir, 'p.webm');
  expect(alphaAt(f, 0.02, 0.02, 512, 512)).toBeLessThan(20);   // фон фото убран — угол прозрачный
  expect(alphaAt(f, 0.37, 0.6, 512, 512)).toBeGreaterThan(200); // человек на месте
  await K.app.close();
});
