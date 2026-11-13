// Большой проект (600 клипов): правка одного клипа, выделение и прокрутка не перерисовывают весь таймлайн.
// Считаем не миллисекунды (они зависят от машины), а сколько клипов таймлайна нарисовалось заново.
import { expect, test } from '@playwright/test';
import { colorsVideo, importAt, launch, waitAssetsReady, type Kadro } from './kadro';

let K: Kadro;
test.beforeAll(async () => { K = await launch(); });
test.afterAll(async () => { await K.app.close(); });

/** Сколько клипов таймлайна нарисовалось заново за действие. */
async function renders(action: () => Promise<unknown>): Promise<number> {
  const count = () => K.win.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return (window as any).__kadro.clipRenders.n as number;
  });
  const before = await count();
  await action();
  return (await count()) - before;
}

test('600 клипов: перерисовывается только то, что поменялось или видно', async () => {
  const { win } = K;
  await importAt(win, [colorsVideo()], 'main', 0);
  await importAt(win, [colorsVideo()], 'overlay', 0);
  await waitAssetsReady(win);
  // размножаем: по 300 клипов на двух дорожках
  await win.evaluate(() => {
    const W = window as any;
    const p = structuredClone(W.__kadro.useStore.getState().project);
    let id = 0;
    for (const t of p.tracks) {
      if (!t.clips.length) continue;
      const c0 = t.clips[0];
      const d = Math.min(c0.out - c0.in, 1.5);
      t.clips = Array.from({ length: 300 }, (_, i) => ({ ...structuredClone(c0), id: `perf-${id++}`, start: i * d, out: c0.in + d }));
    }
    W.__kadro.useStore.getState().replace(p);
  });
  await expect(win.getByTestId('clip')).toHaveCount(600);
  await win.waitForTimeout(300);
  const total = 600;

  // правка одного клипа (как шаг ползунка): раньше перерисовывались все 600
  const edit = await renders(() => win.evaluate(() => {
    const W = (window as any).__kadro;
    const st = W.useStore.getState();
    const id = st.project.tracks.find((t: any) => t.kind === 'main').clips[5].id;
    st.commit((p: any) => W.timeline.updateClip(p, id, { opacity: 0.5 }), 'perf');
  }));
  expect(edit).toBeGreaterThan(0);
  expect(edit).toBeLessThanOrEqual(4);
  // и неизменённые клипы — те же объекты, что до правки (история отмены не хранит их копии)
  const shared = await win.evaluate(() => {
    const s = (window as any).__kadro.useStore.getState();
    const prev = s.past[s.past.length - 1];
    const a = prev.tracks.flatMap((t: any) => t.clips), b = s.project.tracks.flatMap((t: any) => t.clips);
    return { same: b.filter((c: any, i: number) => c === a[i]).length, assets: prev.assets === s.project.assets };
  });
  expect(shared.same).toBe(total - 1);
  expect(shared.assets).toBe(true);

  // выделение: только клип, который выделили, и тот, с которого выделение ушло
  const sel = await renders(() => win.evaluate(() => {
    const st = (window as any).__kadro.useStore.getState();
    st.select([st.project.tracks[0].clips[40].id]);
  }));
  expect(sel).toBeLessThanOrEqual(4);

  // прокрутка: только клипы у видимой части, а не все
  const scroll = await renders(() => win.evaluate(() => { document.querySelector('.tl-scroll')!.scrollLeft = 3000; }));
  expect(scroll).toBeGreaterThan(0);
  expect(scroll).toBeLessThan(total / 2);

  // после прокрутки клипы на экране с миниатюрами (а не пустые)
  const strips = await win.evaluate(() => {
    const box = document.querySelector('.tl-scroll')!.getBoundingClientRect();
    return [...document.querySelectorAll('.clip.video')].filter((c) => { const r = c.getBoundingClientRect(); return r.right > box.left + 80 && r.left < box.right - 80; })
      .map((c) => c.querySelectorAll('.strip > div').length);
  });
  expect(strips.length).toBeGreaterThan(0);
  expect(strips.every((n) => n > 0)).toBe(true);
  console.log(`перерисовано клипов из 600 — правка: ${edit}, выделение: ${sel}, прокрутка: ${scroll}`);
  expect(K.errors).toEqual([]);
});
