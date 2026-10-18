// Запуск настоящего приложения Kadro (Electron) для сквозных тестов и помощники к нему.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';
import type { Project } from '../../src/shared/types';

export const ROOT = path.resolve(__dirname, '../..');
export const MEDIA = path.join(os.tmpdir(), 'kadro-e2e');
export const MODELS = process.env.KADRO_MODELS || path.join(os.homedir(), '.cache', 'kadro-models');
fs.mkdirSync(MEDIA, { recursive: true });

export interface Kadro { app: ElectronApplication; win: Page; data: string; errors: string[]; logs: string[] }

export async function launch(opts: { data?: string; env?: Record<string, string> } = {}): Promise<Kadro> {
  const data = opts.data ?? fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-data-'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const exe = require('electron') as unknown as string;
  const app = await electron.launch({
    executablePath: exe,
    args: ['--no-sandbox', ROOT],
    cwd: ROOT,
    env: { ...process.env, KADRO_DATA: data, KADRO_MULTI: '1', KADRO_MODELS: MODELS, ...opts.env } as Record<string, string>,
  });
  const win = await app.firstWindow();
  const errors: string[] = [];
  const logs: string[] = [];
  win.on('pageerror', (e) => errors.push(e.message));
  win.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error') errors.push(m.text()); });
  await win.setViewportSize({ width: 1480, height: 920 });
  await win.waitForSelector('[data-testid=timeline]');
  return { app, win, data, errors, logs };
}

// ---------- доступ к состоянию редактора ----------
type W = { __kadro: { useStore: { getState: () => any }; actions: Record<string, (...a: any[]) => any> }; __kadroEngine: any };

export const project = (win: Page): Promise<Project> => win.evaluate(() => (window as unknown as W).__kadro.useStore.getState().project);
export const state = <T>(win: Page, fn: string): Promise<T> => win.evaluate((f) => {
  // eslint-disable-next-line no-new-func
  return new Function('s', `return (${f})(s)`)((window as unknown as W).__kadro.useStore.getState());
}, fn);
export async function act(win: Page, name: string, ...args: unknown[]): Promise<any> {
  return win.evaluate(([n, a]) => (window as unknown as W).__kadro.actions[n as string](...(a as unknown[])), [name, args] as const);
}
export async function store(win: Page, method: string, ...args: unknown[]): Promise<void> {
  await win.evaluate(([m, a]) => { (window as unknown as W).__kadro.useStore.getState()[m as string](...(a as unknown[])); }, [method, args] as const);
}
export async function reset(win: Page): Promise<void> {
  await act(win, 'newProjectAction');
  await win.waitForTimeout(100);
}
export async function importAt(win: Page, files: string[], mode: 'main' | 'overlay' | 'auto' = 'auto', at = 0): Promise<string[]> {
  return act(win, 'importPaths', files, { mode, at });
}
export async function clipIds(win: Page, kind: string): Promise<string[]> {
  const p = await project(win);
  return p.tracks.filter((t) => t.kind === kind).flatMap((t) => t.clips.map((c) => c.id));
}
export async function waitAssetsReady(win: Page): Promise<void> {
  await win.waitForFunction(() => {
    const p = (window as unknown as W).__kadro.useStore.getState().project;
    return p.assets.every((a: any) => a.proxy !== 'pending' && (a.kind === 'audio' || a.thumbs?.length) && (!a.hasAudio || a.peaks?.length));
  }, undefined, { timeout: 60_000 });
}

/** Пиксель превью (доли ширины/высоты кадра) — после того как плеер дорисует нужный момент. */
export async function previewPixel(win: Page, fx: number, fy: number): Promise<[number, number, number]> {
  return win.evaluate(([x, y]) => {
    const c = document.querySelector('[data-testid=preview]') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(Math.min(c.width - 1, Math.round(x * c.width)), Math.min(c.height - 1, Math.round(y * c.height)), 1, 1).data;
    return [d[0], d[1], d[2]] as [number, number, number];
  }, [fx, fy]);
}

export async function seekAndSettle(win: Page, t: number): Promise<void> {
  await store(win, 'setPlaying', false);
  await store(win, 'setPlayhead', t);
  // ждём, пока все видео домотаются и кадр перерисуется
  await win.waitForFunction(() => {
    const vids = [...document.querySelectorAll('video')];
    return vids.every((v) => !v.seeking && v.readyState >= 2);
  }, undefined, { timeout: 20_000 }).catch(() => undefined);
  await win.waitForTimeout(250);
}

export function near(a: number[], b: number[], tol: number): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) <= tol);
}

// ---------- медиа для тестов ----------
export function ff(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
}

export function media(name: string, make: (file: string) => void): string {
  const f = path.join(MEDIA, name);
  if (!fs.existsSync(f)) make(f);
  return f;
}

export const COLORS = ['red', 'lime', 'blue', 'yellow'];
export const RGB: Record<string, [number, number, number]> = { red: [255, 0, 0], lime: [0, 255, 0], blue: [0, 0, 255], yellow: [255, 255, 0] };

export function colorsVideo(): string {
  return media('colors.mp4', (f) => {
    const inputs = COLORS.flatMap((c) => ['-f', 'lavfi', '-i', `color=c=${c}:s=640x360:r=30:d=1`]);
    ff([...inputs, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4',
      '-filter_complex', `${COLORS.map((_, i) => `[${i}:v]`).join('')}concat=n=4:v=1:a=0[v]`,
      '-map', '[v]', '-map', '4:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', '4', f]);
  });
}
export function solidVideo(name: string, color: string, dur: number): string {
  return media(name, (f) => ff(['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=30:d=${dur}`, '-f', 'lavfi', '-i', `sine=frequency=330:sample_rate=48000:duration=${dur}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f]));
}
export function grayImage(): string {
  return media('gray.png', (f) => ff(['-f', 'lavfi', '-i', 'color=c=0x8a6f5a:s=400x400,format=rgb24', '-frames:v', '1', f]));
}
export function rotatedVideo(): string {
  return media('rotated.mp4', (f) => {
    const src = f + '.src.mp4';
    ff(['-f', 'lavfi', '-i', 'color=c=red:s=160x240:d=2:r=30', '-f', 'lavfi', '-i', 'color=c=blue:s=160x240:d=2:r=30',
      '-filter_complex', '[0][1]hstack', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src]);
    ff(['-display_rotation:v:0', '90', '-i', src, '-c', 'copy', f]);
  });
}
export function greenVideo(): string {
  return media('green.mp4', (f) => ff(['-f', 'lavfi', '-i', 'color=c=0x00b140:s=640x360:r=30:d=4,drawbox=x=220:y=100:w=200:h=160:color=red@1:t=fill',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', f]));
}
export function toneMp3(): string {
  return media('tone.mp3', (f) => ff(['-f', 'lavfi', '-i', 'sine=frequency=550:sample_rate=48000:duration=6', '-c:a', 'libmp3lame', '-q:a', '4', f]));
}

/** Ролик с речью (синтез piper) и паузами по 1.5 с между фразами. */
export const PHRASES = ['Привет, это тестовый ролик для видеоредактора.', 'Сейчас мы проверим автоматические субтитры.', 'Паузы между фразами будут вырезаны.'];
export function talkVideo(): string {
  return media('talk.mp4', (f) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sherpa = require('sherpa-onnx-node');
    const m = `${MODELS}/vits-piper-ru_RU-irina-medium`;
    const tts = new sherpa.OfflineTts({ model: { vits: { model: `${m}/ru_RU-irina-medium.onnx`, tokens: `${m}/tokens.txt`, dataDir: `${m}/espeak-ng-data` }, numThreads: 2 } });
    const sr = tts.sampleRate;
    const parts: Float32Array[] = [];
    for (const p of PHRASES) {
      parts.push(new Float32Array(Math.round(1.5 * sr)));
      parts.push(tts.generate({ text: p, sid: 0, speed: 1.0 }).samples);
    }
    parts.push(new Float32Array(Math.round(1.5 * sr)));
    const buf = new Float32Array(parts.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of parts) { buf.set(x, o); o += x.length; }
    const wav = f + '.wav';
    sherpa.writeWave(wav, { samples: buf, sampleRate: sr });
    const dur = buf.length / sr;
    ff(['-f', 'lavfi', '-i', `testsrc2=s=640x360:r=30:d=${dur}`, '-i', wav,
      '-f', 'lavfi', '-i', `anoisesrc=color=pink:amplitude=0.05:sample_rate=48000:duration=${dur}`,
      '-filter_complex', '[1]aresample=48000[s];[s][2]amix=inputs=2:normalize=0:duration=first[a]',
      '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f]);
  });
}
export function personVideo(): string | null {
  const img = ['/tmp/kadro-tests/ai/girl1.jpg', '/tmp/asr/girl1.jpg'].find((p) => fs.existsSync(p));
  if (!img) return null;
  return media('person.mp4', (f) => ff(['-loop', '1', '-i', img, '-vf', "scale=640:-2,zoompan=z='1+0.002*on':d=1:s=640x426:fps=30", '-t', '1.5',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', f]));
}

export function probe(file: string): { duration: number; width: number; height: number; hasAudio: boolean } {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' }));
  const v = j.streams.find((s: any) => s.codec_type === 'video');
  return { duration: Number(j.format.duration), width: v?.width, height: v?.height, hasAudio: j.streams.some((s: any) => s.codec_type === 'audio') };
}

/** Кадр как сырые RGB-байты заданного размера (через ffmpeg). */
export function rawFrame(input: string[], w: number, h: number): Buffer {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', ...input, '-frames:v', '1', '-vf', `scale=${w}:${h}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(String(r.stderr));
  return r.stdout;
}

/** Средняя и 98-процентильная разница двух кадров (0..255). */
export function frameDiff(a: Buffer, b: Buffer): { mean: number; p98: number } {
  const n = Math.min(a.length, b.length);
  const d: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i += 3) {
    const v = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
    d.push(v);
    sum += v;
  }
  d.sort((x, y) => x - y);
  return { mean: sum / d.length, p98: d[Math.floor(d.length * 0.98)] };
}
