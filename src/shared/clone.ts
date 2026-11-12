// «Клон себя»: ты дважды в кадре. Камера стоит на месте, поэтому фон в разных местах записи одинаковый:
// поверх клипа кладётся вторая копия — тот же клип с другого момента (ты уже перешёл в другое место кадра)
// или второй дубль — и у неё удаляется фон. Остаётся второй ты поверх первого.
import { tx } from './i18n';
import { clipDuration, edit, MIN_CLIP, placeFree } from './timeline';
import { uid } from './defaults';
import type { MediaClip, Project } from './types';

export type CloneSource = { kind: 'offset'; seconds: number } | { kind: 'take'; assetId: string };

/** Сдвиг по умолчанию: за 4 секунды человек обычно успевает перейти на другое место. */
export const CLONE_OFFSET = 4;
export const CLONE_OFFSETS = [2, 4, 6, 10];
/** Клон короче этого (или всего клипа, если клип короче) — не клон. */
export const CLONE_MIN = 2;

/**
 * Откуда взять второго себя из того же файла: позже или раньше на `seconds` — где клон выходит длиннее
 * (поровну — позже). Длина — сколько получится, но не больше самого клипа. null — файла не хватает.
 */
export function offsetRange(c: Pick<MediaClip, 'in' | 'out'>, fileDur: number, seconds: number): { in: number; out: number } | null {
  const len = c.out - c.in;
  const later = { in: c.in + seconds, out: Math.min(c.out + seconds, fileDur) };
  const earlier = { in: c.in - seconds, out: c.out - seconds };
  const fit = (r: { in: number; out: number }) => r.in >= 0 && r.in < fileDur && r.out - r.in >= Math.min(len, CLONE_MIN) - 1e-6;
  const ok = [later, earlier].filter(fit);
  if (!ok.length) return null;
  return ok.reduce((a, b) => (b.out - b.in > a.out - a.in + 1e-6 ? b : a));
}

/** Второй дубль: тот же кусок по времени, что и у клипа (дубли обычно снимают с начала), а не хватает — с начала. */
export function takeRange(c: Pick<MediaClip, 'in' | 'out'>, takeDur: number): { in: number; out: number } {
  const len = c.out - c.in;
  const a = Math.max(0, Math.min(c.in, takeDur - len));
  return { in: a, out: Math.min(takeDur, a + len) };
}

/**
 * Положить клона над клипом. Возвращает новый проект и id клона (у него потом удаляется фон) или ошибку.
 * Клон повторяет кадр клипа (размер, положение, цвет, эффекты, движение камеры), чтобы фон совпал;
 * звук клона из того же файла выключен (иначе речь задвоится), у второго дубля — оставлен.
 */
export function addClone(p: Project, clipId: string, src: CloneSource): { project: Project; cloneId: string } | { error: string } {
  const base = p.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
  if (!base || base.type !== 'media') return { error: tx('Выбери видеоклип') };
  const asset = p.assets.find((a) => a.id === base.assetId);
  if (!asset || asset.kind !== 'video') return { error: tx('Клон делается из видео') };
  if (base.retime || base.group || base.model3d) return { error: tx('Клон не делается из реверса, группы или 3D — выбери обычный видеоклип') };
  let range: { in: number; out: number } | null;
  let assetId = base.assetId;
  if (src.kind === 'offset') {
    range = offsetRange(base, asset.duration, src.seconds);
    if (!range) return { error: tx('Видео слишком короткое: нужно ещё хотя бы {0} с записи до или после клипа', src.seconds) };
  } else {
    const take = p.assets.find((a) => a.id === src.assetId);
    if (!take || take.kind !== 'video') return { error: tx('Второй дубль — это видео') };
    if (take.id === base.assetId) return { error: tx('Второй дубль — другой файл. Для того же файла выбери «Из этого же видео»') };
    range = takeRange(base, take.duration);
    assetId = take.id;
  }
  const len = (range.out - range.in) / base.speed;
  if (len < Math.min(CLONE_MIN, clipDuration(base)) - 1e-6 || range.out - range.in < MIN_CLIP) return { error: tx('Клон получается слишком коротким') };
  const cloneId = uid('clip');
  const project = edit(p, (d) => {
    const c: MediaClip = {
      ...structuredClone(base),
      id: cloneId,
      assetId,
      start: base.start,
      in: range!.in,
      out: range!.in + Math.min(range!.out - range!.in, base.out - base.in),
      muted: src.kind === 'offset' ? true : base.muted,
      removeBg: { enabled: false, status: 'none' },
      denoise: { enabled: false, status: 'none' },
      stab: undefined,
      beauty: undefined,
      enhance: undefined,
      voice: undefined,
      person: undefined,
      transitionOut: undefined,
      cutSound: undefined,
      anim: undefined,
      blend: undefined,
      chroma: undefined,
      mask: undefined,
    };
    placeFree(d, 'video', c);
  });
  return { project, cloneId };
}
