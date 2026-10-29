import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { extractFromCollection, fontInfos, type Inflate } from '../../src/shared/fontName';

const dir = path.join(__dirname, '..', 'fixtures', 'fonts');
const inflate: Inflate = (d, kind) => (kind === 'zlib' ? zlib.inflateSync(d) : zlib.brotliDecompressSync(d));
const infos = (b: Uint8Array) => fontInfos((o, l) => b.subarray(o, o + l), b.length, inflate);
const read = (n: string) => new Uint8Array(fs.readFileSync(path.join(dir, n)));

describe('разбор файла шрифта', () => {
  it('TTF: семейство, начертание, жирность', () => {
    const [r] = infos(read('KadroTest-Regular.ttf'));
    expect(r).toMatchObject({ family: 'Kadro Test', sub: 'Regular', weight: 400, italic: false, variable: false, index: 0 });
    const [b] = infos(read('KadroTest-Bold.ttf'));
    expect(b).toMatchObject({ family: 'Kadro Test', sub: 'Bold', weight: 700 });
    expect(b.full).toBe('Kadro Test Bold');
    expect(b.postscript).toBe('KadroTest-Bold');
  });

  it('OTF (CFF), WOFF и WOFF2', () => {
    expect(infos(read('KadroBlock.otf'))[0].family).toBe('Kadro Block');
    expect(infos(read('KadroWeb.woff'))[0]).toMatchObject({ family: 'Kadro Web', weight: 400 });
    expect(infos(read('KadroWeb.woff2'))[0]).toMatchObject({ family: 'Kadro Web', sub: 'Regular' });
  });

  it('коллекция .ttc: все начертания, каждое вынимается отдельным .ttf', () => {
    const ttc = read('KadroTestPair.ttc');
    const list = infos(ttc);
    expect(list.map((x) => [x.family, x.weight, x.index])).toEqual([['Kadro Test', 400, 0], ['Kadro Test', 700, 1]]);
    const bold = extractFromCollection(ttc, 1);
    expect(String.fromCharCode(...bold.subarray(0, 4))).not.toBe('ttcf');
    expect(infos(bold)[0]).toMatchObject({ family: 'Kadro Test', weight: 700, index: 0 });
  });

  it('не шрифт — ошибка', () => {
    expect(() => infos(new TextEncoder().encode('это просто текстовый файл, не шрифт'))).toThrow();
    expect(() => infos(new Uint8Array(4))).toThrow();
  });

  it('шрифты Fontsource (настоящие WOFF2 и WOFF) читаются', () => {
    const f = path.join(__dirname, '..', '..', 'node_modules', '@fontsource', 'onest', 'files', 'onest-cyrillic-700-normal.woff2');
    expect(infos(new Uint8Array(fs.readFileSync(f)))[0]).toMatchObject({ family: 'Onest', weight: 700 });
    const w = path.join(__dirname, '..', '..', 'node_modules', '@fontsource', 'onest', 'files', 'onest-cyrillic-400-normal.woff');
    expect(infos(new Uint8Array(fs.readFileSync(w)))[0]).toMatchObject({ family: 'Onest', weight: 400 });
  });
});
