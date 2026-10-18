// Сквозные тесты: настоящее окно Kadro, мышь и клавиатура, плеер и экспорт через интерфейс.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { applyColorToPixel, effectiveColor } from '../../src/shared/color';
import { DEFAULT_COLOR } from '../../src/shared/defaults';
import {
  beatMp3, greenVideo, shakyVideo, walkVideo, RGB, act, clipIds, colorsVideo, frameDiff, grayImage, importAt, launch, MEDIA, near, personVideo, PHRASES, previewPixel, probe,
  project, rawFrame, reset, rotatedVideo, seekAndSettle, setSlider, solidVideo, state, store, talkVideo, toneMp3, waitAssetsReady, type Kadro,
} from './kadro';

let K: Kadro;
let win: Page;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  colorsVideo(); grayImage(); rotatedVideo(); toneMp3(); solidVideo('red3.mp4', 'red', 3); solidVideo('blue3.mp4', 'blue', 3);
  K = await launch({ env: { KADRO_TEST_EXPORT: path.join(MEDIA, 'out.mp4') } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => {
  expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]);
});

/** Где в кадре проекта окажется точка (u, v) исходника при вписывании целиком. */
function mapContain(PW: number, PH: number, aw: number, ah: number, u: number, v: number): [number, number] {
  const k = Math.min(PW / aw, PH / ah);
  const w = aw * k;
  const h = ah * k;
  return [((PW - w) / 2 + u * w) / PW, ((PH - h) / 2 + v * h) / PH];
}

async function clipBox(id: string) {
  const b = await win.locator(`[data-clip="${id}"]`).first().boundingBox();
  if (!b) throw new Error(`клип ${id} не виден на таймлайне`);
  return b;
}

async function drag(x0: number, y0: number, x1: number, y1: number) {
  await win.mouse.move(x0, y0);
  await win.mouse.down();
  await win.mouse.move(x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, { steps: 4 });
  await win.mouse.move(x1, y1, { steps: 8 });
  await win.mouse.up();
}

async function commit(fnSrc: string, ...args: unknown[]) {
  await win.evaluate(([src, a]) => {
    const k = (window as any).__kadro;
    // eslint-disable-next-line no-new-func
    const fn = new Function('tl', 'p', 'args', `return (${src})(tl, p, args)`);
    k.useStore.getState().commit((p: unknown) => fn(k.timeline, p, a));
  }, [fnSrc, args] as const);
}

test('окно запускается без ошибок и показывает пустой проект', async () => {
  await expect(win.getByText('Начни с видео')).toBeVisible();
  await expect(win.getByTestId('timecode')).toHaveText('00:00:00:00 / 00:00:00:00');
  const title = await K.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle());
  expect(title).toContain('Kadro');
});

test('импорт: файл встаёт на основную дорожку, готовятся миниатюры и волна', async () => {
  await reset(win);
  await importAt(win, [colorsVideo()]);
  await waitAssetsReady(win);
  const p = await project(win);
  expect(p.assets).toHaveLength(1);
  expect(p.assets[0].duration).toBeCloseTo(4, 1);
  expect(p.tracks[0].clips).toHaveLength(1);
  await expect(win.getByTestId('media-item')).toHaveCount(1);
  await expect(win.getByTestId('timecode')).toHaveText('00:00:00:00 / 00:00:04:00');
});

test('плеер показывает нужный кусок исходника', async () => {
  for (const [t, c] of [[0.5, 'red'], [1.5, 'lime'], [2.5, 'blue'], [3.5, 'yellow']] as const) {
    await seekAndSettle(win, t);
    await expect.poll(async () => near(await previewPixel(win, 0.5, 0.5), RGB[c], 40), { message: `кадр на ${t} с ≈ ${c}` }).toBe(true);
  }
});

test('разрезание мышью и клавишей S, удаление Delete, отмена и повтор', async () => {
  const [id] = await clipIds(win, 'main');
  await seekAndSettle(win, 1.0);
  const b = await clipBox(id);
  await win.mouse.click(b.x + 20, b.y + b.height / 2);
  expect(await state(win, 's => s.selection')).toEqual([id]);
  await win.getByTestId('split').click();
  let ids = await clipIds(win, 'main');
  expect(ids).toHaveLength(2);
  // курсор на 3 с, клавиша S режет выделенный правый кусок
  await seekAndSettle(win, 3.0);
  await win.keyboard.press('s');
  ids = await clipIds(win, 'main');
  expect(ids).toHaveLength(3);
  // удаляем средний (1..3 с)
  const mid = ids[1];
  const mb = await clipBox(mid);
  await win.mouse.click(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await win.keyboard.press('Delete');
  let p = await project(win);
  expect(p.tracks[0].clips).toHaveLength(2);
  await seekAndSettle(win, 1.5);
  expect(near(await previewPixel(win, 0.5, 0.5), RGB.yellow, 40)).toBe(true); // после склейки на 1.5 с — 3.5 с исходника
  await win.keyboard.press('Control+z');
  p = await project(win);
  expect(p.tracks[0].clips).toHaveLength(3);
  await win.keyboard.press('Control+y');
  p = await project(win);
  expect(p.tracks[0].clips).toHaveLength(2);
  await win.getByTestId('undo').click();
  await win.getByTestId('undo').click();
  await win.getByTestId('undo').click();
  p = await project(win);
  expect(p.tracks[0].clips).toHaveLength(1);
});

test('обрезка края мышью с привязкой к кадрам', async () => {
  const [id] = await clipIds(win, 'main');
  const pps: number = await state(win, 's => s.pxPerSec');
  const b = await clipBox(id);
  const y = b.y + b.height / 2;
  // правый край — на 1 с влево
  await drag(b.x + b.width - 3, y, b.x + b.width - 3 - pps * 1.0, y);
  let p = await project(win);
  let c = p.tracks[0].clips[0] as any;
  expect(c.out - c.in).toBeGreaterThan(2.9);
  expect(c.out - c.in).toBeLessThan(3.1);
  expect(Math.abs(c.out * 30 - Math.round(c.out * 30))).toBeLessThan(1e-6);
  // левый край — на 0.5 с вправо: начало остаётся на 0, in сдвигается
  const b2 = await clipBox(id);
  await drag(b2.x + 3, y, b2.x + 3 + pps * 0.5, y);
  p = await project(win);
  c = p.tracks[0].clips[0];
  expect(c.start).toBe(0);
  expect(c.in).toBeGreaterThan(0.4);
  expect(c.in).toBeLessThan(0.6);
  await seekAndSettle(win, 0.6); // ≈1.1 с исходника — зелёный
  expect(near(await previewPixel(win, 0.5, 0.5), RGB.lime, 40)).toBe(true);
  await win.keyboard.press('Control+z');
  await win.keyboard.press('Control+z');
});

test('скорость из инспектора меняет длину и кадр', async () => {
  const [id] = await clipIds(win, 'main');
  await store(win, 'select', [id]);
  await win.getByTestId('itab-speed').click();
  await win.getByRole('button', { name: '2×', exact: true }).click();
  const p = await project(win);
  expect((p.tracks[0].clips[0] as any).speed).toBe(2);
  await expect(win.getByTestId('timecode')).toHaveText(/\/ 00:00:02:00/);
  await seekAndSettle(win, 1.25); // 2.5 с исходника — синий
  expect(near(await previewPixel(win, 0.5, 0.5), RGB.blue, 40)).toBe(true);
  await win.getByRole('button', { name: '1×', exact: true }).click();
});

test('наложение: перетаскивание по таймлайну и в окне просмотра', async () => {
  const [assetId] = await act(win, 'importPaths', [grayImage()]);
  await seekAndSettle(win, 0.5);
  await act(win, 'addAssetToTimeline', assetId, 'overlay', 0.5);
  const [ov] = await clipIds(win, 'video');
  expect(ov).toBeTruthy();
  const pps: number = await state(win, 's => s.pxPerSec');
  const b = await clipBox(ov);
  await drag(b.x + b.width / 2, b.y + b.height / 2, b.x + b.width / 2 + pps * 1.0, b.y + b.height / 2);
  let p = await project(win);
  const c = p.tracks.find((t) => t.kind === 'video')!.clips[0];
  expect(c.start).toBeGreaterThan(1.3);
  expect(c.start).toBeLessThan(1.7);
  // двигаем картинку в кадре
  await seekAndSettle(win, c.start + 0.5);
  await store(win, 'select', [ov]);
  const box = await win.getByTestId('sel-box').boundingBox();
  const wrap = await win.locator('.canvas-wrap').boundingBox();
  expect(box && wrap).toBeTruthy();
  await drag(box!.x + box!.width / 2, box!.y + box!.height / 2, box!.x + box!.width / 2 + 40, box!.y + box!.height / 2 + 60);
  p = await project(win);
  const m = p.tracks.find((t) => t.kind === 'video')!.clips[0] as any;
  expect(m.transform.x).toBeCloseTo(40 / wrap!.width, 2);
  expect(m.transform.y).toBeCloseTo(60 / wrap!.height, 2);
  // угол рамки — увеличение
  const box2 = (await win.getByTestId('sel-box').boundingBox())!;
  const cx = box2.x + box2.width / 2;
  const cy = box2.y + box2.height / 2;
  await drag(box2.x + box2.width + 1, box2.y + box2.height + 1, cx + (box2.width / 2 + 1) * 1.5, cy + (box2.height / 2 + 1) * 1.5);
  p = await project(win);
  expect((p.tracks.find((t) => t.kind === 'video')!.clips[0] as any).transform.scale).toBeCloseTo(0.9, 1);
  await store(win, 'select', [ov]);
  await win.keyboard.press('Delete');
});

test('перестановка клипов основной дорожки и переход', async () => {
  await reset(win);
  await importAt(win, [solidVideo('red3.mp4', 'red', 3), solidVideo('blue3.mp4', 'blue', 3)]);
  let ids = await clipIds(win, 'main');
  expect(ids).toHaveLength(2);
  const a = await clipBox(ids[0]);
  const bb = await clipBox(ids[1]);
  await drag(a.x + a.width / 2, a.y + a.height / 2, bb.x + bb.width - 5, a.y + a.height / 2);
  expect(await clipIds(win, 'main')).toEqual([ids[1], ids[0]]);
  await win.keyboard.press('Control+z');
  ids = await clipIds(win, 'main');
  // переход: кнопка на стыке → «Растворение» → длительность 1 с
  await win.getByTestId('junction').first().click();
  await win.getByTestId('tr-fade').click();
  await commit('(tl, p, a) => tl.setTransition(p, a[0], { type: "fade", duration: 1 })', ids[0]);
  const p = await project(win);
  expect((p.tracks[0].clips[0] as any).transitionOut).toEqual({ type: 'fade', duration: 1 });
  expect(p.tracks[0].clips[1].start).toBeCloseTo(2, 5);
  await seekAndSettle(win, 2.5);
  const px = await previewPixel(win, 0.5, 0.5);
  expect(near(px, [128, 0, 128], 22), `середина перехода ${px}`).toBe(true);
});

test('цветокоррекция в плеере совпадает с расчётом', async () => {
  await reset(win);
  await importAt(win, [grayImage()]);
  const [id] = await clipIds(win, 'main');
  const color = { ...DEFAULT_COLOR, brightness: 1.15, contrast: 1.25, saturation: 0.6, warmth: 0.4 };
  await commit('(tl, p, a) => tl.updateClip(p, a[0], { color: a[1] })', id, color);
  await seekAndSettle(win, 0.5);
  const expected = applyColorToPixel([0x8a, 0x6f, 0x5a], effectiveColor(color));
  let got: number[] = [];
  await expect.poll(async () => near(got = await previewPixel(win, 0.5, 0.5), expected, 3), { message: `ожидалось ${expected}` }).toBe(true)
    .catch((e) => { throw new Error(`${e.message}\nполучено ${got}`); });
  // пресет «Ч/б» через панель фильтров
  await store(win, 'select', [id]);
  await win.getByTestId('tab-filters').click();
  await win.getByTestId('filter-bw').click();
  const p = await project(win);
  const exp2 = applyColorToPixel([0x8a, 0x6f, 0x5a], effectiveColor((p.tracks[0].clips[0] as any).color));
  await expect.poll(async () => near(await previewPixel(win, 0.5, 0.5), exp2, 3), { message: `ч/б: ожидалось ${exp2}` }).toBe(true);
});

test('повёрнутое видео с телефона: плеер и экспорт показывают одинаково', async () => {
  await reset(win);
  await importAt(win, [rotatedVideo()]);
  const p = await project(win);
  expect([p.assets[0].width, p.assets[0].height]).toEqual([240, 320]);
  await seekAndSettle(win, 0.5);
  const top = await previewPixel(win, ...mapContain(1080, 1920, 240, 320, 0.5, 0.2));
  const bottom = await previewPixel(win, ...mapContain(1080, 1920, 240, 320, 0.5, 0.8));
  expect(near(top, bottom, 60)).toBe(false);
  // экспорт и сравнение тех же точек
  const out = await exportViaUi('720p');
  const W = 720; const H = 1280;
  const frame = rawFrame(['-ss', '0.5', '-i', out], W, H);
  const at = (fx: number, fy: number) => { const i = (Math.round(fy * H) * W + Math.round(fx * W)) * 3; return [frame[i], frame[i + 1], frame[i + 2]]; };
  expect(near(at(...mapContain(1080, 1920, 240, 320, 0.5, 0.2)), top, 30)).toBe(true);
  expect(near(at(...mapContain(1080, 1920, 240, 320, 0.5, 0.8)), bottom, 30)).toBe(true);
});

async function exportViaUi(res: '720p' | '1080p'): Promise<string> {
  const out = path.join(MEDIA, 'out.mp4');
  fs.rmSync(out, { force: true });
  await win.getByTestId('export-open').click();
  await win.getByRole('button', { name: res, exact: true }).click();
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-show')).toBeVisible({ timeout: 180_000 });
  await win.getByRole('button', { name: 'Закрыть' }).last().click();
  expect(fs.existsSync(out)).toBe(true);
  return out;
}

test('воспроизведение идёт в реальном времени и видео не отстаёт', async () => {
  await reset(win);
  await importAt(win, [colorsVideo()]);
  await seekAndSettle(win, 0);
  await win.getByTestId('play').click();
  await win.waitForTimeout(1600);
  const r = await win.evaluate(() => {
    const e = (window as any).__kadroEngine;
    const v = [...e.media.values()].find((x: any) => x.kind === 'video').el as HTMLVideoElement;
    return { t: e.time, v: v.currentTime, paused: v.paused };
  });
  await win.getByTestId('play').click();
  expect(r.paused).toBe(false);
  expect(r.t).toBeGreaterThan(1.3);
  expect(r.t).toBeLessThan(2.0);
  expect(Math.abs(r.v - r.t)).toBeLessThan(0.15);
  expect(await state(win, 's => s.playing')).toBe(false);
});

test('экспорт через окно: кадр в файле совпадает с плеером (видео, наложение, текст, фильтр, музыка)', async () => {
  await reset(win);
  await importAt(win, [colorsVideo()]);
  const [asset2] = await act(win, 'importPaths', [grayImage()]);
  await act(win, 'addAssetToTimeline', asset2, 'overlay', 1.0);
  const [music] = await act(win, 'importPaths', [toneMp3()]);
  await act(win, 'addAssetToTimeline', music, 'auto', 0);
  await win.getByTestId('tab-text').click();
  await seekAndSettle(win, 2.0);
  await win.getByTestId('add-text').click();
  await win.getByTestId('text-input').fill('Привет, Kadro!');
  const [main] = await clipIds(win, 'main');
  await commit('(tl, p, a) => tl.updateClip(p, a[0], { color: { ...tl.findClip(p, a[0]).clip.color, preset: "warm" } })', main);
  await waitAssetsReady(win);
  await win.evaluate(() => document.fonts.ready);
  await seekAndSettle(win, 2.5);
  await win.waitForTimeout(500);
  const snap: string = await win.evaluate(() => (window as any).__kadroEngine.snapshot());
  const png = path.join(MEDIA, 'preview.png');
  fs.writeFileSync(png, Buffer.from(snap.split(',')[1], 'base64'));
  const out = await exportViaUi('720p');
  const info = probe(out);
  expect(info.width).toBe(720);
  expect(info.height).toBe(1280);
  expect(info.hasAudio).toBe(true);
  expect(info.duration).toBeGreaterThan(5.9);
  expect(info.duration).toBeLessThan(6.2);
  const a = rawFrame(['-i', png], 180, 320);
  const b = rawFrame(['-ss', '2.5', '-i', out], 180, 320);
  const d = frameDiff(a, b);
  expect(d.mean, `средняя разница ${d.mean.toFixed(2)}, p98 ${d.p98.toFixed(1)}`).toBeLessThan(4);
  expect(d.p98).toBeLessThan(30);
});

test('отмена экспорта не оставляет файла', async () => {
  const out = path.join(MEDIA, 'out.mp4');
  fs.rmSync(out, { force: true });
  await win.getByTestId('export-open').click();
  await win.getByRole('button', { name: '4K', exact: true }).click();
  await win.getByRole('button', { name: 'Процессор' }).click();
  await win.getByTestId('export-start').click();
  await win.waitForTimeout(1500);
  await win.getByTestId('export-cancel').click();
  await expect(win.getByText('Экспорт остановлен')).toBeVisible({ timeout: 30_000 });
  expect(fs.existsSync(out)).toBe(false);
  expect(fs.readdirSync(MEDIA).filter((f) => f.includes('kadro-part'))).toEqual([]);
  await win.getByRole('button', { name: 'Закрыть' }).last().click();
});

async function parity(t: number, label: string, maxMean = 4) {
  await seekAndSettle(win, t);
  await win.evaluate(() => document.fonts.ready);
  await win.waitForTimeout(300);
  const snap: string = await win.evaluate(() => (window as any).__kadroEngine.snapshot());
  const png = path.join(MEDIA, `prev_${label}.png`);
  fs.writeFileSync(png, Buffer.from(snap.split(',')[1], 'base64'));
  return png;
}
function compareAt(png: string, out: string, t: number, maxMean = 4) {
  const a = rawFrame(['-i', png], 180, 320);
  const b = rawFrame(['-ss', String(t), '-i', out], 180, 320);
  const d = frameDiff(a, b);
  expect(d.mean, `${png}: средняя разница ${d.mean.toFixed(2)}, p98 ${d.p98.toFixed(1)}`).toBeLessThan(maxMean);
  expect(d.p98).toBeLessThan(40);
}

test('ключевые кадры: ромбик и перетаскивание в превью, экспорт совпадает с плеером', async () => {
  await reset(win);
  await importAt(win, [colorsVideo()]);
  const [img] = await act(win, 'importPaths', [grayImage()]);
  await act(win, 'addAssetToTimeline', img, 'overlay', 0);
  const [ov] = await clipIds(win, 'video');
  await store(win, 'select', [ov]);
  await seekAndSettle(win, 0.5);
  await win.getByTestId('itab-basic').click();
  await win.getByTestId('key-x').click();
  await win.getByTestId('key-scale').click();
  let c = (await project(win)).tracks.find((t) => t.kind === 'video')!.clips[0] as any;
  expect(c.keyframes.x).toHaveLength(1);
  // на 2.5 с тянем картинку вправо и увеличиваем — ставятся новые ключи
  await seekAndSettle(win, 2.5);
  const box = (await win.getByTestId('sel-box').boundingBox())!;
  await drag(box.x + box.width / 2, box.y + box.height / 2, box.x + box.width / 2 + 70, box.y + box.height / 2 - 40);
  const b2 = (await win.getByTestId('sel-box').boundingBox())!;
  await drag(b2.x + b2.width + 1, b2.y + b2.height + 1, b2.x + b2.width * 1.3, b2.y + b2.height * 1.3);
  c = (await project(win)).tracks.find((t) => t.kind === 'video')!.clips[0] as any;
  expect(c.keyframes.x).toHaveLength(2);
  expect(c.keyframes.y).toBeUndefined(); // y не анимировали — поменялось обычное значение
  expect(c.keyframes.scale).toHaveLength(2);
  expect(c.keyframes.scale[1].v).toBeGreaterThan(c.keyframes.scale[0].v);
  await expect(win.locator(`[data-clip="${ov}"] .kf-marks i`)).toHaveCount(2);
  // прозрачность ползунком: без ключей — обычное значение
  const pngs = [await parity(1.5, 'kf15'), await parity(2.9, 'kf29')];
  const out = await exportViaUi('720p');
  compareAt(pngs[0], out, 1.5);
  compareAt(pngs[1], out, 2.9);
});

test('анимация текста и подсветка слов: экспорт совпадает с плеером', async () => {
  await reset(win);
  await importAt(win, [colorsVideo()]);
  await seekAndSettle(win, 0);
  await win.getByTestId('tab-text').click();
  await win.getByTestId('add-text').click();
  await win.getByTestId('itab-text').click();
  await win.getByTestId('text-input').fill('Выскакивающий заголовок');
  await win.getByTestId('itab-anim').click();
  await win.getByTestId('anim-in').selectOption('pop');
  await win.getByTestId('anim-out').selectOption('typewriter');
  // субтитры со словами (как после распознавания) и подсветка «караоке»
  await commit(`(tl, p) => tl.setCaptions(p, [{ start: 1, end: 3, text: 'раз два три четыре', words: [
    { text: 'раз', start: 1, end: 1.4 }, { text: 'два', start: 1.5, end: 1.9 }, { text: 'три', start: 2, end: 2.4 }, { text: 'четыре', start: 2.5, end: 2.9 }] }],
    { ...tl.findClip(p, p.tracks.find((t) => t.kind === 'text').clips[0].id).clip.style, size: 64, strokeWidth: 7, color: '#ffffff' }, 0.72)`);
  await commit(`(tl, p) => tl.styleAllCaptions(p, { highlight: { mode: 'karaoke', color: '#ffe14d' } })`);
  const p = await project(win);
  const cap = p.tracks.flatMap((t) => t.clips).find((c: any) => c.role === 'caption') as any;
  expect(cap.words).toHaveLength(4);
  const pngs = [await parity(0.25, 'pop'), await parity(1.7, 'kar'), await parity(2.75, 'type')];
  const out = await exportViaUi('720p');
  compareAt(pngs[0], out, 0.25);
  compareAt(pngs[1], out, 1.7);
  compareAt(pngs[2], out, 2.75);
});

test('маска, хромакей и режим наложения: плеер и экспорт совпадают', async () => {
  await reset(win);
  await importAt(win, [colorsVideo()]);
  const [green] = await act(win, 'importPaths', [greenVideo()]);
  await act(win, 'addAssetToTimeline', green, 'overlay', 0);
  const [gid] = await clipIds(win, 'video');
  await store(win, 'select', [gid]);
  await seekAndSettle(win, 1.5);
  await win.getByTestId('itab-mask').click();
  await win.getByTestId('chroma-toggle').click();
  await commit('(tl, p, a) => tl.updateClip(p, a[0], { chroma: { color: "#00b140", similarity: 0.12, smoothness: 0.05 } })', gid);
  // серая картинка с маской-кругом и умножением
  const [gray] = await act(win, 'importPaths', [grayImage()]);
  await act(win, 'addAssetToTimeline', gray, 'overlay', 0);
  const ids = await clipIds(win, 'video');
  const gr = ids.find((x) => x !== gid)!;
  await store(win, 'select', [gr]);
  await win.getByTestId('mask-circle').click();
  await win.getByTestId('itab-basic').click();
  await win.getByTestId('blend').selectOption('multiply');
  const c = (await project(win)).tracks.flatMap((t) => t.clips).find((x) => x.id === gr) as any;
  expect(c.mask.shape).toBe('circle');
  expect(c.blend).toBe('multiply');
  await seekAndSettle(win, 1.5);
  // зелёный фон вырезан: в углу видно основное видео (зелёное на 1.5 с)
  const W0 = await win.evaluate(() => (window as any).__kadroEngine.W);
  expect(W0).toBeGreaterThan(100);
  const png = await parity(1.5, 'mask');
  const out = await exportViaUi('720p');
  compareAt(png, out, 1.5, 5);
});

test('видеоэффекты: плитки, сила, экспорт совпадает с плеером', async () => {
  await reset(win);
  await importAt(win, [colorsVideo()]);
  const [main] = await clipIds(win, 'main');
  await store(win, 'select', [main]);
  await win.getByTestId('tab-effects').click();
  for (const t of ['mirror', 'vignette', 'glitch', 'vhs']) await win.getByTestId(`fx-${t}`).click();
  await expect(win.getByTestId('fx-vignette')).toHaveClass(/active/);
  await win.getByTestId('itab-fx').click();
  await setSlider(win, 'fxamt-vignette', 0.9);
  // картинка поверх: тряска, пульс, негатив, размытие
  const [img] = await act(win, 'importPaths', [grayImage()]);
  await act(win, 'addAssetToTimeline', img, 'overlay', 0);
  const [ov] = await clipIds(win, 'video');
  await store(win, 'select', [ov]);
  for (const t of ['shake', 'pulse', 'invert', 'blur']) await win.getByTestId(`fx-${t}`).click();
  // повторное нажатие убирает эффект
  await win.getByTestId('fx-blur').click();
  const p = await project(win);
  const m = p.tracks[0].clips[0] as any;
  const o = p.tracks.find((t) => t.kind === 'video')!.clips[0] as any;
  expect(m.effects.map((e: any) => e.type)).toEqual(['mirror', 'vignette', 'glitch', 'vhs']);
  expect(m.effects[1].amount).toBeCloseTo(0.9, 1);
  expect(o.effects.map((e: any) => e.type)).toEqual(['shake', 'pulse', 'invert']);
  const pngs = [await parity(1.2, 'fx12'), await parity(2.3, 'fx23')];
  const out = await exportViaUi('720p');
  compareAt(pngs[0], out, 1.2, 6);
  compareAt(pngs[1], out, 2.3, 6);
});

test('реверс, кривая скорости и стоп-кадр — через интерфейс, экспорт совпадает', async () => {
  await reset(win);
  await importAt(win, [colorsVideo()]);
  const [id] = await clipIds(win, 'main');
  await store(win, 'select', [id]);
  await win.getByTestId('itab-speed').click();
  // реверс: в начале ролика — последняя секунда исходника (жёлтая)
  await win.getByTestId('reverse').click();
  await win.waitForFunction((cid) => {
    const p = (window as any).__kadro.useStore.getState().project;
    const c = p.tracks[0].clips.find((x: any) => x.id === cid);
    return c?.retime?.reverse && !Object.keys((window as any).__kadro.useStore.getState().jobs).length;
  }, id, { timeout: 60_000 });
  await waitAssetsReady(win);
  let p = await project(win);
  let c = p.tracks[0].clips[0] as any;
  const derived = p.assets.find((a) => a.id === c.assetId)!;
  expect(derived.derived).toBe(true);
  expect(Math.abs(derived.duration - 4)).toBeLessThan(0.05);
  await win.getByTestId('tab-media').click();
  await expect(win.getByTestId('media-item')).toHaveCount(1); // служебная копия в медиатеке не видна
  await seekAndSettle(win, 0.5);
  expect(near(await previewPixel(win, 0.5, 0.5), RGB.yellow, 40)).toBe(true);
  await seekAndSettle(win, 3.5);
  expect(near(await previewPixel(win, 0.5, 0.5), RGB.red, 40)).toBe(true);
  // кривая «Пуля» поверх реверса
  await store(win, 'select', [id]);
  await win.getByTestId('itab-speed').click();
  await win.getByTestId('ramp-bullet').click();
  await win.waitForFunction((cid) => {
    const s = (window as any).__kadro.useStore.getState();
    const c = s.project.tracks[0].clips.find((x: any) => x.id === cid);
    return c?.retime?.preset === 'bullet' && !Object.keys(s.jobs).length;
  }, id, { timeout: 60_000 });
  await waitAssetsReady(win);
  p = await project(win);
  c = p.tracks[0].clips[0] as any;
  expect(c.retime.reverse).toBe(true);
  const dur = c.out - c.in;
  expect(dur).toBeGreaterThan(1.5); // быстро—медленно—быстро: в сумме короче исходных 4 с
  expect(dur).toBeLessThan(3);
  expect(p.assets.filter((a) => a.derived)).toHaveLength(1); // старая копия убрана
  await expect(win.getByTestId('ramp-editor')).toBeVisible();
  // стоп-кадр в середине
  const mid = Math.round((dur / 2) * 30) / 30;
  await seekAndSettle(win, mid);
  const before = await previewPixel(win, 0.5, 0.5);
  await win.getByTestId('tl-freeze').click();
  await win.waitForFunction(() => (window as any).__kadro.useStore.getState().project.tracks[0].clips.length === 3, undefined, { timeout: 30_000 });
  await waitAssetsReady(win);
  p = await project(win);
  const kinds = p.tracks[0].clips.map((x: any) => p.assets.find((a) => a.id === x.assetId)!.kind);
  expect(kinds).toEqual(['video', 'image', 'video']);
  expect((p.tracks[0].clips[1] as any).start).toBeCloseTo(mid, 3);
  await seekAndSettle(win, mid + 1);
  expect(near(await previewPixel(win, 0.5, 0.5), before, 30)).toBe(true);
  const pngs = [await parity(0.4, 'rt04'), await parity(mid + 1, 'rtfz'), await parity(mid + 2.6, 'rt_after')];
  const out = await exportViaUi('720p');
  compareAt(pngs[0], out, 0.4);
  compareAt(pngs[1], out, mid + 1);
  compareAt(pngs[2], out, mid + 2.6);
  // убрать кривую и реверс — клип снова из исходника
  await store(win, 'select', [id]);
  await win.getByTestId('itab-speed').click();
  await win.getByTestId('ramp-none').click();
  await win.waitForFunction((cid) => !(window as any).__kadro.useStore.getState().project.tracks[0].clips.find((x: any) => x.id === cid)?.retime?.ramp, id, { timeout: 60_000 });
  await win.getByTestId('reverse').click();
  await win.waitForFunction((cid) => !(window as any).__kadro.useStore.getState().project.tracks[0].clips.find((x: any) => x.id === cid)?.retime, id, { timeout: 60_000 });
  p = await project(win);
  c = p.tracks[0].clips.find((x: any) => x.id === id) as any;
  expect(p.assets.find((a) => a.id === c.assetId)!.derived).toBeFalsy();
});

test('запись голоса с микрофона: от курсора, на аудиодорожку', async () => {
  await reset(win);
  await importAt(win, [colorsVideo()]);
  await seekAndSettle(win, 1);
  await win.getByTestId('tab-audio').click();
  await win.getByTestId('rec-start').click();
  await expect(win.getByTestId('rec-chip')).toBeVisible();
  expect(await state(win, '(s) => s.playing')).toBe(true); // таймлайн играет во время записи
  await win.waitForTimeout(2200);
  await win.getByTestId('rec-stop').click();
  await win.waitForFunction(() => (window as any).__kadro.useStore.getState().project.tracks.some((t: any) => t.kind === 'audio' && t.clips.length), undefined, { timeout: 30_000 });
  await waitAssetsReady(win);
  const p = await project(win);
  const tr = p.tracks.find((t) => t.kind === 'audio')!;
  const c = tr.clips[0] as any;
  const a = p.assets.find((x) => x.id === c.assetId)!;
  expect(a.name).toBe('Голос 1');
  expect(a.path.endsWith('.flac')).toBe(true);
  expect(Math.abs(c.start - 1)).toBeLessThan(0.05);
  expect(a.duration).toBeGreaterThan(1.6);
  expect(a.duration).toBeLessThan(3.5);
  expect(probe(a.path).hasAudio).toBe(true);
  // тестовый микрофон Chromium пищит раз в секунду — запись не тишина
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', a.path, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const max = Number(/max_volume:\s*(-?[\d.]+)/.exec(r.stderr)?.[1] ?? -99);
  expect(max).toBeGreaterThan(-40);
  await expect(win.getByTestId('rec-chip')).toHaveCount(0);
  // отмена ничего не добавляет
  await win.getByTestId('rec-start').click();
  await win.waitForTimeout(500);
  await win.getByTestId('rec-cancel').click();
  expect((await project(win)).tracks.filter((t) => t.kind === 'audio').flatMap((t) => t.clips)).toHaveLength(1);
});

test('голос, озвучка, ритм — через интерфейс', async () => {
  await reset(win);
  await importAt(win, [talkVideo()]);
  const [id] = await clipIds(win, 'main');
  await store(win, 'select', [id]);
  await win.getByTestId('tab-ai').click();
  await win.locator('aside.panel').getByTestId('voice-chipmunk').click();
  await win.waitForFunction((cid) => (window as any).__kadro.useStore.getState().project.tracks[0].clips.find((c: any) => c.id === cid)?.voice?.status === 'ready', id, { timeout: 60_000 });
  let c = (await project(win)).tracks[0].clips[0] as any;
  expect(c.voice.effect).toBe('chipmunk');
  expect(await win.evaluate((cid) => (window as any).__kadroEngine.media.get(`${cid}:a`)?.src.includes('fx_'), id)).toBe(true);
  // чистка шума поверх эффекта — эффект пересчитывается с чисткой
  await win.locator('aside.panel').getByTestId('ai-denoise').click();
  await win.waitForFunction((cid) => (window as any).__kadro.useStore.getState().project.tracks[0].clips.find((x: any) => x.id === cid)?.voice?.withDenoise === true, id, { timeout: 60_000 });
  c = (await project(win)).tracks[0].clips[0] as any;
  expect(c.denoise.status).toBe('ready');
  // озвучка текста
  await seekAndSettle(win, 0.5);
  await win.getByTestId('tab-text').click();
  await win.getByTestId('add-text').click();
  await win.getByTestId('itab-text').click();
  await win.getByTestId('text-input').fill('Это озвучка текста');
  await win.getByTestId('tts-voice').selectOption('irina');
  await win.getByTestId('tts-run').click();
  await win.waitForFunction(() => (window as any).__kadro.useStore.getState().project.tracks.some((t: any) => t.kind === 'audio' && t.clips.length), undefined, { timeout: 90_000 });
  const p = await project(win);
  const audio = p.tracks.find((t) => t.kind === 'audio')!.clips[0] as any;
  expect(audio.start).toBeCloseTo(0.5, 2);
  const txt = p.tracks.find((t) => t.kind === 'text')!.clips[0] as any;
  expect(Math.abs(txt.duration - (audio.out - audio.in) - 0.2)).toBeLessThan(0.05);
  // ритм у музыки и склейки под бит
  await reset(win);
  await importAt(win, [solidVideo('red3.mp4', 'red', 3), solidVideo('blue3.mp4', 'blue', 3)]);
  const [m] = await act(win, 'importPaths', [beatMp3()]);
  await act(win, 'addAssetToTimeline', m, 'auto', 0);
  const [mid] = await clipIds(win, 'audio');
  await store(win, 'select', [mid]);
  await win.getByTestId('itab-audio').click().catch(() => undefined);
  await win.getByTestId('find-beats').click();
  await win.waitForFunction(() => (window as any).__kadro.useStore.getState().project.assets.some((a: any) => a.beats?.length), undefined, { timeout: 60_000 });
  await expect(win.locator(`[data-clip="${mid}"] .beat-marks i`).first()).toBeAttached();
  await win.getByTestId('tl-beats').click();
  const q = await project(win);
  const P = 60 / 128;
  const cut = q.tracks[0].clips[0].start + ((q.tracks[0].clips[0] as any).out - (q.tracks[0].clips[0] as any).in);
  const ph = ((cut - 0.25) / P) % 1;
  expect(Math.min(ph, 1 - ph) * P, `склейка на ${cut}`).toBeLessThan(0.05);
});

test('стабилизация и автокадрирование — через интерфейс', async () => {
  const shaky = shakyVideo();
  const walk = walkVideo();
  test.skip(!shaky || !walk, 'нет тестового фото человека');
  await reset(win);
  await importAt(win, [shaky!]);
  const [id] = await clipIds(win, 'main');
  await store(win, 'select', [id]);
  await win.getByTestId('tab-ai').click();
  await win.locator('aside.panel').getByTestId('ai-stab').click();
  await win.waitForFunction((cid) => (window as any).__kadro.useStore.getState().project.tracks[0].clips.find((c: any) => c.id === cid)?.stab?.status === 'ready', id, { timeout: 90_000 });
  await seekAndSettle(win, 1);
  expect(await win.evaluate((cid) => (window as any).__kadroEngine.media.get(`${cid}:v`)?.src.includes('stab_'), id)).toBe(true);
  const png1 = await parity(1, 'stab');
  const out1 = await exportViaUi('720p');
  compareAt(png1, out1, 1, 6);
  // автокадрирование: горизонтальное видео в вертикальном проекте
  await reset(win);
  await importAt(win, [walk!]);
  const [wid] = await clipIds(win, 'main');
  await store(win, 'select', [wid]);
  await win.locator('aside.panel').getByTestId('ai-reframe').click();
  await win.waitForFunction((cid) => (window as any).__kadro.useStore.getState().project.tracks[0].clips.find((c: any) => c.id === cid)?.keyframes?.x?.length > 2, wid, { timeout: 90_000 });
  const c = (await project(win)).tracks[0].clips[0] as any;
  expect(c.fit).toBe('cover');
  expect(c.keyframes.x[0].v).toBeGreaterThan(c.keyframes.x[c.keyframes.x.length - 1].v); // человек идёт вправо — кадр сдвигается влево
  const png2 = await parity(1.5, 'reframe');
  const out2 = await exportViaUi('720p');
  compareAt(png2, out2, 1.5, 6);
});

test('автосубтитры из интерфейса: распознаются и правятся', async () => {
  await reset(win);
  await importAt(win, [talkVideo()]);
  await win.getByTestId('tab-captions').click();
  await win.locator('.model input').nth(1).check();
  await win.getByTestId('make-captions').click();
  await win.waitForFunction(() => (window as any).__kadro.useStore.getState().project.tracks.some((t: any) => t.kind === 'text' && t.clips.length), undefined, { timeout: 180_000 });
  const p = await project(win);
  const caps = p.tracks.filter((t) => t.kind === 'text').flatMap((t) => t.clips) as any[];
  const text = caps.map((c) => c.text).join(' ').toLowerCase();
  for (const w of ['привет', 'тестовый', 'субтитры', 'паузы', 'вырезаны']) expect(text, text).toContain(w);
  // каждая фраза — в своё время (паузы по 1.5 с не накрыты субтитрами)
  expect(caps[0].start).toBeGreaterThan(1.2);
  await win.getByTestId('cue-text').first().fill('Исправленный текст');
  const p2 = await project(win);
  const first = (p2.tracks.filter((t) => t.kind === 'text').flatMap((t) => t.clips) as any[]).sort((x, y) => x.start - y.start)[0];
  expect(first.text).toBe('Исправленный текст');
  expect(PHRASES.length).toBe(3);
});

test('убрать паузы из панели таймлайна', async () => {
  await reset(win);
  await importAt(win, [talkVideo()]);
  const before = (await project(win)).assets[0].duration;
  const [id] = await clipIds(win, 'main');
  const b = await clipBox(id);
  await win.mouse.click(b.x + 30, b.y + b.height / 2);
  await win.locator('.tl-toolbar').getByRole('button', { name: 'Убрать паузы' }).click();
  await win.waitForFunction(() => (window as any).__kadro.useStore.getState().project.tracks[0].clips.length > 1, undefined, { timeout: 120_000 });
  const p = await project(win);
  const dur = p.tracks[0].clips.reduce((s, c: any) => s + (c.out - c.in), 0);
  expect(before - dur).toBeGreaterThan(3.5);
  expect(p.tracks[0].clips.length).toBe(3);
});

test('чистый голос из вкладки ИИ', async () => {
  await reset(win);
  await importAt(win, [talkVideo()]);
  const [id] = await clipIds(win, 'main');
  await store(win, 'select', [id]);
  await win.getByTestId('tab-ai').click();
  await win.locator('aside.panel').getByTestId('ai-denoise').click();
  await win.waitForFunction((cid) => {
    const p = (window as any).__kadro.useStore.getState().project;
    return p.tracks[0].clips.find((c: any) => c.id === cid)?.denoise.status === 'ready';
  }, id, { timeout: 120_000 });
  await expect(win.getByText('Готово — уже в превью и экспорте').first()).toBeVisible();
  const p = await project(win);
  const c = p.tracks[0].clips[0] as any;
  expect(fs.existsSync(c.denoise.path)).toBe(true);
  const hasAudioEl = await win.evaluate((cid) => (window as any).__kadroEngine.media.has(`${cid}:a`), id);
  expect(hasAudioEl).toBe(true);
});

test('удаление фона из вкладки ИИ — в плеере фон исчезает', async () => {
  const person = personVideo();
  test.skip(!person, 'нет тестового фото человека');
  await reset(win);
  await importAt(win, [person!]);
  const p0 = await project(win);
  const a = p0.assets[0];
  const [id] = await clipIds(win, 'main');
  await seekAndSettle(win, 0.5);
  const bgPoint = mapContain(1080, 1920, a.width, a.height, 0.88, 0.25);
  const bodyPoint = mapContain(1080, 1920, a.width, a.height, 0.37, 0.75);
  const bgBefore = await previewPixel(win, ...bgPoint);
  expect(bgBefore.reduce((s, v) => s + v, 0)).toBeGreaterThan(200);
  await store(win, 'select', [id]);
  await win.getByTestId('tab-ai').click();
  await win.locator('aside.panel').getByTestId('ai-removebg').click();
  await win.waitForFunction((cid) => {
    const p = (window as any).__kadro.useStore.getState().project;
    return p.tracks[0].clips.find((c: any) => c.id === cid)?.removeBg.status === 'ready';
  }, id, { timeout: 280_000 });
  await seekAndSettle(win, 0.5);
  // фон стал чёрным (фон проекта), а человек остался
  await expect.poll(async () => {
    const bg = (await previewPixel(win, ...bgPoint)).reduce((s, v) => s + v, 0);
    const body = (await previewPixel(win, ...bodyPoint)).reduce((s, v) => s + v, 0);
    return bg < 40 && body > 300;
  }, { timeout: 20_000 }).toBe(true);
});

test('черновик восстанавливается после перезапуска, пропавший файл помечается', async () => {
  await reset(win);
  const tmp = path.join(MEDIA, 'temp_clip.mp4');
  fs.copyFileSync(solidVideo('red3.mp4', 'red', 3), tmp);
  await importAt(win, [colorsVideo(), tmp]);
  const ids = await clipIds(win, 'main');
  await win.waitForTimeout(2000); // автосохранение через 1.2 с
  const data = K.data;
  await K.app.close();
  fs.rmSync(tmp);
  K = await launch({ data, env: { KADRO_TEST_EXPORT: path.join(MEDIA, 'out.mp4') } });
  win = K.win;
  await win.waitForFunction(() => (window as any).__kadro.useStore.getState().project.tracks[0].clips.length === 2, undefined, { timeout: 15_000 });
  expect(await clipIds(win, 'main')).toEqual(ids);
  await expect(win.getByTestId('toast').filter({ hasText: 'Не найден файл' })).toBeVisible();
  await expect(win.locator('.media-item.missing')).toHaveCount(1);
  // экспорт честно отказывается
  await win.getByTestId('export-open').click();
  await win.getByTestId('export-start').click();
  await expect(win.getByText(/Не найден файл: «temp_clip.mp4»/)).toBeVisible({ timeout: 20_000 });
  await win.getByRole('button', { name: 'Закрыть' }).last().click();
  // убрать пропавший клип — и проект снова цел
  await store(win, 'select', [ids[1]]);
  await win.keyboard.press('Delete');
  expect(await clipIds(win, 'main')).toEqual([ids[0]]);
  K.errors.length = 0; // ошибки загрузки пропавшего файла в плеере ожидаемы
});
