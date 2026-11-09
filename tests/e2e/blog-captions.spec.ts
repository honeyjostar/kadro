// Субтитры «как у блогеров»: готовые стили, по 1–3 слова, ключевые слова цветом, эмодзи; превью и экспорт.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { act, importAt, launch, probe, project, seekAndSettle, solidVideo, waitAssetsReady } from './kadro';

test.setTimeout(180_000);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-blog-e2e-'));
const SRT = path.join(TMP, 'речь.srt');
fs.writeFileSync(SRT, [
  '1', '00:00:00,300 --> 00:00:02,400', 'Я заработал 100000 рублей за месяц', '',
  '2', '00:00:02,600 --> 00:00:04,800', 'и это просто огонь, друзья', '',
].join('\n'));
const caps = async (win: any) => (await project(win)).tracks.flatMap((t) => t.clips).filter((c: any) => c.type === 'text' && c.role === 'caption') as any[];

test('стили «как у блогеров» в работе: разбивка, ключевые слова, эмодзи, экспорт', async () => {
  const out = path.join(TMP, 'blog.mp4');
  const K = await launch({ env: { KADRO_TEST_SUBS: SRT, KADRO_TEST_EXPORT: out } });
  const win = K.win;
  await act(win, 'newProjectAction', '9:16');
  await importAt(win, [solidVideo('blue6.mp4', 'blue', 6)], 'main', 0);
  await waitAssetsReady(win);
  await win.getByTestId('tab-captions').click();
  await expect(win.getByTestId('blog-styles')).toHaveCount(0); // без субтитров стилей нет
  await win.getByTestId('subs-import').click();
  await expect(win.getByTestId('blog-styles')).toBeVisible();

  // «Хормози»: по 3 слова, ключевые слова и эмодзи
  await win.getByTestId('blog-hormozi').click();
  let c = await caps(win);
  expect(Math.max(...c.map((x) => x.words.length))).toBeLessThanOrEqual(3);
  expect(c.map((x) => x.text).join(' ')).toBe('Я заработал 100000 рублей за месяц и это просто огонь, друзья');
  expect(c.some((x) => x.words.some((w: any) => w.key && w.text === '100000'))).toBe(true);
  expect(c.some((x) => x.words.some((w: any) => w.emoji === '🔥'))).toBe(true);
  expect(c[0].style.font).toBe('Montserrat');
  await expect(win.getByTestId('cap-group').locator('[data-value="3"]')).toHaveClass(/active/);
  await expect(win.getByTestId('cap-keywords')).toHaveAttribute('aria-checked', 'true');

  // по слову; ключевые слова выключить
  await win.getByTestId('cap-group').locator('[data-value="1"]').click();
  c = await caps(win);
  expect(c.every((x) => x.words.length === 1)).toBe(true);
  expect(c.length).toBe(11);
  await win.getByTestId('cap-keywords').click();
  expect((await caps(win)).every((x) => x.words.every((w: any) => !w.key))).toBe(true);

  // остальные стили применяются без ошибок; «Караоке» — строкой
  for (const id of ['beast', 'word', 'boxword', 'neonblog', 'karaoke']) await win.getByTestId(`blog-${id}`).click();
  c = await caps(win);
  expect(c.length).toBeLessThanOrEqual(3);
  expect(c[0].style.highlight.mode).toBe('karaoke');

  // MrBeast: в кадре видно надпись, экспорт проходит
  await win.getByTestId('blog-beast').click();
  await seekAndSettle(win, 1);
  await act(win, 'select', []).catch(() => undefined);
  await win.evaluate(() => (window as any).__kadro.useStore.getState().setExportOpen(true));
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-show')).toBeVisible({ timeout: 120_000 });
  expect(probe(out).duration).toBeGreaterThan(5.5);
  expect(K.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  await K.app.close();
});
