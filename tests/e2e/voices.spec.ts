// Голоса для озвучки: список по языкам, студийные английские (Kokoro) одним архивом, лёгкие (Piper) на других языках,
// «характер» — эффект голоса на готовой озвучке. Голоса должны лежать в KADRO_MODELS (как и остальные модели тестов).
import { expect, test, type Page } from '@playwright/test';
import { launch, project, reset, type Kadro } from './kadro';

let K: Kadro;
let win: Page;
test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);
test.beforeAll(async () => { K = await launch(); win = K.win; });
test.afterAll(async () => { await K?.app.close(); });
test.afterEach(async () => { expect(K.errors, K.errors.join('\n')).toEqual([]); });

const audioClips = async () => (await project(win)).tracks.filter((t) => t.kind === 'audio').flatMap((t) => t.clips) as any[];
async function speak(text: string, voice: string, fx = 'none') {
  await reset(win);
  await win.getByTestId('tab-text').click();
  await win.getByTestId('add-text').click();
  await win.getByTestId('itab-text').click();
  await win.getByTestId('text-input').fill(text);
  await win.getByTestId('tts-voice').selectOption(voice);
  await win.getByTestId('tts-fx').selectOption(fx);
  await win.getByTestId('tts-run').click();
  await expect.poll(async () => (await audioClips()).length, { timeout: 240_000 }).toBe(1);
  return (await audioClips())[0];
}

test('список: голоса по языкам, студийные английские — один архив', async () => {
  const voices = await win.evaluate(() => (window as any).kadro.ttsVoices());
  const by = (id: string) => voices.find((v: any) => v.id === id);
  expect(by('irina')).toMatchObject({ lang: 'ru', gender: 'f', hq: false, label: 'Ирина — русский, женский' });
  expect(by('heart')).toMatchObject({ lang: 'en', gender: 'f', hq: true, label: 'Heart — английский, женский, студийный' });
  expect(by('emma').label).toBe('Emma — английский (британский), женский, студийный');
  const studio = voices.filter((v: any) => v.hq);
  expect(studio.length).toBe(6);
  expect(new Set(studio.map((v: any) => v.pack)).size).toBe(1);
  expect(new Set(voices.map((v: any) => v.lang))).toEqual(new Set(['ru', 'en', 'de', 'es', 'fr', 'pl', 'tr']));
  // в окне текста голоса разложены по языкам
  await win.getByTestId('tab-text').click();
  await win.getByTestId('add-text').click();
  await win.getByTestId('itab-text').click();
  const groups = await win.getByTestId('tts-voice').locator('optgroup').evaluateAll((g) => g.map((x) => (x as HTMLOptGroupElement).label));
  expect(groups).toEqual(['Русский', 'Английский', 'Немецкий', 'Испанский', 'Французский', 'Польский', 'Турецкий']);
});

test('студийный английский голос (Kokoro) озвучивает текст', async () => {
  const c = await speak('Hello from Kadro.', 'heart');
  expect(c.out - c.in).toBeGreaterThan(0.8);
  expect(c.out - c.in).toBeLessThan(5);
});

test('немецкий голос и характер «Робот»: эффект голоса — на готовой озвучке', async () => {
  const c = await speak('Hallo, das ist Kadro.', 'thorsten', 'robot');
  expect(c.out - c.in).toBeGreaterThan(0.8);
  await expect.poll(async () => (await audioClips())[0].voice, { timeout: 120_000 }).toMatchObject({ enabled: true, status: 'ready', effect: 'robot' });
});
