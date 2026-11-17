// «Проверка охватов»: кадры ролика (серые, короткая сторона 144, до 2 к/с), громкость с шагом 0,1 с и EBU R128 —
// дальше разбор в src/shared/reach.ts.
import { tx } from '../shared/i18n';
import { analyzeReach, scanFps, scanSize, type ReachReport } from '../shared/reach';
import type { Platform } from '../shared/safezones';
import { ffmpegToBuffer, runFfmpeg } from './ffrun';
import { probe } from './media';

const rate = (r?: string) => { if (!r) return 0; const [a, b] = r.split('/').map(Number); return b ? a / b : a || 0; };

/** Интегральная громкость и истинный пик из сводки ebur128. */
export function parseEbur(stderr: string): { lufs: number | null; peak: number | null } {
  const sum = stderr.slice(stderr.lastIndexOf('Summary:'));
  const i = /I:\s*(-?[\d.]+|-inf)\s*LUFS/.exec(sum);
  const p = /True peak:\s*[\s\S]*?Peak:\s*(-?[\d.]+|-inf)\s*dBFS/.exec(sum);
  const num = (m: RegExpExecArray | null) => (!m || m[1] === '-inf' ? null : Number(m[1]));
  return { lufs: num(i), peak: num(p) };
}

export async function reachScan(file: string, platform: Platform | null, onProgress: (p: number, stage: string) => void, signal?: AbortSignal): Promise<ReachReport> {
  const pr = await probe(file);
  if (!pr.video) throw new Error(tx('В файле нет видео'));
  const rot = (() => { const sd = pr.video.side_data_list?.find((x) => typeof x.rotation === 'number'); return Math.abs(((Math.round(sd?.rotation ?? Number(pr.video.tags?.rotate ?? 0)) % 180) + 180) % 180) === 90; })();
  const width = (rot ? pr.video.height : pr.video.width) ?? 0;
  const height = (rot ? pr.video.width : pr.video.height) ?? 0;
  const fps = rate(pr.video.avg_frame_rate) || rate(pr.video.r_frame_rate);
  const D = pr.duration;
  const mbps = D > 0 && pr.size ? (pr.size * 8) / D / 1e6 : 0;
  const { fw, fh } = scanSize(width, height);
  const f = scanFps(D);
  onProgress(0.05, tx('Смотрю кадры'));
  const buf = await ffmpegToBuffer(['-hide_banner', '-v', 'error', '-i', file, '-an', '-vf', `fps=${f.toFixed(4)},scale=${fw}:${fh}:flags=area,format=gray`, '-f', 'rawvideo', 'pipe:1'], signal, true);
  const N = fw * fh;
  const frames: Uint8Array[] = [];
  for (let o = 0; o + N <= buf.length; o += N) frames.push(new Uint8Array(buf.buffer, buf.byteOffset + o, N));
  onProgress(0.6, tx('Слушаю звук'));
  let rms: number[] = [];
  let lufs: number | null = null;
  let peak: number | null = null;
  const hasAudio = !!pr.audio;
  const rmsStep = 0.1;
  if (hasAudio) {
    const ar = 4000;
    const pcmBuf = await ffmpegToBuffer(['-hide_banner', '-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(ar), '-f', 's16le', 'pipe:1'], signal, true);
    const pcm = new Int16Array(pcmBuf.buffer, pcmBuf.byteOffset, Math.floor(pcmBuf.byteLength / 2));
    const per = Math.round(rmsStep * ar);
    for (let i = 0; i < pcm.length; i += per) {
      let s = 0;
      const e = Math.min(pcm.length, i + per);
      for (let k = i; k < e; k++) s += pcm[k] * pcm[k];
      rms.push(Math.sqrt(s / Math.max(1, e - i)) / 32768);
    }
    onProgress(0.8, tx('Меряю громкость'));
    const err = await runFfmpeg(['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { signal, low: true });
    ({ lufs, peak } = parseEbur(err));
  } else rms = [];
  onProgress(1, '');
  return analyzeReach({ frames, fw, fh, step: 1 / f, duration: D, width, height, fps, mbps, hasAudio, rms, rmsStep, lufs, peak }, platform);
}
