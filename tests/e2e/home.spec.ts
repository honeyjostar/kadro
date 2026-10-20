// Главный экран: открывается при запуске, новый проект нужного формата, демо-проект, недавние, шаблоны на демо-видео.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { colorsVideo, launch, project, ROOT, state, waitAssetsReady, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-home-'));
const env = () => ({ KADRO_SKIP_HOME: '', KADRO_TEST_PICK: colorsVideo() });

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { K = await launch({ data, env: env() }); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

const home = () => win.getByTestId('home');
/** Пример собирается после закрытия главного экрана — ждём, пока на основной дорожке будет n клипов. */
async function waitMain(n: number) {
  await expect.poll(async () => (await project(win)).tracks[0].clips.length, { timeout: 60_000 }).toBe(n);
  await waitAssetsReady(win);
}
async function openHome() {
  await win.getByTestId('home-open-btn').click();
  await expect(home()).toBeVisible();
}

test('при запуске открыт главный экран, демо-ролик играет', async () => {
  await expect(home()).toBeVisible();
  await expect(win.getByText('Что смонтируем сегодня?')).toBeVisible();
  await expect.poll(() => win.evaluate(() => (document.querySelector('[data-testid=home-reel]') as HTMLVideoElement | null)?.currentTime ?? -1), { timeout: 15_000 })
    .toBeGreaterThan(0.3);
  // проекта ещё нет — возвращаться некуда
  await expect(win.getByTestId('home-close')).toHaveCount(0);
});

test('новый проект нужного формата', async () => {
  await win.getByTestId('home-new-16-9').click();
  await expect(home()).toHaveCount(0);
  expect((await project(win)).settings.aspect).toBe('16:9');
  // в пустом проекте плеер ведёт обратно к демо и шаблонам
  await win.getByTestId('empty-home').click();
  await expect(home()).toBeVisible();
  await win.getByTestId('home-new-16-9').click();
  await openHome();
  await win.getByTestId('home-new-9-16').click();
  expect((await project(win)).settings.aspect).toBe('9:16');
});

test('демо-проект: все демо-ролики под бит, музыка и надписи', async () => {
  await openHome();
  await win.getByTestId('home-demo').click();
  await expect(home()).toHaveCount(0);
  await waitMain(7);
  const p = await project(win);
  expect(p.name).toBe('Демо Kadro');
  expect(p.settings.aspect).toBe('9:16');
  expect(p.tracks[0].clips).toHaveLength(7);
  expect(p.tracks.filter((t) => t.kind === 'audio').flatMap((t) => t.clips)).toHaveLength(1);
  expect(p.tracks.filter((t) => t.kind === 'text').flatMap((t) => t.clips).length).toBeGreaterThanOrEqual(8);
  // готовый пример не разбирается по Ctrl+Z
  expect(await state(win, 's => s.past.length')).toBe(0);
  // с проектом на главном экране есть «вернуться» и Escape
  await openHome();
  await expect(win.getByTestId('home-close')).toBeVisible();
  await win.keyboard.press('Escape');
  await expect(home()).toHaveCount(0);
});

test('надписи встроенных шаблонов и демо не попадают под кнопки TikTok, Reels и Shorts', async () => {
  const bad: string[] = await win.evaluate(async () => {
    const k = (window as any).__kadro;
    const asset = { id: 'a', kind: 'video', path: '/a.mp4', previewPath: '/a.mp4', name: 'a', duration: 60, width: 1080, height: 1920, fps: 30, hasVideo: true, hasAudio: false, size: 1, rotation: 0, proxy: 'none' };
    const out: string[] = [];
    for (const t of [...k.templates.BUILTIN_TEMPLATES, k.templates.DEMO_TEMPLATE]) {
      const p = k.templates.applyTemplate(k.useStore.getState().project, t, [asset]);
      await k.preflight.ensureFonts(p);
      for (const pl of ['tiktok', 'reels', 'shorts']) {
        for (const i of k.preflight.preflight(p, pl, 1080)) if (!i.id.startsWith('res') && i.id !== 'aspect') out.push(`${t.id} ${pl}: ${i.text}`);
      }
    }
    return out;
  });
  expect(bad).toEqual([]);
});

test('проверка перед публикацией: демо чистое, надпись под кнопками TikTok находится и показывается', async () => {
  // демо-проект открыт предыдущим тестом
  await win.getByTestId('export-open').click();
  await win.getByRole('button', { name: 'TikTok', exact: true }).click();
  await expect(win.getByTestId('preflight-ok')).toBeVisible();
  for (const name of ['Reels', 'Shorts']) {
    await win.getByRole('button', { name, exact: true }).click();
    await expect(win.getByTestId('preflight-ok'), name).toBeVisible();
  }
  await win.getByRole('button', { name: 'Закрыть' }).first().click();
  // надпись внизу — под подписью и музыкой TikTok
  const id: string = await win.evaluate(() => {
    const k = (window as any).__kadro;
    let id = '';
    k.useStore.getState().commit((p: any) => { const r = k.timeline.addText(p, 1, 'ПОДПИСЬ ВНИЗУ'); id = r.clipId; return k.timeline.updateClip(r.project, id, { y: 0.86 }); });
    return id;
  });
  await win.getByTestId('export-open').click();
  await win.getByRole('button', { name: 'TikTok', exact: true }).click();
  const issue = win.getByTestId('preflight-issue').filter({ hasText: 'ПОДПИСЬ ВНИЗУ' });
  await expect(issue).toContainText('ник, подпись и музыка');
  await issue.getByRole('button', { name: 'Показать' }).click();
  await expect(win.getByTestId('export-dialog')).toHaveCount(0);
  await expect(win.getByTestId('safe-zones')).toBeVisible();
  expect(await state(win, 's => s.selection')).toEqual([id]);
  // горизонтальный проект для TikTok — подсказка и починка одной кнопкой
  await win.evaluate(() => { const k = (window as any).__kadro; k.useStore.getState().commit((p: any) => k.timeline.setSettings(p, { aspect: '16:9', width: 1920, height: 1080 })); });
  await win.getByTestId('export-open').click();
  await win.getByRole('button', { name: 'TikTok', exact: true }).click();
  await win.getByRole('button', { name: 'Сделать 9:16' }).click();
  expect((await project(win)).settings.aspect).toBe('9:16');
  await win.getByRole('button', { name: 'Закрыть' }).first().click();
  await win.keyboard.press('Control+z');
  await win.keyboard.press('Control+z');
  await win.getByTestId('safe-zone').selectOption('');
});

test('несохранённый проект не пропадает: он в «Недавних»', async () => {
  await openHome();
  await win.getByTestId('home-new-1-1').click();
  expect((await project(win)).tracks[0].clips).toHaveLength(0);
  await openHome();
  const card = win.getByTestId('home-recent').getByRole('button', { name: /Демо Kadro/ });
  await expect(card).toBeVisible();
  await card.click();
  await expect(home()).toHaveCount(0);
  const p = await project(win);
  expect(p.name).toBe('Демо Kadro');
  expect(p.tracks[0].clips).toHaveLength(7);
});

test('шаблон на демо-видео: с главного экрана и из вкладки «Шаблоны»', async () => {
  await openHome();
  await win.getByTestId('home-try-birthday').click();
  await expect(home()).toHaveCount(0);
  await waitMain(5);
  let p = await project(win);
  expect(p.name).toBe('С днём рождения (пример)');
  expect(p.tracks[0].clips).toHaveLength(5);
  await win.getByTestId('tab-templates').click();
  if (fs.existsSync(path.join(ROOT, 'resources', 'templates', 'winter.mp4'))) {
    await expect(win.getByTestId('tpl-winter').locator('video')).toHaveCount(1);
  }
  await win.getByTestId('tpl-winter').getByRole('button').first().click();
  await win.getByTestId('tpl-try').click();
  await expect.poll(async () => (await project(win)).name).toBe('Зимняя сказка (пример)');
  await waitMain(4);
  p = await project(win);
  expect(p.tracks[0].clips).toHaveLength(4);
  // разделы шаблонов
  await win.locator('.chips button', { hasText: 'YouTube и 16:9' }).click();
  await expect(win.getByTestId('tpl-ytintro')).toBeVisible();
  await expect(win.getByTestId('tpl-trip')).toHaveCount(0);
});

test('шаблон со своими файлами — с главного экрана', async () => {
  await openHome();
  await win.getByTestId('home-tpl-trip').getByRole('button', { name: 'Свои видео и фото' }).click();
  await expect(home()).toHaveCount(0);
  await expect.poll(async () => (await project(win)).tracks[0].clips.length).toBe(6);
  const p = await project(win);
  expect(p.name).toBe('Путешествие');
  expect(new Set(p.tracks[0].clips.map((c: any) => c.assetId)).size).toBe(1);
});

test('тема: тёмная → светлая → как в Windows → тёмная', async () => {
  const theme = () => win.evaluate(() => document.documentElement.dataset.theme);
  expect(await theme()).toBe('dark');
  await win.getByTestId('theme-btn').click();
  await expect.poll(theme).toBe('light');
  await expect(win.getByTestId('theme-btn')).toContainText('Светлая');
  await win.getByTestId('theme-btn').click();
  await expect(win.getByTestId('theme-btn')).toContainText('Как в Windows');
  await win.getByTestId('theme-btn').click();
  await expect.poll(theme).toBe('dark');
  await win.getByTestId('theme-btn').click(); // светлая — проверим после перезапуска
  await expect.poll(theme).toBe('light');
});

test('«Показывать при запуске» и недавние сохраняются после перезапуска', async () => {
  await openHome();
  await win.getByTestId('home-show').click();
  await win.getByTestId('home-close').click();
  await win.waitForTimeout(1500); // черновик успевает сохраниться
  await K.app.close();
  K = await launch({ data, env: env() });
  win = K.win;
  await win.waitForTimeout(800);
  await expect(home()).toHaveCount(0);
  await openHome();
  await expect(win.getByTestId('home-recent').getByRole('button', { name: /Демо Kadro/ })).toBeVisible();
  // тема запомнилась
  expect(await win.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await win.getByTestId('home-show').click(); // вернуть как было
});
