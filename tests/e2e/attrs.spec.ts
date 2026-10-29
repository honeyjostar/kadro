// Копировать и вставить параметры клипа: Ctrl+Shift+C на одном клипе, Ctrl+Shift+V на других — окно со
// скопированными значениями, галочки, вставка одним шагом отмены; кнопки в панели клипа; русская раскладка.
import { expect, test, type Page } from '@playwright/test';
import { importAt, launch, project, solidVideo, store, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { K = await launch(); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

const clips = async () => (await project(win)).tracks[0].clips as any[];

test('Ctrl+Shift+C → Ctrl+Shift+V: видно, что скопировано, вставляются только отмеченные группы', async () => {
  await importAt(win, [solidVideo('red3.mp4', 'red', 3), solidVideo('blue3.mp4', 'blue', 3), solidVideo('green3.mp4', 'green', 3)], 'main', 0);
  const [a, b, c] = await clips();
  await win.evaluate((id) => {
    const k = (window as any).__kadro;
    k.useStore.getState().commit((p: any) => k.timeline.updateClip(p, id, {
      transform: { scale: 1.5, x: 0.1, y: 0, rotation: 10 }, effects: [{ type: 'glitch', amount: 0.6 }],
      color: { brightness: 1.2, contrast: 1, saturation: 1, warmth: 0, preset: 'none', presetAmount: 1 }, volume: 0.4,
    }));
  }, a.id);
  await store(win, 'select', [a.id]);
  await win.keyboard.press('Control+Shift+C');
  await expect(win.locator('.toast').filter({ hasText: 'скопированы' })).toBeVisible();
  await store(win, 'select', [b.id, c.id]);
  await win.keyboard.press('Control+Shift+V');
  const dlg = win.getByTestId('paste-attrs');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('Скопировано с «red3.mp4»');
  await expect(win.getByTestId('paste-frame')).toContainText('Масштаб 150%');
  await expect(win.getByTestId('paste-frame')).toContainText('Поворот 10°');
  await expect(win.getByTestId('paste-fx')).toContainText('Глитч 60%');
  await expect(win.getByTestId('paste-color')).toContainText('Яркость +20');
  await expect(win.getByTestId('paste-audio')).toContainText('Громкость 40%');
  // изменённые группы отмечены сами, остальные — нет
  for (const g of ['frame', 'fx', 'color', 'audio']) await expect(win.getByTestId(`paste-${g}`).locator('input')).toBeChecked();
  for (const g of ['keys', 'mask', 'speed', 'anim']) await expect(win.getByTestId(`paste-${g}`).locator('input')).not.toBeChecked();
  await win.getByTestId('paste-audio').click(); // звук не переносим
  await expect(win.getByTestId('paste-apply')).toHaveText('Вставить в 2 клипа');
  await win.keyboard.press('Enter');
  await expect(dlg).toHaveCount(0);
  const [, b2, c2] = await clips();
  for (const x of [b2, c2]) {
    expect(x.transform).toEqual({ scale: 1.5, x: 0.1, y: 0, rotation: 10 });
    expect(x.effects).toEqual([{ type: 'glitch', amount: 0.6 }]);
    expect(x.color.brightness).toBe(1.2);
    expect(x.volume).toBe(1);
  }
  // одним Ctrl+Z
  await win.keyboard.press('Control+z');
  const [, b3, c3] = await clips();
  expect([b3.transform.scale, c3.transform.scale, b3.effects ?? [], c3.effects ?? []]).toEqual([1, 1, [], []]);
});

test('кнопки в панели клипа и русская раскладка (Ctrl+Shift+С / М)', async () => {
  const [a, b, c] = await clips();
  await store(win, 'select', [c.id]);
  await win.evaluate((id) => {
    const k = (window as any).__kadro;
    k.useStore.getState().commit((p: any) => k.timeline.updateClip(p, id, { fit: 'cover', fadeIn: 0.5 }));
  }, c.id);
  await win.getByTestId('attrs-copy').click();
  await store(win, 'select', [a.id, b.id]);
  // русская раскладка: те же физические клавиши
  await win.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'М', code: 'KeyV', ctrlKey: true, shiftKey: true, bubbles: true })));
  await expect(win.getByTestId('paste-attrs')).toBeVisible();
  await expect(win.getByTestId('paste-frame')).toContainText('Заполнить');
  await expect(win.getByTestId('paste-audio')).toContainText('Плавное появление 0.5 с');
  await win.getByTestId('paste-apply').click();
  const [a2, b2] = await clips();
  expect([a2.fit, b2.fit, a2.fadeIn, b2.fadeIn]).toEqual(['cover', 'cover', 0.5, 0.5]);
  // без скопированного — подсказка, окна нет
  await store(win, 'setCopiedAttrs', null);
  await win.keyboard.press('Control+Shift+V');
  await expect(win.locator('.toast').filter({ hasText: 'Сначала скопируй параметры' })).toBeVisible();
  await expect(win.getByTestId('paste-attrs')).toHaveCount(0);
});
