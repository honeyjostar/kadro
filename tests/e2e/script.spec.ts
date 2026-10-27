// «Ролик по сценарию»: текст → сцены → озвучка → кадры из своих видео → субтитры по тексту, музыка тише.
import { expect, test, type Page } from '@playwright/test';
import { colorsVideo, launch, patternImage, project, solidVideo, store, type Kadro } from './kadro';
import { clipDuration } from '../../src/shared/timeline';

let K: Kadro;
let win: Page;
test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);
test.beforeAll(async () => {
  K = await launch({ env: { KADRO_SKIP_HOME: '', KADRO_TEST_PICK: [colorsVideo(), solidVideo('green3.mp4', 'green', 3), patternImage()].join('|') } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

const TEXT = 'Это Kadro — бесплатный видеоредактор.\n\nВ нём есть шейдеры и сто двадцать переходов.\n\nА ещё он сам монтирует ролик по тексту.';

test('без голоса: сцены по скорости чтения, кадры из всех файлов, субтитры точно по тексту', async () => {
  await win.getByTestId('home-script').click();
  const dlg = win.getByTestId('script-dialog');
  await expect(dlg).toBeVisible();
  await win.getByTestId('script-text').fill(TEXT);
  await expect(dlg).toContainText('3 сцены');
  await win.getByTestId('script-voice-none').click();
  await win.getByTestId('script-add-files').click();
  await expect(win.getByTestId('script-files')).toContainText('3. pattern.png');
  await win.getByTestId('script-aspect-16-9').click();
  await win.getByTestId('script-title').fill('Про Kadro');
  await win.getByTestId('script-build').click();
  await expect(dlg).toHaveCount(0, { timeout: 120_000 });
  const p = await project(win);
  expect(p.name).toBe('Про Kadro');
  expect(p.settings.aspect).toBe('16:9');
  const main = p.tracks.find((t) => t.kind === 'main')!.clips as any[];
  expect(main.length).toBeGreaterThanOrEqual(3);
  expect(new Set(main.map((c) => c.assetId)).size).toBe(3);
  const caps = p.tracks.filter((t) => t.kind === 'text').flatMap((t) => t.clips) as any[];
  expect(caps.map((c) => c.text).join(' ')).toBe(TEXT.replace(/\n\n/g, ' '));
  const total = main.reduce((n, c) => n + clipDuration(c), 0);
  expect(Math.abs(caps[caps.length - 1].start + caps[caps.length - 1].duration - total)).toBeLessThan(0.05);
  expect(p.tracks.filter((t) => t.kind === 'audio').flatMap((t) => t.clips)).toHaveLength(0);
});

test('с голосом «Ирина»: каждая сцена озвучена, голос в начале сцены, длина сцены — по голосу', async () => {
  await store(win, 'setScriptOpen', true);
  const dlg = win.getByTestId('script-dialog');
  await win.getByTestId('script-text').fill(TEXT);
  await win.getByTestId('script-voice-irina').click();
  await win.getByTestId('script-add-files').click();
  await win.getByTestId('script-build').click();
  await expect(win.getByTestId('script-progress')).toBeVisible();
  await expect(dlg).toHaveCount(0, { timeout: 200_000 });
  const p = await project(win);
  const voices = p.tracks.filter((t) => t.kind === 'audio').flatMap((t) => t.clips).sort((a, b) => a.start - b.start) as any[];
  expect(voices).toHaveLength(3);
  const assets = p.assets.filter((a) => voices.some((v) => v.assetId === a.id));
  expect(assets.every((a) => a.name.startsWith('Голос'))).toBe(true);
  // сцена = голос + 0,3 с паузы: следующий голос начинается после конца предыдущего
  for (let i = 1; i < voices.length; i++) {
    const prevEnd = voices[i - 1].start + clipDuration(voices[i - 1]);
    expect(voices[i].start - prevEnd).toBeGreaterThan(0.2);
    expect(voices[i].start - prevEnd).toBeLessThan(0.45);
  }
  const caps = p.tracks.filter((t) => t.kind === 'text').flatMap((t) => t.clips) as any[];
  // первый субтитр второй сцены начинается вместе с её голосом
  const second = caps.find((c) => c.text.startsWith('В нём'));
  expect(Math.abs(second.start - voices[1].start)).toBeLessThan(0.02);
});
