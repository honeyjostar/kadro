// «Скоро в Kadro» на главном экране: текст — из файла по адресу (в автотестах — локальный), скрыть до следующего анонса.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { launch } from './kadro';

test('анонс «Скоро в Kadro»: показывается, прячется, новый — снова виден', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-next-'));
  const json = path.join(dir, 'next.json');
  const write = (id: string, title: string) => fs.writeFileSync(json, JSON.stringify({ id, ru: { title, when: 'в декабре', items: ['Мем-кнопки', 'Запись экрана'] } }));
  write('a', 'Мемы и запись экрана');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-next-data-'));
  const env = { KADRO_SKIP_HOME: '', KADRO_NEXT_URL: pathToFileURL(json).href };
  let K = await launch({ data, env });
  await expect(K.win.getByTestId('home-next')).toBeVisible({ timeout: 15_000 });
  await expect(K.win.getByTestId('home-next-title')).toHaveText('Мемы и запись экрана');
  await expect(K.win.getByTestId('home-next-when')).toHaveText('в декабре');
  await expect(K.win.getByTestId('home-next').locator('li')).toHaveCount(2);
  await K.win.getByTestId('home-next-hide').click();
  await expect(K.win.getByTestId('home-next')).toHaveCount(0);
  await K.app.close();
  // тот же анонс — скрыт; без интернета — последний сохранённый
  K = await launch({ data, env: { ...env, KADRO_NEXT_URL: pathToFileURL(path.join(dir, 'nope.json')).href } });
  await expect(K.win.getByTestId('home')).toBeVisible();
  await K.win.waitForTimeout(1500);
  await expect(K.win.getByTestId('home-next')).toHaveCount(0);
  await K.app.close();
  // новый анонс — снова на главном экране
  write('b', 'Обложки в один клик');
  K = await launch({ data, env });
  await expect(K.win.getByTestId('home-next-title')).toHaveText('Обложки в один клик', { timeout: 15_000 });
  expect(K.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  await K.app.close();
});
