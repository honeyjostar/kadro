// Канал Kadro в Telegram: кнопка на главном экране и в «Настройки» → «Помощь» открывает t.me/kadroOffical.
import { expect, test } from '@playwright/test';
import { launch, store } from './kadro';

test('канал в Telegram — на главном экране и в настройках', async () => {
  const K = await launch({ env: { KADRO_SKIP_HOME: '', KADRO_NO_OPEN: '1' } });
  const win = K.win;
  await expect(win.getByTestId('home-tg')).toBeVisible();
  await win.getByTestId('home-tg').click();
  expect(await win.evaluate(() => (window as any).kadro.openUrl('https://t.me/kadroOffical'))).toBe(true);
  expect(await win.evaluate(() => (window as any).kadro.openUrl('https://t.me/other'))).toBe(false);
  await store(win, 'setSettingsOpen', true);
  await expect(win.getByTestId('help-tg')).toBeVisible();
  await win.getByTestId('help-tg').click();
  expect(K.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  await K.app.close();
});
