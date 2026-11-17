// Тематический текст (объём, неон, своя анимация), объёмные эмодзи-стикеры и виджет «Нагрузка ПК».
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { act, launch, project, type Kadro } from './kadro';
import type { TextClip } from '../../src/shared/types';

let K: Kadro;
let win: Page;
const SHOTS = process.env.KADRO_SHOTS;
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);
test.beforeAll(async () => { K = await launch(); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

const texts = async () => (await project(win)).tracks.flatMap((t) => t.clips).filter((c): c is TextClip => c.type === 'text');

test('тематический текст: «Спорт» — объём, обводка и «выскок», сразу выделен', async () => {
  await act(win, 'newProjectAction');
  await win.getByTestId('tab-text').click();
  await expect(win.getByTestId('text-themes')).toBeVisible();
  if (SHOTS) await win.getByTestId('text-themes').screenshot({ path: path.join(SHOTS, 'themes.png') });
  await win.getByTestId('theme-sport').click();
  await expect.poll(async () => (await texts()).length).toBe(1);
  const t = (await texts())[0];
  expect(t.text).toBe('ГОЛ!');
  expect(t.style.depth).toBe(10);
  expect(t.style.font).toBe('Russo One');
  expect(t.anim?.in?.type).toBe('pop');
  expect(await win.evaluate(() => (window as any).__kadro.useStore.getState().selection.length)).toBe(1);
  await win.getByTestId('theme-neon').click();
  await expect.poll(async () => (await texts()).some((x) => x.style.glow === '#ff2bd6')).toBe(true);
  if (SHOTS) { await win.waitForTimeout(800); await win.locator('.player, [data-testid="player"]').first().screenshot({ path: path.join(SHOTS, 'themes-preview.png') }).catch(() => undefined); }
});

test('эмодзи-стикеры рисуются объёмной картинкой (и в плитках, и в кадре)', async () => {
  await act(win, 'newProjectAction');
  await expect.poll(() => win.evaluate(() => !!(window as any).__kadro.textRender.emojiImage('😂'))).toBe(true);
  await expect(win.getByTestId('sticker').first().locator('img')).toBeVisible();
  await win.getByTestId('sticker').first().click();
  await expect.poll(async () => (await texts()).length).toBe(1);
});

test('«Нагрузка ПК»: процессор и память раз в секунду, экспорт попадает в пики', async () => {
  await win.getByTestId('topbar-sysmon').click();
  await expect(win.getByTestId('sysmon')).toBeVisible();
  await expect(win.getByTestId('sysmon-cpu')).toHaveText(/\d+%/, { timeout: 5000 });
  await expect(win.getByTestId('sysmon-ram')).toHaveText(/ГБ/);
  const out = path.join(os.tmpdir(), 'kadro-e2e', 'mon_export.mp4');
  fs.rmSync(out, { force: true });
  const r = await act(win, 'exportTo', out, 360, 30);
  expect(r.ok, r.error).toBe(true);
  await expect(win.getByTestId('sysmon-peaks')).toContainText('Экспорт', { timeout: 5000 });
  if (SHOTS) await win.getByTestId('sysmon').screenshot({ path: path.join(SHOTS, 'sysmon.png') });
  await win.getByTestId('sysmon-close').click();
  await expect(win.getByTestId('sysmon')).toHaveCount(0);
});

test('шрифт Monocraft (как в Minecraft) встроен и с кириллицей; надпись «Как в Minecraft»', async () => {
  const r = await win.evaluate(async () => {
    const loaded = await document.fonts.load('700 48px "Monocraft"', 'Привет');
    const c = document.createElement('canvas').getContext('2d')!;
    c.font = '700 48px "Monocraft"'; const a = c.measureText('Привет мир').width;
    c.font = '700 48px monospace'; const b = c.measureText('Привет мир').width;
    return { n: loaded.length, differs: Math.abs(a - b) > 1 };
  });
  expect(r.n).toBeGreaterThan(0);
  expect(r.differs).toBe(true);
  await act(win, 'newProjectAction');
  await win.getByTestId('tab-text').click();
  await win.getByTestId('theme-block').click();
  await expect.poll(async () => (await texts()).some((t) => t.style.font === 'Monocraft')).toBe(true);
});
