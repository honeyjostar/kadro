// Значок Kadro у часов и экспорт в фоне: закрыли окно во время экспорта — окно прячется, ролик доделывается,
// потом Kadro закрывается сам. Меню значка показывает ход экспорта.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { act, importAt, launch, probe, solidVideo } from './kadro';

test.setTimeout(300_000);

type TrayInfo = { state: { exporting: boolean; progress: number; background: boolean; done: { ok: boolean; path?: string } | null }; items: { id: string; label: string }[]; tooltip: string };

test('закрыли окно во время экспорта — экспорт доделывается в фоне, потом Kadro выходит сам', async () => {
  const K = await launch({ env: { KADRO_BG_QUIT_MS: '1500' } });
  const { app, win } = K;
  const tray = (): Promise<TrayInfo> => app.evaluate(() => {
    const t = (globalThis as unknown as { __kadroTray: TrayInfo }).__kadroTray;
    return { state: t.state, items: t.items, tooltip: t.tooltip };
  });
  await importAt(win, [solidVideo('tray-long.mp4', 'red', 60)], 'main', 0);
  expect((await tray()).items.map((i) => i.id)).toEqual(['open', 'quit']);

  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-tray-')), 'фон.mp4');
  void act(win, 'exportTo', out, 1080, 30).catch(() => undefined); // окно спрячется, Kadro выйдет сам — ответа можно не дождаться
  await expect.poll(async () => (await tray()).state.progress, { timeout: 90_000, intervals: [200] }).toBeGreaterThan(0.01);
  const mid = await tray();
  expect(mid.state.exporting).toBe(true);
  expect(mid.items.map((i) => i.id)).toEqual(['open', 'progress', 'cancel', 'quit']);
  expect(mid.tooltip).toMatch(/^Kadro — экспорт \d+%$/);

  const closed = app.waitForEvent('close', { timeout: 240_000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  // окно не закрылось, а спряталось; экспорт идёт
  const after = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => ({ visible: w.isVisible(), destroyed: w.isDestroyed() })));
  expect(after).toEqual([{ visible: false, destroyed: false }]);
  const bg = await tray();
  expect(bg.state.background).toBe(true);
  expect(bg.state.exporting).toBe(true);

  await closed; // ролик готов → через 1,5 с (в программе — 30 с) Kadro закрывается сам
  expect(fs.existsSync(out)).toBe(true);
  expect(probe(out).duration).toBeGreaterThan(59);
});

test('без экспорта окно закрывается как обычно', async () => {
  const K = await launch();
  const closed = K.app.waitForEvent('close', { timeout: 30_000 });
  await K.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed;
});
