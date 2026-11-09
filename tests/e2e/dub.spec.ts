// Дубляж: русская речь → перевод на английский → озвучка голосом Amy по тем же таймингам, без интернета
// (голос скачивается один раз). Субтитров нет — сначала распознаётся речь.
import { expect, test } from '@playwright/test';
import { act, importAt, launch, project, talkVideo, waitAssetsReady } from './kadro';

test.setTimeout(420_000);

test('дубляж русский → английский: дорожка «Дубляж», оригинал тише, субтитры на английском', async () => {
  const K = await launch();
  const win = K.win;
  await act(win, 'newProjectAction', '16:9');
  await importAt(win, [talkVideo()], 'main', 0);
  await waitAssetsReady(win);
  await win.getByTestId('tab-captions').click();
  await expect(win.getByTestId('dub-card')).toBeVisible();
  await win.getByTestId('dub-pair').locator('[data-value="0"]').click();
  await win.getByTestId('dub-voice-amy').click();
  await win.getByTestId('dub-run').click();
  await win.waitForFunction(() => (window as any).__kadro.useStore.getState().project.tracks.some((t: any) => t.kind === 'audio' && t.name.startsWith('Дубляж')), undefined, { timeout: 400_000 });
  const p = await project(win);
  const dub = p.tracks.find((t: any) => t.name.startsWith('Дубляж'))!;
  expect(dub.name).toBe('Дубляж (английский)');
  expect(dub.clips.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < dub.clips.length; i++) expect(dub.clips[i].start).toBeGreaterThanOrEqual(dub.clips[i - 1].start);
  // первая фраза — там же, где в оригинале (речь начинается на ~1,5 с)
  expect(dub.clips[0].start).toBeGreaterThan(1);
  expect(dub.clips[0].start).toBeLessThan(2.5);
  const main = p.tracks.find((t: any) => t.kind === 'main')!.clips[0] as any;
  expect(main.volume).toBe(0.15);
  const caps = p.tracks.flatMap((t: any) => t.clips).filter((c: any) => c.role === 'caption').map((c: any) => c.text).join(' ');
  expect(caps).toMatch(/[a-z]{3,}/i);
  expect(caps).not.toMatch(/[а-яё]/i);
  // одной правкой: Ctrl+Z убирает дубляж (субтитры остаются)
  await win.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  await win.keyboard.press('Control+z');
  const q = await project(win);
  expect(q.tracks.some((t: any) => t.name.startsWith('Дубляж'))).toBe(false);
  expect(q.tracks.flatMap((t: any) => t.clips).some((c: any) => c.role === 'caption')).toBe(true);
  expect(K.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  await K.app.close();
});
