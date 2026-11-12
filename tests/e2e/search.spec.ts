// Мелочи для удобства: поиск по всему (Ctrl+K), избранное и недавние, перетаскивание эффекта / фильтра / перехода
// на клип, плеер шире (Ctrl+\), плеер на весь экран (F), запомненная высота таймлайна.
import { expect, test, type Page } from '@playwright/test';
import { importAt, launch, project, solidVideo, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  K = await launch();
  win = K.win;
  await importAt(win, [solidVideo('red3.mp4', 'red', 3), solidVideo('blue3.mp4', 'blue', 3)], 'main', 0);
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

const clips = async () => (await project(win)).tracks.find((t) => t.kind === 'main')!.clips as any[];
const search = async (q: string) => {
  await win.keyboard.press('Control+k');
  await expect(win.getByTestId('search')).toBeVisible();
  await win.getByTestId('search-input').fill(q);
};

test('Ctrl+K: эффект по названию встаёт на выделенный клип, Esc закрывает', async () => {
  const [a] = await clips();
  await store(win, 'select', [a.id]);
  await search('глитч');
  await expect(win.getByTestId('search-item').first()).toHaveAttribute('data-id', 'fx-glitch');
  await win.keyboard.press('Enter');
  await expect(win.getByTestId('search')).toHaveCount(0);
  await expect(win.locator('.toast').filter({ hasText: 'Эффект «Глитч» добавлен' })).toBeVisible();
  expect((await clips())[0].effects).toEqual([{ type: 'glitch', amount: 0.6 }]);
  // повторно — не дублируется
  await search('глитч');
  await win.keyboard.press('Enter');
  expect((await clips())[0].effects).toHaveLength(1);
  await search('что-нибудь');
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('search')).toHaveCount(0);
});

test('не та раскладка, команды и разделы; без выделения — подсказка и нужный раздел', async () => {
  await search('ukbn'); // «глит» в английской раскладке
  await expect(win.getByTestId('search-item').first()).toContainText('Глитч');
  await win.getByTestId('search-input').fill('экспорт');
  await win.keyboard.press('Enter');
  await expect(win.getByTestId('export-dialog')).toBeVisible();
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('export-dialog')).toHaveCount(0);
  await store(win, 'select', []);
  await search('кинематограф');
  await win.keyboard.press('Enter');
  await expect(win.locator('.toast').filter({ hasText: 'фильтр встанет на него' })).toBeVisible();
  await expect(win.getByTestId('tab-filters')).toHaveClass(/active/);
  // стрелки и щелчок мышью
  await search('растворение');
  await win.keyboard.press('ArrowDown');
  await expect(win.getByTestId('search-item').nth(1)).toHaveClass(/active/);
  await win.getByTestId('search-item').filter({ hasText: /^Растворение/ }).first().click();
  await expect(win.locator('.toast').filter({ hasText: 'Переход «Растворение» поставлен' })).toBeVisible();
  expect((await clips())[0].transitionOut?.type).toBe('fade');
});

test('избранное и недавние: звёздочка, разделы «Избранное» и «Недавние», первые в поиске', async () => {
  await win.getByTestId('tab-effects').click();
  await expect(win.getByTestId('fxcat-recent')).toBeVisible(); // глитч ставили из поиска
  await expect(win.getByTestId('fxcat-fav')).toHaveCount(0);
  await win.getByTestId('fx-vhs').hover();
  await win.getByTestId('fav-fx-vhs').click();
  await win.getByTestId('fxcat-fav').click();
  await expect(win.locator('.fx-grid .tile')).toHaveCount(1);
  await expect(win.getByTestId('fx-vhs')).toBeVisible();
  await win.getByTestId('fxcat-recent').click();
  await expect(win.getByTestId('fx-glitch')).toBeVisible();
  // избранное — сверху пустого поиска
  await win.keyboard.press('Control+k');
  await expect(win.getByTestId('search-item').first()).toHaveAttribute('data-id', 'fx-vhs');
  await win.keyboard.press('Escape');
  // снять звёздочку — раздел пропадает, показываются все
  await win.getByTestId('fxcat-fav').click();
  await win.getByTestId('fav-fx-vhs').click();
  await expect(win.getByTestId('fx-glitch')).toBeVisible();
  await expect(win.getByTestId('fxcat-fav')).toHaveCount(0);
  expect(await win.evaluate(() => JSON.parse(localStorage.getItem('kadro.favs') ?? '{}').recent.fx)).toContain('glitch');
});

test('перетаскивание: эффект и фильтр — на клип под мышью, переход — на ближайший стык', async () => {
  const [, b] = await clips();
  const target = win.locator(`[data-clip="${b.id}"]`);
  await win.getByTestId('tab-effects').click();
  await win.getByTestId('fxcat-recent').click(); // короткий список — плитка точно видна
  await win.getByTestId('fx-glitch').dragTo(target);
  expect((await clips())[1].effects).toEqual([{ type: 'glitch', amount: 0.6 }]);
  expect(await win.evaluate(() => (window as any).__kadro.useStore.getState().selection)).toEqual([b.id]);
  await win.getByTestId('tab-filters').click();
  await win.getByTestId('filter-cinema').dragTo(target);
  expect((await clips())[1].color.preset).toBe('cinema');
  await expect(win.getByTestId('filtercat-recent')).toBeVisible();
  await win.getByTestId('tab-transitions').click();
  await win.getByTestId('tr-fadeblack').dragTo(target, { targetPosition: { x: 4, y: 10 } });
  expect((await clips())[0].transitionOut?.type).toBe('fadeblack');
});

test('Ctrl+\\ и кнопка «Большой плеер» прячут боковые панели и ужимают таймлайн; F — плеер на весь экран; высота таймлайна запоминается', async () => {
  await expect(win.getByTestId('inspector')).toBeVisible();
  const w0 = (await win.getByTestId('preview').boundingBox())!.width;
  await win.keyboard.press('Control+Backslash');
  await expect(win.getByTestId('inspector')).toHaveCount(0);
  await expect(win.locator('.panel')).toHaveCount(0);
  // вертикальное видео упирается в высоту — таймлайн ниже, плеер крупнее
  await expect.poll(async () => (await win.getByTestId('preview').boundingBox())!.width).toBeGreaterThan(w0 * 1.1);
  // щелчок по разделу возвращает панели
  await win.getByTestId('tab-text').click();
  await expect(win.getByTestId('inspector')).toBeVisible();
  await win.getByTestId('player-wide').click();
  await expect(win.getByTestId('inspector')).toHaveCount(0);
  await win.getByTestId('player-wide').click();
  await expect(win.getByTestId('inspector')).toBeVisible();
  // F — на весь экран и обратно
  await win.locator('body').click({ position: { x: 700, y: 5 } });
  await win.keyboard.press('f');
  await expect.poll(() => win.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await win.keyboard.press('f');
  await expect.poll(() => win.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await store(win, 'setTlHeight', 420);
  expect(await win.evaluate(() => localStorage.getItem('kadro.tlHeight'))).toBe('420');
  await store(win, 'setTlHeight', 300);
});
