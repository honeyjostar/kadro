// «Сообщить об ошибке»: из настроек и с экрана сбоя — описание, версия, система и конец журнала (без личных
// путей) → готовая ссылка на новый Issue на GitHub. Ничего не отправляется само.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launch, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-bug-'));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version: string };

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  fs.writeFileSync(path.join(data, 'kadro.log'), `[2026-10-29T10:00:00.000Z] import ${path.join(os.homedir(), 'Videos', 'secret-trip.mp4')}\n[2026-10-29T10:00:01.000Z] export failed: code 1\n`);
  K = await launch({ data, env: { KADRO_NO_OPEN: '1' } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });

const urlBody = async () => {
  const u = (await win.getByTestId('bug-dialog').getAttribute('data-url'))!;
  return { u, body: new URL(u).searchParams.get('body') ?? '', title: new URL(u).searchParams.get('title') ?? '' };
};

test('из настроек: описание, версия, журнал без личных путей → ссылка на новый Issue', async () => {
  await store(win, 'setSettingsOpen', true);
  await win.getByTestId('bug-open-settings').click();
  await expect(win.getByTestId('settings')).toHaveCount(0);
  const dlg = win.getByTestId('bug-dialog');
  await expect(dlg).toBeVisible();
  await expect(win.getByTestId('bug-open')).toBeDisabled(); // пока не описал — нельзя
  await win.getByTestId('bug-what').fill('Экспорт в 4K падает на 80%\nи окно закрывается');
  await win.getByTestId('bug-steps').fill('Добавил переход «Куб»');
  await win.getByTestId('bug-preview').locator('summary').click();
  const pre = win.getByTestId('bug-preview').locator('pre');
  await expect(pre).toContainText(`Kadro ${pkg.version}`);
  await expect(pre).toContainText('export failed: code 1');
  await expect(pre).toContainText('%USERPROFILE%');
  await expect(pre).not.toContainText(os.homedir());
  const { u, body, title } = await urlBody();
  expect(u.startsWith('https://github.com/honeyjostar/kadro/issues/new?')).toBe(true);
  expect(title).toBe('Экспорт в 4K падает на 80%');
  expect(body).toContain('Добавил переход «Куб»');
  expect(body).toContain('secret-trip.mp4');
  expect(body).not.toContain(os.homedir());
  // без журнала
  await win.getByTestId('bug-log').click();
  expect((await urlBody()).body).not.toContain('export failed');
  await win.getByTestId('bug-open').click();
  await expect(win.getByTestId('bug-note')).toContainText('Submit new issue');
  await win.getByTestId('bug-logs').click();
  await expect(win.getByTestId('bug-note')).toContainText('kadro.log');
  await win.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  expect(K.errors).toEqual([]);
});

test('открыть можно только страницы Kadro на GitHub', async () => {
  const r = await win.evaluate(async () => {
    const k = (window as any).kadro;
    return [await k.openUrl('https://github.com/honeyjostar/kadro/issues/new?title=x'), await k.openUrl('https://evil.example/kadro'), await k.openUrl('https://github.com/honeyjostar/kadro-evil'), await k.openUrl('file:///C:/Windows')];
  });
  expect(r).toEqual([true, false, false, false]);
});

test('экран сбоя: «Сообщить об ошибке» — текст ошибки уже в описании; «Вернуться к работе» — редактор на месте', async () => {
  // ломаем отрисовку: список фоновых задач — не объект (падает только интерфейс)
  await win.evaluate(() => { (window as any).__kadro.useStore.setState({ jobs: null }); });
  await expect(win.getByTestId('crash')).toBeVisible();
  await win.getByTestId('crash-report').click();
  await expect(win.getByTestId('bug-what')).toHaveValue(/^Окно упало: /);
  await expect(win.getByTestId('bug-open')).toBeEnabled();
  const { body } = await urlBody();
  expect(body).toContain('renderer error'); // ошибка окна уже записана в журнал
  await win.getByTestId('bug-open').click();
  await expect(win.getByTestId('bug-note')).toContainText('Submit new issue');
  await win.getByTestId('bug-dialog').getByTitle('Закрыть').click();
  await win.evaluate(() => { const s = (window as any).__kadro.useStore; s.setState({ jobs: {} }); });
  await win.getByRole('button', { name: 'Вернуться к работе' }).click();
  await expect(win.getByTestId('timeline')).toBeVisible();
});
