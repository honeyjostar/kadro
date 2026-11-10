// «Студийный голос»: одна кнопка — звук клипа обрабатывается (без шума, ровная громкость около −16 LUFS),
// обработанный файл звучит и в плеере, и в экспорте; «Убрать» возвращает исходный звук.
import { spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { importAt, launch, project, store, talkVideo } from './kadro';

test.setTimeout(240_000);

/** Интегральная громкость файла, LUFS. */
function lufs(file: string): number {
  const out = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  return Number(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/.exec(out)?.[1]);
}

test('одна кнопка: голос обработан, громкость ровная, можно убрать', async () => {
  const K = await launch();
  const win = K.win;
  await importAt(win, [talkVideo()], 'main', 0);
  const id = (await project(win)).tracks[0].clips[0].id;
  await store(win, 'select', [id]);
  await win.getByTestId('tab-ai').click();
  const card = win.locator('aside.panel').getByTestId('studio-card');
  await card.getByTestId('ai-studio').click();
  await win.waitForFunction((cid) => (window as any).__kadro.useStore.getState().project.tracks[0].clips.find((c: any) => c.id === cid)?.voice?.status === 'ready', id, { timeout: 120_000 });
  const c = (await project(win)).tracks[0].clips[0] as any;
  expect(c.voice).toMatchObject({ enabled: true, effect: 'studio' });
  // в плеере звучит обработанный файл
  expect(await win.evaluate((cid) => (window as any).__kadroEngine.media.get(`${cid}:a`)?.src.includes('fx_'), id)).toBe(true);
  await expect(card).toContainText(/Готово/);
  expect(Math.abs(lufs(c.voice.path) + 16)).toBeLessThan(2.5);
  await card.getByTestId('ai-studio-off').click();
  await expect.poll(async () => ((await project(win)).tracks[0].clips[0] as any).voice.enabled).toBe(false);
  expect(K.errors).toEqual([]);
  await K.app.close();
});
