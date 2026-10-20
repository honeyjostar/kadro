// Генерирует демо-ролики и демо-бит для стартового экрана и шаблонов: resources/demo/*.mp4, beat.m4a.
// Всё нарисовано кодом (scripts/demo-scenes.js) и сочинено формулой — без чужих файлов.
// Запуск: node scripts/make-demo.mjs   (нужны Chromium из Playwright и ffmpeg)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'resources', 'demo');
const FFMPEG = process.env.KADRO_FFMPEG || 'ffmpeg';
const SIZE = 960;
const FPS = 30;
const DUR = 5;
fs.mkdirSync(OUT, { recursive: true });

const only = process.argv.slice(2);
const SCENES = ['sunset', 'city', 'ocean', 'synth', 'space', 'mountains', 'liquid'].filter((s) => !only.length || only.includes(s));

async function renderScene(page, name) {
  const out = path.join(OUT, `${name}.mp4`);
  const ff = spawn(FFMPEG, ['-hide_banner', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-g', String(FPS), '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < FPS * DUR; i++) {
    const url = await page.evaluate(([n, t]) => {
      const c = document.getElementById('c');
      const ctx = c.getContext('2d');
      ctx.save();
      window.KADRO_DEMO.scenes[n](ctx, c.width, c.height, t);
      ctx.restore();
      return c.toDataURL('image/jpeg', 0.95);
    }, [name, i / FPS]);
    const buf = Buffer.from(url.split(',')[1], 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (code) => (code === 0 ? r() : j(new Error(`ffmpeg ${code}`)))));
  console.log('готово', path.relative(ROOT, out), Math.round(fs.statSync(out).size / 1024), 'КБ');
}

function makeBeat() {
  // 112 ударов в минуту, 16 тактов по 4 доли: бочка, хай-хэт, бас и аккорды Am–F–C–G
  const bpm = 112;
  const beat = 60 / bpm;
  const dur = 16 * 4 * beat;
  const b = beat.toFixed(6);
  const bar = (4 * beat).toFixed(6);
  const ch = (k) => `if(eq(mod(floor(t/${bar})\\,4)\\,0)\\,${[220, 261.63, 329.63][k]}\\,if(eq(mod(floor(t/${bar})\\,4)\\,1)\\,${[174.61, 220, 261.63][k]}\\,if(eq(mod(floor(t/${bar})\\,4)\\,2)\\,${[261.63, 329.63, 392][k]}\\,${[196, 246.94, 293.66][k]})))`;
  const bass = `if(eq(mod(floor(t/${bar})\\,4)\\,0)\\,55\\,if(eq(mod(floor(t/${bar})\\,4)\\,1)\\,43.65\\,if(eq(mod(floor(t/${bar})\\,4)\\,2)\\,65.41\\,49)))`;
  const tau = `mod(t\\,${b})`;
  const kick = `0.9*sin(2*PI*(45*${tau}+40*(1-exp(-${tau}*30))/30))*exp(-${tau}*9)`;
  const hat = `0.12*(random(1)*2-1)*exp(-mod(t+${(beat / 2).toFixed(6)}\\,${b})*60)`;
  const pad = `0.06*(sin(2*PI*${ch(0)}*t)+sin(2*PI*${ch(1)}*t)+sin(2*PI*${ch(2)}*t)+0.5*sin(2*PI*2*${ch(2)}*t))*(0.6+0.4*sin(2*PI*t/${bar}))`;
  const bassv = `0.22*sin(2*PI*${bass}*t)*(0.55+0.45*exp(-mod(t\\,${b})*6))`;
  const expr = `(${kick}+${hat}+${pad}+${bassv})*0.8`;
  const out = path.join(OUT, 'beat.m4a');
  const r = spawnSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc=exprs='${expr}|${expr}':s=44100:d=${dur.toFixed(3)}`,
    '-af', 'lowpass=f=9000,aecho=0.8:0.6:60|120:0.2|0.12,afade=t=in:d=0.3,afade=t=out:st=' + (dur - 1.5).toFixed(2) + ':d=1.5,loudnorm=I=-14:TP=-1.5',
    '-c:a', 'aac', '-b:a', '160k', out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  console.log('готово', path.relative(ROOT, out), Math.round(fs.statSync(out).size / 1024), 'КБ');
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
await page.setContent(`<canvas id="c" width="${SIZE}" height="${SIZE}"></canvas>`);
await page.addScriptTag({ path: path.join(ROOT, 'scripts', 'demo-scenes.js') });
for (const s of SCENES) await renderScene(page, s);
await browser.close();
if (!only.length || only.includes('beat')) makeBeat();
