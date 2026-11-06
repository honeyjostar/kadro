// Готовые субтитры: загрузить .srt (старая русская кодировка Windows-1251) и .vtt, поправить, сохранить в .srt.
// Системные окна выбора и сохранения файла подменены (KADRO_TEST_SUBS, KADRO_TEST_SUBS_SAVE).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launch, project, type Kadro } from './kadro';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-subs-e2e-'));
const SRT = path.join(TMP, 'ролик.srt');
const VTT = path.join(TMP, 'clip.vtt');
const OUT = path.join(TMP, 'saved.srt');
// «Привет» и «мир» в Windows-1251 — так их сохраняют старые программы
const cp1251 = (s: string) => Buffer.from([...s].map((ch) => { const c = ch.charCodeAt(0); return c >= 0x410 && c <= 0x44f ? c - 0x410 + 0xc0 : c; }));
fs.writeFileSync(SRT, Buffer.concat([Buffer.from('1\r\n00:00:00,500 --> 00:00:01,800\r\n'), cp1251('Привет'), Buffer.from('\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,000\r\n'), cp1251('мир'), Buffer.from('\r\n')]));
fs.writeFileSync(VTT, 'WEBVTT\n\n00:01.000 --> 00:02.000 align:center\n<v Тим>Один</v>\n\n00:02.500 --> 00:04.000\nДва\n');

let K: Kadro;
let win: Page;
const captions = async () => (await project(win)).tracks.flatMap((t) => t.clips).filter((c: any) => c.type === 'text' && c.role === 'caption') as any[];
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  K = await launch({ env: { KADRO_TEST_SUBS: SRT, KADRO_TEST_SUBS_SAVE: OUT } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors.filter((e) => !/Failed to load resource/.test(e)), K.errors.join('\n')).toEqual([]); });

test('загрузить .srt: время и текст как в файле, кодировка — сама', async () => {
  await win.getByTestId('tab-captions').click();
  await expect(win.getByTestId('subs-export')).toHaveCount(0);
  await win.getByTestId('subs-import').click();
  await expect(win.getByTestId('cue-text')).toHaveCount(2);
  const c = await captions();
  expect(c.map((x) => x.text)).toEqual(['Привет', 'мир']);
  expect(c[0].start).toBeCloseTo(0.5);
  expect(c[0].duration).toBeCloseTo(1.3);
  expect(c[1].start).toBeCloseTo(2);
  expect(c[0].words?.length).toBe(1);
  await expect(win.locator('.toast').last()).toContainText('2');
});

test('поправить и сохранить в .srt', async () => {
  await win.getByTestId('cue-text').first().fill('Привет, Kadro');
  await win.getByTestId('subs-export').click();
  await expect.poll(() => fs.existsSync(OUT)).toBe(true);
  const txt = fs.readFileSync(OUT, 'utf8');
  expect(txt).toContain('00:00:00,500 --> 00:00:01,800');
  expect(txt).toContain('Привет, Kadro');
  expect(txt).toContain('2\r\n00:00:02,000 --> 00:00:03,000\r\nмир');
});

test('.vtt через перетаскивание — встаёт вместо прежних', async () => {
  await win.evaluate((f) => (window as any).__kadro.actions.importPaths([f]), VTT);
  await expect(win.getByTestId('cue-text')).toHaveCount(2);
  expect((await captions()).map((x) => x.text)).toEqual(['Один', 'Два']);
  // отмена возвращает прежние субтитры
  await win.keyboard.press('Control+z');
  await expect.poll(async () => (await captions()).map((x) => x.text)).toEqual(['Привет, Kadro', 'мир']);
});

test('не субтитры — понятная ошибка, проект не меняется', async () => {
  const bad = path.join(TMP, 'bad.srt');
  fs.writeFileSync(bad, 'просто текст без времени');
  await win.evaluate((f) => (window as any).__kadro.actions.importSubtitles(f), bad);
  await expect(win.locator('.toast').last()).toContainText('нет субтитров');
  expect((await captions()).length).toBe(2);
});
