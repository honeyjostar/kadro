// Рост: «Набор создателя» (концовка «Сделано в Kadro» и приглашение друга), Мастерская с шаблонами, моменты из игр,
// анонимная статистика по согласию.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { act, launch, probe, project, ROOT, solidVideo, importAt, type Kadro } from './kadro';
import { newRefCode, replyCode } from '../../src/shared/rewards';

let K: Kadro;
let win: Page;
const CATALOG = pathToFileURL(path.join(ROOT, 'community-plugins', 'index.json')).href;
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);
test.beforeAll(async () => { K = await launch({ env: { KADRO_PLUGINS_URL: CATALOG, KADRO_NO_OPEN: '1', KADRO_NO_STATS: '1' } }); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

const rewards = () => win.evaluate(() => (window as any).__kadro.useStore.getState().rewards);

test('набор закрыт: фон «Золото» не ставится, открываются настройки «Друзья» с моим кодом', async () => {
  await expect.poll(async () => (await rewards())?.code?.length).toBe(6);
  await act(win, 'newProjectAction');
  await win.getByTestId('tab-templates').click();
  await win.getByTestId('bg-group-calm').click();
  await win.getByTestId('bg-gold').click();
  await expect(win.getByTestId('friends-sec')).toBeVisible();
  expect((await project(win)).tracks[0].clips.length).toBe(0);
  await expect(win.getByTestId('friends-code')).toHaveText(`KADRO-${(await rewards()).code}`);
});

test('приглашение: код друга открывает набор и даёт ответный код; ответный код друга засчитывается', async () => {
  const friend = newRefCode();
  await win.getByTestId('friends-input').fill(`kadro-${friend.toLowerCase()}`);
  await win.getByTestId('friends-enter').click();
  await expect(win.getByTestId('friends-reply')).toHaveText(replyCode((await rewards()).code, friend));
  await expect(win.getByTestId('friends-status')).toHaveClass(/on/);
  // другой друг ввёл мой код и прислал ответный
  const other = newRefCode();
  await win.getByTestId('friends-input').fill(replyCode(other, (await rewards()).code));
  await win.getByTestId('friends-enter').click();
  await expect(win.getByTestId('friends-count')).toContainText('1');
  await win.keyboard.press('Escape');
});

test('концовка «Сделано в Kadro»: в файле на 1,5 с длиннее, проект не меняется', async () => {
  await act(win, 'newProjectAction');
  await importAt(win, [solidVideo('growth_red.mp4', 'red', 3)], 'main', 0);
  await expect.poll(async () => (await project(win)).tracks[0].clips.length).toBe(1);
  const before = JSON.stringify((await project(win)).tracks);
  const out = path.join(os.tmpdir(), 'kadro-e2e', 'growth_outro.mp4');
  fs.rmSync(out, { force: true });
  await K.app.evaluate((_e, f) => { process.env.KADRO_TEST_EXPORT = f; }, out);
  await win.getByTestId('export-open').click();
  await win.getByTestId('export-outro').click();
  await win.getByTestId('export-start').click();
  await expect.poll(() => fs.existsSync(out) && fs.statSync(out).size > 1000, { timeout: 120_000 }).toBe(true);
  await expect(win.getByText('Видео готово', { exact: false }).first()).toBeVisible({ timeout: 120_000 });
  expect(Math.abs(probe(out).duration - 4.5)).toBeLessThan(0.25);
  expect(JSON.stringify((await project(win)).tracks)).toBe(before);
  await expect.poll(async () => (await rewards()).by).toContain('outro');
  await win.keyboard.press('Escape');
});

test('Мастерская: шаблоны сообщества, «Добавить» кладёт в «Мои шаблоны»', async () => {
  await win.getByTestId('tab-templates').click();
  await win.getByTestId('tpl-workshop').click();
  await expect(win.getByTestId('plugin-catalog')).toBeVisible();
  const card = win.getByTestId('catalog-w/fonk-edit');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByTestId('catalog-install').click();
  await expect(card).toContainText('В «Моих шаблонах»');
  const mine = await win.evaluate(() => (window as any).kadro.listTemplates());
  expect(mine.some((t: { id: string }) => t.id === 'ws-fonk-edit')).toBe(true);
  await win.keyboard.press('Escape');
});

test('«Моменты из GTA 6 и других игр»: окно шортсов сразу в режиме «Игра»', async () => {
  await win.getByTestId('tab-ai').click().catch(() => undefined);
  await win.evaluate(() => (window as any).__kadro.useStore.getState().setShortsOpen('game'));
  await expect(win.getByTestId('shorts-mode-game')).toHaveClass(/active/);
  await win.keyboard.press('Escape');
});

test('статистика: выключена, пока нет согласия; переключатель в настройках', async () => {
  expect(await win.evaluate(() => (window as any).kadro.statsGet())).toBe(false);
  await win.getByTestId('topbar-settings').click();
  await win.getByTestId('stats-toggle').click();
  await expect.poll(() => win.evaluate(() => (window as any).kadro.statsGet())).toBe(true);
  await win.keyboard.press('Escape');
});

test('разбор видео работает (лучшие места и громкость речи)', async () => {
  const file = solidVideo('growth_hl.mp4', 'blue', 4);
  const r = await win.evaluate((f) => (window as any).kadro.runAi({ kind: 'highlights', jobId: 'hl_test', path: f, duration: 4, speech: true }), file);
  expect(r.ok, r.error).toBe(true);
  expect(r.output.hl.score.length).toBeGreaterThan(10);
});

test('лого Kadro крутится: поверх видео, по кругу, растягивается', async () => {
  await act(win, 'newProjectAction');
  await win.getByTestId('tab-text').click();
  await win.getByTestId('add-logo-spin').click();
  await expect.poll(async () => (await project(win)).tracks.flatMap((t) => t.clips).length).toBe(1);
  const p = await project(win);
  const tr = p.tracks.find((t) => t.clips.length)!;
  expect(tr.kind).toBe('video');
  const c = tr.clips[0] as any;
  expect(c.out - c.in).toBe(3);
  expect(p.assets.find((a) => a.id === c.assetId)!.loop).toBe(true);
});
