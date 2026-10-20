// Состояние редактора: проект, история (отмена/повтор), выделение, плейхед, задачи ИИ, уведомления.
import { create } from 'zustand';
import { newProject } from '../shared/defaults';
import type { DemoFiles, KadroApi, ThemePref } from '../shared/ipc';
import type { Platform } from '../shared/safezones';
import { projectDuration } from '../shared/timeline';
import type { MediaAsset, Project } from '../shared/types';

export const api: KadroApi = (window as unknown as { kadro: KadroApi }).kadro;

export type LeftTab = 'media' | 'audio' | 'text' | 'captions' | 'effects' | 'transitions' | 'filters' | 'templates' | 'ai';

export interface Job { id: string; label: string; progress: number; stage?: string; clipId?: string; cancellable: boolean }
export interface Toast { id: number; text: string; kind: 'info' | 'ok' | 'err' }

interface State {
  project: Project;
  projectPath: string | null;
  savedAt: number | null;
  dirty: boolean;
  past: Project[];
  future: Project[];
  lastKey: string | null;
  lastAt: number;
  selection: string[];
  junction: string | null; // клип основной дорожки, после которого выбран стык (для переходов)
  playhead: number;
  playing: boolean;
  pxPerSec: number;
  leftTab: LeftTab;
  jobs: Record<string, Job>;
  toasts: Toast[];
  exportOpen: boolean;
  tlHeight: number;
  /** Идёт запись голоса: с какого места таймлайна и заглушён ли звук проекта. */
  recording: { startT: number; muted: boolean } | null;
  /** Открыт стартовый экран. */
  home: boolean;
  /** Демо-ролики и превью шаблонов из комплекта программы. */
  demo: DemoFiles | null;
  /** Выбранная тема и та, что сейчас на экране (для «как в Windows»). */
  themePref: ThemePref;
  theme: 'dark' | 'light';
  /** Показывать в плеере, где интерфейс TikTok / Reels / Shorts закроет видео. */
  safeZone: Platform | null;
  /** Папку только что бросили в окно — открыть её в библиотеке. */
  libJump: string | null;

  commit: (fn: (p: Project) => Project, key?: string) => void;
  replace: (p: Project, path?: string | null) => void;
  patchAsset: (id: string, patch: Partial<MediaAsset>) => void;
  undo: () => void;
  redo: () => void;
  select: (ids: string[], junction?: string | null) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (b: boolean) => void;
  setZoom: (pps: number) => void;
  setLeftTab: (t: LeftTab) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  setJob: (job: Job | null, id?: string) => void;
  setExportOpen: (b: boolean) => void;
  markSaved: (path: string) => void;
  setTlHeight: (h: number) => void;
  setRecording: (r: { startT: number; muted: boolean } | null) => void;
  setHome: (b: boolean) => void;
  setDemo: (d: DemoFiles) => void;
  setThemePref: (t: ThemePref) => void;
  setTheme: (t: 'dark' | 'light') => void;
  setSafeZone: (z: Platform | null) => void;
  setLibJump: (p: string | null) => void;
}

const HISTORY = 120;
// мелкие настройки вида (не проект) — в памяти окна; хранилище может быть недоступно — тогда просто по умолчанию
function readPref<T>(key: string, def: T): T {
  try { const v = localStorage.getItem(key); return v === null ? def : (JSON.parse(v) as T); } catch { return def; }
}
function writePref(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* не страшно */ }
}
let toastId = 1;
// обновления файла (миниатюры, волна, прокси) могут прийти раньше, чем файл попал в проект
const earlyPatches = new Map<string, Partial<MediaAsset>>();

/** Применить отложенные обновления к только что добавленным файлам. */
export function takeEarlyPatches(ids: string[]): void {
  for (const id of ids) {
    const patch = earlyPatches.get(id);
    if (!patch) continue;
    earlyPatches.delete(id);
    useStore.getState().patchAsset(id, patch);
  }
}

export const useStore = create<State>((set, get) => ({
  project: newProject(),
  projectPath: null,
  savedAt: null,
  dirty: false,
  past: [],
  future: [],
  lastKey: null,
  lastAt: 0,
  selection: [],
  junction: null,
  playhead: 0,
  playing: false,
  pxPerSec: 60,
  leftTab: 'media',
  jobs: {},
  toasts: [],
  exportOpen: false,
  tlHeight: 300,
  recording: null,
  home: false,
  demo: null,
  themePref: api?.initialTheme?.pref ?? 'dark',
  theme: api?.initialTheme?.dark === false ? 'light' : 'dark',
  safeZone: readPref<Platform | null>('kadro.safeZone', null),
  libJump: null,

  commit: (fn, key) => {
    const s = get();
    let next: Project;
    try {
      next = fn(s.project);
    } catch (e) {
      get().toast(e instanceof Error ? e.message : String(e), 'err');
      return;
    }
    if (next === s.project) return;
    const now = performance.now();
    // ползунки: серия правок с одним ключом в пределах секунды — одна запись в истории
    const coalesce = key && key === s.lastKey && now - s.lastAt < 1000;
    const past = coalesce ? s.past : [...s.past, s.project].slice(-HISTORY);
    const ids = new Set(next.tracks.flatMap((t) => t.clips.map((c) => c.id)));
    set({
      project: next, past, future: [], dirty: true, lastKey: key ?? null, lastAt: now,
      selection: s.selection.filter((id) => ids.has(id)),
      playhead: Math.min(s.playhead, Math.max(0, projectDuration(next))),
    });
  },
  replace: (p, path = null) => {
    set({ project: p, projectPath: path, past: [], future: [], dirty: false, selection: [], playhead: 0, playing: false, junction: null });
    takeEarlyPatches(p.assets.map((a) => a.id));
  },
  patchAsset: (id, patch) => set((s) => {
    if (!s.project.assets.some((a) => a.id === id)) {
      earlyPatches.set(id, { ...earlyPatches.get(id), ...patch });
      return {};
    }
    return {
    project: { ...s.project, assets: s.project.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) },
    past: s.past.map((p) => ({ ...p, assets: p.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
    future: s.future.map((p) => ({ ...p, assets: p.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
    };
  }),
  undo: () => {
    const s = get();
    if (!s.past.length) return;
    const prev = s.past[s.past.length - 1];
    set({ project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future], dirty: true, lastKey: null });
  },
  redo: () => {
    const s = get();
    if (!s.future.length) return;
    const next = s.future[0];
    set({ project: next, future: s.future.slice(1), past: [...s.past, s.project], dirty: true, lastKey: null });
  },
  select: (ids, junction = null) => set({ selection: ids, junction }),
  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (b) => set({ playing: b }),
  setZoom: (pps) => set({ pxPerSec: Math.min(800, Math.max(4, pps)) }),
  setLeftTab: (t) => set({ leftTab: t }),
  toast: (text, kind = 'info') => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'err' ? 7000 : 3500);
  },
  setJob: (job, id) => set((s) => {
    const jobs = { ...s.jobs };
    if (job) jobs[job.id] = job;
    else if (id) delete jobs[id];
    return { jobs };
  }),
  setExportOpen: (b) => set({ exportOpen: b }),
  markSaved: (path) => set({ projectPath: path, dirty: false, savedAt: Date.now() }),
  setRecording: (r) => set({ recording: r }),
  setTlHeight: (h) => set({ tlHeight: Math.min(560, Math.max(180, h)) }),
  setHome: (b) => set(b ? { home: true, playing: false } : { home: false }),
  setDemo: (d) => set({ demo: d }),
  setThemePref: (t) => { api.setTheme(t); set({ themePref: t }); },
  setTheme: (t) => set({ theme: t }),
  setSafeZone: (z) => { writePref('kadro.safeZone', z); set({ safeZone: z }); },
  setLibJump: (p) => set({ libJump: p }),
}));

export const getState = () => useStore.getState();
