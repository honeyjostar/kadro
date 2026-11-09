// «Где пролистнут»: кнопка на таймлайне и в окне экспорта, отметки на линейке, исправления одной кнопкой.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { act, importAt, launch, patternImage, project, solidVideo, waitAssetsReady } from './kadro';

test.setTimeout(180_000);

test('застывшая картинка: крючок, длинный план, нет звука — наезд камеры убирает два замечания', async () => {
  const K = await launch();
  const win = K.win;
  await act(win, 'newProjectAction', '9:16');
  await importAt(win, [patternImage()], 'main', 0);
  await waitAssetsReady(win);
  const id = (await project(win)).tracks[0].clips[0].id;
  await win.evaluate((cid) => { const k = (window as any).__kadro; k.useStore.getState().commit((p: any) => k.timeline.updateClip(p, cid, { out: 6 })); }, id);
  await win.getByTestId('tl-retention').click();
  await expect(win.getByTestId('ret-bar')).toBeVisible({ timeout: 60_000 });
  await expect(win.getByTestId('ret-bar')).toContainText('1 из 3');
  await expect(win.getByTestId('ret-mark')).toHaveCount(2); // «нет звука» — на весь ролик, без отметки
  await expect(win.getByTestId('ret-text')).toContainText('Первые 2 секунды');
  await win.getByTestId('ret-next').click();
  await expect(win.getByTestId('ret-text')).toContainText('Один план');
  await win.getByTestId('ret-prev').click();
  await win.getByTestId('ret-fix').click(); // наезд камеры
  await expect(win.getByTestId('ret-bar')).toContainText('1 из 1');
  await expect(win.getByTestId('ret-text')).toContainText('нет звука');
  const clip = (await project(win)).tracks[0].clips[0] as any;
  expect(clip.keyframes.scale.map((k: any) => k.v)).toEqual([1, 1.15]);
  // «Добавить музыку» — вкладка «Аудио»
  await win.getByTestId('ret-fix').click();
  expect(await win.evaluate(() => (window as any).__kadro.useStore.getState().leftTab)).toBe('audio');
  await win.getByTestId('ret-close').click();
  await expect(win.getByTestId('ret-bar')).toHaveCount(0);
  await expect(win.getByTestId('ret-mark')).toHaveCount(0);
  expect(K.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  await K.app.close();
});

test('в окне экспорта: речь начинается поздно — «Обрезать начало» сдвигает всё вместе', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-ret-'));
  const srt = path.join(dir, 'late.srt');
  fs.writeFileSync(srt, ['1', '00:00:03,400 --> 00:00:05,000', 'Привет всем', '', '2', '00:00:05,200 --> 00:00:07,000', 'Начинаем', ''].join('\n'));
  const K = await launch({ env: { KADRO_TEST_SUBS: srt } });
  const win = K.win;
  await act(win, 'newProjectAction', '9:16');
  await importAt(win, [solidVideo('red12.mp4', 'red', 12)], 'main', 0);
  await waitAssetsReady(win);
  await act(win, 'importSubtitles', srt);
  await win.evaluate(() => (window as any).__kadro.useStore.getState().setExportOpen(true));
  await win.getByTestId('export-retention').click();
  await expect(win.getByTestId('export-retention-list')).toBeVisible({ timeout: 60_000 });
  const late = win.getByTestId('export-retention-list').locator('li', { hasText: 'Речь начинается' });
  await expect(late).toContainText('4-й');
  await late.getByTestId('ret-fix').click();
  await expect(win.getByTestId('export-retention-list').locator('li', { hasText: 'Речь начинается' })).toHaveCount(0);
  const p = await project(win);
  const main = p.tracks.find((t: any) => t.kind === 'main')!.clips[0] as any;
  expect(main.in).toBeCloseTo(3.1, 2);
  const caps = p.tracks.flatMap((t: any) => t.clips).filter((c: any) => c.role === 'caption').sort((a: any, b: any) => a.start - b.start);
  expect(caps[0].start).toBeCloseTo(0.3, 2);
  expect(caps[1].start).toBeCloseTo(2.1, 2);
  // «Показать» — закрывает окно, курсор на месте
  await win.getByTestId('export-retention-list').locator('li').first().getByTestId('ret-show').click();
  await expect(win.getByTestId('export-dialog')).toHaveCount(0);
  expect(K.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  await K.app.close();
});
