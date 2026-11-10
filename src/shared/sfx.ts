// Звуки на стыках основной дорожки: свуш, щелчок, «бум» (свои, сочинены формулой — scripts/make-sfx.mjs).
// Хранится у клипа (cutSound — звук на стыке после него); при показе и экспорте звук встаёт на свою
// дорожку ровно на стык — двигаешь клипы, звук едет вместе со стыком.
import { tx } from './i18n';
import { newMediaClip } from './defaults';
import { clipEnd } from './timeline';
import type { MediaAsset, Project } from './types';

export type SfxId = 'whoosh' | 'click' | 'boom';
/** dur — длина файла; lead — за сколько до стыка начинается (у свуша пик — на стыке); vol — громкость. */
export const SFX: Record<SfxId, { label: string; dur: number; lead: number; vol: number }> = {
  whoosh: { label: tx('Свуш'), dur: 0.7, lead: 0.45, vol: 0.85 },
  click: { label: tx('Щелчок'), dur: 0.18, lead: 0.01, vol: 0.8 },
  boom: { label: tx('Бум'), dur: 1.1, lead: 0.02, vol: 0.9 },
};
export const SFX_IDS = Object.keys(SFX) as SfxId[];

let files: Partial<Record<SfxId, string>> = {};
/** Где лежат файлы звуков (main — из папки программы, окно — от main). */
export function setSfxFiles(f: Partial<Record<string, string>> | undefined): void {
  files = {};
  for (const id of SFX_IDS) if (f?.[id]) files[id] = f[id]!;
}
export const sfxFile = (id: SfxId): string | undefined => files[id];

/** Время стыка после клипа i основной дорожки: середина перехода или сам стык. */
export function junctionAt(p: Project, clipId: string): number | null {
  const main = p.tracks.find((t) => t.kind === 'main');
  const i = main?.clips.findIndex((c) => c.id === clipId) ?? -1;
  if (!main || i < 0 || i >= main.clips.length - 1) return null;
  const c = main.clips[i];
  const d = c.type === 'media' ? c.transitionOut?.duration ?? 0 : 0;
  return clipEnd(c) - d / 2;
}

/** Проект для показа и экспорта: звуки стыков — клипами на отдельной дорожке. Без звуков — тот же проект. */
export function expandSfx(p: Project): Project {
  const main = p.tracks.find((t) => t.kind === 'main');
  const marks = (main?.clips ?? []).flatMap((c) => (c.type === 'media' && c.cutSound && files[c.cutSound] ? [{ id: c.id, sfx: c.cutSound }] : []));
  if (!marks.length) return p;
  const d: Project = structuredClone(p);
  const track = { id: 'sfx~track', kind: 'audio' as const, name: 'sfx', muted: false, hidden: false, clips: [] as ReturnType<typeof newMediaClip>[] };
  for (const m of marks) {
    const at = junctionAt(d, m.id);
    if (at === null) continue;
    const s = SFX[m.sfx];
    const aid = `sfx~${m.sfx}`;
    let a = d.assets.find((x) => x.id === aid);
    if (!a) {
      a = { id: aid, kind: 'audio', path: files[m.sfx]!, previewPath: files[m.sfx]!, name: s.label, duration: s.dur, width: 0, height: 0, fps: 0,
        hasVideo: false, hasAudio: true, size: 1, rotation: 0, proxy: 'none' } as MediaAsset;
      d.assets.push(a);
    }
    const c = newMediaClip(a, Math.max(0, at - s.lead));
    c.id = `sfx~${m.id}`;
    c.volume = s.vol;
    track.clips.push(c);
  }
  track.clips.sort((x, y) => x.start - y.start);
  d.tracks.push(track);
  return d;
}
