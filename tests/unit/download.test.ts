// Скачивание моделей: докачка после обрыва, запасной источник, контрольная сумма, распаковка .tar и .tar.bz2,
// понятные причины ошибок. Сервер — свой, на localhost.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { downloadModelArchive, fetchToFile, HttpError, netReason } from '../../src/main/ai/download';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-dl-'));
const BLOB = Buffer.alloc(3_000_000);
for (let i = 0; i < BLOB.length; i++) BLOB[i] = (i * 31 + (i >> 9)) & 255;
let dropOnce = true; // первый запрос обрывается на середине
let base = '';
let server: http.Server;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

// архив модели: папка model-x с файлами
const modelSrc = path.join(dir, 'src');
fs.mkdirSync(path.join(modelSrc, 'model-x'), { recursive: true });
fs.writeFileSync(path.join(modelSrc, 'model-x', 'weights.onnx'), BLOB.subarray(0, 200_000));
fs.writeFileSync(path.join(modelSrc, 'model-x', 'tokens.txt'), 'a 0\nb 1\n');
execFileSync('tar', ['-cf', path.join(dir, 'model-x.tar'), '-C', modelSrc, 'model-x']);
execFileSync('tar', ['-cjf', path.join(dir, 'model-x.tar.bz2'), '-C', modelSrc, 'model-x']);
const TAR = fs.readFileSync(path.join(dir, 'model-x.tar'));
const BZ = fs.readFileSync(path.join(dir, 'model-x.tar.bz2'));

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const body = req.url === '/blob' ? BLOB : req.url === '/model-x.tar' ? TAR : req.url === '/model-x.tar.bz2' ? BZ : null;
    if (!body) { res.writeHead(404).end(); return; }
    const m = /bytes=(\d+)-/.exec(req.headers.range ?? '');
    const start = m ? Number(m[1]) : 0;
    res.writeHead(m ? 206 : 200, { 'Content-Length': String(body.length - start), ...(m ? { 'Content-Range': `bytes ${start}-${body.length - 1}/${body.length}` } : {}) });
    if (req.url === '/blob' && dropOnce && !m) {
      dropOnce = false;
      res.write(body.subarray(0, 1_000_000), () => res.destroy());
      return;
    }
    res.end(body.subarray(start));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('скачивание моделей', () => {
  it('обрыв на середине — докачка с места обрыва, файл целый', async () => {
    const dest = path.join(dir, 'blob.bin');
    const seen: number[] = [];
    await fetchToFile(`${base}/blob`, dest, { size: BLOB.length, onBytes: (g) => seen.push(g) });
    expect(sha(fs.readFileSync(dest))).toBe(sha(BLOB));
    expect(fs.existsSync(`${dest}.part`)).toBe(false);
    // вторая попытка началась не с нуля
    const restartAt = seen.findIndex((g, i) => i > 0 && g < seen[i - 1]);
    expect(restartAt).toBe(-1);
  }, 30000);

  it('первый источник без файла — берётся второй; .tar.bz2 распаковывается', async () => {
    const root = path.join(dir, 'models1');
    const ready = () => fs.existsSync(path.join(root, 'model-x', 'tokens.txt'));
    await downloadModelArchive([
      { url: `${base}/nope.tar`, label: 'копия' },
      { url: `${base}/model-x.tar.bz2`, label: 'оригинал' },
    ], root, 'model-x', ready, () => undefined);
    expect(ready()).toBe(true);
    expect(fs.readFileSync(path.join(root, 'model-x', 'weights.onnx')).length).toBe(200_000);
    expect(fs.readdirSync(root).sort()).toEqual(['model-x']);
  });

  it('копия с контрольной суммой: неверная сумма — ошибка с причинами всех источников', async () => {
    const root = path.join(dir, 'models2');
    const ready = () => fs.existsSync(path.join(root, 'model-x', 'tokens.txt'));
    await expect(downloadModelArchive([{ url: `${base}/model-x.tar`, sha256: 'ff'.repeat(32), size: TAR.length, label: 'копия' }], root, 'model-x', ready, () => undefined))
      .rejects.toThrow(/контрольная сумма/);
    await downloadModelArchive([{ url: `${base}/model-x.tar`, sha256: sha(TAR), size: TAR.length, label: 'копия' }], root, 'model-x', ready, () => undefined);
    expect(ready()).toBe(true);
  });

  it('понятные причины', () => {
    expect(netReason(new HttpError(404))).toMatch(/404/);
    expect(netReason(new HttpError(403))).toMatch(/блокировка/);
    expect(netReason(new Error('net::ERR_CERT_AUTHORITY_INVALID'))).toMatch(/сертификат/);
    expect(netReason(Object.assign(new TypeError('fetch failed'), { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } }))).toMatch(/сертификат/);
    expect(netReason(new Error('net::ERR_PROXY_CONNECTION_FAILED'))).toMatch(/прокси/);
    expect(netReason(new Error('net::ERR_CONNECTION_RESET'))).toMatch(/обрывается/);
    expect(netReason(new Error('net::ERR_NAME_NOT_RESOLVED'))).toMatch(/интернет/);
  });
});
