// Музыка тише под голос во всех проектах: где в видео говорят, музыка (низкий тон на дорожке звука) тише
// примерно на 9 дБ — и в плеере (громкость элемента), и в готовом звуке; выключается в настройках.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { act, importAt, launch, media, project, store, talkVideo, waitAssetsReady } from './kadro';

test.setTimeout(240_000);

const hum = () => media('hum60.m4a', (f) => { spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=f=60:d=30:sample_rate=48000', '-af', 'volume=0.5', '-c:a', 'aac', f]); });

/** Громкость (RMS, дБ) низкого тона в окне [a, b] с: всё выше 100 Гц отрезается — речь почти не мешает. */
function humDb(file: string, a: number, b: number): number {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-ss', String(a), '-t', String(b - a), '-i', file, '-af', 'lowpass=f=90,lowpass=f=90,astats=metadata=0:measure_overall=RMS_level', '-f', 'null', '-'], { encoding: 'utf8' });
  return Number(/RMS level dB:\s*(-?[\d.]+)/.exec(r.stderr.split('Overall')[1] ?? r.stderr)?.[1]);
}

test('где говорят — музыка тише; в плеере и в экспорте одинаково; выключается', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-duck-'));
  const K = await launch({ data });
  const win = K.win;
  await importAt(win, [talkVideo()], 'main', 0);
  await importAt(win, [hum()], 'auto', 0);
  await waitAssetsReady(win);
  await expect.poll(() => win.evaluate(() => (window as any).__kadro.duck.speechIntervals((window as any).__kadro.useStore.getState().project).length), { timeout: 30_000 }).toBeGreaterThan(0);
  const iv: [number, number][] = await win.evaluate(() => (window as any).__kadro.duck.speechIntervals((window as any).__kadro.useStore.getState().project));
  const p = await project(win);
  const total = await win.evaluate(() => (window as any).__kadro.timeline.projectDuration((window as any).__kadro.useStore.getState().project));
  // самая длинная фраза и самая длинная пауза внутри ролика
  const speech = [...iv].sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
  const gaps = iv.slice(1).map((x, i) => [iv[i][1], x[0]] as [number, number]).concat([[iv[iv.length - 1][1], total] as [number, number]]);
  const gap = gaps.sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
  expect(gap[1] - gap[0]).toBeGreaterThan(0.8);
  const mt = p.tracks.find((t) => t.kind === 'audio')!;
  const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
  // плеер: множитель громкости музыки
  const gainAt = (t: number) => win.evaluate(([tt]) => {
    const k = (window as any).__kadro; const q = k.useStore.getState().project;
    const tr = q.tracks.find((x: any) => x.kind === 'audio'); return (window as any).__kadroEngine.duckAt(tr.clips[0], tr, tt);
  }, [t]);
  expect(await gainAt(mid(speech))).toBeCloseTo(0.35, 2);
  expect(await gainAt(mid(gap))).toBe(1);
  expect(mt.clips).toHaveLength(1);

  // экспорт: тон под речью тише на ~9 дБ, чем в паузе
  const out = path.join(data, 'duck.mp4');
  const r = await act(win, 'exportTo', out, 360, 30);
  expect(r.ok, r.error).toBe(true);
  const w = 0.25;
  const loud = humDb(out, mid(gap) - w, mid(gap) + w);
  const quiet = humDb(out, mid(speech) - w, mid(speech) + w);
  expect(loud - quiet).toBeGreaterThan(6);
  expect(loud - quiet).toBeLessThan(13);

  // выключили — музыка ровная
  await store(win, 'setSettingsOpen', true);
  await win.getByTestId('duck-toggle').click();
  await expect.poll(() => JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8')).duck?.on).toBe(false);
  expect(await gainAt(mid(speech))).toBe(1);
  expect(K.errors).toEqual([]);
  await K.app.close();
});
