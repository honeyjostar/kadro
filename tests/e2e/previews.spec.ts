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
// ролик главного экрана с надписями на другом языке: KADRO_REEL_LANG=en (файлы reel.en.mp4, reel-wide.en.mp4)
const LANG = process.env.KADRO_REEL_LANG || 'ru';
test.beforeAll(async () => { K = await launch({ env: { KADRO_LANG: LANG } }); fs.mkdirSync(MEDIA, { recursive: true }); });
test.afterAll(async () => { await K?.app.close(); });

const TPL_DIR = path.join(ROOT, 'resources', 'templates');
/** Кадры ролика главного экрана по порядку окошек демо-проекта (номера видео на mixkit.co). */
const REEL_FOOTAGE = ['20064', '48525', '99872', '52427', '50989', '16610', '99864', '4155'];
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
    // монтаж демо-проекта на настоящих кадрах (KADRO_REEL_DIR — видео Mixkit, сами файлы в Kadro не входят),
    // вертикальный — в телефоне, горизонтальный — когда телефон поворачивается в широкий экран
    const dir = process.env.KADRO_REEL_DIR;
    const files = dir ? REEL_FOOTAGE.map((f) => path.join(dir, `${f}.mp4`)) : null;
    const suffix = LANG === 'ru' ? '' : `.${LANG}`;
    for (const [aspect, name] of [['9:16', 'reel'], ['16:9', 'reel-wide']] as const) {
      const raw = await render(() => (files ? act(K.win, 'buildDemoWith', files, aspect) : aspect === '9:16' ? act(K.win, 'openDemo') : act(K.win, 'buildDemoWith', [], aspect)), 540);
      const out = path.join(DEMO_DIR, `${name}${suffix}.mp4`);
      ffmpeg(['-i', raw, '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', '112k', '-movflags', '+faststart', out]);
      console.log(path.basename(out), Math.round(fs.statSync(out).size / 1024), 'КБ');
    }
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
