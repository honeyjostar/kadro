// Избранные шрифты: ★ у шрифта — он сверху списка и в «★»; выбранный — в «Недавних»; запоминается.
import { expect, test, type Page } from '@playwright/test';
import { launch, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
test.beforeAll(async () => { K = await launch(); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

test('★ у шрифта: сверху и в «★»; выбранный — в недавних', async () => {
  await win.evaluate(() => { const k = (window as any).__kadro; k.useStore.getState().commit((p: any) => k.timeline.addText(p, 0, 'Шрифт').project); });
  const p = await win.evaluate(() => (window as any).__kadro.useStore.getState().project);
  const t = p.tracks.flatMap((x: any) => x.clips).find((c: any) => c.type === 'text');
  await store(win, 'select', [t.id]);
  await win.getByTestId('text-font').click();
  const pop = win.getByTestId('font-pop');
  await expect(pop.getByTestId('font-group-fav')).toHaveCount(0);
  const russo = pop.locator('.font-row-fav', { has: win.locator('[data-font="Russo One"]') }).first();
  await russo.hover();
  await russo.getByTestId('font-fav').click();
  await expect(pop.getByTestId('font-group-fav')).toContainText('Russo One');
  await pop.getByTestId('font-cat-fav').click();
  await expect(pop.locator('.font-row')).toHaveCount(1);
  await pop.getByTestId('font-cat-fav').click(); // ещё раз — остаётся «★»
  await pop.locator('.font-row', { hasText: 'Russo One' }).click();
  await win.getByTestId('text-font').click();
  // список помнит «★»; выберем другой шрифт из всех и проверим недавние
  await win.getByTestId('font-pop').locator('.chips button', { hasText: 'Все' }).click();
  await win.getByTestId('font-pop').locator('[data-font="Lobster"]').first().click();
  await win.getByTestId('text-font').click();
  await expect(win.getByTestId('font-group-recent')).toContainText('Lobster');
  const favs = await win.evaluate(() => JSON.parse(localStorage.getItem('kadro.favs') ?? '{}'));
  expect(favs.fav.font).toEqual(['Russo One']);
  expect(favs.recent.font.slice(0, 2)).toEqual(['Lobster', 'Russo One']);
});
