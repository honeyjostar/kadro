// Экран проектов (как в CapCut) и место на диске: переименовать, копия, удалить в корзину, поиск;
// очистка кэша не трогает нужное открытому и недавним проектам.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launch, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-projects-'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-myprojects-'));
const trash = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-trash-'));
const cache = path.join(data, 'cache');
const DAY = 24 * 3600 * 1000;

function makeProject(name: string, ageMin: number, refs: string[] = []): string {
  const file = path.join(dir, `${name}.kadro`);
  const p = {
    version: 1, name, settings: { aspect: '9:16', width: 1080, height: 1920, fps: 30, background: 'black' },
    assets: refs.map((r, i) => ({ id: `a${i}`, kind: 'video', path: r, name: 'x.mp4', duration: 3, width: 640, height: 360, hasAudio: false })),
    tracks: [{ id: 'main', kind: 'main', clips: [] }],
  };
  fs.writeFileSync(file, JSON.stringify(p));
  const t = new Date(Date.now() - ageMin * 60_000);
  fs.utimesSync(file, t, t);
  return file;
}
function cacheFile(sub: string, name: string, ageMs: number, size = 1000): string {
  const f = path.join(cache, sub, name);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.alloc(size));
  const t = new Date(Date.now() - ageMs);
  fs.utimesSync(f, t, t);
  return f;
}

const names = ['Отпуск в горах', 'Свадьба Ани', 'Влог 1', 'Влог 2', 'Ёлка', 'Обзор камеры'];
let usedByProject = '';
test.beforeAll(async () => {
  usedByProject = cacheFile('ai', 'nobg_used.webm', 3 * DAY);
  const files = names.map((n, i) => makeProject(n, (i + 1) * 30, i === 0 ? [usedByProject] : []));
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ recent: files, showHome: true }));
  K = await launch({ data, env: { KADRO_SKIP_HOME: '', KADRO_TEST_TRASH: trash } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });
test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

const cards = () => win.getByTestId('project-card');
const card = (name: string) => cards().filter({ has: win.locator('.proj-name', { hasText: new RegExp(`^${name}$`) }) });

test('все проекты на главном экране — сначала новые, поиск и порядок по названию', async () => {
  await expect(win.getByTestId('projects')).toBeVisible();
  await expect(cards()).toHaveCount(6);
  await expect(cards().locator('.proj-name')).toHaveText(names);
  await win.getByTestId('projects-search').fill('влог');
  await expect(cards().locator('.proj-name')).toHaveText(['Влог 1', 'Влог 2']);
  await win.getByTestId('projects-search').fill('елка');
  await expect(cards().locator('.proj-name')).toHaveText(['Ёлка']);
  await win.getByTestId('projects-search').fill('');
  await win.getByTestId('projects-sort').selectOption('name');
  await expect(cards().first().locator('.proj-name')).toHaveText('Влог 1');
  await win.getByTestId('projects-sort').selectOption('date');
});

test('переименовать: двойной щелчок по названию — файл и название внутри', async () => {
  await card('Влог 2').locator('.proj-name').dblclick();
  const input = win.getByTestId('project-rename-input');
  await input.fill('Влог: Питер');
  await input.press('Enter');
  await expect(card('Влог Питер').or(card('Влог: Питер'))).toHaveCount(1);
  const f = path.join(dir, 'Влог Питер.kadro');
  await expect.poll(() => fs.existsSync(f)).toBe(true);
  expect(fs.existsSync(path.join(dir, 'Влог 2.kadro'))).toBe(false);
  expect(JSON.parse(fs.readFileSync(f, 'utf8')).name).toBe('Влог: Питер');
  // занятое имя — ошибка, ничего не меняется
  await card('Ёлка').hover(); // «⋯» появляется при наведении
  await card('Ёлка').getByTestId('project-more').click();
  await win.getByTestId('proj-rename').click();
  await win.getByTestId('project-rename-input').fill('Влог 1');
  await win.getByTestId('project-rename-input').press('Enter');
  await expect(win.locator('.toast.err')).toContainText('уже есть');
  expect(fs.existsSync(path.join(dir, 'Ёлка.kadro'))).toBe(true);
  K.errors.length = 0;
});

test('копия и удаление в корзину', async () => {
  await card('Свадьба Ани').click({ button: 'right' });
  await win.getByTestId('proj-copy').click();
  await expect(card('Свадьба Ани \\(копия\\)')).toHaveCount(1);
  expect(fs.existsSync(path.join(dir, 'Свадьба Ани (копия).kadro'))).toBe(true);
  win.once('dialog', (d) => void d.accept());
  await card('Обзор камеры').click({ button: 'right' });
  await win.getByTestId('proj-trash').click();
  await expect(card('Обзор камеры')).toHaveCount(0);
  expect(fs.existsSync(path.join(trash, 'Обзор камеры.kadro'))).toBe(true);
  expect(fs.existsSync(path.join(dir, 'Обзор камеры.kadro'))).toBe(false);
  // «Убрать из списка» — файл остаётся
  await card('Ёлка').click({ button: 'right' });
  await win.getByTestId('proj-forget').click();
  await expect(card('Ёлка')).toHaveCount(0);
  expect(fs.existsSync(path.join(dir, 'Ёлка.kadro'))).toBe(true);
});

test('открыть проект с карточки', async () => {
  await card('Влог 1').getByRole('button', { name: /Влог 1/ }).click();
  await expect(win.getByTestId('home')).toHaveCount(0);
  expect(await win.evaluate(() => (window as any).__kadro.useStore.getState().project.name)).toBe('Влог 1');
});

test('место на диске: превью чистятся, служебные копии — только ненужные, записи голоса — никогда', async () => {
  const oldProxy = cacheFile('proxy', 'old.mp4', 2 * 3600_000, 50_000);
  const freshProxy = cacheFile('proxy', 'writing.part.mp4', 60_000, 10_000);
  const thumb = cacheFile(path.join('thumbs', 'k1'), 't0.jpg', 2 * 3600_000, 2_000);
  const orphan = cacheFile('clips', 'rev_old.mp4', 3 * DAY, 300_000);
  const freshAi = cacheFile('ai', 'voice_new.flac', 3600_000, 1_000);
  const rec = cacheFile('recordings', 'voice.webm', 30 * DAY, 4_000);
  await store(win, 'setSettingsOpen', true);
  const sec = win.getByTestId('cache');
  await expect(sec).toBeVisible();
  await expect(win.getByTestId('cache-preview')).toHaveText(/\d+ КБ/);
  await win.getByTestId('cache-clear-preview').click();
  await expect(win.getByTestId('cache-note')).toContainText('Освобождено');
  expect(fs.existsSync(oldProxy)).toBe(false);
  expect(fs.existsSync(thumb)).toBe(false);
  expect(fs.existsSync(path.dirname(thumb))).toBe(false); // пустая папка тоже
  expect(fs.existsSync(freshProxy)).toBe(true);          // ещё пишется
  await win.getByTestId('cache-clear-derived').click();
  await expect(win.getByTestId('cache-note')).toContainText('Освобождено');
  expect(fs.existsSync(orphan)).toBe(false);
  expect(fs.existsSync(usedByProject)).toBe(true);       // нужен проекту «Отпуск в горах»
  expect(fs.existsSync(freshAi)).toBe(true);             // моложе суток
  expect(fs.existsSync(rec)).toBe(true);
  await expect(sec).toContainText('Записи голоса');
  await win.keyboard.press('Escape');
});
