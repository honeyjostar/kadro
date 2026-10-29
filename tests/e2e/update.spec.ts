// Автообновление: проверка GitHub (в тестах — файл release.json), карточка «Вышел Kadro X», «Что нового»,
// скачивание с полоской и отменой, проверка SHA-256, запуск установщика; переносная версия — страница
// релиза; «Kadro обновлён» после установки; настройки «Обновления».
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { launch, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-update-'));
const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-release-'));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version: string };
const url = (f: string) => pathToFileURL(path.join(fx, f)).href;

/** Ненастоящий релиз: установщик из случайных байт и суммы (bad — неверная сумма). */
function release(version: string, opts: { bad?: boolean; sums?: boolean } = {}): string {
  const setup = `Kadro-Setup-${version}.exe`;
  const bytes = createHash('sha256').update(version).digest();
  const body = Buffer.alloc(3 * 1024 * 1024);
  for (let i = 0; i < body.length; i++) body[i] = bytes[i % 32] ^ (i & 255);
  fs.writeFileSync(path.join(fx, setup), body);
  const sha = createHash('sha256').update(opts.bad ? 'x' : body).digest('hex');
  fs.writeFileSync(path.join(fx, `sums-${version}.txt`), `${sha}  ${setup}\n`);
  const json = {
    tag_name: `v${version}`, html_url: `https://github.com/honeyjostar/kadro/releases/tag/v${version}`,
    body: `## Что нового в ${version}\n\n- **Маркеры** на таймлайне\n- Каталог плагинов`,
    assets: [
      { name: setup, browser_download_url: url(setup), size: body.length },
      { name: `Kadro-${version}-portable.zip`, browser_download_url: url(setup), size: body.length },
      ...(opts.sums === false ? [] : [{ name: 'SHA256SUMS.txt', browser_download_url: url(`sums-${version}.txt`), size: 100 }]),
    ],
  };
  const f = path.join(fx, `release-${version}.json`);
  fs.writeFileSync(f, JSON.stringify(json));
  return pathToFileURL(f).href;
}
const setEnv = (vars: Record<string, string | null>) => K.app.evaluate((_e, v) => {
  for (const [k, x] of Object.entries(v)) { if (x === null) delete process.env[k]; else process.env[k] = x; }
}, vars);
const card = () => win.getByTestId('update-card');

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);
test.afterAll(async () => { await K?.app.close(); });

test('при запуске: «Вышел Kadro 99.0.0» и «Что нового»', async () => {
  K = await launch({ data, env: { KADRO_UPDATE_URL: release('99.0.0'), KADRO_UPDATE_INSTALLED: '1', KADRO_UPDATE_NO_RUN: '1', KADRO_UPDATE_SLOW: '1', KADRO_NO_OPEN: '1' } });
  win = K.win;
  await expect(card()).toContainText('Вышел Kadro 99.0.0', { timeout: 15_000 });
  await expect(card()).toContainText('Обновление 3 МБ');
  await win.getByTestId('update-notes').click();
  const notes = win.getByTestId('update-notes-dialog');
  await expect(notes.locator('h4')).toHaveText('Что нового в 99.0.0');
  await expect(notes.locator('p.li').first()).toHaveText('Маркеры на таймлайне');
  await win.keyboard.press('Escape');
  await expect(notes).toHaveCount(0);
});

test('«Обновить»: полоска, «Отмена» — назад; второй раз — скачано и сверено, «Установить сейчас» запускает установщик', async () => {
  await win.getByTestId('update-go').click();
  await expect(card()).toContainText('Скачиваю…');
  await win.getByTestId('update-cancel').click();
  await expect(card()).toHaveAttribute('data-phase', 'available');
  expect(fs.readdirSync(path.join(data, 'cache', 'update'))).toEqual([]);
  await win.getByTestId('update-go').click();
  await expect(card()).toHaveAttribute('data-phase', 'ready', { timeout: 60_000 });
  await expect(card()).toContainText('Kadro 99.0.0 скачан');
  const got = fs.readFileSync(path.join(data, 'cache', 'update', 'Kadro-Setup-99.0.0.exe'));
  expect(got.equals(fs.readFileSync(path.join(fx, 'Kadro-Setup-99.0.0.exe')))).toBe(true);
  await win.getByTestId('update-install').click();
  await expect(card()).toHaveAttribute('data-phase', 'installing');
  await expect.poll(() => fs.readFileSync(path.join(data, 'kadro.log'), 'utf8')).toContain('update: run installer');
  // по-настоящему: установщик не запустился (здесь это не программа Windows) — Kadro не закрывается, пишет почему
  await setEnv({ KADRO_UPDATE_NO_RUN: null });
  await win.evaluate(() => (window as any).kadro.installUpdate());
  await expect(win.getByTestId('update-error')).toContainText('Установщик не запустился');
  await setEnv({ KADRO_UPDATE_NO_RUN: '1' });
});

test('повреждённый файл — ошибка и «Повторить», файла не остаётся', async () => {
  await setEnv({ KADRO_UPDATE_URL: release('99.0.1', { bad: true }), KADRO_UPDATE_SLOW: null });
  await store(win, 'setSettingsOpen', true);
  await win.getByTestId('update-check').click();
  await expect(win.getByTestId('update-status')).toHaveText('Вышла версия 99.0.1.');
  await win.getByTestId('update-go-settings').click();
  await expect(win.getByTestId('update-status')).toContainText('Файл скачался с ошибкой', { timeout: 30_000 });
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('update-error')).toContainText('Файл скачался с ошибкой');
  await expect(win.getByTestId('update-retry')).toBeVisible();
  expect(fs.readdirSync(path.join(data, 'cache', 'update')).filter((f) => f.includes('99.0.1'))).toEqual([]);
});

test('переносная версия — «Скачать» открывает страницу релиза; последняя версия — без карточки', async () => {
  await setEnv({ KADRO_UPDATE_URL: release('99.0.2'), KADRO_UPDATE_INSTALLED: null });
  await store(win, 'setSettingsOpen', true);
  await win.getByTestId('update-check').click();
  await expect(win.getByTestId('updates')).toContainText('переносная версия');
  await win.keyboard.press('Escape');
  await expect(card()).toContainText('У тебя переносная версия');
  await card().getByTestId('update-go').click();
  await expect(card()).toHaveAttribute('data-phase', 'available'); // ничего не качали
  await setEnv({ KADRO_UPDATE_URL: release(pkg.version) });
  await store(win, 'setSettingsOpen', true);
  await win.getByTestId('update-check').click();
  await expect(win.getByTestId('update-status')).toHaveText('У тебя последняя версия.');
  await win.keyboard.press('Escape');
  await expect(card()).toHaveCount(0);
});

test('GitHub не отвечает — понятная ошибка в настройках; выключить проверку при запуске', async () => {
  await setEnv({ KADRO_UPDATE_URL: url('nope.json') });
  await store(win, 'setSettingsOpen', true);
  await win.getByTestId('update-check').click();
  await expect(win.getByTestId('update-status')).toContainText('Не получилось');
  await win.getByTestId('update-auto').click();
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(data, 'update.json'), 'utf8')).autoCheck).toBe(false);
  await win.keyboard.press('Escape');
});

test('после обновления: «Kadro обновлён до …» один раз', async () => {
  await K.app.close();
  const f = path.join(data, 'update.json');
  fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, 'utf8')), lastVersion: '0.1.0' }));
  K = await launch({ data, env: { KADRO_NO_OPEN: '1' } });
  win = K.win;
  await expect(card()).toContainText(`Kadro обновлён до ${pkg.version}`);
  await win.getByTestId('update-whatsnew').click();
  await expect(card()).toHaveCount(0);
  expect(JSON.parse(fs.readFileSync(f, 'utf8')).lastVersion).toBe(pkg.version);
  await K.app.close();
  K = await launch({ data });
  win = K.win;
  await win.waitForTimeout(800);
  await expect(card()).toHaveCount(0);
  expect(K.errors).toEqual([]);
});
