// Снимки интерфейса для проверки глазами (не тест): KADRO_SHOTS=папка npx playwright test shots
import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { colorsVideo, importAt, launch, MEDIA, reset, seekAndSettle, waitAssetsReady, type Kadro } from './kadro';

const OUT = process.env.KADRO_SHOTS;
test.skip(!OUT, 'только по запросу: KADRO_SHOTS=папка');

let K: Kadro;
test.beforeAll(async () => { colorsVideo(); K = await launch(); fs.mkdirSync(OUT!, { recursive: true }); });
test.afterAll(async () => { await K?.app.close(); });

const THEME = process.env.KADRO_SHOTS_THEME; // light / dark — снимки в нужной теме
const shot = (name: string) => K.win.screenshot({ path: path.join(OUT!, `${THEME ? `${THEME}-` : ''}${name}.png`) });

test('снимки', async () => {
  const win = K.win;
  const only = (process.env.KADRO_SHOTS_ONLY ?? '').split(',').filter(Boolean);
  const want = (n: string) => !only.length || only.includes(n);
  if (THEME) {
    await win.evaluate((t) => (window as any).__kadro.useStore.getState().setThemePref(t), THEME);
    await win.waitForTimeout(400);
  }
  await reset(win);
  await importAt(win, [path.join(MEDIA, 'colors.mp4')], 'main', 0);
  await waitAssetsReady(win);
  await seekAndSettle(win, 1);
  if (want('start')) await shot('start');
  if (want('text')) {
    await win.click('[data-testid=tab-text]');
    await win.waitForTimeout(300);
    await shot('text-panel');
    await win.click('[data-testid=add-text]');
    await win.waitForTimeout(400);
    await shot('text-added');
    await win.click('[data-testid=text-font]');
    await win.waitForTimeout(400);
    await shot('font-picker');
    await win.keyboard.press('Escape');
  }
  if (want('effects')) {
    const [main] = (await K.win.evaluate(() => (window as any).__kadro.useStore.getState().project.tracks[0].clips.map((c: any) => c.id))) as string[];
    await K.win.evaluate((id) => (window as any).__kadro.useStore.getState().select([id]), main);
    await win.click('[data-testid=tab-effects]');
    await win.waitForTimeout(500);
    await shot('effects');
    for (const cat of ['Свет и цвет', 'Стиль', 'Кадр', 'Частицы']) {
      await win.locator('.chips button', { hasText: cat }).first().click();
      await win.waitForTimeout(400);
      await shot(`effects-${cat}`);
    }
  }
  if (want('filters')) {
    const [main] = (await K.win.evaluate(() => (window as any).__kadro.useStore.getState().project.tracks[0].clips.map((c: any) => c.id))) as string[];
    await K.win.evaluate((id) => (window as any).__kadro.useStore.getState().select([id]), main);
    await win.click('[data-testid=tab-filters]');
    await win.waitForTimeout(800);
    await shot('filters');
    await win.click('[data-testid=filter-tealorange]');
    await seekAndSettle(win, 1.5);
    await shot('filters-applied');
  }
  if (want('home')) {
    await K.win.evaluate(() => (window as any).__kadro.useStore.getState().setHome(true));
    await win.waitForTimeout(2500);
    await shot('home');
    await win.locator('.home-main').evaluate((el) => el.scrollTo(0, 10_000));
    await win.waitForTimeout(800);
    await shot('home-bottom');
    await win.getByTestId('home-tpl-party').hover();
    await win.waitForTimeout(1500);
    await shot('home-hover');
    await K.win.evaluate(() => (window as any).__kadro.useStore.getState().setHome(false));
  }
  if (want('templates')) {
    await win.click('[data-testid=tab-templates]');
    await win.waitForTimeout(1500);
    await shot('templates');
    await win.getByTestId('tpl-birthday').getByRole('button').first().click();
    await win.waitForTimeout(1200);
    await shot('templates-open');
  }
  if (want('demo')) {
    await K.win.evaluate(() => (window as any).__kadro.actions.openDemo());
    await win.waitForFunction(() => (window as any).__kadro.useStore.getState().project.tracks[0].clips.length > 0, undefined, { timeout: 60_000 });
    await waitAssetsReady(win);
    await seekAndSettle(win, 3);
    await K.win.evaluate(() => { const s = (window as any).__kadro.useStore.getState(); s.select([s.project.tracks[0].clips[1].id]); });
    await win.waitForTimeout(500);
    await shot('demo-project');
    if (want('anim')) {
      await win.getByTestId('itab-anim').click();
      await win.getByTestId('canim-in-pop').click();
      await win.waitForTimeout(400);
      await shot('anim-tab');
    }
    if (want('zones')) {
      await K.win.evaluate(() => (window as any).__kadro.useStore.getState().setSafeZone('tiktok'));
      await K.win.evaluate(() => { const k = (window as any).__kadro; k.useStore.getState().commit((p: any) => { const r = k.timeline.addText(p, 2.5, 'ПОДПИСЬ ВНИЗУ'); return k.timeline.updateClip(r.project, r.clipId, { y: 0.86 }); }); });
      await seekAndSettle(win, 3);
      await shot('zones');
      await win.getByTestId('export-open').click();
      await win.getByRole('button', { name: 'TikTok', exact: true }).click();
      await win.waitForTimeout(600);
      await shot('export-check');
      await win.keyboard.press('Escape');
      await K.win.evaluate(() => (window as any).__kadro.useStore.getState().setSafeZone(null));
    }
  }
  if (want('library')) {
    // папка «Мои съёмки» из демо-роликов: подпапки, видео и музыка
    const root = path.join(MEDIA, 'Мои съёмки');
    fs.rmSync(root, { recursive: true, force: true });
    const demo = path.join(__dirname, '../../resources/demo');
    const put = (sub: string, names: string[]) => {
      fs.mkdirSync(path.join(root, sub), { recursive: true });
      for (const n of names) fs.copyFileSync(path.join(demo, `${n}.mp4`), path.join(root, sub, `${n}.mp4`));
    };
    put('Лето 2026', ['sunset', 'ocean', 'mountains']);
    put('Город', ['city', 'synth']);
    put('', ['space', 'liquid']);
    fs.copyFileSync(path.join(demo, 'beat.m4a'), path.join(root, 'бит для рилса.m4a'));
    await win.click('[data-testid=tab-media]');
    await K.win.evaluate((r) => (window as any).__kadro.actions.dropPaths([r]), root);
    await win.waitForTimeout(2500);
    await shot('library');
    await win.locator('[data-testid=lib-subdir]', { hasText: 'Лето' }).click();
    await win.waitForTimeout(2000);
    await shot('library-sub');
    await win.click('[data-testid=lib-home]');
    await win.waitForTimeout(500);
    await shot('library-folders');
  }
  if (want('transitions')) {
    await importAt(win, [path.join(MEDIA, 'colors.mp4')], 'main', 99);
    await waitAssetsReady(win);
    await win.click('[data-testid=tab-transitions]');
    await win.waitForTimeout(400);
    await shot('transitions');
    await win.click('[data-testid=tr-radial]');
    await seekAndSettle(win, 4);
    await shot('transition-applied');
  }
});
