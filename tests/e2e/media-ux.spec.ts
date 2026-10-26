// Замечания монтажёра: «+» переходов не мешают, формат кадра — меню под плеером, музыка не теряется
// (выбор, куда класть, и меню действий с файлом).
import { expect, test, type Page } from '@playwright/test';
import { ff, importAt, launch, media, project, reset, solidVideo, state, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
const music = () => media('music5.m4a', (f) => ff(['-f', 'lavfi', '-i', 'sine=frequency=262:duration=5', '-c:a', 'aac', f]));

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);
test.beforeAll(async () => { K = await launch({ env: { KADRO_TEST_PICK: music() } }); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

const audioClips = async () => (await project(win)).tracks.filter((t) => t.kind === 'audio').flatMap((t) => t.clips);

test('«+» перехода — только у стыка под мышью; стык с переходом виден всегда', async () => {
  await reset(win);
  await importAt(win, [solidVideo('red3.mp4', 'red', 3), solidVideo('blue3.mp4', 'blue', 3), solidVideo('green3.mp4', 'green', 3)], 'main', 0);
  await store(win, 'setZoom', 80);
  await expect(win.getByTestId('junction')).toHaveCount(0);
  const ids = (await project(win)).tracks[0].clips.map((c) => c.id);
  const b = (await win.locator(`[data-clip="${ids[1]}"]`).boundingBox())!;
  // мышь у второго стыка — появляется одна кнопка, ровно на стыке
  await win.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await expect(win.getByTestId('junction')).toHaveCount(0);
  await win.mouse.move(b.x + b.width + 3, b.y + b.height / 2, { steps: 3 });
  await expect(win.getByTestId('junction')).toHaveCount(1);
  const j = (await win.getByTestId('junction').boundingBox())!;
  expect(Math.abs(j.x + j.width / 2 - (b.x + b.width))).toBeLessThan(4);
  // подрезка у края клипа (выше кнопки) по-прежнему работает
  await win.mouse.move(b.x + b.width - 3, b.y + 6);
  await win.mouse.down();
  await win.mouse.move(b.x + b.width - 43, b.y + 6, { steps: 5 });
  await win.mouse.up();
  const c1 = (await project(win)).tracks[0].clips[1] as any;
  expect(c1.out - c1.in).toBeLessThan(2.7);
  await store(win, 'undo');
  // переход на первом стыке — значок виден и без мыши
  await win.evaluate((id) => { const k = (window as any).__kadro; k.useStore.getState().commit((p: any) => k.timeline.setTransition(p, id, { type: 'fade', duration: 0.5 })); }, ids[0]);
  await win.mouse.move(5, 5);
  await expect(win.getByTestId('junction')).toHaveCount(1);
  await expect(win.locator('.junction.has')).toHaveCount(1);
});

test('формат кадра: меню под плеером, «как у видео», клипы — заполнить кадр', async () => {
  await store(win, 'select', []);
  await win.getByTestId('aspect').click();
  await expect(win.getByTestId('format-pop')).toBeVisible();
  await win.getByTestId('fmt-9-16').click();
  let p = await project(win);
  expect([p.settings.aspect, p.settings.width, p.settings.height]).toEqual(['9:16', 1080, 1920]);
  await expect(win.getByTestId('aspect')).toContainText('9:16');
  // видео 640×360 → «как у видео» = 16:9
  await expect(win.getByTestId('aspect-original')).toContainText('16:9');
  await win.getByTestId('aspect-original').click();
  expect((await project(win)).settings.aspect).toBe('16:9');
  await win.getByTestId('fmt-1-1').click();
  await win.getByTestId('format-pop').getByRole('button', { name: 'Заполнить кадр' }).click();
  p = await project(win);
  expect(p.tracks[0].clips.every((c: any) => c.fit === 'cover')).toBe(true);
  await win.getByTestId('format-pop').getByRole('button', { name: 'Размытие' }).click();
  expect((await project(win)).settings.background).toBe('blur');
  // одна отмена — одно действие
  await store(win, 'undo');
  expect((await project(win)).settings.background).toBe('black');
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('format-pop')).toHaveCount(0);
  // щелчок мимо тоже закрывает
  await win.getByTestId('aspect').click();
  await win.getByTestId('timecode').click();
  await expect(win.getByTestId('format-pop')).toHaveCount(0);
});

test('музыка: по умолчанию — с начала ролика, выделена и видна на таймлайне', async () => {
  await store(win, 'setPlayhead', 4);
  await win.getByTestId('tab-audio').click();
  await win.getByTestId('import-btn').click();
  await expect.poll(async () => (await audioClips()).length).toBe(1);
  const [a] = await audioClips();
  expect(a.start).toBe(0);
  expect(await state<string[]>(win, '(s) => s.selection')).toEqual([a.id]);
  await expect(win.locator(`[data-clip="${a.id}"]`)).toBeInViewport();
});

test('музыка: «к курсору» и «только в список»', async () => {
  await win.getByRole('button', { name: 'К курсору', exact: true }).click();
  expect(await state<string>(win, '(s) => s.audioPlace')).toBe('cursor');
  await store(win, 'setPlayhead', 2);
  await win.getByTestId('import-btn').click();
  await expect.poll(async () => (await audioClips()).length).toBe(2);
  const sel = await state<string[]>(win, '(s) => s.selection');
  expect((await audioClips()).find((c) => c.id === sel[0])!.start).toBeCloseTo(2, 3);
  await win.getByRole('button', { name: 'Только в список', exact: true }).click();
  const before = (await project(win)).assets.length;
  await win.getByTestId('import-btn').click();
  await expect.poll(async () => (await project(win)).assets.length).toBe(before + 1);
  expect(await audioClips()).toHaveLength(2);
  await win.getByRole('button', { name: 'С начала', exact: true }).click();
});

test('меню файла: найти на таймлайне, на таймлайн с начала, убрать', async () => {
  const rows = win.getByTestId('audio-row');
  await expect(rows).toHaveCount(3);
  // последний (только в списке) — «Найти» недоступно
  await rows.nth(2).click({ button: 'right' });
  await expect(win.getByTestId('ctx-menu')).toBeVisible();
  await expect(win.getByTestId('menu-find')).toBeDisabled();
  await win.getByTestId('menu-start').click();
  await expect(win.getByTestId('ctx-menu')).toHaveCount(0);
  expect(await audioClips()).toHaveLength(3);
  // «Найти на таймлайне» у первого — выделяет его клип и ставит курсор
  await store(win, 'select', []);
  await store(win, 'setPlayhead', 5);
  const firstAsset = (await project(win)).assets.filter((x) => x.kind === 'audio')[0].id;
  await rows.nth(0).getByTestId('audio-more').click();
  await win.getByTestId('menu-find').click();
  const found = (await audioClips()).filter((c: any) => c.assetId === firstAsset);
  expect((await state<string[]>(win, '(s) => s.selection')).sort()).toEqual(found.map((c) => c.id).sort());
  expect(await state<number>(win, '(s) => s.playhead')).toBeCloseTo(found[0].start, 3);
  // меню видео в медиатеке: «В конец ролика»
  await win.getByTestId('tab-media').click();
  const n = (await project(win)).tracks[0].clips.length;
  await win.getByTestId('media-item').first().click({ button: 'right' });
  await win.getByTestId('menu-end').click();
  const main = (await project(win)).tracks[0].clips;
  expect(main).toHaveLength(n + 1);
  expect(await state<string[]>(win, '(s) => s.selection')).toEqual([main[main.length - 1].id]);
  // Esc закрывает меню
  await win.getByTestId('media-item').first().click({ button: 'right' });
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('ctx-menu')).toHaveCount(0);
});

test('разрешение и частота проекта: в меню формата, сохраняются при смене формата, по умолчанию в экспорте', async () => {
  await store(win, 'select', []);
  await win.getByTestId('aspect').click();
  const pop = win.getByTestId('format-pop');
  await pop.getByTestId('fmt-9-16').click();
  await pop.getByRole('button', { name: '720p', exact: true }).click();
  let s = (await project(win)).settings;
  expect([s.width, s.height]).toEqual([720, 1280]);
  await expect(win.getByTestId('aspect')).toContainText('720p');
  // другой формат — то же разрешение по короткой стороне
  await pop.getByTestId('fmt-16-9').click();
  s = (await project(win)).settings;
  expect([s.aspect, s.width, s.height]).toEqual(['16:9', 1280, 720]);
  await pop.getByRole('button', { name: '4K', exact: true }).click();
  await pop.getByRole('button', { name: '25', exact: true }).click();
  s = (await project(win)).settings;
  expect([s.width, s.height, s.fps]).toEqual([3840, 2160, 25]);
  await win.keyboard.press('Escape');
  // окно экспорта открывается с разрешением и частотой проекта
  await store(win, 'setExportOpen', true);
  const dlg = win.getByTestId('export-dialog');
  await expect(dlg).toContainText('3840×2160');
  await expect(dlg.getByRole('button', { name: '4K', exact: true })).toHaveClass(/active/);
  await expect(dlg.getByRole('button', { name: '25', exact: true })).toHaveClass(/active/);
  await win.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await store(win, 'undo'); await store(win, 'undo'); await store(win, 'undo'); await store(win, 'undo'); await store(win, 'undo');
});

test('качество превью: холст плеера меньше, выбор запоминается', async () => {
  const size = () => win.evaluate(() => { const e = (window as any).__kadroEngine; return e.W * e.H; });
  await win.getByTestId('preview-quality').selectOption('high');
  await expect.poll(size).toBeGreaterThan(0);
  const hi = await size();
  await win.getByTestId('preview-quality').selectOption('low');
  await expect.poll(size).toBeLessThan(hi * 0.5);
  expect(await state<string>(win, '(s) => s.previewQuality')).toBe('low');
  expect(await win.evaluate(() => localStorage.getItem('kadro.previewQuality'))).toContain('low');
  await win.getByTestId('preview-quality').selectOption('high');
  await expect.poll(size).toBe(hi);
});
