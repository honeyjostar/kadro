// Реверс, кривая скорости и стоп-кадр: строим копию фрагмента отдельным файлом.
// Реверс длинных фрагментов — кусками (фильтр reverse держит весь кусок в памяти), куски склеиваются без перекодирования.
import fs from 'node:fs';
import path from 'node:path';
import { cacheDir, ffmpegMajor } from './bins';
import { runFfmpeg } from './ffrun';
import { RampMap, rampPtsExpr, rampTempoCommands } from '../shared/retime';
import type { RampPoint } from '../shared/types';

export interface RetimeJob {
  path: string; in: number; out: number;
  reverse: boolean; ramp?: RampPoint[];
  hasVideo: boolean; hasAudio: boolean;
  width: number; height: number; fps: number;
}

const fmt = (n: number) => String(Math.round(n * 1e6) / 1e6);
const uniq = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function videoEnc(fps: number): string[] {
  return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '15', '-pix_fmt', 'yuv420p', '-g', String(Math.max(1, Math.round(fps / 2)))];
}

/** Строит копию фрагмента [in, out] с реверсом и/или кривой скорости. Возвращает путь и длину. */
export async function retime(job: RetimeJob, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<{ path: string; duration: number }> {
  const work = path.join(cacheDir('tmp'), `rt_${uniq()}`);
  fs.mkdirSync(work, { recursive: true });
  const ext = job.hasVideo ? 'mp4' : 'm4a';
  const out = path.join(cacheDir('clips'), `${job.reverse ? 'rev' : 'ramp'}_${uniq()}.${ext}`);
  const L = job.out - job.in;
  const fps = Math.min(60, Math.max(1, job.fps || 30));
  try {
    let src = job.path;
    let ss = job.in;
    const revShare = job.reverse && job.ramp ? 0.6 : 1;
    if (job.reverse) {
      const target = job.ramp ? path.join(work, `reversed.${job.hasVideo ? 'mkv' : 'mka'}`) : out;
      await reverse(job, fps, work, target, (p) => onProgress?.(p * revShare), signal);
      if (!job.ramp) return { path: out, duration: L };
      src = target;
      ss = 0;
    }
    const ramp = job.ramp!;
    const total = new RampMap(ramp, L).total;
    const lines: string[] = [];
    if (job.hasVideo) {
      lines.push(`[0:v]setpts='(${rampPtsExpr(ramp, L)})/TB',fps=${fps},tpad=stop_mode=clone:stop_duration=1,trim=duration=${fmt(total)},setpts=PTS-STARTPTS[v]`);
    }
    if (job.hasAudio) {
      const { first, cmds } = rampTempoCommands(ramp, L);
      const tempos = [0, 1, 2, 3].map((j) => `atempo@rt${j}=${fmt(first)}`).join(',');
      lines.push(`[0:a]aresample=48000,asetpts=PTS-STARTPTS,asendcmd=c='${cmds}',${tempos},apad,atrim=duration=${fmt(total)},asetpts=PTS-STARTPTS[a]`);
    }
    const graph = path.join(work, 'ramp.txt');
    fs.writeFileSync(graph, lines.join(';\n'));
    const filterOpt = ffmpegMajor() >= 7 ? ['-/filter_complex', 'ramp.txt'] : ['-filter_complex_script', 'ramp.txt'];
    await runFfmpeg([
      '-hide_banner', '-y', '-ss', fmt(ss), '-t', fmt(L), '-i', src, ...filterOpt,
      ...(job.hasVideo ? ['-map', '[v]', ...videoEnc(fps)] : []),
      ...(job.hasAudio ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '192k'] : []),
      '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', out,
    ], { cwd: work, duration: total, onProgress: (p) => onProgress?.(1 - revShare + p * revShare), signal });
    return { path: out, duration: total };
  } catch (e) {
    fs.rmSync(out, { force: true });
    throw e;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** Реверс фрагмента: куски с конца к началу, каждый перевёрнут, затем склейка. */
async function reverse(job: RetimeJob, fps: number, work: string, target: string, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<void> {
  const L = job.out - job.in;
  // кусок — примерно 300 МБ несжатых кадров, но не меньше 0.5 с и не больше 5 с; граница — на целом кадре
  const frameBytes = job.hasVideo ? Math.max(1, job.width * job.height * 1.5) : 0;
  const chunkFrames = job.hasVideo ? Math.min(5 * fps, Math.max(Math.ceil(fps / 2), Math.floor(300e6 / frameBytes))) : 30 * fps;
  const C = chunkFrames / fps;
  const n = Math.max(1, Math.ceil(L / C - 1e-6));
  const half = 0.5 / fps;
  const parts: string[] = [];
  const pext = job.hasVideo ? 'mkv' : 'mka';
  for (let i = n - 1, k = 0; i >= 0; i--, k++) {
    const a = job.in + i * C;
    const b = Math.min(job.out, job.in + (i + 1) * C);
    // сдвиг на полкадра: кадр ровно на границе попадает ровно в один кусок
    const ss = i === 0 ? a : a - half;
    const t = b - half - ss; // кадр ровно на конце фрагмента в него не входит (как при обычном показе)
    const part = path.join(work, `p${String(k).padStart(4, '0')}.${pext}`);
    await runFfmpeg([
      '-hide_banner', '-y', '-ss', fmt(ss), '-t', fmt(t), '-i', job.path,
      ...(job.hasVideo ? ['-map', '0:v:0', '-vf', `setpts=PTS-STARTPTS,fps=${fps},reverse`, ...videoEnc(fps)] : ['-vn']),
      ...(job.hasAudio ? ['-map', '0:a:0', '-af', 'aresample=48000,areverse', '-c:a', 'pcm_s16le'] : ['-an']),
      '-progress', 'pipe:1', '-nostats', part,
    ], { duration: t, onProgress: (p) => onProgress?.((k + p) / n * 0.95), signal });
    parts.push(part);
  }
  const list = path.join(work, 'parts.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${path.basename(p)}'`).join('\n'));
  const finalAudio = target.endsWith('.mkv') || target.endsWith('.mka') ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'aac', '-b:a', '192k'];
  await runFfmpeg([
    '-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', 'parts.txt',
    ...(job.hasVideo ? ['-map', '0:v:0', '-c:v', 'copy'] : []),
    ...(job.hasAudio ? ['-map', '0:a:0', ...finalAudio] : []),
    ...(target.endsWith('.mp4') || target.endsWith('.m4a') ? ['-movflags', '+faststart'] : []),
    target,
  ], { cwd: work, signal });
  onProgress?.(1);
}

/** Стоп-кадр: кадр исходника в момент t (ближайший) — в PNG. alpha: источник — VP9 с прозрачностью. */
export async function freezeFrame(src: string, t: number, fps: number, alpha: boolean): Promise<string> {
  const out = path.join(cacheDir('clips'), `freeze_${uniq()}.png`);
  const ss = Math.max(0, t - 0.5 / Math.max(1, fps || 30));
  await runFfmpeg(['-hide_banner', '-y', ...(alpha ? ['-c:v', 'libvpx-vp9'] : []), '-ss', fmt(ss), '-i', src, '-frames:v', '1', '-update', '1',
    '-pix_fmt', alpha ? 'rgba' : 'rgb24', out]);
  if (!fs.existsSync(out)) throw new Error('Кадр не получился');
  return out;
}
