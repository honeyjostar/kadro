// Переезд из CapCut: проект CapCut (папка с draft_content.json) открывается в Kadro; клавиши как в CapCut
// (Q / W — убрать кусок до / после курсора, ↑ / ↓ — к склейкам) и как в Premiere Pro (Ctrl+K — разрезать).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launch, project, solidVideo, store, type Kadro } from './kadro';

function capcutDraft(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capcut-draft-'));
  fs.mkdirSync(path.join(dir, 'Resources'));
  const red = solidVideo('cc_red.mp4', 'red', 6);
  fs.copyFileSync(solidVideo('cc_blue.mp4', 'blue', 6), path.join(dir, 'Resources', 'blue.mp4'));
  const draft = {
    canvas_config: { width: 1080, height: 1920 }, fps: 30, duration: 8e6,
    materials: {
      videos: [
        { id: 'v1', path: red, type: 'video', duration: 6e6 },
        { id: 'v2', path: '##_draftpath_placeholder_0E685133-18CE-45ED-8CB8-2904A212EC80_##/Resources/blue.mp4', type: 'video', duration: 6e6 },
        { id: 'v3', path: '/nowhere/lost.mp4', type: 'video', duration: 6e6 },
      ],
      audios: [],
      texts: [{ id: 't1', content: JSON.stringify({ text: 'Привет из CapCut' }) }],
      transitions: [{ id: 'x' }],
    },
    tracks: [
      { type: 'video', segments: [
        { material_id: 'v1', target_timerange: { start: 0, duration: 3e6 }, source_timerange: { start: 1e6, duration: 3e6 }, speed: 1 },
        { material_id: 'v2', target_timerange: { start: 3e6, duration: 5e6 }, source_timerange: { start: 0, duration: 5e6 }, speed: 1, volume: 0.4 },
        { material_id: 'v3', target_timerange: { start: 8e6, duration: 2e6 }, source_timerange: { start: 0, duration: 2e6 } },
      ] },
      { type: 'text', segments: [{ material_id: 't1', target_timerange: { start: 0, duration: 2e6 } }] },
    ],
  };
  fs.writeFileSync(path.join(dir, 'draft_content.json'), JSON.stringify(draft));
  fs.writeFileSync(path.join(dir, 'draft_meta_info.json'), JSON.stringify({ draft_name: 'Мой проект CapCut' }));
  return dir;
}

let K: Kadro;
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);
test.beforeAll(async () => { K = await launch({ env: { KADRO_TEST_CAPCUT: capcutDraft() } }); });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

test('проект CapCut открывается: склейки, обрезка, громкость, надпись; пропавший файл — в подсказке', async () => {
  const win = K.win;
  await win.keyboard.press('Control+k');
  await win.getByTestId('search-input').fill('capcut');
  await win.keyboard.press('Enter');
  await expect.poll(async () => (await project(win)).name, { timeout: 30_000 }).toBe('Мой проект CapCut');
  const p = await project(win);
  const main = p.tracks.find((t) => t.kind === 'main')!.clips as any[];
  expect(main.map((c) => [c.in, c.out])).toEqual([[1, 4], [0, 5]]);
  expect(main[1].volume).toBe(0.4);
  expect(p.tracks.find((t) => t.kind === 'text')!.clips[0]).toMatchObject({ text: 'Привет из CapCut', duration: 2 });
  await expect(win.locator('.toast').filter({ hasText: 'не найдено файлов: 1' })).toBeVisible();
});

test('клавиши как в CapCut: Q и W режут до и после курсора, ↑ ↓ — к склейкам', async () => {
  const win = K.win;
  await store(win, 'select', []);
  await store(win, 'setPlayhead', 1.5);
  await win.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  await win.keyboard.press('q');
  let main = (await project(win)).tracks.find((t) => t.kind === 'main')!.clips as any[];
  expect(main[0].in).toBeCloseTo(2.5, 1); // убран кусок 0–1,5 с
  await store(win, 'setPlayhead', 0.5);
  await win.keyboard.press('w');
  main = (await project(win)).tracks.find((t) => t.kind === 'main')!.clips as any[];
  expect(main[0].out - main[0].in).toBeCloseTo(0.5, 1);
  await store(win, 'setPlayhead', 0);
  await win.keyboard.press('ArrowDown');
  expect(await win.evaluate(() => (window as any).__kadro.useStore.getState().playhead)).toBeGreaterThan(0.3);
});

test('клавиши как в Premiere Pro: Ctrl+K разрезает, поиск — Ctrl+F; выбор сохраняется', async () => {
  const win = K.win;
  await win.keyboard.press('F1');
  await win.getByTestId('keymap').locator('[data-value="premiere"]').click();
  await expect(win.getByTestId('keys-dialog')).toContainText('Ctrl');
  await win.keyboard.press('Escape');
  const before = (await project(win)).tracks.find((t) => t.kind === 'main')!.clips.length;
  const p = await project(win);
  const c = p.tracks.find((t) => t.kind === 'main')!.clips[1] as any;
  await store(win, 'select', []);
  await store(win, 'setPlayhead', c.start + 1);
  await win.keyboard.press('Control+k');
  await expect(win.getByTestId('search-input')).toHaveCount(0);
  expect((await project(win)).tracks.find((t) => t.kind === 'main')!.clips.length).toBe(before + 1);
  await win.keyboard.press('Control+f');
  await expect(win.getByTestId('search-input')).toBeVisible();
  await win.keyboard.press('Escape');
  expect(await win.evaluate(() => localStorage.getItem('kadro.keymap'))).toBe('"premiere"');
});
