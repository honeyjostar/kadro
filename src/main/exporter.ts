// Экспорт проекта в MP4 (а также GIF и MP3): слои текста → списки concat, граф FFmpeg, кодирование с прогрессом.
import { makeBlurMasks } from './blurMask';
import { makePhoto3dMaps } from './photo3dMaps';
import { tx } from '../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph, fullArgs, gifArgs, gifFilter, mp3Args } from '../shared/exportGraph';
import { ffmetadataChapters } from '../shared/markers';
import { exportSize } from '../shared/geometry';
import type { ExportReq, ExportResult, TextLayerReq } from '../shared/ipc';
import { projectDuration } from '../shared/timeline';
import { cacheDir, ffmpegMajor } from './bins';
import { runFfmpeg } from './ffrun';
import { grayPng, rgbPng } from './png';
import { encoderPlan, type EncoderEngine } from '../shared/hw';
import { hardwareInfo } from './hardware';
import { loadLuts } from './luts';
import { expandPerson } from '../shared/person';
import { expandSfx } from '../shared/sfx';
import { stickerArgs, stickerFilter, stickerSize, TG_KBPS, TG_STICKER } from '../shared/tgSticker';
import { duckNow, speechIntervals } from '../shared/duck';
import { makePeaks } from './media';
import type { Project } from '../shared/types';

/**
 * Музыка тише под голос: где говорят — по пикам голосовых файлов (нет пиков — посчитаем).
 * Выключено в настройках или голоса нет — undefined.
 */
async function duckFor(p: Project): Promise<{ level: number; iv: [number, number][] } | undefined> {
  const d = duckNow();
  if (!d.on) return undefined;
  const extra = new Map<string, number[]>();
  for (const a of p.assets) {
    if (a.peaks?.length || !a.hasAudio || a.missing || !(a.voice || a.kind === 'video')) continue;
    extra.set(a.id, await makePeaks(a).catch(() => []));
  }
  const iv = speechIntervals(p, (a) => (a.peaks?.length ? a.peaks : extra.get(a.id)));
  return iv.length ? { level: d.level, iv } : undefined;
}


/** Папки с кадрами шейдеров (окно рисует, экспорт накладывает). Токен — чтобы окно не писало куда попало. */
export const glFrames = {
  dirs: new Map<string, string>(),
  begin(): string {
    const token = `gl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const dir = path.join(cacheDir('export'), token);
    fs.mkdirSync(dir, { recursive: true });
    this.dirs.set(token, dir);
    return token;
  },
  write(token: string, seg: number, k: number, png: Uint8Array): boolean {
    const dir = this.dirs.get(token);
    if (!dir || !Number.isInteger(seg) || !Number.isInteger(k) || seg < 0 || k < 0) return false;
    fs.writeFileSync(path.join(dir, `s${seg}_${String(k).padStart(5, '0')}.png`), Buffer.from(png));
    return true;
  },
  pattern(token: string, seg: number): string | null {
    const dir = this.dirs.get(token);
    return dir ? path.join(dir, `s${seg}_%05d.png`) : null;
  },
  drop(token: string): void {
    const dir = this.dirs.get(token);
    this.dirs.delete(token);
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  },
};

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

/** Только звук проекта в MP3 (все дорожки, с музыкой). */
async function exportMp3(req: ExportReq, onProgress: (p: number) => void, signal?: AbortSignal): Promise<ExportResult> {
  const t0 = Date.now();
  const { project, opts } = req;
  // звуки на стыках — тоже в звуке ролика
  const full = expandSfx(project);
  const g = buildGraph(full, { width: 16, height: 16, fps: 30, textLayers: [], audioOnly: true, includeMusic: true, duck: await duckFor(full) });
  fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
  const tmpOut = path.join(path.dirname(opts.outPath), `.${path.basename(opts.outPath, '.mp3')}.kadro-part.mp3`);
  const filterFile = path.join(cacheDir('export'), `mp3_${Date.now()}.txt`);
  fs.writeFileSync(filterFile, g.filter);
  try {
    await runFfmpeg(mp3Args(g, filterFile, ffmpegMajor(), opts.mp3Kbps ?? 192, project.name, tmpOut), { duration: g.duration, onProgress, signal });
    fs.rmSync(opts.outPath, { force: true });
    fs.renameSync(tmpOut, opts.outPath);
    onProgress(1);
    return { ok: true, path: opts.outPath, seconds: (Date.now() - t0) / 1000 };
  } catch (e) {
    fs.rmSync(tmpOut, { force: true });
    if (signal?.aborted) return { ok: false, error: tx('Экспорт отменён') };
    return { ok: false, error: tx('Не удалось сохранить звук: {0}', e instanceof Error ? e.message : String(e)) };
  } finally {
    fs.rmSync(filterFile, { force: true });
  }
}

export async function exportProject(req: ExportReq, onProgress: (p: number) => void, signal?: AbortSignal): Promise<ExportResult> {
  const t0 = Date.now();
  const { opts } = req;
  let { project } = req;
  const total = projectDuration(project);
  if (total <= 0) return { ok: false, error: tx('Проект пустой — добавь видео или фото на таймлайн.') };
  const used = new Set(project.tracks.flatMap((t) => t.clips.map((c) => (c.type === 'media' ? c.assetId : ''))));
  const lost = project.assets.filter((a) => used.has(a.id) && !fs.existsSync(a.path));
  if (lost.length) return { ok: false, error: tx('Не найден файл: {0}. Верни его на место или убери клип с таймлайна.', lost.map((a) => `«${a.name}»`).join(', ')) };
  if (opts.format === 'mp3') return exportMp3(req, onProgress, signal);
  const size = opts.format === 'sticker' ? stickerSize(project.settings.width, project.settings.height) : exportSize(project.settings.width, project.settings.height, opts.height);
  const format = opts.format ?? 'mp4';
  // логотипа нет на месте — экспорт без него (как в плеере)
  if (project.settings.logo && !fs.existsSync(project.settings.logo.path)) {
    project = { ...project, settings: { ...project.settings, logo: undefined } };
  }
  // человек отдельным слоем (портрет, неон, текст за человеком) — фон и вырезанный человек, как в плеере
  project = expandSfx(expandPerson(project)); // и звуки на стыках — своей дорожкой
  const job = path.join(cacheDir('export'), `job_${Date.now()}`);
  fs.mkdirSync(job, { recursive: true });
  try {
    const blank = path.join(job, 'blank.png');
    fs.writeFileSync(blank, Buffer.from(req.blankPng));
    const lists = req.textLayers.filter((l) => l.clips.length).map((l, i) => ({ trackId: l.trackId, list: writeTextLayer(job, l, blank, total, i) }));
    let grayN = 0;
    const grayFile = (_name: string, bytes: Uint8Array, w: number, h: number) => {
      const file = path.join(job, `gray${grayN++}.png`);
      fs.writeFileSync(file, grayPng(bytes, w, h));
      return file;
    };
    let rgbN = 0;
    const rgbFile = (_name: string, bytes: Uint8Array, w: number, h: number) => {
      const file = path.join(job, `clut${rgbN++}.png`);
      fs.writeFileSync(file, rgbPng(bytes, w, h));
      return file;
    };
    // куски с шейдерами — кадры, нарисованные окном
    const glSegments = req.glToken && !opts.alpha
      ? (req.glSegments ?? []).flatMap((s, i) => { const pattern = glFrames.pattern(req.glToken!, i); return pattern ? [{ ...s, pattern }] : []; })
      : [];
    const sticker = format === 'sticker';
    // скрытые лица и номера: маска на каждый кадр клипа
    const blurMasks = await makeBlurMasks(project, job, opts.fps, signal);
    const photo3dMaps = await makePhoto3dMaps(project, job, opts.fps, signal); // 3D-фото: сдвиг по глубине на каждый кадр
    const graph = buildGraph(project, { width: size.w, height: size.h, fps: opts.fps, textLayers: lists, grayFile, rgbFile, luts: loadLuts(project), transparent: !!opts.alpha, glSegments, blurMasks, photo3dMaps,
      duck: opts.alpha || sticker ? undefined : await duckFor(project), maxDuration: sticker ? TG_STICKER.maxSec : opts.maxSec });
    const filterFile = path.join(job, 'graph.txt');
    fs.writeFileSync(filterFile, graph.filter);
    // главы из маркеров — видны в плеерах (VLC, MPC-HC, «Кино и ТВ»)
    const meta = ffmetadataChapters(project, project.name);
    const metaFile = meta ? path.join(job, 'chapters.txt') : undefined;
    if (metaFile) fs.writeFileSync(metaFile, meta!);
    fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
    const ext = path.extname(opts.outPath) || `.${format}`;
    const tmpOut = path.join(path.dirname(opts.outPath), `.${path.basename(opts.outPath, ext)}.kadro-part${ext}`);
    // GIF: тот же кадр, своя палитра на весь ролик, без звука
    if (format === 'gif') {
      fs.writeFileSync(filterFile, gifFilter(graph));
      try {
        await runFfmpeg(gifArgs(graph, filterFile, ffmpegMajor(), tmpOut), { duration: total, onProgress, signal });
      } catch (e) {
        fs.rmSync(tmpOut, { force: true });
        if (signal?.aborted) return { ok: false, error: tx('Экспорт отменён') };
        throw e;
      }
      fs.rmSync(opts.outPath, { force: true });
      fs.renameSync(tmpOut, opts.outPath);
      onProgress(1);
      return { ok: true, path: opts.outPath, seconds: (Date.now() - t0) / 1000 };
    }
    // видеостикер Telegram: VP9 без звука; не влез в 256 КБ — ещё раз с битрейтом пониже
    if (sticker) {
      fs.writeFileSync(filterFile, stickerFilter(graph));
      const dur = Math.min(TG_STICKER.maxSec, graph.duration);
      for (let i = 0; i < TG_KBPS.length; i++) {
        try {
          await runFfmpeg(stickerArgs(graph, filterFile, ffmpegMajor(), tmpOut, TG_KBPS[i], !!opts.alpha), { duration: dur, onProgress: (p) => onProgress((i + p) / TG_KBPS.length), signal });
        } catch (e) {
          fs.rmSync(tmpOut, { force: true });
          if (signal?.aborted) return { ok: false, error: tx('Экспорт отменён') };
          throw e;
        }
        if (fs.statSync(tmpOut).size <= TG_STICKER.maxBytes || i === TG_KBPS.length - 1) break;
      }
      const bytes = fs.statSync(tmpOut).size;
      fs.rmSync(opts.outPath, { force: true });
      fs.renameSync(tmpOut, opts.outPath);
      onProgress(1);
      if (bytes > TG_STICKER.maxBytes) return { ok: false, error: tx('Стикер получился больше 256 КБ — Telegram его не примет. Сделай ролик проще или короче.') };
      return { ok: true, path: opts.outPath, seconds: (Date.now() - t0) / 1000 };
    }
    // видеокарта: то, что прошло пробное кодирование; не вышло — следующий кодировщик, в конце процессор
    const hw = opts.alpha || opts.encoder === 'x264' ? null : await hardwareInfo();
    const encoders: EncoderEngine[] = opts.alpha ? ['vp9alpha'] : encoderPlan(opts.encoder, hw?.encoders ?? null, process.platform);
    let lastErr: unknown;
    for (const enc of encoders) {
      try {
        const args = fullArgs(graph, filterFile, ffmpegMajor(), enc, opts.quality, opts.fps, tmpOut, metaFile, size);
        await runFfmpeg(args, { duration: Math.min(total, graph.duration), onProgress, signal });
        fs.rmSync(opts.outPath, { force: true });
        fs.renameSync(tmpOut, opts.outPath);
        onProgress(1);
        return { ok: true, path: opts.outPath, encoder: enc, seconds: (Date.now() - t0) / 1000 };
      } catch (e) {
        lastErr = e;
        fs.rmSync(tmpOut, { force: true });
        if (signal?.aborted) return { ok: false, error: tx('Экспорт отменён') };
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    fs.writeFileSync(path.join(cacheDir('logs'), `export_error_${Date.now()}.txt`),
      `${msg}\n\n${(lastErr as { stderr?: string })?.stderr ?? ''}\n\n--- graph ---\n${graph.filter}`);
    return { ok: false, error: tx('Не удалось собрать видео: {0}', msg) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    fs.rmSync(job, { recursive: true, force: true });
    if (req.glToken) glFrames.drop(req.glToken);
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
