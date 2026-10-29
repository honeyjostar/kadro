// Картинки установщика (NSIS): боковая панель приветствия и завершения и шапка внутренних страниц.
// Рисуем HTML в Chromium (шрифты Kadro — Unbounded и Onest), снимаем в 2× для чётких экранов с масштабом
// и сохраняем BMP 24 бит — другой формат NSIS не понимает. Запуск: node scripts/make-installer-art.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'resources', 'installer');
// шрифты встраиваем прямо в страницу: файлы с диска страница из setContent подключить не может
const font = (pkg, file) => `url("data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file)).toString('base64')}") format("woff2")`;

const FONTS = `
@font-face { font-family: Unbounded; font-weight: 700; src: ${font('unbounded', 'unbounded-latin-700-normal.woff2')}; }
@font-face { font-family: Onest; font-weight: 500; src: ${font('onest', 'onest-cyrillic-500-normal.woff2')}; unicode-range: U+0400-04FF; }
@font-face { font-family: Onest; font-weight: 500; src: ${font('onest', 'onest-latin-500-normal.woff2')}; unicode-range: U+0000-00FF; }
* { margin: 0; box-sizing: border-box; }
html, body { background: transparent; }
`;

// значок Kadro — как в программе (чёрный: рамка-«плёнка» и кнопка воспроизведения)
const MARK = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="13.5" fill="#000" stroke="rgba(255,255,255,0.22)" stroke-width="1.5"/>
  <rect x="12" y="12" width="40" height="4.5" rx="2.25" fill="#fff"/><rect x="12" y="47.5" width="40" height="4.5" rx="2.25" fill="#fff"/>
  <path d="M26 23.5v17l16-8.5z" fill="#fff"/></svg>`;

// боковая панель 164×314: знак, название и кусочек таймлайна Kadro с плейхедом
function wave(n, seed) {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: n }, (_, i) => `<i style="height:${Math.round(3 + r() * 9 + Math.sin(i / 2.2) * 2)}px"></i>`).join('');
}
const SIDE = `<!doctype html><meta charset="utf-8"><style>${FONTS}
body { width: 164px; height: 314px; overflow: hidden; background: #15131a; font-family: Onest; position: relative; }
.glow { position: absolute; left: -60px; bottom: -80px; width: 260px; height: 260px; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255,61,127,0.20), rgba(255,61,127,0)); }
.top { position: absolute; left: 18px; top: 22px; }
.name { margin-top: 14px; font: 700 23px/1 Unbounded; color: #fff; letter-spacing: -0.3px; }
.what { margin-top: 7px; font-size: 11px; color: #9a93a8; letter-spacing: 0.1px; }
.tl { position: absolute; left: 18px; right: -40px; top: 176px; }
.ruler { position: relative; height: 12px; border-bottom: 1px solid #2a2532; margin-bottom: 7px; }
.ruler b { position: absolute; bottom: 0; width: 1px; height: 4px; background: #36303f; }
.ruler b.l { height: 7px; background: #4a4355; }
.row { position: relative; height: 17px; margin-bottom: 6px; }
.c { position: absolute; top: 0; bottom: 0; border-radius: 4px; border: 1px solid; overflow: hidden; }
.v { background: #3a5a8c; border-color: rgba(111,149,209,0.55); }
.v::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 17px, rgba(0,0,0,0.22) 17px 18px); }
.o { background: #3f6f6a; border-color: rgba(111,195,184,0.55); }
.t { background: #57409a; border-color: rgba(167,139,255,0.6); }
.a { background: #1f5a52; border-color: rgba(95,224,201,0.45); display: flex; align-items: center; gap: 1px; padding: 0 3px; }
.a i { display: block; width: 2px; flex: none; border-radius: 1px; background: #5fe0c9; opacity: 0.85; }
.t span { position: absolute; left: 6px; top: 3px; width: 26px; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.75); box-shadow: 0 6px 0 rgba(255,255,255,0.45); width: 30px; }
.ph { position: absolute; left: 70px; top: 0; height: 122px; width: 2px; background: #ff3d7f; }
.ph::before { content: ''; position: absolute; left: -5px; top: 0; width: 12px; height: 12px; background: #ff3d7f;
  clip-path: polygon(0 0, 100% 0, 100% 55%, 50% 100%, 0 55%); }
</style><body>
<div class="glow"></div>
<div class="top">${MARK(38)}<div class="name">Kadro</div></div>
<div class="tl">
  <div class="ruler">${Array.from({ length: 16 }, (_, i) => `<b class="${i % 4 === 0 ? 'l' : ''}" style="left:${i * 12}px"></b>`).join('')}</div>
  <div class="row"><div class="c t" style="left:30px;width:58px"><span></span></div></div>
  <div class="row"><div class="c o" style="left:52px;width:70px"></div></div>
  <div class="row"><div class="c v" style="left:0;width:44px"></div><div class="c v" style="left:46px;width:56px"></div><div class="c v" style="left:104px;width:80px"></div></div>
  <div class="row"><div class="c a" style="left:0;width:190px">${wave(46, 7)}</div></div>
  <div class="ph"></div>
</div>
</body>`;

// шапка 150×57 внутренних страниц: на белом фоне, прижата вправо
const HEAD = `<!doctype html><meta charset="utf-8"><style>${FONTS}
body { width: 150px; height: 57px; overflow: hidden; background: #fff; display: flex; align-items: center; justify-content: flex-end; gap: 9px; padding-right: 14px; }
.name { font: 700 17px/1 Unbounded; color: #15131a; letter-spacing: -0.2px; }
</style><body>${MARK(30)}<div class="name">Kadro</div></body>`;

/** PNG-снимок → BMP 24 бит (снизу вверх, строки выровнены по 4 байта) — разбираем PNG прямо в Chromium. */
async function toBmp(page, png) {
  const b64 = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const { data, width: w, height: h } = g.getImageData(0, 0, c.width, c.height);
    const row = Math.ceil((w * 3) / 4) * 4;
    const size = 54 + row * h;
    const buf = new Uint8Array(size);
    const v = new DataView(buf.buffer);
    buf[0] = 0x42; buf[1] = 0x4d;
    v.setUint32(2, size, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true);
    v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true);
    v.setUint32(34, row * h, true); v.setInt32(38, 3780, true); v.setInt32(42, 3780, true);
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4;
      const dst = 54 + y * row;
      for (let x = 0; x < w; x++) {
        buf[dst + x * 3] = data[src + x * 4 + 2];
        buf[dst + x * 3 + 1] = data[src + x * 4 + 1];
        buf[dst + x * 3 + 2] = data[src + x * 4];
      }
    }
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, `data:image/png;base64,${png.toString('base64')}`);
  return Buffer.from(b64, 'base64');
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [name, html, w, h] of [['wizard', SIDE, 164, 314], ['header', HEAD, 150, 57]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(async () => { await document.fonts.load('700 20px Unbounded'); await document.fonts.load('500 11px Onest', 'видео'); await document.fonts.ready; });
  const ok = await page.evaluate(() => document.fonts.check('700 20px Unbounded'));
  if (!ok) throw new Error('шрифт Unbounded не подключился');
  const png = await page.screenshot({ type: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.bmp`), await toBmp(page, png));
  await page.close();
  console.log(`${name}.bmp ${w * 2}×${h * 2}`);
}
await browser.close();
