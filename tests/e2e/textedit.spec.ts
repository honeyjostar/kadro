// Монтаж текстом: Kadro распознаёт речь, слова видны текстом; выделил и Delete — кусок вырезан из видео,
// Ctrl+Z — обратно; команды словами («убери паузы», непонятное — подсказка).
import { expect, test, type Page } from '@playwright/test';
import { act, importAt, launch, project, talkVideo, waitAssetsReady, type Kadro } from './kadro';
import { projectDuration } from '../../src/shared/timeline';

let K: Kadro;
let win: Page;
test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);
test.beforeAll(async () => {
  K = await launch();
  win = K.win;
  await act(win, 'newProjectAction', '16:9');
  await importAt(win, [talkVideo()], 'main', 0);
  await waitAssetsReady(win);
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

const dur = async () => projectDuration(await project(win));
const text = async () => (await win.getByTestId('tw').allTextContents()).join(' ');

test('распознать речь → слова текстом, субтитры спрятаны', async () => {
  await win.keyboard.press('Control+k');
  await win.getByTestId('search-input').fill('монтаж текстом');
  await win.keyboard.press('Enter');
  await expect(win.getByTestId('textedit')).toBeVisible();
  await win.getByTestId('textedit-recognize').click();
  await expect(win.getByTestId('tw').first()).toBeVisible({ timeout: 240_000 });
  expect((await text()).toLowerCase()).toContain('тестовый');
  const caps = (await project(win)).tracks.find((t) => t.kind === 'text')!;
  expect(caps.hidden).toBe(true);
});

test('выделил «тестовый ролик» и Delete — видео короче, слов нет; Ctrl+Z — обратно', async () => {
  const d0 = await dur();
  const tw = win.getByTestId('tw');
  const words = await tw.allTextContents();
  const i = words.findIndex((w) => w.toLowerCase().startsWith('тестов'));
  expect(i).toBeGreaterThan(0);
  await tw.nth(i).click();
  const ph = await win.evaluate(() => (window as any).__kadro.useStore.getState().playhead);
  expect(ph).toBeGreaterThan(0.5);
  await tw.nth(i + 1).click({ modifiers: ['Shift'] });
  await expect(tw.nth(i)).toHaveClass(/sel/);
  await expect(tw.nth(i + 1)).toHaveClass(/sel/);
  await win.keyboard.press('Delete');
  await expect.poll(dur).toBeLessThan(d0 - 0.4);
  expect((await text()).toLowerCase()).not.toContain('тестовый');
  // основная дорожка — из двух кусков, клип не удалён целиком
  expect((await project(win)).tracks.find((t) => t.kind === 'main')!.clips.length).toBe(2);
  await win.keyboard.press('Control+z');
  await expect.poll(dur).toBeCloseTo(d0, 1);
  expect((await text()).toLowerCase()).toContain('тестовый');
});

const lastWord = async () => win.evaluate(() => {
  const p = (window as any).__kadro.useStore.getState().project;
  const caps = p.tracks.find((t: any) => t.kind === 'text').clips;
  const c = caps[caps.length - 1];
  return c.start + c.words[c.words.length - 1].start;
});

test('команды словами: «убери паузы» режет тишину и сдвигает субтитры, непонятное — подсказка', async () => {
  const d0 = await dur();
  const w0 = await lastWord();
  await win.getByTestId('textedit-cmd').fill('убери паузы');
  await win.getByTestId('textedit-run').click();
  await expect.poll(dur, { timeout: 120_000 }).toBeLessThan(d0 - 1);
  await expect(win.locator('.toast').filter({ hasText: 'Сделано: паузы вырезаны' })).toBeVisible();
  // субтитры уехали вместе с видео: последнее слово — раньше (вырезаны паузы перед ним) и внутри укороченного ролика
  const w1 = await lastWord();
  expect(w1).toBeLessThan(w0 - 0.5);
  expect(w0 - w1).toBeLessThanOrEqual(d0 - (await dur()) + 0.05);
  expect(w1).toBeLessThan(await dur());
  await win.getByTestId('textedit-cmd').fill('покрась небо');
  await win.getByTestId('textedit-run').click();
  await expect(win.locator('.toast').filter({ hasText: 'Не понял: «покрась небо»' })).toBeVisible();
  await win.getByTestId('textedit-close').click();
  await expect(win.getByTestId('textedit')).toHaveCount(0);
});
