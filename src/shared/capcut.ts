// Переезд из CapCut: открыть свой проект CapCut (draft_content.json — обычный JSON у CapCut для компьютера 7–8.x)
// в Kadro. Переносятся склейки и обрезка, скорость, громкость, положение и размер видео поверх, музыка и звук,
// надписи. Эффекты, фильтры, стикеры и переходы CapCut у Kadro свои — их Kadro только посчитает и скажет.
// Зашифрованные проекты (новые версии) не открываются — Kadro их не расшифровывает.
import { tx } from './i18n';
import { newProject, sizeFor } from './defaults';
import { aspectOf } from './refEdit';
import { addAsset, addFree, addText, addToMain, updateClip } from './timeline';
import type { MediaAsset, Project } from './types';

interface Range { start: number; duration: number }
interface CcSeg {
  material_id: string;
  target_timerange?: Range;
  source_timerange?: Range | null;
  speed?: number;
  volume?: number;
  visible?: boolean;
  clip?: { scale?: { x: number; y: number }; transform?: { x: number; y: number }; rotation?: number; alpha?: number } | null;
}
interface CcTrack { type: string; segments?: CcSeg[] }
interface CcMat { id: string; path?: string; type?: string; duration?: number; width?: number; height?: number; material_name?: string; name?: string; content?: string }
export interface CcDraft {
  canvas_config?: { width?: number; height?: number };
  fps?: number;
  duration?: number;
  materials?: { videos?: CcMat[]; audios?: CcMat[]; texts?: CcMat[]; stickers?: CcMat[]; transitions?: CcMat[]; effects?: CcMat[]; video_effects?: CcMat[] };
  tracks?: CcTrack[];
}

const US = 1e6;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Проект CapCut прочитался? Иначе — понятная причина. */
export function parseDraft(text: string): { draft: CcDraft } | { error: string } {
  let j: unknown;
  try { j = JSON.parse(text); } catch {
    return { error: tx('Этот проект CapCut зашифрован — новые версии CapCut закрывают свои проекты, и Kadro их не расшифровывает. Сохрани ролик из CapCut как видео и открой его в Kadro.') };
  }
  const d = j as CcDraft;
  if (!d || typeof d !== 'object' || !Array.isArray(d.tracks) || !d.materials) return { error: tx('Это не проект CapCut: нет дорожек и материалов') };
  return { draft: d };
}

/** Путь к файлу: заглушку «##_draftpath_placeholder_…_##» CapCut заменяет папкой проекта. */
export function resolvePath(p: string, draftDir: string): string {
  const m = /^##_draftpath_placeholder_[^#]*_##[\\/]?/.exec(p);
  if (!m) return p;
  const sep = draftDir.includes('\\') ? '\\' : '/';
  return `${draftDir.replace(/[\\/]+$/, '')}${sep}${p.slice(m[0].length).replace(/[\\/]/g, sep)}`;
}

/** Все файлы проекта — их Kadro добавит в проект (видео, фото, звук). */
export function draftFiles(d: CcDraft, draftDir: string): string[] {
  const all = [...(d.materials?.videos ?? []), ...(d.materials?.audios ?? [])].map((m) => m.path).filter((p): p is string => !!p);
  return [...new Set(all.map((p) => resolvePath(p, draftDir)))];
}

/** Текст надписи: у CapCut — JSON {"text": …} или старый формат с тегами. */
export function textOf(content: string | undefined): string {
  if (!content) return '';
  try { const j = JSON.parse(content) as { text?: string }; if (typeof j.text === 'string') return j.text; } catch { /* старый формат */ }
  return content.replace(/<[^>]+>/g, '').replace(/\[|\]/g, '').trim();
}

export interface CapcutImport { project: Project; missing: string[]; skipped: number }

/** Проект Kadro из проекта CapCut. assetFor — файл, уже добавленный в Kadro (по полному пути). */
export function capcutToProject(d: CcDraft, draftDir: string, name: string, assetFor: (path: string) => MediaAsset | undefined): CapcutImport {
  const W = d.canvas_config?.width || 1080, H = d.canvas_config?.height || 1920;
  const aspect = aspectOf(W, H);
  let p = newProject(name, aspect);
  p = { ...p, settings: { ...p.settings, ...sizeFor(aspect, Math.max(720, Math.min(2160, Math.min(W, H)))), ...(d.fps ? { fps: Math.round(d.fps) } : {}) } };
  const mats = new Map<string, CcMat & { kind: 'video' | 'audio' | 'text' }>();
  for (const m of d.materials?.videos ?? []) mats.set(m.id, { ...m, kind: 'video' });
  for (const m of d.materials?.audios ?? []) mats.set(m.id, { ...m, kind: 'audio' });
  for (const m of d.materials?.texts ?? []) mats.set(m.id, { ...m, kind: 'text' });
  const missing = new Set<string>();
  let skipped = 0;
  const assetOf = (m: CcMat): MediaAsset | undefined => {
    if (!m.path) return undefined;
    const path = resolvePath(m.path, draftDir);
    const a = assetFor(path);
    if (!a) { missing.add(path); return undefined; }
    if (!p.assets.some((x) => x.id === a.id)) p = addAsset(p, a);
    return a;
  };
  const tracks = d.tracks ?? [];
  const videoTracks = tracks.filter((t) => t.type === 'video');
  // основная — первая дорожка видео, которая начинается с начала ролика
  const main = videoTracks.find((t) => (t.segments ?? []).some((s) => (s.target_timerange?.start ?? 0) < 0.05 * US)) ?? videoTracks[0];
  for (const t of tracks) {
    const segs = [...(t.segments ?? [])].sort((a, b) => (a.target_timerange?.start ?? 0) - (b.target_timerange?.start ?? 0));
    if (t.type !== 'video' && t.type !== 'audio' && t.type !== 'text') { skipped += segs.length; continue; }
    for (const s of segs) {
      const m = mats.get(s.material_id);
      if (!m) { skipped++; continue; }
      const start = (s.target_timerange?.start ?? 0) / US;
      const tdur = (s.target_timerange?.duration ?? 0) / US;
      if (m.kind === 'text') {
        const txt = textOf(m.content);
        if (!txt || tdur <= 0) continue;
        const r = addText(p, start, txt);
        const tr = s.clip?.transform;
        p = updateClip(r.project, r.clipId, { duration: r3(tdur), ...(tr ? { x: r3(0.5 + tr.x / 2), y: r3(0.5 - tr.y / 2) } : {}) });
        continue;
      }
      const a = assetOf(m);
      if (!a) continue;
      const speed = s.speed && s.speed > 0 ? s.speed : 1;
      const src = s.source_timerange;
      const range = a.kind === 'image' ? undefined : src ? { in: src.start / US, out: (src.start + src.duration) / US } : { in: 0, out: tdur * speed };
      const onMain = t === main && a.kind !== 'audio';
      const r = onMain ? addToMain(p, a.id, Number.POSITIVE_INFINITY, range) : addFree(p, a.id, start, range);
      p = r.project;
      const cl = s.clip;
      const patch: Record<string, unknown> = {};
      if (Math.abs(speed - 1) > 1e-3) patch.speed = r3(speed);
      if (typeof s.volume === 'number' && Math.abs(s.volume - 1) > 1e-3) patch.volume = Math.max(0, Math.min(2, r3(s.volume)));
      if (a.kind === 'image') patch.out = r3(tdur);
      if (a.kind !== 'audio') {
        patch.transform = {
          x: r3((cl?.transform?.x ?? 0) / 2), y: r3(-(cl?.transform?.y ?? 0) / 2),
          scale: r3(cl?.scale?.x ?? 1), rotation: r3(cl?.rotation ?? 0),
        };
        if (typeof cl?.alpha === 'number' && cl.alpha < 0.999) patch.opacity = r3(cl.alpha);
        patch.fit = 'contain';
      }
      if (s.visible === false) patch.muted = true;
      p = updateClip(p, r.clipId, patch);
    }
  }
  // эффекты, переходы и стикеры CapCut — своими средствами Kadro (не переносятся)
  skipped += (d.materials?.transitions?.length ?? 0) + (d.materials?.stickers?.length ?? 0);
  return { project: p, missing: [...missing], skipped };
}
