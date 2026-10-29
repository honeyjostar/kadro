// 3D-объекты: окно рисует кадры (three.js), здесь они собираются в видео с прозрачным фоном (VP9 + альфа).
import { tx } from '../shared/i18n';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { cacheDir, ffmpegPath } from './bins';

interface Job { proc: ChildProcess; out: string; err: string; done: Promise<number> }
const jobs = new Map<string, Job>();

export function begin(w: number, h: number, fps: number): string {
  const id = `m3d_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const out = path.join(cacheDir('models'), `${id}.webm`);
  const proc = spawn(ffmpegPath(), [
    '-hide_banner', '-v', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', '-',
    '-vf', 'vflip', // кадры приходят снизу вверх (так читает видеокарта)
    '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '26', '-deadline', 'good', '-cpu-used', '4',
    '-row-mt', '1', '-auto-alt-ref', '0', '-g', String(fps), out,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  const job: Job = { proc, out, err: '', done: Promise.resolve(0) };
  proc.stderr?.on('data', (d) => { job.err += String(d); });
  job.done = new Promise((r) => proc.on('close', (code) => r(code ?? 1)));
  proc.stdin?.on('error', () => undefined);
  jobs.set(id, job);
  return id;
}

export async function frame(id: string, data: ArrayBuffer): Promise<void> {
  const job = jobs.get(id);
  if (!job?.proc.stdin) throw new Error(tx('Сборка 3D уже остановлена'));
  const ok = job.proc.stdin.write(Buffer.from(data));
  if (!ok) await new Promise<void>((r) => job.proc.stdin!.once('drain', () => r()));
}

export async function end(id: string): Promise<{ path?: string; error?: string }> {
  const job = jobs.get(id);
  if (!job) return { error: tx('Сборка 3D не найдена') };
  job.proc.stdin?.end();
  const code = await job.done;
  jobs.delete(id);
  if (code !== 0 || !fs.existsSync(job.out)) return { error: `FFmpeg: ${job.err.trim().split('\n').pop() ?? code}` };
  return { path: job.out };
}

export function cancel(id: string): void {
  const job = jobs.get(id);
  if (!job) return;
  jobs.delete(id);
  try { job.proc.kill(); } catch { /* уже завершён */ }
  void job.done.then(() => fs.rmSync(job.out, { force: true }));
}
