// Снимки интерфейса для проверки глазами (не тест): KADRO_SHOTS=папка npx playwright test shots
import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { colorsVideo, importAt, launch, MEDIA, reset, seekAndSettle, waitAssetsReady, type Kadro } from './kadro';

const OUT = process.env.KADRO_SHOTS;
test.skip(!OUT, 'только по запросу: KADRO_SHOTS=папка');

let K: Kadro;
test.beforeAll(async () => { colorsVideo(); K = await launch(); fs.mkdirSync(OUT!, { recursive: true }); });
test.afterAll(async () => { await K?.app.close(); });

const shot = (name: string) => K.win.screenshot({ path: path.join(OUT!, `${name}.png`) });

test('снимки', async () => {
  const win = K.win;
  const only = (process.env.KADRO_SHOTS_ONLY ?? '').split(',').filter(Boolean);
  const want = (n: string) => !only.length || only.includes(n);
  await reset(win);
  await importAt(win, [path.join(MEDIA, 'colors.mp4')], 'main', 0);
  await waitAssetsReady(win);
  await seekAndSettle(win, 1);
  if (want('start')) await shot('start');
  if (want('text')) {
    await win.click('[data-testid=tab-text]');
    await win.waitForTimeout(300);
    await shot('text-panel');
    await win.click('[data-testid=add-text]');
    await win.waitForTimeout(400);
    await shot('text-added');
    await win.click('[data-testid=text-font]');
    await win.waitForTimeout(400);
    await shot('font-picker');
    await win.keyboard.press('Escape');
  }
});
