// Модели ИИ в настройках: скачивание через сеть Electron (копия на «сервере» — localhost), удаление,
// установка из архива, скачанного вручную, понятная ошибка, когда скачать неоткуда.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launch, store, type Kadro } from './kadro';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-models-e2e-'));
const MODELS = path.join(TMP, 'models');
const SRV = path.join(TMP, 'srv');
fs.mkdirSync(MODELS, { recursive: true });
fs.mkdirSync(SRV, { recursive: true });

/** Поддельный голос Piper: нужные файлы есть, содержимое — заглушка. */
function fakeVoice(name: string): string {
  const src = path.join(TMP, `src-${name}`);
  const d = path.join(src, `vits-piper-${name}`);
  fs.mkdirSync(path.join(d, 'espeak-ng-data'), { recursive: true });
  fs.writeFileSync(path.join(d, `${name}.onnx`), Buffer.alloc(300_000, 7));
  fs.writeFileSync(path.join(d, 'tokens.txt'), '_ 0\n');
  fs.writeFileSync(path.join(d, 'espeak-ng-data', 'phontab'), 'x');
  return src;
}
const irina = fakeVoice('ru_RU-irina-medium');
execFileSync('tar', ['-cf', path.join(SRV, 'vits-piper-ru_RU-irina-medium.tar'), '-C', irina, 'vits-piper-ru_RU-irina-medium']);
const tarBuf = fs.readFileSync(path.join(SRV, 'vits-piper-ru_RU-irina-medium.tar'));
fs.writeFileSync(path.join(SRV, 'manifest.json'), JSON.stringify([{ file: 'vits-piper-ru_RU-irina-medium.tar', size: tarBuf.length, sha256: createHash('sha256').update(tarBuf).digest('hex') }]));
// архив «скачанный в браузере» — как у авторов, .tar.bz2
const denis = fakeVoice('ru_RU-denis-medium');
const MANUAL = path.join(TMP, 'vits-piper-ru_RU-denis-medium.tar.bz2');
execFileSync('tar', ['-cjf', MANUAL, '-C', denis, 'vits-piper-ru_RU-denis-medium']);

let server: http.Server;
let K: Kadro;
let win: Page;
const hits: string[] = [];
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits.push(req.url ?? '');
    const f = path.join(SRV, path.basename(req.url ?? ''));
    if (!fs.existsSync(f)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Length': String(fs.statSync(f).size) });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  K = await launch({ env: { KADRO_MODELS: MODELS, KADRO_AI_MIRROR: `http://127.0.0.1:${port}`, KADRO_AI_MIRROR_ONLY: '1', KADRO_NO_OPEN: '1', KADRO_TEST_ARCHIVE: MANUAL } });
  win = K.win;
  await store(win, 'setSettingsOpen', true);
});
test.afterAll(async () => { await K?.app.close(); server?.close(); });
test.afterEach(async () => { expect(K.errors.filter((e) => !/Failed to load resource/.test(e)), K.errors.join('\n')).toEqual([]); });

test('голос скачивается (копия Kadro, сверка суммы) и удаляется', async () => {
  const row = win.getByTestId('model-tts-irina');
  await expect(row).not.toHaveClass(/ready/);
  await row.getByTestId('model-dl').click();
  await expect(row).toHaveClass(/ready/, { timeout: 30000 });
  expect(hits).toContain('/manifest.json');
  expect(hits).toContain('/vits-piper-ru_RU-irina-medium.tar');
  expect(fs.existsSync(path.join(MODELS, 'vits-piper-ru_RU-irina-medium', 'ru_RU-irina-medium.onnx'))).toBe(true);
  expect(fs.readdirSync(MODELS).filter((f) => /\.(part|tar)$/.test(f))).toEqual([]);
  await row.getByTestId('model-del').click();
  await expect(row).not.toHaveClass(/ready/);
  expect(fs.existsSync(path.join(MODELS, 'vits-piper-ru_RU-irina-medium'))).toBe(false);
});

test('скачать неоткуда — ошибка с причиной и подсказкой, что делать', async () => {
  await win.getByTestId('model-asr-ru').getByTestId('model-dl').click();
  await expect(win.locator('.toast').last()).toContainText('Модели ИИ', { timeout: 30000 });
  await expect(win.getByTestId('model-asr-ru')).not.toHaveClass(/ready/);
});

test('установка из файла, скачанного в браузере (.tar.bz2)', async () => {
  const row = win.getByTestId('model-tts-denis');
  expect(await win.evaluate(() => (window as any).kadro.openModelUrl('https://evil.example/x.tar'))).toBe(false);
  await row.getByTestId('model-browser').click();
  await row.getByTestId('model-file').click();
  await expect(row).toHaveClass(/ready/, { timeout: 30000 });
  expect(fs.existsSync(path.join(MODELS, 'vits-piper-ru_RU-denis-medium', 'tokens.txt'))).toBe(true);
});
