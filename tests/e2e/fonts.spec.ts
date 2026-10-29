// Свои и системные шрифты: установка (кнопкой, перетаскиванием, из .ttc), выбор в тексте, экспорт с ними,
// предупреждение о шрифте, которого нет; «Собрать проект в папку» и открытие такой папки «на другом компьютере»:
// файлы находятся рядом, шрифты и плагины ставятся сами.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { act, importAt, launch, MEDIA, project, ROOT, solidVideo, store, type Kadro } from './kadro';

const FX = path.join(ROOT, 'tests', 'fixtures', 'fonts');
const SYS = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-sysfonts-'));
for (const f of ['KadroBlock.otf', 'KadroDuo.ttc']) fs.copyFileSync(path.join(FX, f), path.join(SYS, f));
const PACK_TO = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-pack-'));

let K: Kadro;
let win: Page;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  K = await launch({ env: {
    KADRO_SYSTEM_FONTS: SYS, KADRO_NO_OPEN: '1', KADRO_TEST_DIR: PACK_TO,
    KADRO_TEST_PICK: ['KadroTest-Regular.ttf', 'KadroTest-Bold.ttf', 'KadroTestPair.ttc', 'notafont.ttf'].map((f) => path.join(FX, f)).join('|'),
  } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors.filter((e) => !/Failed to load resource/.test(e)), K.errors.join('\n')).toEqual([]); });

/** Ширина надписи шрифтом в окне: у тестовых шрифтов каждая буква — квадрат в 1 em. */
const width = (family: string, text: string, weight = 400) => win.evaluate(async ([f, t, w]) => {
  await document.fonts.load(`${w} 100px "${f}"`, t as string);
  const c = new OffscreenCanvas(10, 10).getContext('2d')!;
  c.font = `${w} 100px "${f}", "Onest"`;
  return Math.round(c.measureText(t as string).width);
}, [family, text, weight] as const);

async function addText(text: string, font: string): Promise<string> {
  return win.evaluate(([t, f]) => {
    const k = (window as any).__kadro;
    let id = '';
    k.useStore.getState().commit((p: any) => { const r = k.timeline.addText(p, 0, t, { font: f, size: 140 }); id = r.clipId; return r.project; });
    k.useStore.getState().select([id]);
    return id;
  }, [text, font] as const);
}

test('«Установить шрифт…»: .ttf ставятся, начертания из .ttc не дублируются, не-шрифт — понятная ошибка', async () => {
  await importAt(win, [solidVideo('red3.mp4', 'red', 3)], 'main', 0);
  await addText('ЖЖЖ', 'Onest');
  await win.getByTestId('text-font').click();
  await expect(win.getByTestId('font-pop')).toBeVisible();
  await win.getByTestId('font-cat-mine').click();
  await expect(win.getByTestId('font-pop')).toContainText('Своих шрифтов пока нет');
  await win.getByTestId('font-install').click();
  await expect(win.locator('.toast').filter({ hasText: 'Шрифт «Kadro Test» установлен' })).toBeVisible();
  await expect(win.locator('.toast').filter({ hasText: 'notafont.ttf: не похоже на шрифт' })).toBeVisible();
  const files = fs.readdirSync(path.join(K.data, 'fonts')).sort();
  expect(files).toEqual(['KadroTest-Bold.ttf', 'KadroTest-Regular.ttf']);
  const group = win.getByTestId('font-group-mine');
  await expect(group).toContainText('Kadro Test');
  // выбор — шрифт у надписи, буквы в окне — квадраты по 1 em (то есть шрифт действительно подключён)
  await group.locator('.font-row', { hasText: 'Kadro Test' }).click();
  const p = await project(win);
  const t = p.tracks.find((x) => x.kind === 'text')!.clips[0] as any;
  expect(t.style.font).toBe('Kadro Test');
  expect(await width('Kadro Test', 'ЖЖЖ')).toBe(300);
  expect(await width('Kadro Test', 'ЖЖЖ', 700)).toBe(300);
  await expect(win.getByTestId('text-font')).not.toHaveClass(/missing/);
});

test('перетащить шрифт в окно — ставится (WOFF2, OTF), повторно — «уже установлен»', async () => {
  const r = await win.evaluate((paths) => (window as any).kadro.installFonts(paths), [path.join(FX, 'KadroWeb.woff2'), path.join(FX, 'KadroTest-Regular.ttf')]);
  expect(r.installed.map((x: any) => x.family)).toEqual(['Kadro Web']);
  expect(r.already).toEqual(['Kadro Test']);
  await expect.poll(() => win.evaluate(() => (window as any).__kadro.fonts.useFonts.getState().user.map((f: any) => f.family))).toEqual(['Kadro Test', 'Kadro Web']);
  expect(await width('Kadro Web', 'АБ')).toBe(200);
});

test('шрифты системы — в списке, шрифт из коллекции .ttc выбирается и подключается', async () => {
  await win.getByTestId('text-font').click();
  await win.getByTestId('font-cat-system').click();
  const sys = win.getByTestId('font-group-system');
  await expect(sys).toContainText('Kadro Block');
  await expect(sys).toContainText('Kadro Duo');
  await win.getByTestId('font-search').fill('duo');
  await expect(sys.locator('.font-row')).toHaveCount(1);
  await sys.locator('.font-row').click();
  const p = await project(win);
  expect((p.tracks.find((x) => x.kind === 'text')!.clips[0] as any).style.font).toBe('Kadro Duo');
  await expect.poll(() => width('Kadro Duo', 'ЖЖ', 700)).toBe(200);
  // начертание вынуто из коллекции в кэш
  expect(fs.readdirSync(path.join(K.data, 'cache', 'fonts')).some((f) => f.endsWith('.ttf'))).toBe(true);
});

test('экспорт: надпись своим шрифтом — в видео (сплошные квадраты, а не запасной шрифт)', async () => {
  await win.evaluate(() => {
    const k = (window as any).__kadro;
    const p = k.useStore.getState().project;
    const t = p.tracks.find((x: any) => x.kind === 'text').clips[0];
    k.useStore.getState().commit((q: any) => k.timeline.updateClip(q, t.id, { duration: 2, style: { ...t.style, font: 'Kadro Test', color: '#ffffff', size: 160, strokeWidth: 0, shadow: false, bgOpacity: 0 } }));
  });
  const out = path.join(MEDIA, 'fonts-export.mp4');
  const r = await act(win, 'exportTo', out, 360, 30);
  expect(r.ok, r.error).toBe(true);
  // кадр на 1-й секунде: доля белых пикселей в середине кадра. Квадраты 1 em дают сплошную полосу.
  const raw = spawnSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', out, '-frames:v', '1', '-vf', 'crop=iw*0.36:ih*0.04:iw*0.32:ih*0.47,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 }).stdout;
  let white = 0;
  for (const v of raw) if (v > 200) white++;
  expect(white / raw.length).toBeGreaterThan(0.75);
});

test('шрифта нет на компьютере — предупреждение перед экспортом и значок у выбора шрифта', async () => {
  await win.evaluate(() => {
    const k = (window as any).__kadro;
    const t = k.useStore.getState().project.tracks.find((x: any) => x.kind === 'text').clips[0];
    k.useStore.getState().commit((q: any) => k.timeline.updateClip(q, t.id, { style: { ...t.style, font: 'Нет Такого Шрифта' } }));
  });
  await expect(win.getByTestId('text-font')).toHaveClass(/missing/);
  await store(win, 'setExportOpen', true);
  await expect(win.getByText('Шрифта «Нет Такого Шрифта» нет на этом компьютере')).toBeVisible();
  await win.keyboard.press('Escape');
  await win.evaluate(() => {
    const k = (window as any).__kadro;
    const t = k.useStore.getState().project.tracks.find((x: any) => x.kind === 'text').clips[0];
    k.useStore.getState().commit((q: any) => k.timeline.updateClip(q, t.id, { style: { ...t.style, font: 'Kadro Test' } }));
  });
});

test('удалить свой шрифт — из списка и из папки', async () => {
  const p = await project(win);
  await store(win, 'select', [p.tracks.find((x) => x.kind === 'text')!.clips[0].id]);
  await win.getByTestId('text-font').click();
  await win.getByTestId('font-cat-mine').click();
  const row = win.locator('.font-row-wrap', { hasText: 'Kadro Web' });
  await row.hover();
  await row.getByTestId('font-remove').click();
  await expect(win.locator('.toast').filter({ hasText: 'Шрифт «Kadro Web» удалён' })).toBeVisible();
  await expect(win.getByTestId('font-group-mine')).not.toContainText('Kadro Web');
  expect(fs.readdirSync(path.join(K.data, 'fonts'))).not.toContain('KadroWeb.woff2');
  await win.keyboard.press('Escape');
});

let packed = '';
test('«Собрать проект в папку»: проект, видео, шрифты, плагин и памятка', async () => {
  // плагин-эффект на видео — тоже должен уехать с проектом
  const glsl = path.join(MEDIA, 'kadro-pack-tint.glsl');
  fs.writeFileSync(glsl, '// Name: Тест — оттенок\nvec4 effect(vec2 uv) { vec4 c = getColor(uv); return vec4(c.r, c.g * 0.5, c.b, c.a); }\n');
  const inst = await win.evaluate((f) => (window as any).kadro.installPluginFiles([f]), glsl);
  expect(inst.installed).toHaveLength(1);
  await win.evaluate(() => {
    const k = (window as any).__kadro;
    const v = k.useStore.getState().project.tracks[0].clips[0];
    k.useStore.getState().commit((q: any) => k.timeline.updateClip(q, v.id, { effects: [{ type: 'plug:e/kadro-pack-tint', amount: 1 }] }));
  });
  await win.evaluate(() => (window as any).__kadro.useStore.getState().commit((p: any) => ({ ...p, name: 'Перенос' })));
  await win.getByTestId('topbar-pack').click();
  await expect(win.locator('.toast').filter({ hasText: 'Проект собран' })).toBeVisible({ timeout: 30_000 });
  packed = path.join(PACK_TO, 'Перенос');
  const ls = (d: string) => fs.readdirSync(path.join(packed, d)).sort();
  expect(fs.readdirSync(packed).sort()).toEqual(['fonts', 'media', 'plugins', 'Как открыть.txt', 'Перенос.kadro'].sort());
  expect(ls('media')).toEqual(['red3.mp4']);
  expect(ls('fonts')).toEqual(['KadroTest-Bold.ttf', 'KadroTest-Regular.ttf']);
  expect(ls('plugins/effects')).toEqual(['kadro-pack-tint.glsl']);
  const p = JSON.parse(fs.readFileSync(path.join(packed, 'Перенос.kadro'), 'utf8'));
  expect(p.assets[0].rel).toBe('media/red3.mp4');
  expect(p.assets[0].path).toBe(path.join(packed, 'media', 'red3.mp4'));
});

test('собранную папку перенесли на «другой компьютер»: файлы находятся, шрифты и плагин ставятся сами', async () => {
  // «другой компьютер»: папку переместили, данных Kadro (шрифтов, плагинов) нет
  const moved = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-moved-')), 'Флешка');
  fs.renameSync(packed, moved);
  const K2 = await launch({ env: { KADRO_SYSTEM_FONTS: '', KADRO_NO_OPEN: '1' } });
  try {
    const w2 = K2.win;
    expect(await w2.evaluate((f) => (window as any).__kadro.actions.openRecent(f), path.join(moved, 'Перенос.kadro'))).toBe(true);
    await expect(w2.locator('.toast').filter({ hasText: 'Файлы проекта нашлись рядом с ним: 1' })).toBeVisible();
    await expect(w2.locator('.toast').filter({ hasText: 'Из папки проекта установлены шрифты: Kadro Test' })).toBeVisible();
    await expect(w2.locator('.toast').filter({ hasText: 'установлены плагины: kadro-pack-tint' })).toBeVisible();
    const p = await project(w2);
    expect(p.assets[0].missing).toBeFalsy();
    expect(p.assets[0].path).toBe(path.join(moved, 'media', 'red3.mp4'));
    expect(fs.readdirSync(path.join(K2.data, 'fonts')).sort()).toEqual(['KadroTest-Bold.ttf', 'KadroTest-Regular.ttf']);
    expect(fs.existsSync(path.join(K2.data, 'plugins', 'effects', 'kadro-pack-tint.glsl'))).toBe(true);
    await expect.poll(() => w2.evaluate(async () => {
      await document.fonts.load('400 100px "Kadro Test"', 'ЖЖ');
      const c = new OffscreenCanvas(10, 10).getContext('2d')!;
      c.font = '400 100px "Kadro Test", "Onest"';
      return Math.round(c.measureText('ЖЖ').width);
    })).toBe(200);
    expect(K2.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  } finally {
    await K2.app.close();
  }
});
