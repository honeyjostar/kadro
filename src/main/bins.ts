// Где лежат ffmpeg/ffprobe и модели. В собранном приложении — рядом с программой (resources/bin),
// при разработке и в тестах — системные или из переменных окружения.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const exe = process.platform === 'win32' ? '.exe' : '';

function resourcesDir(): string | undefined {
  const rp = (process as unknown as { resourcesPath?: string }).resourcesPath;
  return rp && fs.existsSync(path.join(rp, 'bin')) ? rp : undefined;
}

export function ffmpegPath(): string {
  if (process.env.KADRO_FFMPEG) return process.env.KADRO_FFMPEG;
  const r = resourcesDir();
  if (r) return path.join(r, 'bin', `ffmpeg${exe}`);
  return `ffmpeg${exe}`;
}

export function ffprobePath(): string {
  if (process.env.KADRO_FFPROBE) return process.env.KADRO_FFPROBE;
  const r = resourcesDir();
  if (r) return path.join(r, 'bin', `ffprobe${exe}`);
  return `ffprobe${exe}`;
}

/** Встроенные небольшие модели (RNNoise), идут вместе с программой. */
export function bundledModel(name: string): string {
  const r = resourcesDir();
  const candidates = [
    r && path.join(r, 'models', name),
    path.join(__dirname, '..', '..', 'resources', 'models', name),
    path.join(process.cwd(), 'resources', 'models', name),
  ].filter(Boolean) as string[];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return candidates[candidates.length - 1];
}

/** Папка для скачиваемых моделей и кэша. */
let dataDirOverride: string | undefined;
export function setDataDir(d: string): void { dataDirOverride = d; }
export function dataDir(): string {
  const d = process.env.KADRO_DATA || dataDirOverride || path.join(os.homedir(), '.kadro');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
export function modelsDir(): string {
  const d = process.env.KADRO_MODELS || path.join(dataDir(), 'models');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
export function cacheDir(sub: string): string {
  const d = path.join(dataDir(), 'cache', sub);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

let majorCache: number | undefined;
export function ffmpegMajor(): number {
  if (majorCache !== undefined) return majorCache;
  try {
    const out = execFileSync(ffmpegPath(), ['-version'], { encoding: 'utf8', windowsHide: true });
    const m = /ffmpeg version n?(\d+)\./.exec(out);
    // сборки из git (N-xxxxx) — новые, считаем 8
    majorCache = m ? Number(m[1]) : /ffmpeg version N-/.test(out) ? 8 : 7;
  } catch {
    majorCache = 7;
  }
  return majorCache;
}
