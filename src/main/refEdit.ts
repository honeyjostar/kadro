// «Повторить монтаж по ролику»: разбор образца ffmpeg-ом (маленькие серые кадры с частотой ролика — склейки
// точно по кадрам), звук образца — отдельным файлом рядом с шаблоном, картинка для карточки шаблона.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { tx } from '../shared/i18n';
import { REF_H, REF_MAX_SEC, REF_W, analyzeRef, refTemplate } from '../shared/refEdit';
import type { Template } from '../shared/templates';
import { dataDir, ffmpegPath } from './bins';
import { FfmpegError, ffmpegToBuffer, runFfmpeg } from './ffrun';
import { analyze } from './media';

export interface RefResult { template: Template; shots: number; flashes: number; zooms: number; music: boolean; duration: number }

export const templatesDir = (): string => { const d = path.join(dataDir(), 'templates'); fs.mkdirSync(d, { recursive: true }); return d; };

function grayFrames(file: string, fps: number, limit: number, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Uint8Array[]> {
  const size = REF_W * REF_H;
  const expected = Math.max(1, Math.ceil(limit * fps));
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), [
      '-hide_banner', '-nostdin', '-v', 'error', '-t', String(limit), '-i', file, '-map', '0:v:0', '-an', '-sn', '-dn',
      '-vf', `fps=${fps},scale=${REF_W}:${REF_H}:flags=area,format=gray`, '-f', 'rawvideo', 'pipe:1',
    ], { windowsHide: true });
    const frames: Uint8Array[] = [];
    let pending: Buffer = Buffer.alloc(0);
    let err = '';
    proc.stdout.on('data', (d: Buffer) => {
      pending = pending.length ? Buffer.concat([pending, d]) : d;
      while (pending.length >= size) {
        frames.push(new Uint8Array(pending.subarray(0, size)));
        pending = pending.subarray(size);
      }
      onProgress?.(Math.min(0.95, frames.length / expected));
    });
    proc.stderr.on('data', (d: Buffer) => { err += d.toString(); if (err.length > 40_000) err = err.slice(-20_000); });
    const onAbort = () => { try { proc.kill('SIGKILL'); } catch { /* уже всё */ } };
    signal?.addEventListener('abort', onAbort, { once: true });
    proc.on('error', (e) => reject(new FfmpegError(tx('Не удалось запустить ffmpeg: {0}', e.message), err)));
    proc.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) { reject(new FfmpegError(tx('Отменено'), err)); return; }
      if (code !== 0 && !frames.length) { reject(new FfmpegError(err.trim().split(/\r?\n/).slice(-2).join('\n') || tx('ffmpeg: код {0}', code), err)); return; }
      resolve(frames);
    });
  });
}

/** Разобрать образец и сохранить шаблон «по ролику» (с его звуком) в «Мои шаблоны». */
export async function referenceTemplate(file: string, onProgress?: (p: number, stage: string) => void, signal?: AbortSignal): Promise<RefResult> {
  const { asset } = await analyze(file);
  if (asset.kind !== 'video') throw new Error(tx('Нужен видеоролик — в этом файле нет движущейся картинки'));
  const limit = Math.min(REF_MAX_SEC, asset.duration || REF_MAX_SEC);
  const fps = Math.max(10, Math.min(30, Math.round(asset.fps || 30)));
  onProgress?.(0.02, tx('Ищу склейки'));
  const frames = await grayFrames(file, fps, limit, (p) => onProgress?.(0.02 + p * 0.78, tx('Ищу склейки')), signal);
  if (frames.length < 4) throw new Error(tx('Ролик слишком короткий'));
  const analysis = analyzeRef(frames, fps);
  const id = `ref_${Date.now().toString(36)}`;
  // звук образца — музыка шаблона
  let music: string | undefined;
  if (asset.hasAudio) {
    onProgress?.(0.85, tx('Беру музыку из ролика'));
    const out = path.join(templatesDir(), `${id}.m4a`);
    try {
      await runFfmpeg(['-hide_banner', '-nostdin', '-v', 'error', '-y', '-t', String(limit), '-i', file, '-map', '0:a:0', '-vn', '-ac', '2', '-c:a', 'aac', '-b:a', '192k', out], { signal });
      music = out;
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  // картинка карточки — из середины первого кадра
  let thumb: string | undefined;
  try {
    const s0 = analysis.shots[0];
    const at = s0 ? (s0.start + s0.end) / 2 : 0.5;
    const jpg = await ffmpegToBuffer(['-hide_banner', '-v', 'error', '-ss', at.toFixed(3), '-i', file, '-frames:v', '1', '-vf', 'scale=240:-2', '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '5', 'pipe:1'], signal);
    if (jpg.length) thumb = `data:image/jpeg;base64,${jpg.toString('base64')}`;
  } catch { /* без картинки */ }
  const turned = Math.abs((asset.rotation ?? 0) % 180) === 90; // телефон снимал боком — размер кадра на экране
  const template = refTemplate(analysis, { id, name: path.basename(file), width: turned ? asset.height : asset.width, height: turned ? asset.width : asset.height, music, thumb });
  fs.writeFileSync(path.join(templatesDir(), `${id}.json`), JSON.stringify(template));
  onProgress?.(1, tx('Готово'));
  return {
    template, shots: analysis.shots.length, flashes: analysis.shots.filter((s) => s.flash).length,
    zooms: analysis.shots.filter((s) => s.zoom).length, music: !!music, duration: Math.round(analysis.duration * 100) / 100,
  };
}
