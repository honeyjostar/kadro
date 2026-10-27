// Шейдеры: 123 перехода gl-transitions и встроенные эффекты в плеере; плагины пользователя из папки
// %USERPROFILE%\.kadro\plugins подхватываются на лету, ошибки видны в настройках.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { importAt, launch, near, previewPixel, project, seekAndSettle, solidVideo, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-plugins-'));
const plug = (kind: 'transitions' | 'effects', name: string, src: string) => {
  const d = path.join(data, 'plugins', kind);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, name), src);
};
const GREEN_T = `// Name: Зелёная вспышка
// Author: Тест
vec4 transition(vec2 uv) { return mix(mix(getFromColor(uv), vec4(0.0, 1.0, 0.0, 1.0), smoothstep(0.0, 0.5, progress)), getToColor(uv), smoothstep(0.5, 1.0, progress)); }
`;
const INVERT_E = `// Name: Негатив-плагин
// @range(0, 1) Яркость
uniform float gain; // = 1.0
vec4 effect(vec2 uv) { vec4 c = getColor(uv); return vec4(mix(c.rgb, (1.0 - c.rgb) * gain, amount), c.a); }
`;

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);
test.beforeAll(async () => {
  plug('transitions', 'green-flash.glsl', GREEN_T);
  plug('effects', 'negative.glsl', INVERT_E);
  plug('effects', 'broken.glsl', 'vec4 effect(vec2 uv) { return getColor(uv) + 1; }\n');
  K = await launch({ data, env: { KADRO_TEST_EXPORT: path.join(os.tmpdir(), 'kadro-e2e', 'gl_ui.mp4') } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, `ошибки в окне:\n${K.errors.join('\n')}`).toEqual([]); });

const commitTr = (id: string, type: string, duration = 1) => win.evaluate(([i, t, d]) => {
  const k = (window as any).__kadro; k.useStore.getState().commit((p: any) => k.timeline.setTransition(p, i, { type: t, duration: d }));
}, [id, type, duration] as const);

test('переход-шейдер gl-transitions в плеере: «Шторка вправо (GL)» — левая часть уже синяя, правая ещё красная', async () => {
  await importAt(win, [solidVideo('red3.mp4', 'red', 3), solidVideo('blue3.mp4', 'blue', 3)], 'main', 0);
  const [a] = (await project(win)).tracks[0].clips.map((c) => c.id);
  await commitTr(a, 'gl:WipeRight');
  await seekAndSettle(win, 2.5); // середина перехода (2…3 с)
  const left = await previewPixel(win, 0.2, 0.5);
  const right = await previewPixel(win, 0.8, 0.5);
  expect(near(left, [0, 0, 255], 40), `слева ${left}`).toBe(true);
  expect(near(right, [255, 0, 0], 40), `справа ${right}`).toBe(true);
});

test('раздел «Переходы»: 181 встроенный переход, разделы шейдеров и плагин пользователя', async () => {
  await store(win, 'setLeftTab', 'transitions');
  await expect(win.locator('.panel-head').first()).toContainText('Переходы · 182'); // 58 + 123 + 1 плагин
  await win.getByTestId('trcat-gl3d').click();
  await expect(win.getByTestId('tr-gl:Cube')).toBeVisible();
  await expect(win.getByTestId('tr-gl:Cube')).toContainText('Куб');
  await win.getByTestId('trcat-plugins').click();
  await expect(win.getByTestId('tr-plug:t/green-flash')).toContainText('Зелёная вспышка');
  // поставить плагин на стык мышью и проверить кадр: в середине — зелёный
  await win.getByTestId('tr-plug:t/green-flash').click();
  expect(((await project(win)).tracks[0].clips[0] as any).transitionOut.type).toBe('plug:t/green-flash');
  await seekAndSettle(win, 2.5); // длительность осталась от прошлого перехода — 1 с (2…3 с), середина
  const mid = await previewPixel(win, 0.5, 0.5);
  expect(near(mid, [0, 255, 0], 50), `середина ${mid}`).toBe(true);
});

test('эффекты: встроенные шейдеры, плагин с параметром, сломанный — ошибка в настройках', async () => {
  const main = (await project(win)).tracks[0].clips;
  await store(win, 'select', [main[0].id]);
  await store(win, 'setLeftTab', 'effects');
  await win.getByTestId('fxcat-shader').click();
  await expect(win.getByTestId('fx-gl:aberration')).toContainText('Хроматическая аберрация');
  await win.getByTestId('fxcat-plugins').click();
  await expect(win.getByTestId('fx-plug:e/broken')).toHaveCount(0); // сломанный не показывается
  await win.getByTestId('fx-plug:e/negative').click();
  await seekAndSettle(win, 1);
  // новый эффект ставится с силой 60%: красный → 0,6 пути к негативу (голубому)
  expect(((await project(win)).tracks[0].clips[0] as any).effects).toEqual([{ type: 'plug:e/negative', amount: 0.6 }]);
  const px = await previewPixel(win, 0.5, 0.5);
  expect(near(px, [102, 153, 153], 25), `${px}`).toBe(true);
  // ползунок параметра во вкладке «Эффекты»: яркость 0 — чёрный
  await win.getByTestId('itab-fx').click();
  await expect(win.locator('.fx-gl')).toContainText('Негатив-плагин');
  await win.evaluate((id) => {
    const k = (window as any).__kadro;
    k.useStore.getState().commit((p: any) => k.timeline.updateClip(p, id, { effects: [{ type: 'plug:e/negative', amount: 1, params: { gain: 0 } }] }));
  }, main[0].id);
  await seekAndSettle(win, 1.05);
  expect(near(await previewPixel(win, 0.5, 0.5), [0, 0, 0], 30)).toBe(true);
  await store(win, 'setSettingsOpen', true);
  await expect(win.getByTestId('plugins-list')).toContainText('Негатив-плагин');
  await expect(win.getByTestId('plugin-error')).toContainText('ERROR');
  await win.keyboard.press('Escape');
});

test('правка файла плагина — сразу в программе; удалённый плагин — растворение без ошибок', async () => {
  plug('effects', 'negative.glsl', INVERT_E.replace('Негатив-плагин', 'Негатив 2'));
  await expect.poll(() => win.evaluate(() => (window as any).__kadro.gl.glDef('plug:e/negative')?.name), { timeout: 10_000 }).toBe('Негатив 2');
  fs.rmSync(path.join(data, 'plugins', 'transitions', 'green-flash.glsl'));
  await expect.poll(() => win.evaluate(() => !!(window as any).__kadro.gl.glDef('plug:t/green-flash')), { timeout: 10_000 }).toBe(false);
  await seekAndSettle(win, 2.5);
  const mid = await previewPixel(win, 0.5, 0.5);
  // растворение красного (уже негатив — голубой… эффект только на первом клипе) и синего — не зелёный
  expect(mid[1] < 200 || mid[2] > 100, `${mid}`).toBe(true);
  // исправленный сломанный плагин появляется
  plug('effects', 'broken.glsl', 'vec4 effect(vec2 uv) { return getColor(uv) + 0.1; }\n');
  await expect.poll(() => win.evaluate(() => !!(window as any).__kadro.gl.glDef('plug:e/broken')), { timeout: 10_000 }).toBe(true);
  expect(await win.evaluate(() => (window as any).__kadro.gl.glPluginErrors().length)).toBe(0);
});

test('экспорт: переход-шейдер и эффект-шейдер в MP4 совпадают с плеером', async () => {
  test.setTimeout(240_000);
  const { colorsVideo, frameDiff, patternImage, rawFrame, act, waitAssetsReady, MEDIA, reset } = await import('./kadro');
  await reset(win);
  await importAt(win, [colorsVideo(), patternImage(), solidVideo('blue3.mp4', 'blue', 3)], 'main', 0);
  const ids = (await project(win)).tracks[0].clips.map((c) => c.id);
  await commitTr(ids[0], 'gl:Cube', 1);           // куб между цветами и узором
  await commitTr(ids[1], 'gl:WipeRight', 0.5);    // шторка между узором и синим
  // эффект-шейдер на узоре
  await win.evaluate((id) => { const k = (window as any).__kadro; k.useStore.getState().commit((p: any) => k.timeline.updateClip(p, id, { effects: [{ type: 'gl:fisheye', amount: 0.8 }] })); }, ids[1]);
  await waitAssetsReady(win);
  // моменты: середина куба (3…4 с → 3.5), внутри клипа с эффектом (4.5), середина шторки
  const p = await project(win);
  const c1 = p.tracks[0].clips[1] as any;
  const c2 = p.tracks[0].clips[2] as any;
  const times = [3.533, 4.5 + 0.033, c2.start + 0.25 + 0.033];
  expect(c1.start).toBeCloseTo(3, 3);
  const pngs: string[] = [];
  for (const t of times) {
    await seekAndSettle(win, t);
    const snap: string = await win.evaluate(() => (window as any).__kadroEngine.snapshot());
    const f = path.join(MEDIA, `glprev_${t.toFixed(2)}.png`);
    fs.writeFileSync(f, Buffer.from(snap.split(',')[1], 'base64'));
    pngs.push(f);
  }
  const out = path.join(MEDIA, 'gl_out.mp4');
  fs.rmSync(out, { force: true });
  const r = await act(win, 'exportTo', out, 720, 30);
  expect(r.ok, r.error).toBe(true);
  const bad: string[] = [];
  times.forEach((t, k) => {
    const a = rawFrame(['-i', pngs[k]], 180, 320);
    const b = rawFrame(['-ss', String(t), '-i', out], 180, 320);
    const d = frameDiff(a, b);
    if (d.mean > 6 || d.p98 > 48) bad.push(`@${t}: ${d.mean.toFixed(2)} / ${d.p98.toFixed(0)}`);
  });
  expect(bad, `не совпали:\n${bad.join('\n')}`).toEqual([]);
  // и это действительно шейдер: кадр куба не похож на простое растворение цветов и узора
  const fadeLike = rawFrame(['-ss', '3.533', '-i', out], 180, 320);
  const plainA = rawFrame(['-ss', '3.0', '-i', out], 180, 320);
  expect(frameDiff(fadeLike, plainA).mean).toBeGreaterThan(10);
});

test('экспорт через окно: этап «Рисую шейдеры», «Остановить» — файла нет, кадры удалены', async () => {
  // эффект-шейдер на всём ролике — кадров много, успеем остановить
  const ids = (await project(win)).tracks[0].clips.map((c) => c.id);
  for (const id of ids) {
    await win.evaluate((i) => { const k = (window as any).__kadro; k.useStore.getState().commit((p: any) => k.timeline.updateClip(p, i, { effects: [{ type: 'gl:haze', amount: 1 }] })); }, id);
  }
  const out = path.join(os.tmpdir(), 'kadro-e2e', 'gl_ui.mp4');
  fs.rmSync(out, { force: true });
  await win.getByTestId('export-open').click();
  await win.getByTestId('export-start').click();
  await expect(win.getByTestId('export-dialog')).toContainText('Рисую шейдеры', { timeout: 20_000 });
  await win.getByTestId('export-cancel').click();
  await expect(win.getByText('Экспорт остановлен')).toBeVisible({ timeout: 30_000 });
  expect(fs.existsSync(out)).toBe(false);
  await expect.poll(() => fs.readdirSync(path.join(data, 'cache', 'export')).filter((f) => f.startsWith('gl_'))).toEqual([]);
  await win.getByRole('button', { name: 'Закрыть' }).last().click();
});
