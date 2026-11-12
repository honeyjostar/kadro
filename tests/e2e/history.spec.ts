// История действий: шаги с понятными подписями, щелчок — к любому шагу (и обратно вперёд); версии проекта по времени.
import { expect, test, type Page } from '@playwright/test';
import { act, colorsVideo, importAt, launch, project, store, waitAssetsReady, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { K = await launch(); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

const clips = async () => (await project(win)).tracks[0].clips as any[];

test('история: подписи шагов, возврат к шагу и вперёд', async () => {
  await importAt(win, [colorsVideo()], 'main', 0);
  await waitAssetsReady(win);
  await store(win, 'setPlayhead', 2);
  await win.getByTestId('split').click();
  expect(await clips()).toHaveLength(2);
  await store(win, 'select', [(await clips())[1].id]);
  await win.getByTestId('delete').click();
  expect(await clips()).toHaveLength(1);
  await win.getByTestId('history').click();
  const items = win.getByTestId('history-item');
  await expect(items.first()).toContainText('Удалён: colors.mp4');
  await expect(items.first()).toContainText('сейчас');
  await expect(items.nth(1)).toContainText('Разрезан: colors.mp4');
  await expect(items.last()).toContainText('Начало');
  // назад на два шага — к «Добавлен»
  await items.filter({ hasText: 'Добавлен' }).click();
  expect(await clips()).toHaveLength(1);
  expect((await clips())[0].out - (await clips())[0].in).toBeCloseTo(4, 1);
  await expect(items.filter({ hasText: 'Добавлен' })).toContainText('сейчас');
  await expect(items.first()).toHaveClass(/future/);
  // и вперёд — к удалению
  await items.first().click();
  expect(await clips()).toHaveLength(1);
  expect((await clips())[0].out - (await clips())[0].in).toBeCloseTo(2, 1);
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('history-list')).toHaveCount(0);
});

test('версии: снимок, открыть старую версию, Ctrl+Z — как было', async () => {
  expect(await act(win, 'snapshotNow')).toBe(true);
  expect(await act(win, 'snapshotNow')).toBe(false); // не изменился — второй не нужен
  const id = (await clips())[0].id;
  await win.evaluate((cid) => {
    const s = (window as any).__kadro.useStore.getState();
    s.commit((p: any) => ({ ...p, tracks: p.tracks.map((t: any) => ({ ...t, clips: t.clips.map((c: any) => (c.id === cid ? { ...c, volume: 0.3 } : c)) })) }));
  }, id);
  await win.getByTestId('history').click();
  await win.getByTestId('versions-open').click();
  await expect(win.getByTestId('version-row')).toHaveCount(2); // окно само снимает текущий вариант
  await win.getByTestId('version-open').nth(1).click();
  await expect(win.getByTestId('versions-dialog')).toHaveCount(0);
  expect((await clips())[0].volume).toBe(1);
  await expect(win.locator('.toast').filter({ hasText: 'Открыта версия от' })).toBeVisible();
  await win.keyboard.press('Control+z');
  expect((await clips())[0].volume).toBe(0.3);
});
