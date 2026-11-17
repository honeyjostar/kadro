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
  await expect(win.getByTestId('shorts-count-all')).toHaveText('Все хорошие');
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
  await expect(win.getByTestId('shorts-why').first()).toContainText('Почему:');
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

/** «Геймплей» 90 с: почти ничего не происходит, на 40-й секунде — грохот и мельтешение, на 70-й — только грохот. */
function gameplay(): string {
  return media('gameplay.mp4', (f) => {
    ff(['-f', 'lavfi', '-i', 'color=c=0x203040:s=640x360:r=30:d=90', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=90',
      '-f', 'lavfi', '-i', 'anoisesrc=d=90:a=0.02:c=pink', '-f', 'lavfi', '-i', 'anoisesrc=d=90:a=0.9:c=white',
      '-filter_complex',
      "[0:v][1:v]overlay=enable='between(t,37,43)'[v];" +
      "[3:a]volume=enable='not(between(t,38,42)+between(t,69,72))':volume=0[boom];[2:a][boom]amix=inputs=2:normalize=0[a]",
      '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', '90', f]);
  });
}

test('игра: моменты по экшену без речи → вертикальные клипы с размытым фоном', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-gshorts-'));
  const K = await launch({ env: { KADRO_TEST_PICK: gameplay(), KADRO_TEST_SHORTS: dir, KADRO_SKIP_HOME: '' } });
  const win = K.win;
  await win.getByTestId('home-shorts').click();
  await win.getByTestId('shorts-mode-game').click();
  await expect(win.getByTestId('shorts-lang-ru')).toHaveCount(0);
  await win.getByTestId('shorts-pick').click();
  await expect(win.getByTestId('shorts-src')).toContainText('gameplay.mp4');
  await win.getByTestId('shorts-len-short').click();
  await win.getByTestId('shorts-count-3').click();
  await win.getByTestId('shorts-layout-blur').click();
  await win.getByTestId('shorts-find').click();
  await expect(win.getByTestId('shorts-list')).toBeVisible({ timeout: 120_000 });
  // первый (лучший) — вокруг 40-й секунды: и громко, и движение
  await expect(win.getByTestId('shorts-item').first()).toContainText('ЭТО БЫЛО ЖЁСТКО');
  await expect(win.getByTestId('shorts-item').first()).toContainText('много движения');
  await win.getByTestId('shorts-make').click();
  await expect(win.getByTestId('shorts-done')).toBeVisible({ timeout: 60_000 });
  const files = fs.readdirSync(path.join(dir, 'gameplay')).filter((f) => f.endsWith('.kadro')).sort();
  expect(files.length).toBeGreaterThanOrEqual(2);
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'gameplay', files[0]), 'utf8'));
  expect(p.settings.aspect).toBe('9:16');
  expect(p.settings.background).toBe('blur');
  const main = p.tracks.find((t: any) => t.kind === 'main').clips[0];
  expect(main.fit).toBe('contain');
  expect(main.in).toBeLessThan(40);
  expect(main.out).toBeGreaterThan(41);
  expect(main.out - main.in).toBeCloseTo(25, 0);
  expect(K.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  await K.app.close();
});
