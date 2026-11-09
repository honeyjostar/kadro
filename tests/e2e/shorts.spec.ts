// Нарезка длинного видео в шортсы: распознавание речи → лучшие моменты → отдельные вертикальные проекты.
// Окно выбора файла подменено (KADRO_TEST_PICK), папка для проектов — KADRO_TEST_SHORTS.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { ff, launch, media, project, talkVideo } from './kadro';

test.setTimeout(300_000);

/** «Подкаст» ~42 с: тот же ролик с речью три раза подряд. */
function longTalk(): string {
  return media('talk-long.mp4', (f) => {
    const t = talkVideo();
    ff(['-i', t, '-i', t, '-i', t, '-filter_complex', '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a]', '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', f]);
  });
}

test('длинное видео → моменты → проекты шортсов в «Моих проектах»', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-shorts-'));
  const K = await launch({ env: { KADRO_TEST_PICK: longTalk(), KADRO_TEST_SHORTS: dir, KADRO_SKIP_HOME: '' } });
  const win = K.win;
  await expect(win.getByTestId('home')).toBeVisible();
  await win.getByTestId('home-shorts').click();
  await expect(win.getByTestId('shorts-dialog')).toBeVisible();
  await expect(win.getByTestId('shorts-find')).toBeDisabled();
  await win.getByTestId('shorts-pick').click();
  await expect(win.getByTestId('shorts-src')).toContainText('talk-long.mp4');
  await win.getByTestId('shorts-len-short').click();
  await win.getByTestId('shorts-count-3').click();
  await win.getByTestId('shorts-lang-ru').click();
  await win.getByTestId('shorts-style-beast').click();
  await win.getByTestId('shorts-reframe').click(); // без поиска человека — быстрее
  await win.getByTestId('shorts-find').click();
  await expect(win.getByTestId('shorts-list')).toBeVisible({ timeout: 240_000 });
  const n = await win.getByTestId('shorts-item').count();
  expect(n).toBeGreaterThanOrEqual(1);
  expect(n).toBeLessThanOrEqual(3);
  await expect(win.getByTestId('shorts-item').first()).toContainText('«');
  await win.getByTestId('shorts-make').click();
  await expect(win.getByTestId('shorts-done')).toBeVisible({ timeout: 120_000 });
  const files = fs.readdirSync(path.join(dir, 'talk-long')).filter((f) => f.endsWith('.kadro')).sort();
  expect(files.length).toBe(n);
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'talk-long', files[0]), 'utf8'));
  expect(p.settings.aspect).toBe('9:16');
  const main = p.tracks.find((t: any) => t.kind === 'main').clips[0];
  expect(main.out - main.in).toBeGreaterThanOrEqual(15);
  expect(main.out - main.in).toBeLessThanOrEqual(36);
  const texts = p.tracks.flatMap((t: any) => t.clips).filter((c: any) => c.type === 'text');
  const caps = texts.filter((c: any) => c.role === 'caption');
  expect(caps.length).toBeGreaterThan(3);
  expect(caps[0].style.font).toBe('Dela Gothic One');
  expect(caps.map((c: any) => c.text).join(' ').toLowerCase()).toMatch(/субтитр|ролик|паузы/);
  expect(texts.some((c: any) => c.role !== 'caption' && c.y === 0.2)).toBe(true);
  // открыть первый — он и в «Моих проектах»
  await win.getByTestId('shorts-open-first').click();
  await expect(win.getByTestId('shorts-dialog')).toHaveCount(0);
  expect((await project(win)).name.startsWith('Шортс 1')).toBe(true);
  expect(K.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  await K.app.close();
});
