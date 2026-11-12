import type { AiResult, MediaClip } from './types';

const EPS = 1e-3;
type AiKind = 'removeBg' | 'denoise' | 'stab' | 'voice' | 'beauty' | 'enhance';

/** Годится ли обработанный файл для текущего фрагмента клипа. */
export function aiCovers(r: AiResult | undefined, clipIn: number, clipOut: number): boolean {
  return !!r && r.enabled && r.status === 'ready' && !!r.path && !!r.range &&
    clipIn >= r.range[0] - EPS && clipOut <= r.range[1] + EPS;
}

/** Откуда брать картинку/звук клипа: обработанный файл (со сдвигом) или null — оригинал. */
export function aiSource(c: MediaClip, kind: AiKind): { path: string; offset: number } | null {
  const r = c[kind];
  if (!aiCovers(r, c.in, c.out)) return null;
  return { path: r!.path as string, offset: (r!.range as [number, number])[0] };
}

/** Картинка клипа: без фона (с прозрачностью) → с ретушью → стабилизированная → улучшенная → оригинал (null).
 *  Обработки строятся цепочкой: улучшение качества → стабилизация → ретушь → удаление фона. */
export function videoSource(c: MediaClip): { path: string; offset: number; alpha: boolean } | null {
  const bg = aiSource(c, 'removeBg');
  if (bg) return { ...bg, alpha: true };
  const be = aiSource(c, 'beauty');
  if (be) return { ...be, alpha: false };
  const st = aiSource(c, 'stab');
  if (st) return { ...st, alpha: false };
  const en = aiSource(c, 'enhance');
  if (en) return { ...en, alpha: false };
  return null;
}

/** Из чего строить следующую обработку картинки: стабилизация — из улучшенной копии, ретушь — из стабилизированной
 *  (или улучшенной), удаление фона — из ретуши, стабилизации или улучшенной. null — из оригинала. */
export function videoInputFor(c: MediaClip, kind: 'stab' | 'beauty' | 'removeBg'): { path: string; offset: number } | null {
  if (kind === 'removeBg') { const be = aiSource(c, 'beauty'); if (be) return be; }
  if (kind !== 'stab') { const st = aiSource(c, 'stab'); if (st) return st; }
  return aiSource(c, 'enhance');
}

/** Звук клипа: голос с эффектом → очищенный → оригинал (null). */
export function audioSource(c: MediaClip): { path: string; offset: number } | null {
  if (c.voice?.effect && c.voice.effect !== 'none') {
    const v = aiSource(c, 'voice');
    if (v) return v;
  }
  return aiSource(c, 'denoise');
}

/** Нужно ли заново обработать (включено, но результат не покрывает фрагмент). */
export function aiStale(c: MediaClip, kind: AiKind): boolean {
  const r = c[kind];
  if (!r || !r.enabled || r.status === 'processing') return false;
  if (kind === 'voice' && (!c.voice?.effect || c.voice.effect === 'none')) return false;
  return !aiCovers(r, c.in, c.out);
}
