// Английский интерфейс: на главном экране, во всех разделах слева, во вкладках клипа справа, в окнах
// настроек, экспорта, каталога, «Сообщить об ошибке» нет ни одной русской буквы. Смена языка в настройках.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { importAt, launch, project, solidVideo, store, colorsVideo, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-en-'));

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);
test.beforeAll(async () => {
  K = await launch({ data, env: { KADRO_LANG: 'en', KADRO_SKIP_HOME: '', KADRO_NO_RELAUNCH: '1', KADRO_NO_OPEN: '1', KADRO_PLUGINS_URL: pathToFileURL(path.join(__dirname, '..', '..', 'community-plugins', 'index.json')).href } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });

/** Видимый текст, подсказки и подписи с русскими буквами (имена файлов и проектов пользователя не в счёт). */
async function russian(where: string): Promise<string[]> {
  return win.evaluate((w) => {
    const CYR = /[А-Яа-яЁё]/;
    const out = new Set<string>();
    const skip = (el: Element | null) => !!el?.closest('[data-native], [data-user-text], .cue-text, textarea, input, .clip-label, .proj-name, .cap-text');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || skip(el)) continue;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      if (CYR.test(n.textContent ?? '')) out.add(`${w}: ${(n.textContent ?? '').trim().slice(0, 90)}`);
    }
    for (const el of document.querySelectorAll('[title], [aria-label], [placeholder]')) {
      if (skip(el)) continue;
      for (const a of ['title', 'aria-label', 'placeholder']) {
        const v = el.getAttribute(a);
        if (v && CYR.test(v)) out.add(`${w} [${a}]: ${v.slice(0, 90)}`);
      }
    }
    return [...out];
  }, where);
}

test('главный экран по-английски', async () => {
  await expect(win.getByText('What are we editing today?')).toBeVisible();
  expect(await win.evaluate(() => document.documentElement.lang)).toBe('en');
  expect(await russian('home')).toEqual([]);
});

test('редактор: все разделы слева и вкладки клипа справа', async () => {
  await store(win, 'setHome', false);
  await importAt(win, [colorsVideo(), solidVideo('blue3.mp4', 'blue', 3)], 'main', 0);
  const bad: string[] = [];
  bad.push(...await russian('editor'));
  for (const tab of ['media', 'audio', 'text', 'captions', 'effects', 'transitions', 'filters', 'templates', 'ai', '3d']) {
    await store(win, 'setLeftTab', tab);
    await win.waitForTimeout(250);
    bad.push(...await russian(`left:${tab}`));
  }
  const clip = (await project(win)).tracks[0].clips[0];
  await store(win, 'select', [clip.id]);
  for (const t of await win.locator('[data-testid^=itab-]').all()) {
    await t.click();
    await win.waitForTimeout(150);
    bad.push(...await russian(`inspector:${await t.getAttribute('data-testid')}`));
  }
  expect([...new Set(bad)]).toEqual([]);
});

test('окна: настройки, экспорт, сообщить об ошибке, каталог плагинов', async () => {
  const bad: string[] = [];
  await store(win, 'setSettingsOpen', true);
  await win.waitForTimeout(300);
  bad.push(...await russian('settings'));
  await win.keyboard.press('Escape');
  await win.getByTestId('export-open').click();
  await win.waitForTimeout(300);
  bad.push(...await russian('export'));
  await win.keyboard.press('Escape');
  await store(win, 'setBugOpen', { what: '' });
  await win.waitForTimeout(300);
  bad.push(...await russian('bug'));
  await win.keyboard.press('Escape');
  await store(win, 'setScriptOpen', true);
  await win.waitForTimeout(300);
  bad.push(...await russian('script'));
  await win.keyboard.press('Escape');
  await store(win, 'setAutoOpen', { files: [], fresh: false });
  await win.waitForTimeout(300);
  bad.push(...await russian('auto'));
  await win.keyboard.press('Escape');
  await store(win, 'setAutoOpen', null);
  await store(win, 'setPluginCatalogOpen', true);
  await win.waitForTimeout(1500);
  bad.push(...await russian('catalog'));
  await win.keyboard.press('Escape');
  // формат кадра под плеером и меню по правой кнопке на клипе и на файле
  await win.locator('.format-btn').click();
  await win.waitForTimeout(200);
  bad.push(...await russian('format'));
  await win.keyboard.press('Escape');
  await store(win, 'setLeftTab', 'media');
  await win.getByTestId('media-item').first().click({ button: 'right' });
  await win.waitForTimeout(200);
  bad.push(...await russian('media-menu'));
  await win.keyboard.press('Escape');
  await win.getByTestId('ruler').click({ button: 'right', position: { x: 200, y: 10 } });
  await win.waitForTimeout(200);
  bad.push(...await russian('ruler-menu'));
  await win.keyboard.press('Escape');
  expect([...new Set(bad)]).toEqual([]);
});

test('смена языка в настройках: запоминается и просит перезапуск', async () => {
  await store(win, 'setSettingsOpen', true);
  await win.getByTestId('lang').getByRole('button', { name: 'Русский' }).click();
  await expect(win.getByTestId('lang')).toContainText('Kadro will restart in the chosen language');
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8')).lang).toBe('ru');
  await win.keyboard.press('Escape');
});
