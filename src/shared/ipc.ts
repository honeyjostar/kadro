// Контракт между интерфейсом (renderer) и главным процессом.
import type { Cue } from './timeline';
import type { Template } from './templates';
import type { Highlights } from './autoEdit';
import type { Appearance } from './appearance';
import type { CacheInfo } from './cache';
/** Файл плагина-шейдера из папки пользователя. */
export interface PluginFile { kind: 'transition' | 'effect'; file: string; src: string }
export interface AppearanceResult { appearance?: Appearance; shortcuts?: number; windows?: boolean }
export interface CustomStatus { on: boolean; dir: string; error?: string; skipped?: string[] }
import type { ExportOptions, MediaAsset, Project, RampPoint, VoiceEffect } from './types';

export type TtsVoiceId = 'irina' | 'dmitri' | 'denis' | 'ruslan' | 'amy' | 'ryan';
export interface VoiceInfo { id: TtsVoiceId; label: string; sizeMb: number; ready: boolean }

export interface TextLayerReq {
  trackId: string;
  clips: { start: number; duration: number; png: Uint8Array }[];
}

export interface ExportReq {
  project: Project;
  opts: ExportOptions;
  textLayers: TextLayerReq[];
  blankPng: Uint8Array; // прозрачный кадр размера экспорта
  /** Куски с шейдерами: кадры уже нарисованы окном (glFrame) в папку задания glToken. */
  glToken?: string;
  glSegments?: { start: number; frames: number }[];
}

export interface ExportResult { ok: boolean; path?: string; error?: string; encoder?: string; seconds?: number }

export interface ModelInfo { id: 'multi' | 'ru'; label: string; note: string; sizeMb: number; ready: boolean }

export type AiJob =
  | { kind: 'captions'; jobId: string; project: Project; model: 'multi' | 'ru'; includeMusic: boolean }
  | { kind: 'silence'; jobId: string; path: string; in: number; out: number }
  | { kind: 'denoise'; jobId: string; path: string; in: number; out: number }
  | { kind: 'removeBg'; jobId: string; path: string; in: number; out: number; width: number; height: number; fps: number; offset?: number }
  | { kind: 'download'; jobId: string; model: 'multi' | 'ru' }
  | { kind: 'voice'; jobId: string; path: string; in: number; out: number; effect: VoiceEffect; denoise: boolean }
  | { kind: 'tts'; jobId: string; text: string; voice: TtsVoiceId; speed: number }
  | { kind: 'ttsDownload'; jobId: string; voice: TtsVoiceId }
  | { kind: 'stab'; jobId: string; path: string; in: number; out: number; strength: number }
  | { kind: 'beats'; jobId: string; path: string }
  | { kind: 'highlights'; jobId: string; path: string; duration: number }
  | { kind: 'reframe'; jobId: string; path: string; in: number; out: number; width: number; height: number }
  | { kind: 'retime'; jobId: string; path: string; in: number; out: number; reverse: boolean; ramp?: RampPoint[]; smooth?: boolean; hasVideo: boolean; hasAudio: boolean; width: number; height: number; fps: number }
  | { kind: 'freeze'; jobId: string; path: string; t: number; fps: number; alpha: boolean }
  | { kind: 'beauty'; jobId: string; path: string; in: number; out: number; offset: number; smooth: number; bright: number; width: number; height: number };

export type AiOutput =
  | { kind: 'captions'; cues: Cue[]; text: string }
  | { kind: 'silence'; ranges: [number, number][] }
  | { kind: 'denoise'; path: string; range: [number, number] }
  | { kind: 'removeBg'; path: string; range: [number, number] }
  | { kind: 'download' }
  | { kind: 'voice'; path: string; range: [number, number] }
  | { kind: 'tts'; path: string; duration: number }
  | { kind: 'stab'; path: string; range: [number, number] }
  | { kind: 'beats'; beats: number[]; bpm: number }
  | { kind: 'highlights'; hl: Highlights }
  | { kind: 'reframe'; points: { t: number; x: number; y: number; found: boolean }[] }
  | { kind: 'retime'; path: string; duration: number }
  | { kind: 'freeze'; path: string }
  | { kind: 'beauty'; path: string; range: [number, number] };

export interface AiResponse { ok: boolean; output?: AiOutput; error?: string }

export interface AppInfo { version: string; platform: string; nvenc: boolean; dataDir: string; mattingProvider?: string }

export interface ImportResult { assets: MediaAsset[]; errors: { path: string; message: string }[] }

// ---------- библиотека папок ----------
export type LibKind = 'video' | 'image' | 'audio';
export interface LibFolder { path: string; name: string; exists: boolean; count: number }
export interface LibDir { path: string; name: string; count: number }
export interface LibFile { path: string; name: string; kind: LibKind; size: number; mtime: number }
export interface LibListing { dir: string; dirs: LibDir[]; files: LibFile[]; error?: string }
/** Кадр-превью и сведения о файле библиотеки (появляются по мере готовности). */
export interface LibMeta { thumb?: string; duration?: number; width?: number; height?: number; broken?: boolean; missing?: boolean }

/** Тема: тёмная, светлая или как в Windows. */
export type ThemePref = 'dark' | 'light' | 'system';
export interface RecentProject { path: string; name: string; mtime: number; clips: number; duration: number; aspect: string; thumb?: string; size?: number; draft?: boolean }
/** Демо-файлы из комплекта программы: ролики-сцены, бит, демо-ролик и превью шаблонов. Только те, что есть на диске. */
export interface DemoFiles { scenes: Record<string, string>; beat: string | null; reel: string | null; previews: Record<string, string> }
/** show — настройка «показывать при запуске», autoOpen — открыть ли сейчас (в автотестах выключено). */
export interface HomeInfo { show: boolean; autoOpen: boolean; demo: DemoFiles; recent: RecentProject[] }

export interface KadroApi {
  info(): Promise<AppInfo>;
  pickMedia(): Promise<string[]>;
  importMedia(paths: string[]): Promise<ImportResult>;
  onAssetUpdate(cb: (id: string, patch: Partial<MediaAsset>) => void): () => void;
  mediaUrl(path: string): string;
  pathForFile(file: File): string;
  saveProject(project: Project, path?: string | null): Promise<string | null>;
  /** Открыть проект или видео: { media } — выбрали видео, фото, звук (не проект). */
  openProject(): Promise<{ project: Project; path: string } | { media: string[] } | null>;
  /** Файлы, с которыми запустили Kadro («Открыть с помощью»), — один раз. */
  pendingFiles(): Promise<string[]>;
  bugInfo(): Promise<import('./bugReport').BugInfo>;
  openUrl(url: string): Promise<boolean>;
  openLogs(): Promise<string>;
  glFramesBegin(): Promise<string>;
  glFrame(token: string, seg: number, k: number, png: Uint8Array): Promise<boolean>;
  glFramesDrop(token: string): void;
  onCoversReady(cb: () => void): () => void;
  renameProjectFile(file: string, name: string): Promise<{ path: string } | { error: string }>;
  duplicateProject(file: string): Promise<{ path: string } | { error: string }>;
  trashProject(file: string): Promise<{ ok: true } | { error: string }>;
  cacheInfo(): Promise<CacheInfo>;
  clearCache(what: 'preview' | 'derived', refs: string[]): Promise<{ freed: number; removed: number; info: CacheInfo }>;
  onOpenFiles(cb: (files: string[]) => void): () => void;
  /** Открыть проект по пути (из списка недавних). */
  openProjectPath(path: string): Promise<{ project: Project; path: string } | { error: string }>;
  /** Стартовый экран: показывать ли, недавние проекты, демо-файлы. */
  homeInfo(): Promise<HomeInfo>;
  setShowHome(show: boolean): void;
  /** Тема при запуске (читается сразу, чтобы окно не мигало): выбор и тёмная ли она сейчас. */
  initialTheme: { pref: ThemePref; dark: boolean };
  setTheme(pref: ThemePref): void;
  onThemeChanged(cb: (t: { pref: ThemePref; dark: boolean }) => void): () => void;
  /** Оформление: акцент, значок, размер интерфейса, своё оформление. */
  initialAppearance: Appearance;
  setAppearance(patch: Partial<Appearance>): Promise<AppearanceResult>;
  pickAppIcon(): Promise<AppearanceResult & { ok: boolean; error?: string }>;
  openCustomDir(): Promise<string>;
  openDocs(page: 'customize' | 'guide' | 'plugins'): void;
  plugins(): Promise<PluginFile[]>;
  openPluginsDir(): Promise<string>;
  onPluginsChanged(cb: (list: PluginFile[]) => void): () => void;
  onAppearanceChanged(cb: (a: Appearance) => void): () => void;
  onCustomStatus(cb: (s: CustomStatus) => void): () => void;
  forgetRecent(path: string): void;
  /** Библиотека: папки, которые видны в любом проекте. */
  libFolders(): Promise<LibFolder[]>;
  /** Добавить папки (без путей — окно выбора папки). */
  libAdd(paths?: string[]): Promise<LibFolder[]>;
  libRemove(path: string): Promise<LibFolder[]>;
  libList(dir: string): Promise<LibListing>;
  libSearch(root: string, query: string): Promise<LibFile[]>;
  libMeta(file: string): Promise<LibMeta>;
  /** Какие из путей — папки (для перетаскивания в окно). */
  whichDirs(paths: string[]): Promise<boolean[]>;
  /** Сохранить копию проекта в «Черновики» (и в недавние). */
  stashDraft(project: Project): Promise<string>;
  loadLast(): Promise<{ project: Project; path: string | null } | null>;
  autosave(project: Project, path: string | null): void;
  /** То же, но дожидается записи — при закрытии окна. */
  autosaveNow(project: Project, path: string | null): void;
  pickExportPath(defaultName: string): Promise<string | null>;
  startExport(req: ExportReq): Promise<ExportResult>;
  cancelExport(): void;
  onExportProgress(cb: (p: number) => void): () => void;
  models(): Promise<ModelInfo[]>;
  ttsVoices(): Promise<VoiceInfo[]>;
  runAi(job: AiJob): Promise<AiResponse>;
  /** Запись с микрофона (webm/opus) → FLAC в папке данных. */
  saveRecording(data: ArrayBuffer): Promise<string>;
  /** Выбрать файл .cube: копия в папке программы. null — отменили. */
  pickLut(): Promise<{ path: string; name: string } | { error: string } | null>;
  listLuts(): Promise<{ path: string; name: string }[]>;
  readLut(path: string): Promise<string | null>;
  /** Звук файла — отдельным файлом FLAC (для «Извлечь звук»). */
  extractAudio(path: string): Promise<string>;
  /** 3D: выбрать файл модели (GLB, GLTF, OBJ, STL, FBX). */
  pickModel(): Promise<string | null>;
  pickMusic(): Promise<string | null>;
  /** 3D: собрать кадры RGBA (снизу вверх) в видео с прозрачным фоном. */
  m3dBegin(w: number, h: number, fps: number): Promise<string>;
  m3dFrame(id: string, rgba: ArrayBuffer): Promise<void>;
  m3dEnd(id: string): Promise<{ path?: string; error?: string }>;
  m3dCancel(id: string): void;
  /** Новый путь для отрисованной группы в папке программы. */
  groupPath(ext: 'mp4' | 'webm'): Promise<string>;
  listTemplates(): Promise<Template[]>;
  saveTemplate(t: Template): Promise<boolean>;
  deleteTemplate(id: string): Promise<void>;
  cancelAi(jobId: string): void;
  onAiProgress(cb: (jobId: string, p: number, stage?: string) => void): () => void;
  showInFolder(path: string): void;
  setTitle(title: string): void;
  /** Записать ошибку окна в журнал программы. */
  logError(message: string): void;
}
