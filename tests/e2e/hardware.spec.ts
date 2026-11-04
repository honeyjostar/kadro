// Компьютер: видеокарта и процессор в настройках, причина, почему видеокарта не кодирует, кнопка драйвера,
// подсказка в окне экспорта. «Железо» подставное (KADRO_TEST_HW) — на машине тестов видеокарты нет.
import { expect, test, type Page } from '@playwright/test';
import { launch, store, type Kadro } from './kadro';

const OLD_DRIVER = JSON.stringify({
  cpu: 'Intel(R) Core(TM) i5-12400F', threads: 12, ramGb: 16,
  gpus: [{ name: 'NVIDIA GeForce RTX 3060', vendor: 'nvidia', driver: '552.22', vramGb: 12 }],
  encoders: [
    { id: 'nvenc', ok: false, code: 'driver-old', need: '570.0', detail: 'The minimum required Nvidia driver for nvenc is 570.0 or newer' },
    { id: 'mf', ok: false, code: 'no-hw' },
  ],
});

let K: Kadro;
let win: Page;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  K = await launch({ env: { KADRO_TEST_HW: OLD_DRIVER, KADRO_NO_OPEN: '1' } });
  win = K.win;
});
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors.filter((e) => !/Failed to load resource/.test(e)), K.errors.join('\n')).toEqual([]); });

test('настройки: процессор, видеокарта и почему она не кодирует', async () => {
  await store(win, 'setSettingsOpen', true);
  const sec = win.getByTestId('hw');
  await expect(sec.getByTestId('hw-cpu')).toContainText('i5-12400F');
  await expect(sec.getByTestId('hw-cpu')).toContainText('12');
  await expect(sec.getByTestId('hw-gpu')).toContainText('RTX 3060');
  await expect(sec.getByTestId('hw-gpu')).toContainText('552.22');
  const nv = sec.getByTestId('hw-enc-nvenc');
  await expect(nv).toHaveClass(/bad/);
  await expect(nv).toContainText('552.22');
  await expect(nv).toContainText('570.0');
  await expect(sec.getByTestId('hw-summary')).toContainText('процессор');
  // кнопка драйвера — на сайт NVIDIA (в тестах браузер не открывается)
  await expect(sec.getByTestId('hw-driver')).toContainText('NVIDIA');
  expect(await win.evaluate(() => (window as any).kadro.openDriverPage('nvidia'))).toBe(true);
  expect(await win.evaluate(() => (window as any).kadro.openDriverPage('evil'))).toBe(false);
  await sec.getByTestId('hw-recheck').click();
  await expect(sec.getByTestId('hw-recheck')).toBeEnabled();
  await win.keyboard.press('Escape');
});

test('экспорт: видно, что видеокарта не кодирует и почему; выбор кодировщика', async () => {
  await win.getByTestId('export-open').click();
  await expect(win.getByTestId('export-hw')).toContainText('не кодирует');
  await expect(win.getByTestId('export-hw-why')).toContainText('570.0');
  await win.getByTestId('export-encoder').locator('[data-value=gpu]').click();
  await expect(win.getByTestId('export-encoder').locator('[data-value=gpu]')).toHaveClass(/active/);
  await win.keyboard.press('Escape');
});

test('видеокарта работает: в экспорте — её имя', async () => {
  await K.app.close();
  K = await launch({ env: { KADRO_NO_OPEN: '1', KADRO_TEST_HW: JSON.stringify({
    cpu: 'AMD Ryzen 5 5600', threads: 12, ramGb: 32,
    gpus: [{ name: 'AMD Radeon RX 6600', vendor: 'amd', driver: '31.0.24027.1012' }],
    encoders: [{ id: 'amf', ok: true }, { id: 'mf', ok: true }],
  }) } });
  win = K.win;
  await win.getByTestId('export-open').click();
  await expect(win.getByTestId('export-hw')).toContainText('AMD Radeon RX 6600');
  await expect(win.getByTestId('export-hw-why')).toHaveCount(0);
  await win.keyboard.press('Escape');
  await store(win, 'setSettingsOpen', true);
  await expect(win.getByTestId('hw-enc-amf')).toHaveClass(/ok/);
  await expect(win.getByTestId('hw-summary')).toContainText('AMD');
});
