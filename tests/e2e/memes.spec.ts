// Мем-кнопки: каждая — правка клипа у курсора и свой звук на дорожке звука одним шагом (Ctrl+Z убирает всё),
// «Продолжение следует…» — стоп-кадр в сепии с плашкой-стрелкой, одинаково в плеере и в экспорте.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { act, importAt, launch, probe, project, seekAndSettle, store, talkVideo, waitAssetsReady, type Kadro } from './kadro';

let K: Kadro;
test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);
test.beforeAll(async () => { K = await launch(); });
test.afterAll(async () => { await K?.app.close(); });

async function fresh(): Promise<string> {
  await act(K.win, 'newProjectAction', '16:9');
  await importAt(K.win, [talkVideo()], 'main', 0);
  await waitAssetsReady(K.win);
  await seekAndSettle(K.win, 1);
  await K.win.getByTestId('tab-effects').click();
  return (await project(K.win)).tracks[0].clips[0].id;
}
const audioClips = async () => (await project(K.win)).tracks.filter((t) => t.kind === 'audio').flatMap((t) => t.clips) as any[];

test('драматический зум: ключевые кадры и «дун-дун-дууун»; Ctrl+Z убирает всё', async () => {
  await fresh();
  await K.win.getByTestId('meme-drama').click();
  await expect.poll(async () => (await audioClips()).length).toBe(1);
  const c = (await project(K.win)).tracks[0].clips[0] as any;
  expect(c.keyframes.scale.length).toBeGreaterThanOrEqual(6);
  const snd = (await audioClips())[0];
  const a = (await project(K.win)).assets.find((x) => x.id === snd.assetId)!;
  expect(a.path).toMatch(/meme-drama\.m4a$/);
  expect(snd.start).toBeCloseTo(1, 1);
  await K.win.locator('body').click({ position: { x: 700, y: 300 } });
  await K.win.keyboard.press('Control+z');
  await expect.poll(async () => (await audioClips()).length).toBe(0);
  expect(((await project(K.win)).tracks[0].clips[0] as any).keyframes?.scale ?? []).toHaveLength(0);
});

test('басс-буст: кусок с тряской и звуком в басы, «дроп»', async () => {
  await fresh();
  await K.win.getByTestId('meme-bass').click();
  await expect.poll(async () => (await audioClips()).length, { timeout: 60_000 }).toBe(1);
  const main = (await project(K.win)).tracks[0].clips as any[];
  expect(main).toHaveLength(3);
  expect(main[1].effects.map((e: any) => e.type)).toEqual(['shake', 'pulse']);
  expect(main[1].voice).toMatchObject({ enabled: true, effect: 'bassboost', status: 'ready' });
});

test('замедление с «бум»: кусок в 0,3 раза', async () => {
  await fresh();
  const before = await K.win.evaluate(() => (window as any).__kadro.timeline.projectDuration((window as any).__kadro.useStore.getState().project));
  await K.win.getByTestId('meme-slowmo').click();
  await expect.poll(async () => (await audioClips()).length).toBe(1);
  const main = (await project(K.win)).tracks[0].clips as any[];
  expect(main[1].speed).toBe(0.3);
  const after = await K.win.evaluate(() => (window as any).__kadro.timeline.projectDuration((window as any).__kadro.useStore.getState().project));
  expect(after - before).toBeCloseTo(0.8 / 0.3 - 0.8, 0);
});

test('«Продолжение следует…»: стоп-кадр в сепии, плашка и музыка — в плеере и в экспорте', async () => {
  await fresh();
  await K.win.getByTestId('meme-tbc').click();
  await expect.poll(async () => (await audioClips()).length, { timeout: 60_000 }).toBe(1);
  const p = await project(K.win);
  const fz = (p.tracks[0].clips as any[]).find((c) => p.assets.find((a) => a.id === c.assetId)?.kind === 'image');
  expect(fz.start).toBeCloseTo(1, 1);
  expect(fz.color.preset).toBe('sepia');
  const txt = p.tracks.flatMap((t) => t.clips).find((c: any) => c.widget === 'tbc') as any;
  expect(txt.duration).toBeCloseTo(3.4);
  await seekAndSettle(K.win, 2.5);
  await K.win.getByTestId('preview').screenshot({ path: path.join(os.tmpdir(), 'kadro-meme-tbc.png') });
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-meme-')), 'm.mp4');
  const r = await act(K.win, 'exportTo', out, 360, 30);
  expect(r.ok, r.error).toBe(true);
  expect(probe(out).duration).toBeGreaterThan(4);
  expect(K.errors).toEqual([]);
});
