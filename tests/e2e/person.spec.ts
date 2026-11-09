// Человек отдельным слоем (на удалении фона): портрет — фон размыт, неоновый контур, текст за человеком.
// В плеере и в готовом видео одинаково. Нужно фото человека (как в тесте удаления фона).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { act, importAt, launch, near, personVideo, previewPixel, project, rawFrame, seekAndSettle, store, waitAssetsReady } from './kadro';

test.setTimeout(420_000);

test('портрет, неон и текст за человеком — в плеере и в экспорте', async () => {
  const person = personVideo();
  test.skip(!person, 'нет тестового фото человека');
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-person-')), 'p.mp4');
  const K = await launch({ env: { KADRO_TEST_EXPORT: out } });
  const win = K.win;
  await act(win, 'newProjectAction', '16:9');
  await importAt(win, [person!], 'main', 0);
  await waitAssetsReady(win);
  const id = (await project(win)).tracks[0].clips[0].id;
  // кадр 640×426 «вписан» в 1920×1080: слева и справа полосы по 149 px
  const at = (fx: number, fy: number) => [(149 + fx * 1622) / 1920, fy] as const;
  const body = at(0.37, 0.75);
  const sky = at(0.88, 0.25);
  const mount = at(0.85, 0.75);
  await seekAndSettle(win, 0.5);
  const skyBefore = await previewPixel(win, ...sky);

  // портрет: удаление фона запускается само, фон остаётся (размытый), а не чёрный
  await store(win, 'select', [id]);
  await win.getByTestId('tab-ai').click();
  await win.getByTestId('person-blur').click();
  await win.waitForFunction((cid) => (window as any).__kadro.useStore.getState().project.tracks[0].clips.find((c: any) => c.id === cid)?.removeBg.status === 'ready', id, { timeout: 300_000 });
  await expect(win.getByTestId('removebg-person')).toBeVisible();
  const c = (await project(win)).tracks[0].clips[0] as any;
  expect(c.person).toEqual({ blur: 0.6 });
  expect(c.removeBg.enabled).toBe(true);
  await seekAndSettle(win, 0.5);
  const skyAfter = await previewPixel(win, ...sky);
  expect(skyAfter.reduce((s, v) => s + v, 0)).toBeGreaterThan(300); // небо на месте, не чёрное
  expect(near(skyAfter, skyBefore, 60)).toBe(true);
  expect((await previewPixel(win, ...body)).reduce((s, v) => s + v, 0)).toBeGreaterThan(300);

  // неон и текст за человеком; жёлтая плашка через весь кадр на уровне человека
  await win.getByTestId('person-neon').click();
  await win.getByTestId('person-front').click();
  await win.evaluate(() => {
    const k = (window as any).__kadro;
    const r = k.timeline.addText(k.useStore.getState().project, 0, 'ТЕКСТ ЗА ЧЕЛОВЕКОМ', { size: 120, color: '#ffff00', bgColor: '#ffff00', bgOpacity: 1, strokeWidth: 0, shadow: false });
    k.useStore.getState().commit(() => k.timeline.updateClip(r.project, r.clipId, { y: 0.75, duration: 1.5 }));
  });
  const yellow = [255, 255, 0];
  await seekAndSettle(win, 0.5);
  expect(near(await previewPixel(win, ...mount), yellow, 60)).toBe(true);     // фон — за надписью
  expect(near(await previewPixel(win, ...body), yellow, 60)).toBe(false);     // человек — перед надписью

  // экспорт: то же самое
  await store(win, 'setExportOpen', true);
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-show')).toBeVisible({ timeout: 180_000 });
  const f = rawFrame(['-ss', '0.5', '-i', out], 192, 108);
  const px = ([fx, fy]: readonly [number, number]) => { const x = Math.round(fx * 191); const y = Math.round(fy * 107); return [...f.subarray((y * 192 + x) * 3, (y * 192 + x) * 3 + 3)]; };
  expect(near(px(mount), yellow, 70)).toBe(true);
  expect(near(px(body), yellow, 70)).toBe(false);
  expect(px(sky).reduce((s, v) => s + v, 0)).toBeGreaterThan(300);

  // выключить «текст за человеком» — надпись снова поверх человека
  await store(win, 'setExportOpen', false);
  await store(win, 'select', [id]);
  await win.getByTestId('person-front').click();
  await seekAndSettle(win, 0.5);
  expect(near(await previewPixel(win, ...body), yellow, 60)).toBe(true);
  expect(K.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  await K.app.close();
});
