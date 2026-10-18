// Сквозные тесты: настоящее окно Kadro, мышь и клавиатура, плеер и экспорт через интерфейс.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { applyColorToPixel, effectiveColor } from '../../src/shared/color';
import { DEFAULT_COLOR } from '../../src/shared/defaults';
import {
  RGB, act, clipIds, colorsVideo, frameDiff, grayImage, importAt, launch, MEDIA, near, personVideo, PHRASES, previewPixel, probe,
  project, rawFrame, reset, rotatedVideo, seekAndSettle, solidVideo, state, store, talkVideo, toneMp3, waitAssetsReady, type Kadro,
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
