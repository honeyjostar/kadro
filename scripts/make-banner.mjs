// Обложка для README (2560×1280) и превью ссылки (1280×640): scripts/banner.html → PNG через Chromium.
// node scripts/make-banner.mjs путь/к/снимку-редактора.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const shot = path.resolve(process.argv[2] ?? path.join(root, 'docs/screenshots/editor.png'));
const html = fs.readFileSync(path.join(here, 'banner.html'), 'utf8').replace('src="SHOT"', `src="${pathToFileURL(shot).href}"`);
const tmp = path.join(here, '.banner.tmp.html');
fs.writeFileSync(tmp, html);
const exe = ['/opt/pw-browsers/chromium', process.env.CHROMIUM].find((p) => p && fs.existsSync(p));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
try {
  for (const [scale, out] of [[2, 'docs/brand/banner.png'], [1, 'docs/brand/social-preview.png']]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: scale });
    await page.goto(pathToFileURL(tmp).href);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(root, out) });
    await page.close();
    console.log('готово:', out);
  }
} finally {
  await browser.close();
  fs.rmSync(tmp, { force: true });
}
