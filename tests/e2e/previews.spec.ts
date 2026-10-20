// Сборка превью шаблонов и демо-ролика для главного экрана (не тест): KADRO_MAKE_PREVIEWS=1 npx playwright test previews
// Каждый шаблон собирается в самом Kadro на демо-роликах и сохраняется его же экспортом — превью честно показывает результат.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { BUILTIN_TEMPLATES, templateDuration, type Template } from '../../src/shared/templates';
import { act, launch, MEDIA, ROOT, waitAssetsReady, type Kadro } from './kadro';

test.skip(!process.env.KADRO_MAKE_PREVIEWS, 'только по запросу: KADRO_MAKE_PREVIEWS=1');
test.setTimeout(1_800_000);

let K: Kadro;
test.beforeAll(async () => { K = await launch(); fs.mkdirSync(MEDIA, { recursive: true }); });
test.afterAll(async () => { await K?.app.close(); });

const TPL_DIR = path.join(ROOT, 'resources', 'templates');
const DEMO_DIR = path.join(ROOT, 'resources', 'demo');

function ffmpeg(args: string[]): void {
  const r = spawnSync(process.env.KADRO_FFMPEG || 'ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
}

async function render(build: () => Promise<unknown>, shortSide: number): Promise<string> {
  await build();
  await waitAssetsReady(K.win);
  const raw = path.join(MEDIA, `preview_raw_${Date.now()}.mp4`);
  const r = await act(K.win, 'exportTo', raw, shortSide, 30);
  expect(r.ok, r.error).toBe(true);
  return raw;
}

test('превью шаблонов и демо-ролик', async () => {
  const only = (process.env.KADRO_MAKE_PREVIEWS ?? '').split(',').filter((x) => x && x !== '1');
  fs.mkdirSync(TPL_DIR, { recursive: true });
  if (!only.length || only.includes('reel')) {
    const raw = await render(() => act(K.win, 'openDemo'), 540);
    ffmpeg(['-i', raw, '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', '112k', '-movflags', '+faststart', path.join(DEMO_DIR, 'reel.mp4')]);
    console.log('reel', Math.round(fs.statSync(path.join(DEMO_DIR, 'reel.mp4')).size / 1024), 'КБ');
  }
  for (const t of BUILTIN_TEMPLATES as Template[]) {
    if (only.length && !only.includes(t.id)) continue;
    const short = t.aspect === '9:16' || t.aspect === '1:1' ? 288 : 216;
    const raw = await render(() => act(K.win, 'tryTemplate', t), short);
    const out = path.join(TPL_DIR, `${t.id}.mp4`);
    ffmpeg(['-i', raw, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-g', '60', '-movflags', '+faststart', out]);
    console.log(t.id, templateDuration(t), 'с,', Math.round(fs.statSync(out).size / 1024), 'КБ');
  }
});
