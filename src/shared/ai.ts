import type { AiResult, MediaClip } from './types';

const EPS = 1e-3;

/** Годится ли обработанный файл для текущего фрагмента клипа. */
export function aiCovers(r: AiResult, clipIn: number, clipOut: number): boolean {
  return r.enabled && r.status === 'ready' && !!r.path && !!r.range &&
    clipIn >= r.range[0] - EPS && clipOut <= r.range[1] + EPS;
}

/** Откуда брать картинку/звук клипа: обработанный файл (со сдвигом) или null — оригинал. */
export function aiSource(c: MediaClip, kind: 'removeBg' | 'denoise'): { path: string; offset: number } | null {
  const r = c[kind];
  if (!aiCovers(r, c.in, c.out)) return null;
  return { path: r.path as string, offset: (r.range as [number, number])[0] };
}

/** Нужно ли заново обработать (включено, но результат не покрывает фрагмент). */
export function aiStale(c: MediaClip, kind: 'removeBg' | 'denoise'): boolean {
  const r = c[kind];
  return r.enabled && r.status !== 'processing' && !aiCovers(r, c.in, c.out);
}
