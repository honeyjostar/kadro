// «Проверка охватов» на настоящем файле: логотип в углу поверх движущейся картинки, тёмная заставка в конце, тихий звук.
// Потом — «Открыть в Kadro и поправить»: знак закрывается размытием, заставка обрезается, громкость — в экспорт.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { act, ff, launch, media, project, store, type Kadro } from './kadro';
import type { MediaClip } from '../../src/shared/types';

/** 10 с движущейся картинки с «логотипом» сверху справа + 2 с тёмной заставки с белым квадратом; звук очень тихий. */
function markedVideo(): string {
  return media('reach-marked.mp4', (f) => ff([
    '-f', 'lavfi', '-i', 'testsrc2=s=540x960:r=30:d=10',
    '-f', 'lavfi', '-i', 'color=c=white:s=130x44:d=10,drawbox=x=8:y=8:w=34:h=28:color=black:t=fill,drawbox=x=56:y=12:w=66:h=10:color=black:t=fill,drawbox=x=56:y=26:w=40:h=8:color=black:t=fill',
    '-f', 'lavfi', '-i', 'color=c=black:s=540x960:r=30:d=2,drawbox=x=230:y=440:w=80:h=80:color=white:t=fill',
    '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=12,volume=0.01',
    '-filter_complex', '[0:v]scroll=h=0.004:v=0.002[bg];[bg][1:v]overlay=x=W-160:y=40[a];[a][2:v]concat=n=2:v=1:a=0,format=yuv420p[v]',
    '-map', '[v]', '-map', '3:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-c:a', 'aac', '-shortest', f,
  ]));
}

let K: Kadro;
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);
test.beforeAll(async () => { K = await launch(); });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

test('чужой ролик: знак, заставка в конце и тихий звук — найдены, с объяснением', async () => {
  const win = K.win;
  await store(win, 'setReachOpen', { file: markedVideo(), project: false, platform: 'reels' });
  await expect(win.getByTestId('reach-dialog')).toBeVisible();
  await expect(win.getByTestId('reach-result')).toBeVisible({ timeout: 90_000 });
  const kinds = await win.getByTestId('reach-issue').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
  expect(kinds).toEqual(expect.arrayContaining(['mark', 'endcard', 'quiet']));
  expect(kinds).not.toContain('noAudio');
  await expect(win.getByTestId('reach-sum')).toContainText('Режут показы: 2');
  // знак — сверху справа
  await expect(win.locator('[data-kind="mark"]')).toContainText('сверху справа');
  // в чужом файле кнопок «поправить» нет — только «Открыть в Kadro»
  await expect(win.getByTestId('reach-fix-mark')).toHaveCount(0);
  // площадка сменилась — замечания по формату пересчитались без новой проверки
  await win.getByTestId('reach-platform').locator('[data-value="tiktok"]').click();
  await expect(win.getByTestId('reach-result')).toBeVisible();
});

test('«Открыть в Kadro и поправить»: размытие на знак, заставка обрезана, громкость — в экспорт', async () => {
  const win = K.win;
  await win.getByTestId('reach-open').click();
  await expect.poll(async () => (await project(win)).assets.length, { timeout: 30_000 }).toBe(1);
  const p0 = await project(win);
  expect(p0.settings.aspect).toBe('9:16');
  await win.getByTestId('reach-fix-mark').click();
  await expect.poll(async () => ((await project(win)).tracks[0].clips[0] as MediaClip).blurs?.length ?? 0).toBe(1);
  const reg = ((await project(win)).tracks[0].clips[0] as MediaClip).blurs![0];
  // логотип: x 380–510 из 540, y 40–84 из 960 → центр примерно (0.82, 0.065)
  expect(reg.boxes[0].x).toBeGreaterThan(0.7);
  expect(reg.boxes[0].y).toBeLessThan(0.15);
  await win.getByTestId('reach-fix-endcard').click();
  await expect.poll(async () => {
    const c = (await project(win)).tracks[0].clips[0] as MediaClip;
    return c.out - c.in;
  }).toBeLessThan(10.6);
  await win.getByTestId('reach-fix-quiet').click();
  await expect(win.locator('[data-kind="quiet"]')).toContainText('Поправлено');
  // сохранить заново: в экспорте включено выравнивание громкости
  await win.getByTestId('reach-export').click();
  await expect(win.getByTestId('reach-dialog')).toHaveCount(0);
  await expect(win.getByTestId('export-loudnorm')).toHaveAttribute('aria-checked', 'true');
});

test('после экспорта из Kadro — «Проверить охваты»: проверка своего ролика и поправки в проекте', async () => {
  const win = K.win;
  await win.keyboard.press('Escape');
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-reach-')), 'mine.mp4');
  const r = await act(win, 'exportTo', out, 720, 30);
  expect(r.ok, r.error).toBe(true);
  await store(win, 'setReachOpen', { file: out, project: true, platform: 'tiktok' });
  await expect(win.getByTestId('reach-result')).toBeVisible({ timeout: 90_000 });
  // заставки уже нет
  expect(await win.getByTestId('reach-issue').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))).not.toContain('endcard');
  await win.getByTestId('reach-dialog').getByRole('button', { name: 'Закрыть' }).last().click();
  // и из поиска (Ctrl+K)
  await win.keyboard.press('Control+k');
  await win.getByTestId('search-input').fill('охват');
  await win.keyboard.press('Enter');
  await expect(win.getByTestId('reach-dialog')).toBeVisible();
  await expect(win.getByTestId('reach-pick')).toBeVisible();
});
