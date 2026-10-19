// Импорт медиа: анализ файла (ffprobe), прокси для превью, миниатюры, форма волны.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { MediaAsset, MediaKind } from '../shared/types';
import { uid } from '../shared/defaults';
import { cacheDir, ffprobePath } from './bins';
import { ffmpegToBuffer, runFfmpeg } from './ffrun';

const execFileP = promisify(execFile);

export const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif', '.tiff', '.heic', '.avif'];
export const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi', '.wmv', '.flv', '.3gp', '.mts', '.m2ts', '.ts', '.mpg', '.mpeg', '.ogv'];
export const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.wma', '.aiff', '.aif'];

interface ProbeStream {
  codec_type: string; codec_name?: string; width?: number; height?: number; pix_fmt?: string;
  avg_frame_rate?: string; r_frame_rate?: string; duration?: string; nb_frames?: string;
  tags?: Record<string, string>; side_data_list?: { rotation?: number }[]; disposition?: { attached_pic?: number };
}

export interface ProbeResult {
  format: string;
  duration: number;
  size: number;
  video?: ProbeStream;
  audio?: ProbeStream;
}

export async function probe(file: string): Promise<ProbeResult> {
  const { stdout } = await execFileP(ffprobePath(), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    { windowsHide: true, maxBuffer: 16 << 20 });
  const j = JSON.parse(stdout);
  const streams: ProbeStream[] = j.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = streams.find((s) => s.codec_type === 'audio');
  return {
    format: j.format?.format_name ?? '',
    duration: Number(j.format?.duration ?? video?.duration ?? audio?.duration ?? 0) || 0,
    size: Number(j.format?.size ?? 0) || 0,
    video, audio,
  };
}

function parseRate(r?: string): number {
  if (!r) return 0;
  const [a, b] = r.split('/').map(Number);
  return b ? a / b : a || 0;
}

function rotationOf(v?: ProbeStream): number {
  if (!v) return 0;
  const sd = v.side_data_list?.find((x) => typeof x.rotation === 'number');
  const r = sd?.rotation ?? (v.tags?.rotate ? Number(v.tags.rotate) : 0);
  return ((Math.round(r) % 360) + 360) % 360;
}

export function kindOf(file: string, pr: ProbeResult): MediaKind {
  const ext = path.extname(file).toLowerCase();
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (pr.video && ['png', 'mjpeg', 'bmp', 'webp', 'tiff'].includes(pr.video.codec_name ?? '') && (pr.duration < 0.05 || pr.video.nb_frames === '1')) return 'image';
  if (!pr.video) return 'audio';
  return 'video';
}

const PLAYABLE_V = ['h264', 'vp8', 'vp9', 'av1'];
const PLAYABLE_A = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_f32le', 'pcm_s24le', 'pcm_u8'];
const OK_PIX = ['yuv420p', 'yuvj420p', 'nv12'];

/** Что нужно сделать, чтобы файл играл в плеере Chromium. */
export function proxyPlan(kind: MediaKind, pr: ProbeResult, file: string): 'none' | 'audio' | 'video' {
  const ext = path.extname(file).toLowerCase();
  if (kind === 'image') {
    return ['.heic', '.tif', '.tiff'].includes(ext) ? 'video' : 'none';
  }
  if (kind === 'audio') {
    return pr.audio && PLAYABLE_A.includes(pr.audio.codec_name ?? '') && !['.wma', '.aiff', '.aif'].includes(ext) ? 'none' : 'audio';
  }
  const v = pr.video!;
  const vOk = PLAYABLE_V.includes(v.codec_name ?? '') && (v.codec_name !== 'h264' || OK_PIX.includes(v.pix_fmt ?? ''));
  const aOk = !pr.audio || PLAYABLE_A.includes(pr.audio.codec_name ?? '');
  const containerOk = /mov|mp4|webm|matroska/.test(pr.format) && !['.avi', '.wmv', '.flv', '.mts', '.m2ts', '.ts', '.mpg', '.mpeg'].includes(ext);
  return vOk && aOk && containerOk ? 'none' : 'video';
}

export async function analyze(file: string): Promise<{ asset: MediaAsset; plan: 'none' | 'audio' | 'video' }> {
  const pr = await probe(file);
  const kind = kindOf(file, pr);
  if (kind !== 'audio' && !pr.video) throw new Error('В файле нет картинки');
  if (kind === 'audio' && !pr.audio) throw new Error('В файле нет звука');
  const rot = rotationOf(pr.video);
  let w = pr.video?.width ?? 0;
  let h = pr.video?.height ?? 0;
  if (rot === 90 || rot === 270) [w, h] = [h, w]; // ffmpeg и плеер поворачивают кадр сами
  const plan = proxyPlan(kind, pr, file);
  const asset: MediaAsset = {
    id: uid('asset'),
    kind,
    path: file,
    previewPath: file,
    name: path.basename(file),
    duration: kind === 'image' ? 0 : pr.duration,
    width: w,
    height: h,
    fps: parseRate(pr.video?.avg_frame_rate) || parseRate(pr.video?.r_frame_rate) || 30,
    hasVideo: kind !== 'audio',
    hasAudio: kind !== 'image' && !!pr.audio,
    videoCodec: pr.video?.codec_name,
    audioCodec: pr.audio?.codec_name,
    size: pr.size || fs.statSync(file).size,
    rotation: rot,
    proxy: plan === 'none' ? 'none' : 'pending',
  };
  const tags = Object.fromEntries(Object.entries(pr.video?.tags ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (kind === 'video' && ['vp8', 'vp9'].includes(pr.video?.codec_name ?? '') && tags.alpha_mode === '1') asset.alpha = true;
  return { asset, plan };
}

function fileKey(file: string): string {
  const st = fs.statSync(file);
  return crypto.createHash('sha1').update(`${file}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16);
}

/** Прокси для превью: H.264 до 720p по короткой стороне, частые ключевые кадры (быстрая перемотка). */
export async function makeProxy(asset: MediaAsset, plan: 'audio' | 'video', onProgress?: (p: number) => void, signal?: AbortSignal): Promise<string> {
  const key = fileKey(asset.path);
  if (asset.kind === 'image') {
    const out = path.join(cacheDir('proxy'), `${key}.png`);
    if (!fs.existsSync(out)) await runFfmpeg(['-hide_banner', '-y', '-i', asset.path, '-frames:v', '1', out], { signal });
    return out;
  }
  if (plan === 'audio') {
    const out = path.join(cacheDir('proxy'), `${key}.m4a`);
    if (fs.existsSync(out)) return out;
    const tmp = out + '.part.m4a';
    await runFfmpeg(['-hide_banner', '-y', '-i', asset.path, '-vn', '-c:a', 'aac', '-b:a', '192k', '-progress', 'pipe:1', '-nostats', tmp],
      { duration: asset.duration, onProgress, signal });
    fs.renameSync(tmp, out);
    return out;
  }
  const out = path.join(cacheDir('proxy'), `${key}.mp4`);
  if (fs.existsSync(out)) return out;
  const tmp = out + '.part.mp4';
  const short = Math.min(asset.width, asset.height);
  const scale = short > 720 ? (asset.width < asset.height ? 'scale=720:-2' : 'scale=-2:720') : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  await runFfmpeg([
    '-hide_banner', '-y', '-i', asset.path, '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', `${scale},format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-g', '15',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', tmp,
  ], { duration: asset.duration, onProgress, signal });
  fs.renameSync(tmp, out);
  return out;
}

/** Миниатюры для таймлайна: count кадров равномерно по длительности, высота 80px. */
export async function makeThumbs(asset: MediaAsset, count?: number): Promise<string[]> {
  const key = fileKey(asset.path);
  const dir = cacheDir(path.join('thumbs', key));
  if (asset.kind === 'image') {
    const out = path.join(dir, 't0.jpg');
    if (!fs.existsSync(out)) await runFfmpeg(['-hide_banner', '-y', '-i', asset.path, '-vf', 'scale=-2:80', '-frames:v', '1', out]);
    return [out];
  }
  const n = count ?? Math.max(4, Math.min(60, Math.ceil(asset.duration / 2)));
  const list: string[] = [];
  const src = asset.previewPath || asset.path;
  for (let i = 0; i < n; i++) {
    const t = Math.min(asset.duration - 0.05, (asset.duration * (i + 0.5)) / n);
    const out = path.join(dir, `t${i}.jpg`);
    if (!fs.existsSync(out)) {
      try {
        await runFfmpeg(['-hide_banner', '-y', '-ss', String(Math.max(0, t)), '-i', src, '-frames:v', '1', '-vf', 'scale=-2:80', '-q:v', '5', out]);
      } catch {
        continue;
      }
    }
    if (fs.existsSync(out)) list.push(out);
  }
  return list;
}

/** Форма волны: пики 0..1, по ~40 точек на секунду (не больше 4000). */
export async function makePeaks(asset: MediaAsset): Promise<number[]> {
  if (!asset.hasAudio || asset.duration <= 0) return [];
  const key = fileKey(asset.path);
  const cache = path.join(cacheDir('peaks'), `${key}.json`);
  if (fs.existsSync(cache)) {
    try { return JSON.parse(fs.readFileSync(cache, 'utf8')); } catch { /* пересчитаем */ }
  }
  const rate = 4000;
  const pcm = await ffmpegToBuffer(['-hide_banner', '-v', 'error', '-i', asset.path, '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', '-']);
  const samples = Math.floor(pcm.length / 2);
  const n = Math.max(1, Math.min(4000, Math.round(asset.duration * 40)));
  const per = Math.max(1, Math.floor(samples / n));
  const peaks: number[] = [];
  for (let i = 0; i < n; i++) {
    let m = 0;
    const end = Math.min(samples, (i + 1) * per);
    for (let j = i * per; j < end; j++) {
      const v = Math.abs(pcm.readInt16LE(j * 2));
      if (v > m) m = v;
    }
    peaks.push(Math.round((m / 32768) * 1000) / 1000);
  }
  fs.writeFileSync(cache, JSON.stringify(peaks));
  return peaks;
}
