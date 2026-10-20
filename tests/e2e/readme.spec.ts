// Картинки для страницы на GitHub (не тест): KADRO_README=папка npx playwright test readme
// tour/ — кадры демо-ролика (CDP screencast) + список для ffmpeg; *.png — снимки интерфейса.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { launch, ROOT, store, type Kadro } from './kadro';

const OUT = process.env.KADRO_README;
test.skip(!OUT, 'только по запросу: KADRO_README=папка');
test.describe.configure({ mode: 'serial' });
test.setTimeout(600_000);

const DEMO = path.join(ROOT, 'resources', 'demo');
const SCENES = ['sunset', 'city', 'ocean', 'synth', 'space', 'mountains'].map((s) => path.join(DEMO, `${s}.mp4`));

/** Нарисованный курсор: в записи экрана настоящего курсора не видно. */
async function fakeCursor(win: Page): Promise<void> {
  await win.evaluate(() => {
    if (document.getElementById('demo-cursor')) return;
    const c = document.createElement('div');
    c.id = 'demo-cursor';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 10-6.5 1.2L16 20l-3 1.4-3.3-6.8L4 19z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '-40px', top: '-40px', zIndex: '99999', pointerEvents: 'none', transition: 'transform 0.12s' });
    document.body.appendChild(c);
    window.addEventListener('mousemove', (e) => { c.style.left = `${e.clientX - 3}px`; c.style.top = `${e.clientY - 2}px`; }, true);
    window.addEventListener('mousedown', () => { c.style.transform = 'scale(0.8)'; }, true);
    window.addEventListener('mouseup', () => { c.style.transform = ''; }, true);
  });
}
/** Плеер дорисовал кадр (не чёрный). */
async function waitPreview(win: Page): Promise<void> {
  await win.waitForFunction(() => {
    const c = document.querySelector('[data-testid=preview]') as HTMLCanvasElement | null;
    if (!c) return false;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
    return lit > d.length / (4 * 97) * 0.3;
  }, undefined, { timeout: 30_000 });
}
/** Всплывающие подсказки не нужны на снимках. */
const noToasts = (win: Page) => win.addStyleTag({ content: '.toasts { display: none !important; }' });
async function clickOn(win: Page, l: Locator, pause = 250): Promise<void> {
  await l.scrollIntoViewIfNeeded();
  const b = (await l.boundingBox())!;
  await win.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 });
  await win.waitForTimeout(140);
  await win.mouse.down();
  await win.waitForTimeout(70);
  await win.mouse.up();
  await win.waitForTimeout(pause);
}

test('демо-ролик для README: авто-ролик за 20 секунд', async () => {
  const dir = path.join(OUT!, 'tour');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const K = await launch({ env: { KADRO_SKIP_HOME: '', KADRO_TEST_PICK: SCENES.join('|') } });
  const win = K.win;
  await expect(win.getByTestId('home')).toBeVisible();
  await fakeCursor(win);
  await noToasts(win);
  await win.mouse.move(700, 820);
  await win.waitForTimeout(1500);
  const cdp = await K.app.context().newCDPSession(win);
  const frames: { t: number; file: string }[] = [];
  cdp.on('Page.screencastFrame', (f) => {
    const file = path.join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ t: f.metadata.timestamp ?? Date.now() / 1000, file });
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1480, maxHeight: 920, everyNthFrame: 1 });
  const t0 = Date.now();
  await win.waitForTimeout(1800);
  await clickOn(win, win.getByTestId('home-auto'), 500);
  await clickOn(win, win.getByTestId('auto-add-files'), 450);
  await clickOn(win, win.getByTestId('auto-music-demo'), 300);
  await clickOn(win, win.getByTestId('auto-len-15'), 300);
  await clickOn(win, win.getByTestId('auto-title'), 100);
  await win.keyboard.type('Лето 2026', { delay: 90 });
  await win.waitForTimeout(400);
  await clickOn(win, win.getByTestId('auto-build'), 0);
  const buildStart = Date.now() / 1000;
  await expect(win.getByTestId('auto-dialog')).toHaveCount(0, { timeout: 60_000 });
  await waitPreview(win);
  const buildEnd = Date.now() / 1000;
  await win.mouse.move(760, 600, { steps: 12 });
  await win.waitForTimeout(1200);
  await clickOn(win, win.getByTestId('play'), 0);
  await win.waitForTimeout(6500);
  await clickOn(win, win.getByTestId('play'), 300);
  await clickOn(win, win.getByTestId('tpl-auto-variant'), 300);
  await store(win, 'setPlayhead', 0);
  await waitPreview(win);
  await win.waitForTimeout(500);
  await clickOn(win, win.getByTestId('play'), 0);
  await win.waitForTimeout(4000);
  await cdp.send('Page.stopScreencast');
  const end = (Date.now() - t0) / 1000;
  // список кадров с длительностями для ffmpeg (concat)
  const lines: string[] = [];
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.t ?? frames[i].t + 0.1;
    lines.push(`file '${path.basename(f.file)}'`, `duration ${Math.max(0.01, next - f.t).toFixed(4)}`);
  });
  lines.push(`file '${path.basename(frames[frames.length - 1].file)}'`);
  fs.writeFileSync(path.join(dir, 'list.txt'), lines.join('\n'));
  // сборка (разбор видео) в гифке идёт быстрее — отметки времени для ускорения
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ frames: frames.map((f) => f.t), buildStart, buildEnd }));
  console.log(`кадров: ${frames.length}, секунд: ${end.toFixed(1)}`);
  await K.app.close();
});

test('снимки интерфейса для README', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-readme-'));
  const K: Kadro = await launch({ data, env: { KADRO_SKIP_HOME: '', KADRO_TEST_PICK: SCENES.join('|'), KADRO_TEST_FOLDER: DEMO } });
  const win = K.win;
  const shot = (n: string) => win.screenshot({ path: path.join(OUT!, `${n}.png`) });
  await noToasts(win);
  await expect(win.getByTestId('home')).toBeVisible();
  await win.mouse.move(1470, 10);
  await win.waitForTimeout(2600);
  await shot('home');

  await win.getByTestId('home-auto').click();
  await win.getByTestId('auto-add-files').click();
  await win.getByTestId('auto-music-demo').click();
  await win.getByTestId('auto-len-15').click();
  await win.getByTestId('auto-title').fill('Лето 2026');
  await win.waitForTimeout(300);
  await shot('auto');
  await win.getByTestId('auto-build').click();
  await expect(win.getByTestId('auto-dialog')).toHaveCount(0, { timeout: 60_000 });
  await win.waitForTimeout(1200);
  await store(win, 'setPlayhead', 0.9);
  await win.mouse.move(1470, 900);
  await win.waitForTimeout(1500);
  await shot('editor');

  // библиотека папок
  await win.getByTestId('tab-media').click();
  await win.getByTestId('media-view-library').click();
  await store(win, 'select', []);
  await win.getByTestId('lib-add').click();
  await win.waitForTimeout(2500);
  await shot('library');

  // перспектива: видео на 4 точках поверх другого видео + текст, уходящий к горизонту
  await win.evaluate(async (scenes) => {
    const k = (window as any).__kadro;
    await k.actions.newProjectAction('16:9');
    const ids: string[] = await k.actions.importPaths([scenes[4]], { mode: 'main', at: 0 });
    const ov: string[] = await k.actions.importPaths([scenes[0]], { mode: 'overlay', at: 0 });
    const s = k.useStore.getState();
    const clip = s.project.tracks.flatMap((t: any) => t.clips).find((c: any) => c.assetId === ov[0]);
    s.commit((p: any) => k.timeline.updateClip(p, clip.id, { pin: [0.68, 0.05, 0.95, 0.11, 0.68, 0.43, 0.94, 0.38] }));
    const r = k.timeline.addText(k.useStore.getState().project, 0, 'ГЛАВА ПЕРВАЯ\nКАК Я СДЕЛАЛ\nСВОЙ РЕДАКТОР', { font: 'Russo One', size: 150, color: '#ffe14d', shadow: false });
    k.useStore.getState().commit(() => k.timeline.updateClip(r.project, r.clipId, { tilt: { x: 62, y: 0 }, x: 0.5, y: 0.7, duration: 5 }));
    k.useStore.getState().select([clip.id]);
    void ids;
  }, SCENES);
  await win.getByTestId('itab-basic').click().catch(() => undefined);
  await win.getByText('Углы — натянуть на 4 точки').scrollIntoViewIfNeeded();
  await store(win, 'setPlayhead', 2);
  await win.waitForTimeout(2000);
  await shot('perspective');

  // светлая тема
  await store(win, 'setThemePref', 'light');
  await win.evaluate(async () => { await (window as any).__kadro.actions.openDemo(); });
  await win.waitForTimeout(800);
  await store(win, 'setPlayhead', 5.2);
  const at = await win.evaluate(() => { const p = (window as any).__kadro.useStore.getState().project; return p.tracks[0].clips.find((c: any) => c.start <= 5.2 && c.start + (c.out - c.in) / c.speed > 5.2)?.id; });
  await store(win, 'select', [at]);
  await win.getByTestId('tab-filters').click();
  await win.waitForTimeout(2000);
  await shot('light');
  await store(win, 'setThemePref', 'dark');
  await K.app.close();
});

test('3D-объект (программная видеокарта)', async () => {
  const K = await launch({ env: { KADRO_SWIFTSHADER: '1' } });
  const win = K.win;
  await win.evaluate(async (scene) => {
    const k = (window as any).__kadro;
    await k.actions.importPaths([scene], { mode: 'main', at: 0 });
  }, SCENES[3]);
  await store(win, 'setPlayhead', 1.5);
  await win.getByTestId('tab-3d').click();
  await win.waitForTimeout(3000);
  await win.getByTestId('m3d-heart').click();
  await win.getByTestId('m3d-mat-metal').click();
  await win.waitForTimeout(2500);
  await win.screenshot({ path: path.join(OUT!, '3d.png') });
  await K.app.close();
});
