import { useMemo } from 'react';
import { findClip } from '../shared/timeline';
import type { Clip, MediaAsset, Track } from '../shared/types';
import { useStore } from './store';

export interface Selected { track: Track; clip: Clip; index: number; asset?: MediaAsset }

/** Единственный выделенный клип (или null, если выделено 0 или несколько). */
export function useSelected(): Selected | null {
  const project = useStore((s) => s.project);
  const sel = useStore((s) => s.selection);
  return useMemo(() => {
    if (sel.length !== 1) return null;
    const f = findClip(project, sel[0]);
    if (!f) return null;
    const asset = f.clip.type === 'media' ? project.assets.find((a) => a.id === (f.clip as { assetId: string }).assetId) : undefined;
    return { ...f, asset };
  }, [project, sel]);
}

/** Есть ли сейчас задача ИИ для клипа. */
export function useClipJob(clipId: string | undefined) {
  const jobs = useStore((s) => s.jobs);
  return clipId ? Object.values(jobs).find((j) => j.clipId === clipId) : undefined;
}

export function useJobRunning(prefix: string): boolean {
  const jobs = useStore((s) => s.jobs);
  return Object.keys(jobs).some((k) => k.startsWith(prefix));
}
