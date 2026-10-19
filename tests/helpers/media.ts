// Помощники для интеграционных тестов: генерация тестовых медиа и проверка результата через ffmpeg/ffprobe.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildGraph, fullArgs, type BuildOpts, type Quality } from '../../src/shared/exportGraph';
import type { MediaAsset, Project } from '../../src/shared/types';
import { grayPng, rgbPng } from '../../src/main/png';

export const FFMPEG = process.env.KADRO_FFMPEG || 'ffmpeg';
export const FFPROBE = process.env.KADRO_FFPROBE || 'ffprobe';

export function tmpDir(name: string): string {
  const d = path.join(os.tmpdir(), 'kadro-tests', name);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export function ff(args: string[]): void {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
}

export function ffmpegMajor(): number {
  const out = execFileSync(FFMPEG, ['-version'], { encoding: 'utf8' });
  const m = /ffmpeg version n?(\d+)/.exec(out);
  return m ? Number(m[1]) : 7;
}

/** Видео, в котором каждая секунда — свой цвет (для проверки, какой кусок исходника попал в кадр). */
export function makeColorSeconds(file: string, colors: string[], w = 1920, h = 1080, fps = 30, tone = true): void {
  const n = colors.length;
  const inputs: string[] = [];
  colors.forEach((c) => inputs.push('-f', 'lavfi', '-i', `color=c=${c}:s=${w}x${h}:r=${fps}:d=1`));
  const audio = tone
    ? ['-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${n}`]
    : ['-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`];
  const concat = colors.map((_, i) => `[${i}:v]`).join('') + `concat=n=${n}:v=1:a=0[v]`;
  ff([...inputs, ...audio, '-filter_complex', concat, '-map', '[v]', '-map', `${n}:a`, '-t', String(n),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-g', String(fps), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]);
}

export function makeSolid(file: string, color: string, dur: number, w: number, h: number, fps: number, freq = 0): void {
  const audio = freq > 0 ? ['-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=48000:duration=${dur}`] : [];
  ff(['-f', 'lavfi', '-i', `color=c=${color}:s=${w}x${h}:r=${fps}:d=${dur}`, ...audio,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', ...(freq > 0 ? ['-c:a', 'aac', '-shortest'] : []), file]);
}

export function makeImage(file: string, color: string, w: number, h: number): void {
  ff(['-f', 'lavfi', '-i', `color=c=${color}:s=${w}x${h}`, '-frames:v', '1', file]);
}

export function makeTone(file: string, freq: number, dur: number): void {
  ff(['-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=48000:duration=${dur}`, '-c:a', 'libmp3lame', '-q:a', '4', file]);
}

export function probe(file: string): { duration: number; width?: number; height?: number; fps?: number; hasAudio: boolean; vcodec?: string } {
  const out = execFileSync(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' });
  const j = JSON.parse(out);
  const v = j.streams.find((s: any) => s.codec_type === 'video');
  const a = j.streams.find((s: any) => s.codec_type === 'audio');
  const fr = v?.avg_frame_rate ? v.avg_frame_rate.split('/').map(Number) : undefined;
  return {
    duration: Number(j.format.duration),
    width: v?.width, height: v?.height, vcodec: v?.codec_name,
    fps: fr && fr[1] ? fr[0] / fr[1] : undefined,
    hasAudio: !!a,
  };
}

/** Цвет пикселя (x,y) в кадре на момент t. */
export function pixelAt(file: string, t: number, x: number, y: number): [number, number, number] {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1',
    '-vf', `crop=1:1:${x}:${y},format=rgb24`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
  if (r.status !== 0 || r.stdout.length < 3) throw new Error(`pixelAt failed: ${r.stderr}`);
  return [r.stdout[0], r.stdout[1], r.stdout[2]];
}

/** Средняя громкость (dB) участка звука. */
export function meanVolume(file: string, start: number, dur: number): number {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-ss', String(start), '-t', String(dur), '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(r.stderr);
  if (!m) return -Infinity;
  return m[1] === '-inf' ? -Infinity : Number(m[1]);
}

/** Доминирующая частота звука на участке (грубо, по числу переходов через ноль). */
export function zeroCrossFreq(file: string, start: number, dur: number): number {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-ss', String(start), '-t', String(dur), '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', '-'], { maxBuffer: 1 << 26 });
  const buf = r.stdout as Buffer;
  let crossings = 0;
  let prev = 0;
  const n = Math.floor(buf.length / 2);
  for (let i = 0; i < n; i++) {
    const s = buf.readInt16LE(i * 2);
    if (i > 0 && ((prev < 0 && s >= 0) || (prev >= 0 && s < 0))) crossings++;
    prev = s;
  }
  return crossings / 2 / (n / 48000);
}

export function assetFromFile(id: string, file: string, kind: MediaAsset['kind']): MediaAsset {
  const pr = probe(file);
  return {
    id, kind, path: file, previewPath: file, name: path.basename(file),
    duration: kind === 'image' ? 0 : pr.duration, width: pr.width ?? 0, height: pr.height ?? 0,
    fps: pr.fps ?? 30, hasVideo: kind !== 'audio', hasAudio: pr.hasAudio, size: fs.statSync(file).size,
    rotation: 0, proxy: 'none',
  };
}

export function runExport(p: Project, out: string, opts: Partial<BuildOpts> & { quality?: Quality } = {}): { args: string[]; filter: string } {
  const W = opts.width ?? 540;
  const H = opts.height ?? 960;
  const F = opts.fps ?? 30;
  let grayN = 0;
  const grayFile = (_name: string, bytes: Uint8Array, w: number, h: number) => {
    const file = `${out}.gray${grayN++}.png`;
    fs.writeFileSync(file, grayPng(bytes, w, h));
    return file;
  };
  let rgbN = 0;
  const rgbFile = (_name: string, bytes: Uint8Array, w: number, h: number) => {
    const file = `${out}.clut${rgbN++}.png`;
    fs.writeFileSync(file, rgbPng(bytes, w, h));
    return file;
  };
  const g = buildGraph(p, { width: W, height: H, fps: F, textLayers: opts.textLayers ?? [], grayFile, rgbFile, luts: opts.luts });
  const filterFile = out + '.filter.txt';
  fs.writeFileSync(filterFile, g.filter);
  const args = fullArgs(g, filterFile, ffmpegMajor(), 'x264', opts.quality ?? 'normal', F, out)
    .map((a) => (a === 'medium' || a === 'slow' ? 'ultrafast' : a));
  const pretty = args.filter((a) => a !== '-progress' && a !== 'pipe:1');
  const r = spawnSync(FFMPEG, pretty, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`export failed:\n${r.stderr.slice(-3000)}\n--- filter ---\n${g.filter}`);
  return { args, filter: g.filter };
}

export const near = (a: number[], b: number[], tol = 12) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
