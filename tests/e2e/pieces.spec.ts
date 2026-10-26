// «Взять кусок»: из видео на таймлайн — только отмеченный кусок; выбор нескольких файлов в «Медиа».
import { expect, test, type Page } from '@playwright/test';
import { act, colorsVideo, ff, launch, media, project, reset, solidVideo, state, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);
test.beforeAll(async () => { K = await launch(); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

const mainClips = async () => (await project(win)).tracks[0].clips as any[];
const videoTime = () => win.getByTestId('source-video').evaluate((v: HTMLVideoElement) => v.currentTime);

test('ножницы у видео → окно, отметки I и O, на таймлайн — только кусок', async () => {
  await reset(win);
  const [id] = await act(win, 'importPaths', [colorsVideo()]); // 4 с: красный, зелёный, синий, жёлтый
  await store(win, 'setLeftTab', 'media');
  await win.getByTestId('media-item').first().hover();
  await win.getByTestId('media-piece').click();
  const dlg = win.getByTestId('source-view');
  await expect(dlg).toBeVisible();
  await expect(win.getByTestId('source-len')).toHaveText('Весь файл');
  await expect.poll(() => win.getByTestId('source-video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(1);
  // щелчок по полосе на 25% → курсор на 1 с, I — начало
  const bar = (await win.getByTestId('source-bar').boundingBox())!;
  await win.mouse.click(bar.x + bar.width * 0.25, bar.y + bar.height / 2);
  await expect.poll(videoTime).toBeCloseTo(1, 1);
  await win.keyboard.press('i');
  // стрелками на 1,5 с вперёд (Shift — секунда, без — кадр)
  await win.keyboard.press('Shift+ArrowRight');
  for (let i = 0; i < 15; i++) await win.keyboard.press('ArrowRight');
  await expect.poll(videoTime).toBeCloseTo(2.5, 1);
  await win.keyboard.press('o');
  await expect(win.getByTestId('source-len')).toContainText('1,5 с');
  // пробел играет кусок, а не таймлайн
  await win.keyboard.press('Space');
  expect(await state<boolean>(win, '(s) => s.playing')).toBe(false);
  await win.keyboard.press('Space');
  // Enter — на таймлайн; окно остаётся
  await win.keyboard.press('Enter');
  await expect.poll(async () => (await mainClips()).length).toBe(1);
  let c = (await mainClips())[0];
  expect(c.assetId).toBe(id);
  expect(c.in).toBeCloseTo(1, 1);
  expect(c.out).toBeCloseTo(2.5, 1);
  await expect(dlg).toBeVisible();
  await expect(win.getByTestId('source-added')).toContainText('1');
  // второй кусок — тянем край «начало» в самое начало и кладём в конец
  const hIn = (await win.getByTestId('source-in').boundingBox())!;
  await win.mouse.move(hIn.x + hIn.width / 2, hIn.y + hIn.height / 2);
  await win.mouse.down();
  await win.mouse.move(bar.x - 20, hIn.y + hIn.height / 2, { steps: 5 });
  await win.mouse.up();
  await win.getByTestId('source-add-end').click();
  await expect.poll(async () => (await mainClips()).length).toBe(2);
  c = (await mainClips())[1];
  expect(c.in).toBe(0);
  expect(c.out).toBeCloseTo(2.5, 1);
  // «Поверх» — на дорожку наложений тем же куском
  await win.getByTestId('source-add-overlay').click();
  const ov = (await project(win)).tracks.filter((t) => t.kind === 'video').flatMap((t) => t.clips) as any[];
  expect(ov).toHaveLength(1);
  expect(ov[0].out - ov[0].in).toBeCloseTo(2.5, 1);
  await win.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  // меню файла: «Взять кусок…»
  await win.getByTestId('media-item').first().click({ button: 'right' });
  await win.getByTestId('menu-piece').click();
  await expect(dlg).toBeVisible();
  await win.keyboard.press('Escape');
});

test('несколько файлов в «Медиа»: Ctrl и Shift, «На таймлайн» по порядку', async () => {
  await reset(win);
  const files = [solidVideo('red3.mp4', 'red', 3), solidVideo('blue3.mp4', 'blue', 3), solidVideo('green3.mp4', 'green', 3),
    media('beep2.m4a', (f) => ff(['-f', 'lavfi', '-i', 'sine=frequency=880:duration=2', '-c:a', 'aac', f]))];
  const ids: string[] = await act(win, 'importPaths', files);
  const items = win.getByTestId('media-item');
  await expect(items).toHaveCount(4);
  await items.nth(0).click();
  await items.nth(2).click({ modifiers: ['Shift'] });
  await expect(win.getByTestId('media-bar')).toContainText('Выбрано: 3');
  await items.nth(1).click({ modifiers: ['Control'] });
  await expect(win.getByTestId('media-bar')).toContainText('Выбрано: 2');
  await items.nth(3).click({ modifiers: ['Control'] });
  await store(win, 'setPlayhead', 0);
  await win.getByTestId('media-place').click();
  await expect(win.getByTestId('media-bar')).toHaveCount(0);
  const p = await project(win);
  expect(p.tracks[0].clips.map((c: any) => c.assetId)).toEqual([ids[0], ids[2]]);
  const audio = p.tracks.filter((t) => t.kind === 'audio').flatMap((t) => t.clips) as any[];
  expect(audio.map((c) => c.assetId)).toEqual([ids[3]]);
  expect((await state<string[]>(win, '(s) => s.selection')).length).toBe(3);
  // щелчок по выбранному одиночному — снять выбор
  await items.nth(1).click();
  await expect(win.getByTestId('media-bar')).toContainText('Выбрано: 1');
  await items.nth(1).click();
  await expect(win.getByTestId('media-bar')).toHaveCount(0);
});
