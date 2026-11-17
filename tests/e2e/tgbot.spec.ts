// Монтаж с телефона: токен в настройках → бот подключился → код привязки → хозяин присылает видео → проверка охватов
// и авто-ролик, который Kadro собирает и отправляет обратно. Telegram — поддельный сервер на этом компьютере.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { colorsVideo, launch, store, type Kadro } from './kadro';

const TOKEN = '123456789:AAH_fake_token_abcdefghijklmnop';
const OWNER = 777;

interface Sent { method: string; body: any; bytes?: number }

function fakeTelegram(video: string) {
  const sent: Sent[] = [];
  const updates: any[] = [];
  let id = 1;
  let waiters: (() => void)[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const url = req.url ?? '';
      const ok = (result: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, result })); };
      if (url.startsWith(`/file/bot${TOKEN}/`)) { res.end(fs.readFileSync(video)); return; }
      const m = /^\/bot([^/]+)\/(\w+)/.exec(url);
      if (!m || m[1] !== TOKEN) { res.statusCode = 401; res.end(JSON.stringify({ ok: false, error_code: 401, description: 'Unauthorized' })); return; }
      const method = m[2];
      const raw = Buffer.concat(chunks);
      const body = (req.headers['content-type'] ?? '').includes('json') ? JSON.parse(raw.toString() || '{}') : {};
      if (method === 'getMe') return ok({ id: 1, is_bot: true, username: 'kadro_test_bot' });
      if (method === 'getUpdates') {
        const take = () => updates.filter((u) => u.update_id >= (body.offset ?? 0));
        if (!take().length) await new Promise<void>((r) => { waiters.push(r); setTimeout(r, 1000); });
        return ok(take());
      }
      if (method === 'getFile') return ok({ file_id: body.file_id, file_path: 'videos/file_1.mp4' });
      sent.push({ method, body, bytes: method === 'sendVideo' ? raw.length : undefined });
      return ok(true);
    });
  });
  const push = (u: any) => { updates.push({ update_id: id++, ...u }); const w = waiters; waiters = []; w.forEach((f) => f()); };
  return { server, sent, push };
}

let K: Kadro;
let tg: ReturnType<typeof fakeTelegram>;
const msgs = (chat: number) => tg.sent.filter((s) => s.method === 'sendMessage' && s.body.chat_id === chat).map((s) => String(s.body.text));
const msg = (chat: number, extra: any) => ({ message: { message_id: 1, chat: { id: chat, type: 'private' }, from: { id: chat, first_name: 'Тим' }, date: 0, ...extra } });

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);
test.beforeAll(async () => {
  tg = fakeTelegram(colorsVideo());
  await new Promise<void>((r) => tg.server.listen(0, '127.0.0.1', () => r()));
  const port = (tg.server.address() as AddressInfo).port;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-tg-'));
  K = await launch({ env: { KADRO_TG_API: `http://127.0.0.1:${port}`, KADRO_TG_POLL: '1', KADRO_TG_DEBOUNCE: '200', KADRO_TG_OUT: out, KADRO_NO_OPEN: '1' } });
  await K.win.evaluate(() => { (window as any).__kadroTgIdle = 0; });
});
test.afterAll(async () => { await K?.app.close(); tg?.server.close(); });

test('токен в настройках → бот подключён, код привязки; чужим бот не подчиняется', async () => {
  const win = K.win;
  await store(win, 'setSettingsOpen', true);
  const sec = win.getByTestId('tg-sec');
  await sec.scrollIntoViewIfNeeded();
  await win.getByTestId('tg-token').fill('не токен');
  await win.getByTestId('tg-save').click();
  await expect(win.getByTestId('tg-status')).toContainText('не похоже на токен');
  await win.getByTestId('tg-token').fill(TOKEN);
  await win.getByTestId('tg-save').click();
  await expect(win.getByTestId('tg-status')).toContainText('@kadro_test_bot', { timeout: 15_000 });
  const code = (await win.getByTestId('tg-code').textContent())!.trim();
  expect(code).toMatch(/^\d{6}$/);
  // токен не лежит в настройках открытым текстом там, где есть шифрование системы
  const settings = fs.readFileSync(path.join(K.data, 'settings.json'), 'utf8');
  expect(settings).toContain('"tg"');
  // чужой без кода
  tg.push(msg(555, { text: '/start' }));
  await expect.poll(() => msgs(555).join('\n')).toContain('отправь код из Kadro');
  // хозяин с кодом
  tg.push(msg(OWNER, { text: `/start ${code}` }));
  await expect.poll(() => msgs(OWNER).join('\n')).toContain('Бот подключён');
  await expect(win.getByTestId('tg-status')).toContainText('принимает видео');
  // чужой после привязки — видео не принимается
  tg.push(msg(888, { video: { file_id: 'x', file_size: 1000 } }));
  await expect.poll(() => msgs(888).join('\n')).toContain('личный бот');
  await win.keyboard.press('Escape');
});

test('хозяин прислал видео: кнопки, проверка охватов, авто-ролик приходит в чат', async () => {
  tg.push(msg(OWNER, { video: { file_id: 'v1', file_size: 200_000, mime_type: 'video/mp4' } }));
  await expect.poll(() => tg.sent.some((s) => s.method === 'sendMessage' && s.body.reply_markup?.inline_keyboard), { timeout: 20_000 }).toBe(true);
  tg.push({ callback_query: { id: 'q1', from: { id: OWNER }, message: { message_id: 2, chat: { id: OWNER, type: 'private' } }, data: 'reach' } });
  await expect.poll(() => msgs(OWNER).join('\n'), { timeout: 60_000 }).toMatch(/Проверка охватов:|Ничего не мешает/);
  // то же видео ещё раз — и авто-ролик
  tg.push(msg(OWNER, { video: { file_id: 'v2', file_size: 200_000, mime_type: 'video/mp4' } }));
  await expect.poll(() => tg.sent.filter((s) => s.body.reply_markup).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  tg.push({ callback_query: { id: 'q2', from: { id: OWNER }, message: { message_id: 3, chat: { id: OWNER, type: 'private' } }, data: 'auto' } });
  await expect.poll(() => msgs(OWNER).join('\n'), { timeout: 20_000 }).toContain('Собираю авто-ролик');
  await expect.poll(() => tg.sent.find((s) => s.method === 'sendVideo')?.bytes ?? 0, { timeout: 180_000 }).toBeGreaterThan(10_000);
  expect(K.errors).toEqual([]);
});
