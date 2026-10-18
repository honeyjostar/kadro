// Экспорт проекта в MP4: слои текста → списки concat, граф FFmpeg, кодирование с прогрессом.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph, fullArgs } from '../shared/exportGraph';
import { exportSize } from '../shared/geometry';
import type { ExportReq, ExportResult, TextLayerReq } from '../shared/ipc';
import { projectDuration } from '../shared/timeline';
import { cacheDir, ffmpegMajor, ffmpegPath } from './bins';
import { runFfmpeg } from './ffrun';

let nvencCache: Promise<boolean> | undefined;

/** Проверка, работает ли аппаратный кодер NVIDIA (пробное кодирование 0.2 с). Не блокирует окно. */
export function hasNvenc(): Promise<boolean> {
  nvencCache ??= new Promise<boolean>((resolve) => {
    try {
      const p = spawn(ffmpegPath(), ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.2',
        '-c:v', 'h264_nvenc', '-f', 'null', '-'], { windowsHide: true, stdio: 'ignore' });
      const t = setTimeout(() => { p.kill(); resolve(false); }, 20000);
      p.on('error', () => { clearTimeout(t); resolve(false); });
      p.on('exit', (code) => { clearTimeout(t); resolve(code === 0); });
    } catch {
      resolve(false);
    }
  });
  return nvencCache;
}

const fwd = (p: string) => p.replace(/\\/g, '/').replace(/'/g, "'\\''");

/** Пишет PNG-кадры текстового слоя и список concat, покрывающий весь ролик от 0 до total. */
export function writeTextLayer(dir: string, layer: TextLayerReq, blank: string, total: number, idx: number): string {
  const lines = ['ffconcat version 1.0'];
  let t = 0;
  const clips = [...layer.clips].sort((a, b) => a.start - b.start);
  clips.forEach((c, i) => {
    const start = Math.max(t, c.start);
    const end = Math.min(total, c.start + c.duration);
    if (end <= start + 1e-4) return;
    if (start > t + 1e-4) { lines.push(`file '${fwd(blank)}'`, `duration ${(start - t).toFixed(6)}`); }
    const png = path.join(dir, `L${idx}_${i}.png`);
    fs.writeFileSync(png, Buffer.from(c.png));
    lines.push(`file '${fwd(png)}'`, `duration ${(end - start).toFixed(6)}`);
    t = end;
  });
  if (total > t + 1e-4) lines.push(`file '${fwd(blank)}'`, `duration ${(total - t).toFixed(6)}`);
  // последний файл повторяем — так concat применяет длительность последнего элемента
  lines.push(`file '${fwd(blank)}'`);
  const list = path.join(dir, `layer${idx}.txt`);
  fs.writeFileSync(list, lines.join('\n') + '\n');
  return list;
}

export async function exportProject(req: ExportReq, onProgress: (p: number) => void, signal?: AbortSignal): Promise<ExportResult> {
  const t0 = Date.now();
  const { project, opts } = req;
  const total = projectDuration(project);
  if (total <= 0) return { ok: false, error: 'Проект пустой — добавь видео или фото на таймлайн.' };
  const used = new Set(project.tracks.flatMap((t) => t.clips.map((c) => (c.type === 'media' ? c.assetId : ''))));
  const lost = project.assets.filter((a) => used.has(a.id) && !fs.existsSync(a.path));
  if (lost.length) return { ok: false, error: `Не найден файл: ${lost.map((a) => `«${a.name}»`).join(', ')}. Верни его на место или убери клип с таймлайна.` };
  const size = exportSize(project.settings.width, project.settings.height, opts.height);
  const job = path.join(cacheDir('export'), `job_${Date.now()}`);
  fs.mkdirSync(job, { recursive: true });
  try {
    const blank = path.join(job, 'blank.png');
    fs.writeFileSync(blank, Buffer.from(req.blankPng));
    const lists = req.textLayers.filter((l) => l.clips.length).map((l, i) => ({ trackId: l.trackId, list: writeTextLayer(job, l, blank, total, i) }));
    const graph = buildGraph(project, { width: size.w, height: size.h, fps: opts.fps, textLayers: lists });
    const filterFile = path.join(job, 'graph.txt');
    fs.writeFileSync(filterFile, graph.filter);
    fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
    const tmpOut = path.join(path.dirname(opts.outPath), `.${path.basename(opts.outPath, '.mp4')}.kadro-part.mp4`);
    const wantNv = opts.encoder === 'nvenc' || (opts.encoder === 'auto' && (await hasNvenc()));
    const encoders: ('nvenc' | 'x264')[] = wantNv ? ['nvenc', 'x264'] : ['x264'];
    let lastErr: unknown;
    for (const enc of encoders) {
      try {
        const args = fullArgs(graph, filterFile, ffmpegMajor(), enc, opts.quality, opts.fps, tmpOut);
        await runFfmpeg(args, { duration: total, onProgress, signal });
        fs.rmSync(opts.outPath, { force: true });
        fs.renameSync(tmpOut, opts.outPath);
        onProgress(1);
        return { ok: true, path: opts.outPath, encoder: enc, seconds: (Date.now() - t0) / 1000 };
      } catch (e) {
        lastErr = e;
        fs.rmSync(tmpOut, { force: true });
        if (signal?.aborted) return { ok: false, error: 'Экспорт отменён' };
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    fs.writeFileSync(path.join(cacheDir('logs'), `export_error_${Date.now()}.txt`),
      `${msg}\n\n${(lastErr as { stderr?: string })?.stderr ?? ''}\n\n--- graph ---\n${graph.filter}`);
    return { ok: false, error: `Не удалось собрать видео: ${msg}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    fs.rmSync(job, { recursive: true, force: true });
  }
}

/** Звук проекта в WAV 16 кГц моно — для распознавания речи. */
export async function exportSpeechAudio(req: { project: ExportReq['project']; includeMusic: boolean }, out: string, signal?: AbortSignal): Promise<void> {
  const g = buildGraph(req.project, { width: 16, height: 16, fps: 30, textLayers: [], audioOnly: true, includeMusic: req.includeMusic });
  const filterFile = out + '.graph.txt';
  fs.writeFileSync(filterFile, g.filter);
  const filterOpt = ffmpegMajor() >= 7 ? ['-/filter_complex', filterFile] : ['-filter_complex_script', filterFile];
  try {
    await runFfmpeg(['-hide_banner', '-y', '-nostdin', ...g.inputs.flat(), ...filterOpt, '-map', g.aOut, '-ac', '1', '-ar', '16000',
      '-c:a', 'pcm_s16le', '-t', String(g.duration), out], { signal });
  } finally {
    fs.rmSync(filterFile, { force: true });
  }
}
