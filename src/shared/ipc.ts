// Контракт между интерфейсом (renderer) и главным процессом.
import type { Cue } from './timeline';
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
  | { kind: 'reframe'; jobId: string; path: string; in: number; out: number; width: number; height: number }
  | { kind: 'retime'; jobId: string; path: string; in: number; out: number; reverse: boolean; ramp?: RampPoint[]; hasVideo: boolean; hasAudio: boolean; width: number; height: number; fps: number }
  | { kind: 'freeze'; jobId: string; path: string; t: number; fps: number; alpha: boolean };

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
  | { kind: 'reframe'; points: { t: number; x: number; y: number; found: boolean }[] }
  | { kind: 'retime'; path: string; duration: number }
  | { kind: 'freeze'; path: string };

export interface AiResponse { ok: boolean; output?: AiOutput; error?: string }

export interface AppInfo { version: string; platform: string; nvenc: boolean; dataDir: string; mattingProvider?: string }

export interface ImportResult { assets: MediaAsset[]; errors: { path: string; message: string }[] }

export interface KadroApi {
  info(): Promise<AppInfo>;
  pickMedia(): Promise<string[]>;
  importMedia(paths: string[]): Promise<ImportResult>;
  onAssetUpdate(cb: (id: string, patch: Partial<MediaAsset>) => void): () => void;
  mediaUrl(path: string): string;
  pathForFile(file: File): string;
  saveProject(project: Project, path?: string | null): Promise<string | null>;
  openProject(): Promise<{ project: Project; path: string } | null>;
  loadLast(): Promise<{ project: Project; path: string | null } | null>;
  autosave(project: Project, path: string | null): void;
  pickExportPath(defaultName: string): Promise<string | null>;
  startExport(req: ExportReq): Promise<ExportResult>;
  cancelExport(): void;
  onExportProgress(cb: (p: number) => void): () => void;
  models(): Promise<ModelInfo[]>;
  ttsVoices(): Promise<VoiceInfo[]>;
  runAi(job: AiJob): Promise<AiResponse>;
  cancelAi(jobId: string): void;
  onAiProgress(cb: (jobId: string, p: number, stage?: string) => void): () => void;
  showInFolder(path: string): void;
  setTitle(title: string): void;
}
