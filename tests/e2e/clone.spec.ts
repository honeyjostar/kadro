// «Клон себя»: камера стоит на месте, человек сначала слева, потом справа. Клон — тот же клип через 4 с поверх,
// с удалённым фоном: в кадре сразу двое. Нужно фото человека (как в тесте удаления фона).
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { importAt, launch, MEDIA, near, previewPixel, project, seekAndSettle, store, waitAssetsReady } from './kadro';

test.setTimeout(420_000);

function cloneVideo(): string | null {
  const img = [process.env.KADRO_TEST_PERSON, '/tmp/kadro-tests/ai/girl1.jpg', '/tmp/asr/girl1.jpg'].find((p): p is string => !!p && fs.existsSync(p));
  if (!img) return null;
  const f = path.join(MEDIA, 'clone.mp4');
  if (!fs.existsSync(f)) {
    fs.mkdirSync(MEDIA, { recursive: true });
    // серый фон 960×540; человек (кусок фото) слева первые 3 с, справа — следующие 3 с
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x808080:s=960x540:r=30:d=6', '-loop', '1', '-i', img,
      '-filter_complex', "[1:v]crop=340:399:70:0,scale=-2:540,setsar=1[p];[0:v][p]overlay=x='if(lt(t,3),20,490)':y=0:shortest=1,format=yuv420p",
      '-t', '6', '-c:v', 'libx264', '-preset', 'ultrafast', f]);
  }
  return f;
}

test('клон из того же видео: двое в кадре, звук клона выключен', async () => {
  const src = cloneVideo();
  test.skip(!src, 'нет тестового фото человека');
  const K = await launch();
  const win = K.win;
  await store(win, 'setHome', false);
  await win.evaluate(() => (window as any).__kadro.actions.newProjectAction('16:9'));
  await importAt(win, [src!], 'main', 0);
  await waitAssetsReady(win);
  // клип — первые 2 с (человек слева)
  await win.evaluate(() => {
    const k = (window as any).__kadro;
    const p = k.useStore.getState().project;
    k.useStore.getState().commit(() => k.timeline.trimClip(p, p.tracks[0].clips[0].id, 'end', 2));
  });
  const id = (await project(win)).tracks[0].clips[0].id;
  const shirt: [number, number] = [0.735, 0.72];
  const sky: [number, number] = [0.94, 0.08];
  await seekAndSettle(win, 0.5);
  const grey = [128, 128, 128];
  expect(near(await previewPixel(win, ...shirt), grey, 20)).toBe(true); // справа пока пусто

  await store(win, 'select', [id]);
  await win.getByTestId('tab-ai').click();
  await expect(win.getByTestId('clone-card')).toBeVisible();
  await win.getByTestId('clone-offset').locator('[data-value="4"]').click();
  await win.getByTestId('clone-run').click();
  await win.waitForFunction(() => {
    const p = (window as any).__kadro.useStore.getState().project;
    return p.tracks.some((t: any) => t.kind === 'video' && t.clips.some((c: any) => c.removeBg?.status === 'ready'));
  }, null, { timeout: 300_000 });
  const p = await project(win);
  const clone = p.tracks.filter((t) => t.kind === 'video').flatMap((t) => t.clips)[0] as any;
  expect(clone).toMatchObject({ assetId: (p.tracks[0].clips[0] as any).assetId, start: 0, in: 4, out: 6, muted: true });
  expect(clone.removeBg.enabled).toBe(true);
  await seekAndSettle(win, 0.5);
  // справа — второй человек (белая футболка), а фон фото у клона убран — там серый фон кадра
  const s = await previewPixel(win, ...shirt);
  expect(s.reduce((a, v) => a + v, 0) / 3).toBeGreaterThan(180);
  expect(near(await previewPixel(win, ...sky), grey, 40)).toBe(true);
  expect(K.errors).toEqual([]);
  await K.app.close();
});

test('второй дубль: нет другого видео — подсказка', async () => {
  const src = cloneVideo();
  test.skip(!src, 'нет тестового фото человека');
  const K = await launch();
  const win = K.win;
  await importAt(win, [src!], 'main', 0);
  await waitAssetsReady(win);
  await store(win, 'select', [(await project(win)).tracks[0].clips[0].id]);
  await win.getByTestId('tab-ai').click();
  await win.getByTestId('clone-mode').locator('[data-value=take]').click();
  await expect(win.getByTestId('clone-run')).toBeDisabled();
  await expect(win.getByTestId('clone-card')).toContainText('второй дубль');
  await K.app.close();
});
