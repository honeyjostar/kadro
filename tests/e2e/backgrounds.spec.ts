// Живые фоны («Шаблоны» → «Фоны»): все шейдеры собираются и рисуют картинку, фон ложится на таймлайн,
// экспорт совпадает с плеером (кадр не чёрный, двигается во времени).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { act, frameDiff, launch, project, rawFrame, type Kadro } from './kadro';
import { BG_PRESETS } from '../../src/shared/backgrounds';
import type { MediaClip } from '../../src/shared/types';

let K: Kadro;
let win: Page;
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);
test.beforeAll(async () => { K = await launch(); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

const SHOTS = process.env.KADRO_SHOTS;

test('каждый фон рисуется в карточке (шейдер собрался)', async () => {
  await win.getByTestId('tab-templates').click();
  await expect(win.getByTestId('bg-section')).toBeVisible();
  for (const g of ['calm', 'neon', 'split']) {
    await win.getByTestId(`bg-group-${g}`).click();
    for (const b of BG_PRESETS.filter((x) => x.group === g)) {
      const thumb = win.getByTestId(`bg-${b.id}`).locator('.bg-thumb');
      // нарисовано шейдером — заливка-заглушка снята
      await expect.poll(() => thumb.evaluate((el) => (el as HTMLElement).style.background), { message: b.id }).toBe('');
    }
    if (SHOTS) await win.getByTestId('bg-section').screenshot({ path: path.join(SHOTS, `bg-${g}.png`) });
  }
});

test('фон на таймлайн и в экспорт: 15 с, кадр не чёрный и движется', async () => {
  await act(win, 'newProjectAction');
  await win.getByTestId('bg-group-calm').click();
  await win.getByTestId('bg-stars').click();
  await expect.poll(async () => (await project(win)).tracks[0].clips.length).toBe(1);
  const p = await project(win);
  const c = p.tracks[0].clips[0] as MediaClip;
  expect(c.out - c.in).toBe(15);
  expect(c.effects?.[0].type).toBe('gl:bg_stars');
  const out = path.join(os.tmpdir(), 'kadro-e2e', 'bg_export.mp4');
  fs.rmSync(out, { force: true });
  const r = await act(win, 'exportTo', out, 360, 30);
  expect(r.ok, r.error).toBe(true);
  const a = rawFrame(['-ss', '3', '-i', out], 64, 114);
  const b = rawFrame(['-ss', '9', '-i', out], 64, 114);
  const mean = a.reduce((s, v) => s + v, 0) / a.length;
  expect(mean).toBeGreaterThan(6);
  expect(frameDiff(a, b).mean).toBeGreaterThan(0.3);
});
