// Авто-ролик: с главного экрана, из медиатеки и из библиотеки — файлы, музыка, стиль, формат, длина, надпись →
// готовый монтаж в ритм; «Ещё вариант» и отмена; экспорт собранного ролика.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { act, ff, launch, media, MEDIA, probe, project, state, store, type Kadro } from './kadro';
import type { MediaClip, TextClip } from '../../src/shared/types';

let K: Kadro;
let win: Page;

const trip = () => media('auto_trip.mp4', (f) => ff(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=6', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=6',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f]));
const tall = () => media('auto_tall.mp4', (f) => ff(['-f', 'lavfi', '-i', 'smptebars=s=360x640:r=30:d=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', f]));
const photo = () => media('auto_photo.png', (f) => ff(['-f', 'lavfi', '-i', 'testsrc=s=800x600', '-frames:v', '1', f]));
const FOLDER = path.join(MEDIA, 'auto_folder');

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);
test.beforeAll(async () => {
  fs.mkdirSync(FOLDER, { recursive: true });
  for (const f of [trip(), tall(), photo()]) fs.copyFileSync(f, path.join(FOLDER, path.basename(f)));
  fs.copyFileSync(path.join(__dirname, '../../resources/demo/beat.m4a'), path.join(FOLDER, 'beat.m4a'));
  K = await launch({ env: { KADRO_SKIP_HOME: '', KADRO_TEST_PICK: [trip(), tall(), photo()].join('|'), KADRO_TEST_FOLDER: FOLDER } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

const dialog = () => win.getByTestId('auto-dialog');
const mainClips = async () => (await project(win)).tracks[0].clips as MediaClip[];
/** Каждый кадр основной дорожки начинается на доле музыки. */
async function onBeats(): Promise<void> {
  const p = await project(win);
  const mc = p.tracks.find((t) => t.kind === 'audio')!.clips[0] as MediaClip;
  const beats = p.assets.find((a) => a.id === mc.assetId)!.beats!;
  expect(beats.length).toBeGreaterThan(8);
  const grid = [0, ...beats.map((b) => b - mc.in)];
  for (const c of p.tracks[0].clips) {
    const near = Math.min(...grid.map((g) => Math.abs(g - c.start)));
    expect(near, `кадр с ${c.start.toFixed(3)} не на доле`).toBeLessThan(0.01);
  }
}

test('с главного экрана: свои файлы + демо-бит → новый проект, склейки в ритм, надпись', async () => {
  await expect(win.getByTestId('home')).toBeVisible();
  await win.getByTestId('home-auto').click();
  await expect(dialog()).toBeVisible();
  await expect(win.getByTestId('auto-build')).toBeDisabled();
  await win.getByTestId('auto-add-files').click();
  await expect(win.getByTestId('auto-file')).toHaveCount(3);
  await win.getByTestId('auto-music-demo').click();
  await win.getByTestId('auto-style-energy').click();
  await win.getByTestId('auto-len-15').click();
  await win.getByTestId('auto-title').fill('Лето');
  await win.getByTestId('auto-build').click();
  await expect(dialog()).toHaveCount(0, { timeout: 120_000 });
  await expect(win.getByTestId('home')).toHaveCount(0);

  const p = await project(win);
  expect(p.name).toBe('Лето');
  expect(p.settings.aspect).toBe('9:16');
  const clips = p.tracks[0].clips as MediaClip[];
  expect(clips.length).toBeGreaterThanOrEqual(8);
  expect(new Set(clips.map((c) => c.assetId)).size).toBe(3);
  const end = clips[clips.length - 1].start + (clips[clips.length - 1].out - clips[clips.length - 1].in) / clips[clips.length - 1].speed;
  expect(Math.abs(end - 15)).toBeLessThan(2.2);
  await onBeats();
  const title = p.tracks.find((t) => t.kind === 'text')!.clips[0] as TextClip;
  expect(title.text).toBe('Лето');
  expect(title.style.font).toBe('Unbounded');
  // видео без своего звука, музыка до конца ролика с затуханием
  for (const c of clips) if (p.assets.find((a) => a.id === c.assetId)!.kind === 'video') expect(c.muted).toBe(true);
  const music = p.tracks.find((t) => t.kind === 'audio')!.clips[0] as MediaClip;
  expect(music.fadeOut).toBeGreaterThan(0);
  // после сборки открыта вкладка с «Ещё вариант»
  expect(await state(win, '(s) => s.leftTab')).toBe('templates');
  await expect(win.getByTestId('tpl-auto-variant')).toBeVisible();
  await expect(win.getByText(/Авто-ролик готов/)).toBeVisible();
});

test('воспроизведение ролика из многих кусков: без чёрных кадров, видео открыто немного', async () => {
  const n = (await mainClips()).length;
  expect(n).toBeGreaterThanOrEqual(8);
  // раньше на каждый кусок создавался свой <video> — на десятках кусков видеокарта не успевала, и шёл чёрный экран
  const els = () => win.evaluate(() => (window as any).__kadroEngine.elementCount as number);
  expect(await els()).toBeLessThanOrEqual(8);
  const lit = () => win.evaluate(() => {
    const c = document.querySelector('[data-testid=preview]') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let s = 0; let k = 0;
    for (let i = 0; i < d.length; i += 4 * 211) { s += d[i] + d[i + 1] + d[i + 2]; k++; }
    return s / k;
  });
  await store(win, 'setPlayhead', 0);
  await win.waitForTimeout(800);
  await win.getByTestId('play').click();
  const samples: number[] = [];
  let maxEls = 0;
  for (let i = 0; i < 40; i++) { samples.push(await lit()); maxEls = Math.max(maxEls, await els()); await win.waitForTimeout(150); }
  await win.getByTestId('play').click();
  expect(samples.filter((x) => x < 20), `яркость кадров: ${samples.map(Math.round).join(' ')}`).toEqual([]);
  expect(maxEls).toBeLessThanOrEqual(10);
});

test('«Ещё вариант» — другие куски и переходы, Ctrl+Z возвращает прошлый', async () => {
  const before = JSON.stringify((await mainClips()).map((c) => [c.assetId, c.in.toFixed(2), c.transitionOut?.type ?? '']));
  await win.getByTestId('tpl-auto-variant').click();
  await expect.poll(async () => JSON.stringify((await mainClips()).map((c) => [c.assetId, c.in.toFixed(2), c.transitionOut?.type ?? ''])), { timeout: 30_000 }).not.toBe(before);
  await onBeats();
  expect((await project(win)).name).toBe('Лето');
  await store(win, 'undo');
  await expect.poll(async () => JSON.stringify((await mainClips()).map((c) => [c.assetId, c.in.toFixed(2), c.transitionOut?.type ?? '']))).toBe(before);
});

test('из медиатеки, без музыки, 16:9: вертикальное видео целиком с размытым фоном, звук видео остаётся', async () => {
  await win.getByTestId('tab-media').click();
  await win.getByTestId('media-view-project').click();
  await win.getByTestId('media-auto').click();
  await expect(dialog()).toBeVisible();
  await expect(win.getByTestId('auto-file')).toHaveCount(3);
  await win.getByTestId('auto-music-none').click();
  await win.getByTestId('auto-style-smooth').click();
  await win.getByTestId('auto-aspect-16-9').click();
  await win.getByTestId('auto-len-auto').click();
  await win.getByTestId('auto-title').fill('');
  await win.getByTestId('auto-build').click();
  await expect(dialog()).toHaveCount(0, { timeout: 60_000 });
  const p = await project(win);
  expect(p.settings.aspect).toBe('16:9');
  expect(p.settings.background).toBe('blur');
  expect(p.tracks.some((t) => t.kind === 'audio' || t.kind === 'text')).toBe(false);
  const clips = p.tracks[0].clips as MediaClip[];
  const tallId = p.assets.find((a) => a.name === 'auto_tall.mp4')!.id;
  const tripId = p.assets.find((a) => a.name === 'auto_trip.mp4')!.id;
  expect(clips.find((c) => c.assetId === tallId)!.fit).toBe('contain');
  expect(clips.find((c) => c.assetId === tripId)!.fit).toBe('cover');
  expect(clips.find((c) => c.assetId === tripId)!.muted).toBe(false);
  // «Плавный» — переход на каждой склейке
  expect(clips.slice(0, -1).every((c) => !!c.transitionOut)).toBe(true);
});

test('из папки библиотеки: видео и фото по порядку, музыка из той же папки; отмена ничего не меняет', async () => {
  const before = JSON.stringify(await mainClips());
  await win.getByTestId('tab-media').click();
  await win.getByTestId('media-view-library').click();
  await win.getByTestId('lib-add').click();
  await win.getByTestId('lib-auto').click();
  await expect(dialog()).toBeVisible();
  await expect(win.getByTestId('auto-file')).toHaveCount(3);
  await expect(win.getByTestId('auto-music-file').filter({ hasText: 'beat.m4a' })).toHaveClass(/active/);
  await win.getByTestId('auto-cancel').click();
  await expect(dialog()).toHaveCount(0);
  expect(JSON.stringify(await mainClips())).toBe(before);
});

test('экспорт авто-ролика: длина как на таймлайне, есть звук', async () => {
  await win.getByTestId('tab-templates').click();
  await win.getByTestId('tpl-auto').click();
  await win.getByTestId('auto-music-demo').click();
  await win.getByTestId('auto-style-cinema').click();
  await win.getByTestId('auto-aspect-9-16').click();
  await win.getByTestId('auto-len-15').click();
  await win.getByTestId('auto-title').fill('Кино');
  await win.getByTestId('auto-build').click();
  await expect(dialog()).toHaveCount(0, { timeout: 60_000 });
  const p = await project(win);
  const total = Math.max(...p.tracks[0].clips.map((c) => c.start + ((c as MediaClip).out - (c as MediaClip).in) / (c as MediaClip).speed));
  const out = path.join(os.tmpdir(), 'kadro-e2e', 'auto_export.mp4');
  fs.rmSync(out, { force: true });
  const r = await act(win, 'exportTo', out, 360, 30);
  expect(r.ok, r.error).toBe(true);
  const pr = probe(out);
  expect(Math.abs(pr.duration - total)).toBeLessThan(0.2);
  expect(pr.hasAudio).toBe(true);
});

test('новые стили: «Велосити» — ускорение и замедление; у демо-бита найдена громкость; «3D-зум» экспортируется', async () => {
  await win.getByTestId('tab-templates').click();
  await win.getByTestId('tpl-auto').click();
  await expect(win.getByTestId('auto-style-velocity')).toBeVisible();
  await win.getByTestId('auto-music-demo').click();
  await win.getByTestId('auto-style-velocity').click();
  await expect(win.getByTestId('auto-style-hint')).toContainText('замедлении');
  await win.getByTestId('auto-len-15').click();
  await win.getByTestId('auto-build').click();
  await expect(dialog()).toHaveCount(0, { timeout: 60_000 });
  let p = await project(win);
  const music = p.assets.find((a) => a.kind === 'audio' && a.beats?.length)!;
  expect(music.shape?.energy.length).toBeGreaterThan(20);
  expect(music.shape!.phase).toBeGreaterThanOrEqual(0);
  const clips = p.tracks[0].clips as MediaClip[];
  expect(clips.some((c) => c.speed > 1.2)).toBe(true);
  expect(clips.some((c) => c.speed < 0.8)).toBe(true);
  await onBeats();

  await win.getByTestId('tab-templates').click();
  await win.getByTestId('tpl-auto').click();
  await win.getByTestId('auto-music-demo').click();
  await win.getByTestId('auto-style-zoom3d').click();
  await win.getByTestId('auto-len-15').click();
  await win.getByTestId('auto-build').click();
  await expect(dialog()).toHaveCount(0, { timeout: 60_000 });
  p = await project(win);
  const z = p.tracks[0].clips as MediaClip[];
  expect(z.some((c) => c.transitionOut?.type.startsWith('gl:'))).toBe(true);
  expect(z.some((c) => (c.keyframes?.scale?.length ?? 0) >= 4)).toBe(true); // удары на долях
  const total = Math.max(...z.map((c) => c.start + (c.out - c.in) / c.speed));
  const out = path.join(os.tmpdir(), 'kadro-e2e', 'auto_zoom3d.mp4');
  fs.rmSync(out, { force: true });
  const r = await act(win, 'exportTo', out, 360, 30);
  expect(r.ok, r.error).toBe(true);
  expect(Math.abs(probe(out).duration - total)).toBeLessThan(0.25);
});
