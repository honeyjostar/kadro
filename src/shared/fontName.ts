// Разбор файла шрифта без сторонних библиотек: семейство, начертание, жирность и наклон из таблиц name, OS/2,
// head (форматы .ttf, .otf, .ttc, .woff, .woff2). И вынуть одно начертание из коллекции .ttc в отдельный .ttf —
// браузерный FontFace коллекции не принимает.

export interface FontInfo {
  family: string;      // семейство, как его выбирают в списке (типографское, если есть)
  sub: string;         // начертание: Regular, Bold Italic…
  full: string;        // полное имя
  postscript: string;
  weight: number;      // 100…900
  italic: boolean;
  variable: boolean;   // переменный шрифт (жирность меняется плавно)
  index: number;       // номер в коллекции .ttc, иначе 0
}

/** Читает кусок файла: off — от начала, len байт (меньше, если файл кончился). */
export type ReadAt = (off: number, len: number) => Uint8Array;
/** Распаковка таблиц WOFF (zlib) и WOFF2 (brotli). */
export type Inflate = (data: Uint8Array, kind: 'zlib' | 'brotli', size: number) => Uint8Array;

const tag = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

type Tables = Map<string, () => Uint8Array>;

// WOFF2: известные таблицы по номеру (спецификация W3C, раздел 5.1)
const WOFF2_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC',
  'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar',
  'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

function sfntTables(read: ReadAt, base: number): Tables {
  const head = read(base, 12);
  if (head.length < 12) throw new Error('short');
  const n = u16(head, 4);
  if (!n || n > 200) throw new Error('bad tables');
  const dir = read(base + 12, n * 16);
  const out: Tables = new Map();
  for (let i = 0; i < n; i++) {
    const o = i * 16;
    const off = u32(dir, o + 8), len = u32(dir, o + 12);
    out.set(tag(dir, o), () => read(off, len));
  }
  return out;
}

function woffTables(read: ReadAt, inflate: Inflate): Tables {
  const head = read(0, 44);
  const n = u16(head, 12);
  if (!n || n > 200) throw new Error('bad tables');
  const dir = read(44, n * 20);
  const out: Tables = new Map();
  for (let i = 0; i < n; i++) {
    const o = i * 20;
    const off = u32(dir, o + 4), comp = u32(dir, o + 8), orig = u32(dir, o + 12);
    out.set(tag(dir, o), () => (comp < orig ? inflate(read(off, comp), 'zlib', orig) : read(off, orig)));
  }
  return out;
}

function woff2Tables(read: ReadAt, size: number, inflate: Inflate): Tables {
  const head = read(0, 48);
  if (tag(head, 4) === 'ttcf') throw new Error('woff2 collection');
  const n = u16(head, 12);
  const compressed = u32(head, 20);
  const dir = read(48, Math.min(size - 48, n * 20 + 16));
  let p = 0;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = dir[p++];
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error('bad woff2');
  };
  const list: { tag: string; len: number }[] = [];
  for (let i = 0; i < n; i++) {
    const flags = dir[p++];
    let t: string;
    if ((flags & 63) === 63) { t = tag(dir, p); p += 4; } else t = WOFF2_TAGS[flags & 63];
    const orig = base128();
    const ver = flags >> 6;
    const transformed = t === 'glyf' || t === 'loca' ? ver !== 3 : ver !== 0;
    const len = transformed ? base128() : orig;
    list.push({ tag: t, len });
  }
  let data: Uint8Array | null = null;
  const all = () => (data ??= inflate(read(48 + p, compressed), 'brotli', 0));
  const out: Tables = new Map();
  let off = 0;
  for (const t of list) {
    const at = off;
    out.set(t.tag, () => all().subarray(at, at + t.len));
    off += t.len;
  }
  return out;
}

function utf16(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
  return s;
}

/** Имена из таблицы name: nameID → строка (английская запись Windows, иначе любая). */
function names(b: Uint8Array): Map<number, string> {
  const count = u16(b, 2), strings = u16(b, 4);
  const best = new Map<number, { rank: number; s: string }>();
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 12;
    if (o + 12 > b.length) break;
    const pid = u16(b, o), eid = u16(b, o + 2), lang = u16(b, o + 4), nid = u16(b, o + 6), len = u16(b, o + 8), off = u16(b, o + 10);
    if (![1, 2, 4, 6, 16, 17].includes(nid)) continue;
    const raw = b.subarray(strings + off, strings + off + len);
    let rank: number, s: string;
    if (pid === 3 && (eid === 1 || eid === 10)) { rank = lang === 0x409 ? 0 : 1; s = utf16(raw); }
    else if (pid === 0) { rank = 2; s = utf16(raw); }
    else if (pid === 1 && eid === 0) { rank = 3; s = String.fromCharCode(...raw); }
    else continue;
    s = s.replace(/\0/g, '').trim();
    if (!s) continue;
    const cur = best.get(nid);
    if (!cur || rank < cur.rank) best.set(nid, { rank, s });
  }
  return new Map([...best].map(([k, v]) => [k, v.s]));
}

function infoOf(t: Tables, index: number): FontInfo {
  const nameT = t.get('name');
  if (!nameT) throw new Error('no name table');
  const nm = names(nameT());
  const family = nm.get(16) ?? nm.get(1);
  if (!family) throw new Error('no family name');
  const sub = nm.get(17) ?? nm.get(2) ?? 'Regular';
  let weight = 400, italic = /italic|oblique|курсив/i.test(sub);
  const os2 = t.get('OS/2')?.();
  if (os2 && os2.length >= 64) {
    const w = u16(os2, 4);
    if (w >= 1 && w <= 1000) weight = w < 100 ? w * 100 : w; // старые шрифты пишут 1…9
    const sel = u16(os2, 62);
    italic = !!(sel & 1) || !!(sel & 0x200);
  } else {
    const h = t.get('head')?.();
    if (h && h.length >= 46) { const mac = u16(h, 44); if (mac & 1) weight = 700; if (mac & 2) italic = true; }
  }
  if (!os2 && /bold/i.test(sub)) weight = 700;
  return { family, sub, full: nm.get(4) ?? `${family} ${sub}`, postscript: nm.get(6) ?? '', weight: Math.round(weight / 100) * 100 || 400, italic, variable: t.has('fvar'), index };
}

/** Все начертания из файла шрифта (у .ttc — несколько). Бросает ошибку, если это не шрифт. */
export function fontInfos(read: ReadAt, size: number, inflate: Inflate): FontInfo[] {
  const head = read(0, 16);
  if (head.length < 12) throw new Error('not a font');
  const sig = tag(head, 0);
  const v = u32(head, 0);
  if (sig === 'wOFF') return [infoOf(woffTables(read, inflate), 0)];
  if (sig === 'wOF2') return [infoOf(woff2Tables(read, size, inflate), 0)];
  if (sig === 'ttcf') {
    const n = u32(head, 8);
    if (!n || n > 64) throw new Error('bad collection');
    const offs = read(12, n * 4);
    const out: FontInfo[] = [];
    for (let i = 0; i < n; i++) {
      try { out.push(infoOf(sfntTables(read, u32(offs, i * 4)), i)); } catch { /* битое начертание — пропускаем */ }
    }
    if (!out.length) throw new Error('empty collection');
    return out;
  }
  if (v === 0x00010000 || sig === 'OTTO' || sig === 'true') return [infoOf(sfntTables(read, 0), 0)];
  throw new Error('not a font');
}

/** Одно начертание коллекции .ttc — отдельным файлом .ttf (таблицы копируются как есть). */
export function extractFromCollection(file: Uint8Array, index: number): Uint8Array {
  if (tag(file, 0) !== 'ttcf') return file;
  const base = u32(file, 12 + index * 4);
  const n = u16(file, base + 4);
  const recs: { tag: string; sum: number; off: number; len: number }[] = [];
  for (let i = 0; i < n; i++) {
    const o = base + 12 + i * 16;
    recs.push({ tag: tag(file, o), sum: u32(file, o + 4), off: u32(file, o + 8), len: u32(file, o + 12) });
  }
  const pad = (x: number) => (x + 3) & ~3;
  const headLen = 12 + n * 16;
  const total = recs.reduce((s, r) => s + pad(r.len), headLen);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  out.set(file.subarray(base, base + 12), 0); // версия, число таблиц и поля поиска — как в оригинале
  let at = headLen;
  recs.forEach((r, i) => {
    const o = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[o + k] = r.tag.charCodeAt(k);
    dv.setUint32(o + 4, r.sum);
    dv.setUint32(o + 8, at);
    dv.setUint32(o + 12, r.len);
    out.set(file.subarray(r.off, r.off + r.len), at);
    at += pad(r.len);
  });
  return out;
}
