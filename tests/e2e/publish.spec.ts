// «Опубликовать»: после экспорта — название и хэштеги из проекта, подпись под каждую площадку,
// «Выложить» открывает только страницу загрузки площадки (в браузере) и показывает файл в папке.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { act, colorsVideo, importAt, launch, store, waitAssetsReady } from './kadro';

test('после экспорта: подписи для площадок и «Выложить» в ВК Клипы', async () => {
  test.setTimeout(150_000);
  const K = await launch({ env: { KADRO_NO_OPEN: '1' } });
  const win = K.win;
  await act(win, 'newProjectAction', '9:16');
  await importAt(win, [colorsVideo()], 'main', 0);
  await waitAssetsReady(win);
  await win.evaluate(() => (window as any).__kadro.useStore.getState().commit((p: any) => ({ ...p, name: 'Поездка в Карелию' })));
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-pub-')), 'karelia.mp4');
  const r = await act(win, 'exportTo', out, 720, 30);
  expect(r.ok, r.error).toBe(true);

  await store(win, 'setPublishOpen', { file: out });
  const dlg = win.getByTestId('publish-dialog');
  await expect(dlg).toBeVisible();
  await expect(win.getByTestId('publish-title')).toHaveValue('Поездка в Карелию');
  await expect(win.getByTestId('publish-tags')).toHaveValue(/#карелию|#карелия/);
  // YouTube Shorts: #shorts в названии
  await expect(win.getByTestId('publish-shorts').getByTestId('publish-title-text')).toHaveText('Поездка в Карелию #shorts');
  // TikTok: одна подпись — название и теги
  await expect(win.getByTestId('publish-tiktok').getByTestId('publish-text')).toContainText('Поездка в Карелию');
  // правка тегов сразу в подписях
  await win.getByTestId('publish-tags').fill('#карелия, водопад');
  await expect(win.getByTestId('publish-vkclips').getByTestId('publish-text')).toContainText('#карелия #водопад');

  await win.getByTestId('publish-go-vkclips').click();
  await expect(win.getByTestId('publish-vkclips')).toHaveClass(/done/);
  await expect.poll(() => fs.readFileSync(path.join(K.data, 'kadro.log'), 'utf8')).toContain('open url https://vk.com/clips');
  expect(K.errors).toEqual([]);
  await K.app.close();
});
