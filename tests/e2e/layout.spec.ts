// Вёрстка разделов слева: ничего не вылезает за ширину панели (кнопки «Подписаться», мемы, стикеры…) —
// по-русски и по-английски, и с шрифтом пошире (на Windows шрифты бывают шире, чем в тестах).
import { expect, test } from '@playwright/test';
import { importAt, launch, project, solidVideo, store, waitAssetsReady } from './kadro';

test.setTimeout(180_000);

for (const lang of ['ru', 'en']) {
  test(`разделы слева не шире панели (${lang})`, async () => {
    const K = await launch({ env: { KADRO_LANG: lang } });
    const win = K.win;
    await importAt(win, [solidVideo('grey3.mp4', 'gray', 3)], 'main', 0);
    await waitAssetsReady(win);
    await store(win, 'select', [(await project(win)).tracks[0].clips[0].id]);
    const bad: string[] = [];
    for (const wide of [false, true]) {
      // «шрифт пошире»: та же вёрстка с растянутыми буквами
      await win.evaluate((w) => { document.documentElement.style.letterSpacing = w ? '0.06em' : ''; }, wide);
      for (const tab of ['media', 'audio', 'text', 'captions', 'effects', 'transitions', 'filters', 'ai', 'templates', '3d']) {
        await store(win, 'setLeftTab', tab);
        await win.waitForTimeout(200);
        const over = await win.evaluate(() => {
          const body = document.querySelector('aside.panel .panel-body') as HTMLElement | null;
          if (!body) return [];
          const r = body.getBoundingClientRect();
          return [...body.querySelectorAll('button, .chips, .ai-card, .meme-btn, .subscribe-row')]
            .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > r.right + 1; })
            .slice(0, 3).map((e) => `${e.className || e.tagName}: ${(e.textContent ?? '').trim().slice(0, 30)}`);
        });
        bad.push(...over.map((o) => `${wide ? 'wide ' : ''}${tab} — ${o}`));
      }
    }
    expect(bad).toEqual([]);
    await K.app.close();
  });
}
