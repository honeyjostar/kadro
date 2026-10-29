// Перевод субтитров без интернета: модель OPUS-MT скачивается один раз (в тестах — из папки с файлами
// релиза), обрывки фраз переводятся целиком и раскладываются по тем же субтитрам; две строки; отмена.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { MODELS, launch, project, store, type Kadro } from './kadro';

const SRC = path.join(MODELS, 'mt');
const have = ['ru-en'].every((p) => fs.existsSync(path.join(SRC, p, 'encoder.onnx')));
test.skip(!have, 'нет модели перевода ru-en в папке моделей для тестов');

let K: Kadro;
let win: Page;
const models = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-mt-models-'));
const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-mt-release-'));

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);
test.beforeAll(async () => {
  // «релиз»: файлы ru-en и manifest.json с их хешами
  const manifest = JSON.parse(fs.readFileSync(path.join(MODELS, 'mt-src', 'manifest.json'), 'utf8')) as { file: string }[];
  for (const f of fs.readdirSync(path.join(SRC, 'ru-en'))) fs.symlinkSync(path.join(SRC, 'ru-en', f), path.join(fx, `ru-en.${f}`));
  fs.writeFileSync(path.join(fx, 'manifest.json'), JSON.stringify(manifest.filter((e) => fs.existsSync(path.join(fx, e.file)))));
  K = await launch({ env: { KADRO_MODELS: models, KADRO_MT_BASE: pathToFileURL(fx).href } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

const caps = async () => (await project(win)).tracks.flatMap((t) => t.clips).filter((c: any) => c.role === 'caption').map((c: any) => c.text as string);

test('язык угадан, модель скачивается один раз, фраза из трёх субтитров переведена целиком', async () => {
  await win.evaluate(() => {
    const k = (window as any).__kadro;
    const cues = [
      { start: 0, end: 1.6, text: 'Привет!' },
      { start: 1.7, end: 3, text: 'Сегодня мы поедем' },
      { start: 3.1, end: 4.4, text: 'на море и будем' },
      { start: 4.5, end: 6, text: 'купаться весь день.' },
      { start: 6.4, end: 8, text: 'Этот редактор бесплатный.' },
    ].map((c) => ({ ...c, words: c.text.split(' ').map((w: string, i: number, a: string[]) => ({ text: w, start: c.start + (i * (c.end - c.start)) / a.length, end: c.start + ((i + 1) * (c.end - c.start)) / a.length })) }));
    k.useStore.getState().commit((p: any) => k.timeline.setCaptions(p, cues, { font: 'Onest', size: 60, color: '#ffffff' }, 0.8));
  });
  await store(win, 'setLeftTab', 'captions');
  const card = win.getByTestId('translate-card');
  await expect(win.getByTestId('mt-from')).toHaveValue('ru');
  await expect(win.getByTestId('mt-to')).toHaveValue('en');
  await expect(win.getByTestId('mt-note')).toContainText('скачается один раз');
  await win.getByTestId('mt-run').click();
  await expect(win.locator('.toast').filter({ hasText: 'Субтитры переведены' })).toBeVisible({ timeout: 200_000 });
  const t = await caps();
  expect(t).toHaveLength(5);
  const all = t.join(' ');
  expect(all, all).toMatch(/sea/i);
  expect(all).toMatch(/free/i);
  expect(t.every((x) => x && !/[а-яё]/i.test(x)), JSON.stringify(t)).toBe(true);
  // фраза из трёх субтитров разложена по ним же: в каждом по куску
  expect(t[1].length > 0 && t[2].length > 0 && t[3].length > 0).toBe(true);
  expect(fs.existsSync(path.join(models, 'mt', 'ru-en', 'decoder_with_past.onnx'))).toBe(true);
  await expect(card.getByTestId('mt-note')).toContainText('уже скачана');
  // слова для подсветки — по новому тексту
  const clip = (await project(win)).tracks.flatMap((x) => x.clips).find((c: any) => c.role === 'caption' && c.start > 6) as any;
  expect(clip.words.map((w: any) => w.text).join(' ')).toBe(clip.text);
});

test('Ctrl+Z возвращает оригинал; «Две строки» — оригинал и перевод', async () => {
  await win.keyboard.press('Control+z');
  expect((await caps())[4]).toBe('Этот редактор бесплатный.');
  await win.getByTestId('translate-card').getByRole('button', { name: 'Две строки' }).click();
  await win.getByTestId('mt-run').click();
  await expect.poll(async () => (await caps())[4].split('\n').length, { timeout: 120_000 }).toBe(2);
  const last = (await caps())[4];
  expect(last.split('\n')).toHaveLength(2);
  expect(last.split('\n')[0]).toBe('Этот редактор бесплатный.');
  expect(last.split('\n')[1]).toMatch(/free/i);
});
