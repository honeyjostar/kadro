// Главный процесс Kadro: окно, доступ к файлам, импорт, экспорт, ИИ-задачи.
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol, shell, utilityProcess, type UtilityProcess } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { AiJob, AiResponse, DemoFiles, ExportReq, HomeInfo, LibFolder, ModelInfo, RecentProject, ThemePref, VoiceInfo } from '../shared/ipc';
import { countDeep, libMeta, listDir, searchDir } from './library';
import * as m3d from './model3d';
import { highlights } from './highlights';
import type { MediaAsset, Project } from '../shared/types';
import { ASR_MODELS, asrModelReady, TTS_VOICES, ttsVoiceReady } from './ai/models';
import { denoise } from './ai/denoise';
import { processVoice } from './ai/voice';
import { stabilize } from './ai/stab';
import { freezeFrame, retime } from './retime';
import { beautify } from './ai/beauty';
import { runFfmpeg } from './ffrun';
import { importLutFile, listLutFiles } from './luts';
import { BUILTIN_TEMPLATES, DEMO_SCENES, isTemplate, type Template } from '../shared/templates';
import { projectDuration } from '../shared/timeline';
import { bundledFile, cacheDir, dataDir, ffmpegPath, ffprobePath, modelsDir } from './bins';
import { exportProject, exportSpeechAudio, hasNvenc } from './exporter';
import { analyze, makePeaks, makeProxy, makeThumbs } from './media';

void net;
const isDev = !app.isPackaged;
const LOG = () => path.join(dataDir(), 'kadro.log');
function log(...a: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${a.map((x) => (x instanceof Error ? x.stack : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`;
  try { fs.appendFileSync(LOG(), line); } catch { /* нет доступа к логу — не критично */ }
  if (isDev) process.stdout.write(line);
}

// В тестах — отдельная папка данных, чтобы не трогать настоящие проекты
if (process.env.KADRO_DATA) app.setPath('userData', process.env.KADRO_DATA);

protocol.registerSchemesAsPrivileged([{
  scheme: 'kmedia',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true },
}]);

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/webm',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
  '.opus': 'audio/ogg', '.flac': 'audio/flac', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.avif': 'image/avif',
};

/** Отдаёт локальный файл плееру с поддержкой Range (без неё не работает перемотка видео). */
function serveFile(req: Request): Response {
  const url = new URL(req.url);
  const file = decodeURIComponent(url.pathname.replace(/^\//, ''));
  let stat: fs.Stats;
  try { stat = fs.statSync(file); } catch { return new Response('not found', { status: 404 }); }
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' };
  const range = req.headers.get('range');
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? Number(m[1]) : 0;
    let end = m && m[2] ? Number(m[2]) : stat.size - 1;
    if (m && !m[1] && m[2]) { start = Math.max(0, stat.size - Number(m[2])); end = stat.size - 1; }
    end = Math.min(end, stat.size - 1);
    if (start > end || start >= stat.size) return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${stat.size}` } });
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as unknown as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...base, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${stat.size}` } });
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as unknown as ReadableStream;
  return new Response(stream, { status: 200, headers: { ...base, 'Content-Length': String(stat.size) } });
}

let win: BrowserWindow | null = null;

/** Цвета рамки окна под тему: фон и значки свернуть/закрыть (Windows рисует их поверх нашей верхней панели). */
function chromeColors(): { bg: string; symbol: string } {
  return nativeTheme.shouldUseDarkColors ? { bg: '#15131a', symbol: '#d9d3e3' } : { bg: '#eeedf2', symbol: '#2a2633' };
}
function applyTheme(pref: ThemePref): void {
  nativeTheme.themeSource = pref;
  // окно не всегда узнаёт о смене через prefers-color-scheme — сообщаем явно
  win?.webContents.send('theme:changed', { pref, dark: nativeTheme.shouldUseDarkColors });
  const c = chromeColors();
  if (win && !win.isDestroyed()) {
    win.setBackgroundColor(c.bg);
    if (process.platform === 'win32') { try { win.setTitleBarOverlay({ color: c.bg, symbolColor: c.symbol, height: 40 }); } catch { /* старая система */ } }
  }
}

function createWindow(): void {
  const colors = chromeColors();
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: colors.bg,
    title: 'Kadro',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32' ? { color: colors.bg, symbolColor: colors.symbol, height: 40 } : false,
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '..', '..', 'resources', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => { if (!process.env.KADRO_HIDDEN) win?.show(); });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win?.webContents.toggleDevTools();
  });
  // окно упало (нехватка памяти, сбой видеодрайвера) — перезагружаем: черновик сохраняется автоматически
  let lastReload = 0;
  win.webContents.on('render-process-gone', (_e, d) => {
    log('renderer gone', d);
    if (d.reason === 'clean-exit' || !win || win.isDestroyed()) return;
    if (Date.now() - lastReload < 10_000) return; // не уходим в бесконечный перезапуск
    lastReload = Date.now();
    win.webContents.reload();
  });
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) log('renderer:', message); });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

// ---------- ИИ-процесс ----------
type Lane = 'speech' | 'vision';
const workers = new Map<Lane, UtilityProcess>();
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; lane: Lane }>();

/** ИИ-процесс: «speech» — речь и паузы (sherpa-onnx), «vision» — удаление фона (onnxruntime). */
function aiWorker(lane: Lane): UtilityProcess {
  const existing = workers.get(lane);
  if (existing) return existing;
  const w = utilityProcess.fork(path.join(__dirname, '..', 'worker', 'aiWorker.js'), [], {
    serviceName: lane === 'speech' ? 'Kadro Speech' : 'Kadro Vision',
    env: {
      ...process.env,
      KADRO_RESOURCES: app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..', 'resources'),
      KADRO_DATA: dataDir(),
      KADRO_MODELS: modelsDir(),
      KADRO_FFMPEG: ffmpegPath(),
      KADRO_FFPROBE: ffprobePath(),
    },
    stdio: 'pipe',
  });
  workers.set(lane, w);
  w.stdout?.on('data', (d) => log(`ai ${lane}:`, d.toString().trim()));
  w.stderr?.on('data', (d) => log(`ai ${lane} err:`, d.toString().trim()));
  w.on('message', (m: { id?: string; type: string; p?: number; stage?: string; result?: unknown; message?: string }) => {
    if (!m.id) return;
    if (m.type === 'progress') win?.webContents.send('ai:progress', m.id, m.p, m.stage);
    else if (m.type === 'done') { pending.get(m.id)?.resolve(m.result); pending.delete(m.id); }
    else if (m.type === 'error') { pending.get(m.id)?.reject(new Error(m.message)); pending.delete(m.id); }
  });
  w.on('exit', (code) => {
    log(`ai ${lane} exit`, code);
    if (workers.get(lane) === w) workers.delete(lane);
    for (const [id, p] of pending) {
      if (p.lane !== lane) continue;
      p.reject(new Error('ИИ-процесс неожиданно завершился. Попробуй ещё раз.'));
      pending.delete(id);
    }
  });
  return w;
}

function workerCall<T>(id: string, msg: Record<string, unknown>): Promise<T> {
  const lane: Lane = msg.kind === 'removeBg' || msg.kind === 'reframe' ? 'vision' : 'speech';
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, lane });
    aiWorker(lane).postMessage({ id, ...msg });
  });
}

const aiAborts = new Map<string, AbortController>();

async function runAi(job: AiJob): Promise<AiResponse> {
  const id = job.jobId;
  const send = (p: number, stage?: string) => win?.webContents.send('ai:progress', id, p, stage);
  try {
    if (job.kind === 'download') {
      await workerCall(id, { kind: 'download', model: job.model });
      return { ok: true, output: { kind: 'download' } };
    }
    if (job.kind === 'captions') {
      if (!asrModelReady(job.model)) return { ok: false, error: 'Модель распознавания не скачана' };
      const ac = new AbortController();
      aiAborts.set(id, ac);
      send(0.01, 'Собираю звук');
      const wav = path.join(cacheDir('tmp'), `speech_${Date.now()}.wav`);
      await exportSpeechAudio({ project: job.project, includeMusic: job.includeMusic }, wav, ac.signal);
      try {
        const r = await workerCall<{ cues: { start: number; end: number; text: string }[]; text: string }>(id, { kind: 'transcribe', wav, model: job.model });
        return { ok: true, output: { kind: 'captions', cues: r.cues, text: r.text } };
      } finally {
        fs.rmSync(wav, { force: true });
      }
    }
    if (job.kind === 'silence') {
      const r = await workerCall<{ ranges: [number, number][] }>(id, { kind: 'silence', path: job.path, in: job.in, out: job.out });
      return { ok: true, output: { kind: 'silence', ranges: r.ranges } };
    }
    if (job.kind === 'denoise') {
      const ac = new AbortController();
      aiAborts.set(id, ac);
      const out = path.join(cacheDir('ai'), `voice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.flac`);
      await denoise(job.path, job.in, job.out - job.in, out, (p) => send(p, 'Чищу голос'), ac.signal);
      return { ok: true, output: { kind: 'denoise', path: out, range: [job.in, job.out] } };
    }
    if (job.kind === 'removeBg') {
      const out = path.join(cacheDir('ai'), `nobg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.webm`);
      await workerCall(id, { kind: 'removeBg', path: job.path, in: job.in, out: job.out, width: job.width, height: job.height, fps: job.fps, outPath: out });
      const off = job.offset ?? 0; // источник — стабилизированная копия: её время 0 = off в исходнике
      return { ok: true, output: { kind: 'removeBg', path: out, range: [job.in + off, job.out + off] } };
    }
    if (job.kind === 'voice') {
      const ac = new AbortController();
      aiAborts.set(id, ac);
      const out = path.join(cacheDir('ai'), `fx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.flac`);
      await processVoice(job.path, job.in, job.out - job.in, job.effect, job.denoise, out, (p) => send(p, 'Меняю голос'), ac.signal);
      return { ok: true, output: { kind: 'voice', path: out, range: [job.in, job.out] } };
    }
    if (job.kind === 'stab') {
      const ac = new AbortController();
      aiAborts.set(id, ac);
      const out = path.join(cacheDir('ai'), `stab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp4`);
      await stabilize(job.path, job.in, job.out - job.in, job.strength, out, (p) => send(p, 'Стабилизирую'), ac.signal);
      return { ok: true, output: { kind: 'stab', path: out, range: [job.in, job.out] } };
    }
    if (job.kind === 'ttsDownload') {
      await workerCall(id, { kind: 'ttsDownload', voice: job.voice });
      return { ok: true, output: { kind: 'download' } };
    }
    if (job.kind === 'tts') {
      if (!ttsVoiceReady(job.voice)) return { ok: false, error: 'Голос не скачан' };
      const out = path.join(cacheDir('tts'), `tts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.wav`);
      const r = await workerCall<{ duration: number }>(id, { kind: 'tts', text: job.text, voice: job.voice, speed: job.speed, outPath: out });
      return { ok: true, output: { kind: 'tts', path: out, duration: r.duration } };
    }
    if (job.kind === 'beats') {
      const r = await workerCall<{ beats: number[]; bpm: number }>(id, { kind: 'beats', path: job.path });
      return { ok: true, output: { kind: 'beats', beats: r.beats, bpm: r.bpm } };
    }
    if (job.kind === 'highlights') {
      const ac = new AbortController();
      aiAborts.set(id, ac);
      const hl = await highlights(job.path, job.duration, (p) => send(p, 'Смотрю видео'), ac.signal);
      return { ok: true, output: { kind: 'highlights', hl } };
    }
    if (job.kind === 'reframe') {
      const r = await workerCall<{ points: { t: number; x: number; y: number; found: boolean }[] }>(id, { kind: 'reframe', path: job.path, in: job.in, out: job.out, width: job.width, height: job.height });
      return { ok: true, output: { kind: 'reframe', points: r.points } };
    }
    if (job.kind === 'retime') {
      const ac = new AbortController();
      aiAborts.set(id, ac);
      const r = await retime(job, (p) => send(p, job.smooth ? 'Дорисовываю кадры' : job.reverse ? 'Переворачиваю' : 'Меняю скорость'), ac.signal);
      return { ok: true, output: { kind: 'retime', path: r.path, duration: r.duration } };
    }
    if (job.kind === 'beauty') {
      const ac = new AbortController();
      aiAborts.set(id, ac);
      const out = path.join(cacheDir('ai'), `beauty_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp4`);
      await beautify(job.path, job.in, job.out - job.in, { smooth: job.smooth, bright: job.bright, width: job.width, height: job.height }, out, (p) => send(p, 'Ретушь'), ac.signal);
      return { ok: true, output: { kind: 'beauty', path: out, range: [job.in + job.offset, job.out + job.offset] } };
    }
    if (job.kind === 'freeze') {
      const out = await freezeFrame(job.path, job.t, job.fps, job.alpha);
      return { ok: true, output: { kind: 'freeze', path: out } };
    }
    return { ok: false, error: 'Неизвестная задача' };
  } catch (e) {
    log('ai job failed', job.kind, e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    aiAborts.delete(id);
  }
}

// ---------- импорт ----------
async function importMedia(paths: string[]) {
  const assets: MediaAsset[] = [];
  const errors: { path: string; message: string }[] = [];
  for (const p of paths) {
    try {
      const { asset, plan } = await analyze(p);
      assets.push(asset);
      void postImport(asset, plan);
    } catch (e) {
      errors.push({ path: p, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { assets, errors };
}

/** После импорта: прокси (если нужен), миниатюры и волна — в фоне, с обновлениями в интерфейс. */
async function postImport(asset: MediaAsset, plan: 'none' | 'audio' | 'video'): Promise<void> {
  const upd = (patch: Partial<MediaAsset>) => win?.webContents.send('asset:update', asset.id, patch);
  let a = asset;
  if (plan !== 'none') {
    try {
      const pp = await makeProxy(asset, plan);
      a = { ...a, previewPath: pp, proxy: 'ready' };
      upd({ previewPath: pp, proxy: 'ready' });
    } catch (e) {
      log('proxy failed', asset.path, e);
      upd({ proxy: 'error' });
    }
  }
  if (a.kind !== 'audio') {
    try { upd({ thumbs: await makeThumbs(a) }); } catch (e) { log('thumbs failed', e); }
  }
  if (a.hasAudio) {
    try { upd({ peaks: await makePeaks(a) }); } catch (e) { log('peaks failed', e); }
  }
}

/** Проверка файлов открытого проекта: пропавшие помечаем, потерянный кэш (прокси, миниатюры, ИИ) пересобираем в фоне. */
async function refreshProject(project: Project): Promise<Project> {
  const later: (() => void)[] = [];
  for (const a of project.assets) {
    a.missing = !fs.existsSync(a.path);
    if (a.missing) continue;
    const previewOk = !!a.previewPath && fs.existsSync(a.previewPath);
    const thumbsOk = a.kind === 'audio' || (!!a.thumbs?.length && a.thumbs.every((t) => fs.existsSync(t)));
    if (previewOk && thumbsOk) continue;
    try {
      const { asset, plan } = await analyze(a.path);
      const p = previewOk ? 'none' : plan;
      if (!previewOk) { a.previewPath = a.path; a.proxy = p === 'none' ? 'none' : 'pending'; }
      later.push(() => void postImport({ ...asset, id: a.id, previewPath: a.previewPath }, p));
    } catch (e) {
      log('refresh failed', a.path, e);
    }
  }
  for (const t of project.tracks) for (const c of t.clips) {
    if (c.type !== 'media') continue;
    for (const k of ['removeBg', 'denoise', 'stab', 'voice'] as const) {
      const r = c[k];
      if (r && r.status === 'ready' && (!r.path || !fs.existsSync(r.path))) c[k] = { ...r, enabled: r.enabled, status: 'none', path: undefined };
    }
  }
  // обновления уйдут в окно, когда оно уже подхватит проект
  if (later.length) setTimeout(() => later.forEach((f) => f()), 400);
  return project;
}

// ---------- проекты ----------
const settingsFile = () => path.join(dataDir(), 'settings.json');
interface Settings { lastProject?: string | null; recent?: string[]; showHome?: boolean; theme?: ThemePref; library?: string[] }
function readSettings(): Settings {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
function writeSettings(s: Settings): void {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); } catch { /* не критично */ }
}
/** Запомнить проект в списке недавних (сверху — последний). */
function rememberProject(file: string): void {
  const s = readSettings();
  const recent = [file, ...(s.recent ?? []).filter((x) => path.resolve(x) !== path.resolve(file))].slice(0, 12);
  writeSettings({ ...s, lastProject: file, recent });
}
function recentProjects(): RecentProject[] {
  const out: RecentProject[] = [];
  for (const file of readSettings().recent ?? []) {
    try {
      const st = fs.statSync(file);
      const p = JSON.parse(fs.readFileSync(file, 'utf8')) as Project;
      if (!p?.tracks) continue;
      const media = p.tracks.flatMap((t) => t.clips).filter((c) => c.type === 'media');
      const thumbOf = (id: string) => p.assets.find((a) => a.id === id)?.thumbs?.find((t) => fs.existsSync(t));
      const thumb = media.map((c) => (c.type === 'media' ? thumbOf(c.assetId) : undefined)).find(Boolean);
      out.push({ path: file, name: p.name || path.basename(file, '.kadro'), mtime: st.mtimeMs, clips: media.length, duration: projectDuration(p), aspect: p.settings?.aspect ?? '', thumb });
    } catch { /* файл пропал или не читается — не показываем */ }
    if (out.length >= 8) break;
  }
  return out;
}
function demoFiles(): DemoFiles {
  const has = (dir: string, name: string) => { const f = bundledFile(dir, name); return fs.existsSync(f) ? f : null; };
  const scenes: Record<string, string> = {};
  for (const s of DEMO_SCENES) { const f = has('demo', `${s}.mp4`); if (f) scenes[s] = f; }
  const previews: Record<string, string> = {};
  for (const t of BUILTIN_TEMPLATES) { const f = has('templates', `${t.id}.mp4`); if (f) previews[t.id] = f; }
  return { scenes, beat: has('demo', 'beat.m4a'), reel: has('demo', 'reel.mp4'), previews };
}
async function readProjectFile(file: string): Promise<Project> {
  const p = JSON.parse(fs.readFileSync(file, 'utf8')) as Project;
  if (!p?.tracks || !p.assets) throw new Error('not a project');
  return refreshProject(p);
}
const autosaveFile = () => path.join(dataDir(), 'autosave.kadro');

// ---------- библиотека папок ----------
const folderCounts = new Map<string, number>();
function libFolders(): LibFolder[] {
  return (readSettings().library ?? []).map((p) => {
    const exists = fs.existsSync(p);
    if (exists && !folderCounts.has(p)) folderCounts.set(p, countDeep(p));
    return { path: p, name: path.basename(p) || p, exists, count: folderCounts.get(p) ?? 0 };
  });
}
function libAdd(paths: string[]): void {
  const s = readSettings();
  const list = s.library ?? [];
  for (const raw of paths) {
    const p = path.resolve(raw);
    try { if (!fs.statSync(p).isDirectory()) continue; } catch { continue; }
    if (list.some((x) => path.resolve(x).toLowerCase() === p.toLowerCase())) continue;
    list.push(p);
    folderCounts.delete(p);
  }
  writeSettings({ ...s, library: list });
}
/** Путь внутри одной из папок библиотеки (в другие места окно не заглядывает). */
function inLibrary(p: string): boolean {
  const r = path.resolve(p).toLowerCase();
  return (readSettings().library ?? []).some((root) => {
    const base = path.resolve(root).toLowerCase();
    return r === base || r.startsWith(base + path.sep);
  });
}

function writeProject(file: string, project: Project): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(project, null, 1));
  fs.renameSync(tmp, file);
}

let exportAbort: AbortController | null = null;

function registerIpc(): void {
  ipcMain.handle('app:info', async () => ({
    version: app.getVersion(), platform: process.platform, nvenc: await hasNvenc(), dataDir: dataDir(),
  }));
  ipcMain.handle('dialog:media', async () => {
    if (process.env.KADRO_TEST_PICK) return process.env.KADRO_TEST_PICK.split('|'); // автотесты: без системного окна
    const r = await dialog.showOpenDialog(win!, {
      title: 'Добавить файлы',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Видео, фото и звук', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'mts', 'm2ts', '3gp', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'wma'] },
        { name: 'Все файлы', extensions: ['*'] },
      ],
    });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('media:import', (_e, paths: string[]) => importMedia(paths));
  ipcMain.handle('project:save', async (_e, project: Project, file?: string | null) => {
    let target = file ?? null;
    if (!target) {
      const r = await dialog.showSaveDialog(win!, {
        title: 'Сохранить проект', defaultPath: path.join(app.getPath('documents'), `${project.name || 'Проект'}.kadro`),
        filters: [{ name: 'Проект Kadro', extensions: ['kadro'] }],
      });
      if (r.canceled || !r.filePath) return null;
      target = r.filePath;
    }
    writeProject(target, project);
    rememberProject(target);
    return target;
  });
  ipcMain.handle('project:open', async () => {
    const r = await dialog.showOpenDialog(win!, { title: 'Открыть проект', properties: ['openFile'], filters: [{ name: 'Проект Kadro', extensions: ['kadro'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    let project: Project;
    try {
      project = await readProjectFile(r.filePaths[0]);
    } catch {
      dialog.showErrorBox('Kadro', 'Этот файл не похож на проект Kadro или повреждён.');
      return null;
    }
    rememberProject(r.filePaths[0]);
    return { project, path: r.filePaths[0] };
  });
  ipcMain.handle('project:openPath', async (_e, file: string) => {
    if (!fs.existsSync(file)) return { error: 'Файла проекта больше нет на этом месте — его переместили или удалили.' };
    try {
      const project = await readProjectFile(file);
      rememberProject(file);
      return { project, path: file };
    } catch {
      return { error: 'Этот файл не похож на проект Kadro или повреждён.' };
    }
  });
  // перед заменой несохранённого проекта (новый, демо, шаблон) — копия в «Черновики», чтобы ничего не потерять
  ipcMain.handle('project:stash', async (_e, project: Project) => {
    const dir = path.join(dataDir(), 'drafts');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-');
    const safe = (project.name || 'Проект').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Проект';
    const file = path.join(dir, `${safe} ${stamp}.kadro`);
    writeProject(file, project);
    rememberProject(file);
    // храним 20 последних черновиков
    const all = fs.readdirSync(dir).filter((f) => f.endsWith('.kadro')).map((f) => path.join(dir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const old of all.slice(20)) { try { fs.rmSync(old); } catch { /* занят — не страшно */ } }
    return file;
  });
  ipcMain.handle('lib:folders', () => libFolders());
  ipcMain.handle('lib:add', async (_e, paths: string[] | null) => {
    let list = paths;
    if (!list) {
      if (process.env.KADRO_TEST_FOLDER) list = process.env.KADRO_TEST_FOLDER.split('|'); // автотесты: без системного окна
      else {
        const r = await dialog.showOpenDialog(win!, { title: 'Добавить папку в библиотеку', properties: ['openDirectory', 'multiSelections'] });
        if (r.canceled) return libFolders();
        list = r.filePaths;
      }
    }
    libAdd(list);
    return libFolders();
  });
  ipcMain.handle('lib:remove', (_e, p: string) => {
    const s = readSettings();
    writeSettings({ ...s, library: (s.library ?? []).filter((x) => x !== p) });
    return libFolders();
  });
  ipcMain.handle('lib:list', (_e, dir: string) => (inLibrary(dir) ? listDir(dir) : { dir, dirs: [], files: [], error: 'Эта папка не в библиотеке' }));
  ipcMain.handle('lib:search', (_e, root: string, q: string) => (inLibrary(root) ? searchDir(root, q) : []));
  ipcMain.handle('lib:meta', (_e, file: string) => (inLibrary(file) ? libMeta(file) : { missing: true }));
  ipcMain.handle('fs:dirs', (_e, paths: string[]) => paths.map((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } }));
  ipcMain.on('project:forget', (_e, file: string) => {
    const s = readSettings();
    writeSettings({ ...s, recent: (s.recent ?? []).filter((x) => x !== file) });
  });
  ipcMain.handle('home:info', async (): Promise<HomeInfo> => ({
    show: readSettings().showHome !== false,
    autoOpen: !process.env.KADRO_SKIP_HOME && readSettings().showHome !== false,
    demo: demoFiles(),
    recent: recentProjects(),
  }));
  ipcMain.on('home:show', (_e, show: boolean) => writeSettings({ ...readSettings(), showHome: !!show }));
  ipcMain.handle('project:last', async () => {
    try {
      if (fs.existsSync(autosaveFile())) {
        const j = JSON.parse(fs.readFileSync(autosaveFile(), 'utf8')) as { project: Project; path: string | null };
        if (j?.project?.tracks) j.project = await refreshProject(j.project);
        return j;
      }
    } catch (e) { log('autosave read failed', e); }
    return null;
  });
  ipcMain.on('project:autosave', (_e, project: Project, file: string | null) => {
    try { fs.writeFileSync(autosaveFile(), JSON.stringify({ project, path: file })); } catch (e) { log('autosave failed', e); }
  });
  ipcMain.handle('dialog:exportPath', async (_e, name: string) => {
    if (process.env.KADRO_TEST_EXPORT) return process.env.KADRO_TEST_EXPORT; // автотесты: без системного окна
    const r = await dialog.showSaveDialog(win!, {
      title: 'Куда сохранить видео', defaultPath: path.join(app.getPath('videos'), `${name || 'Kadro'}.mp4`),
      filters: [{ name: 'Видео MP4', extensions: ['mp4'] }],
    });
    return r.canceled ? null : r.filePath ?? null;
  });
  ipcMain.handle('export:start', async (_e, req: ExportReq) => {
    exportAbort?.abort();
    exportAbort = new AbortController();
    log('export start', req.opts);
    const r = await exportProject(req, (p) => win?.webContents.send('export:progress', p), exportAbort.signal);
    log('export result', r);
    exportAbort = null;
    return r;
  });
  ipcMain.on('export:cancel', () => exportAbort?.abort());
  ipcMain.handle('ai:models', async (): Promise<ModelInfo[]> =>
    Object.values(ASR_MODELS).map((m) => ({ id: m.id, label: m.label, note: m.note, sizeMb: m.sizeMb, ready: asrModelReady(m.id) })));
  ipcMain.handle('ai:voices', async (): Promise<VoiceInfo[]> =>
    Object.values(TTS_VOICES).map((v) => ({ id: v.id, label: v.label, sizeMb: v.sizeMb, ready: ttsVoiceReady(v.id) })));
  ipcMain.handle('ai:run', (_e, job: AiJob) => runAi(job));
  ipcMain.handle('lut:pick', async () => {
    let src = process.env.KADRO_TEST_LUT; // автотесты: без системного окна
    if (!src) {
      const r = await dialog.showOpenDialog(win!, { title: 'Загрузить LUT', properties: ['openFile'], filters: [{ name: 'LUT (.cube)', extensions: ['cube'] }] });
      if (r.canceled || !r.filePaths[0]) return null;
      src = r.filePaths[0];
    }
    try { return importLutFile(src); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  });
  ipcMain.handle('lut:list', () => listLutFiles());
  const tplDir = () => { const d = path.join(dataDir(), 'templates'); fs.mkdirSync(d, { recursive: true }); return d; };
  const tplFile = (id: string) => path.join(tplDir(), `${id.replace(/[^a-z0-9_-]/gi, '_')}.json`);
  ipcMain.handle('tpl:list', () => fs.readdirSync(tplDir()).filter((f) => f.endsWith('.json')).flatMap((f) => {
    try { const t = JSON.parse(fs.readFileSync(path.join(tplDir(), f), 'utf8')); return isTemplate(t) ? [{ ...t, custom: true }] : []; } catch { return []; }
  }));
  ipcMain.handle('tpl:save', (_e, t: Template) => { if (!isTemplate(t)) return false; fs.writeFileSync(tplFile(t.id), JSON.stringify(t)); return true; });
  ipcMain.handle('tpl:delete', (_e, id: string) => { fs.rmSync(tplFile(id), { force: true }); });
  // 3D: выбор файла модели и сборка кадров в видео с прозрачностью
  ipcMain.handle('dialog:model', async () => {
    if (process.env.KADRO_TEST_MODEL) return process.env.KADRO_TEST_MODEL; // автотесты: без системного окна
    const r = await dialog.showOpenDialog(win!, {
      title: 'Открыть 3D-модель',
      properties: ['openFile'],
      filters: [{ name: '3D-модели', extensions: ['glb', 'gltf', 'obj', 'stl', 'fbx'] }, { name: 'Все файлы', extensions: ['*'] }],
    });
    return r.canceled ? null : r.filePaths[0] ?? null;
  });
  ipcMain.handle('dialog:music', async () => {
    if (process.env.KADRO_TEST_MUSIC) return process.env.KADRO_TEST_MUSIC; // автотесты: без системного окна
    const r = await dialog.showOpenDialog(win!, {
      title: 'Музыка для ролика',
      properties: ['openFile'],
      filters: [{ name: 'Музыка', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'wma', 'mp4', 'webm', 'mkv', 'mov'] }, { name: 'Все файлы', extensions: ['*'] }],
    });
    return r.canceled ? null : r.filePaths[0] ?? null;
  });
  ipcMain.handle('m3d:begin', (_e, w: number, h: number, fps: number) => m3d.begin(w, h, fps));
  ipcMain.handle('m3d:frame', (_e, id: string, data: ArrayBuffer) => m3d.frame(id, data));
  ipcMain.handle('m3d:end', (_e, id: string) => m3d.end(id));
  ipcMain.on('m3d:cancel', (_e, id: string) => m3d.cancel(id));
  ipcMain.handle('group:path', (_e, ext: string) =>
    path.join(cacheDir('groups'), `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext === 'webm' ? 'webm' : 'mp4'}`));
  ipcMain.handle('lut:read', (_e, p: string) => { if (!/\.cube$/i.test(p)) return null; try { return fs.readFileSync(p, 'utf8'); } catch { return null; } });
  // «Извлечь звук»: дорожка звука файла — отдельным файлом без потерь (один раз на файл)
  ipcMain.handle('audio:extract', async (_e, src: string) => {
    const st = fs.statSync(src);
    const key = crypto.createHash('sha1').update(`${src}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16);
    const dir = path.join(cacheDir('audio'), key);
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, `${path.basename(src, path.extname(src))} — звук.flac`);
    if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;
    const tmp = path.join(dir, 'tmp.flac');
    await runFfmpeg(['-hide_banner', '-y', '-i', src, '-map', '0:a:0', '-vn', '-c:a', 'flac', tmp]);
    fs.renameSync(tmp, out);
    return out;
  });
  ipcMain.handle('rec:save', async (_e, data: ArrayBuffer) => {
    const dir = cacheDir('recordings');
    const stem = `voice_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`;
    const raw = path.join(dir, `${stem}.webm`);
    const out = path.join(dir, `${stem}.flac`);
    fs.writeFileSync(raw, Buffer.from(data));
    try {
      await runFfmpeg(['-hide_banner', '-y', '-i', raw, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'flac', out]);
    } finally {
      fs.rmSync(raw, { force: true });
    }
    return out;
  });
  ipcMain.on('ai:cancel', (_e, jobId: string) => {
    aiAborts.get(jobId)?.abort();
    for (const w of workers.values()) w.postMessage({ cancel: jobId });
  });
  ipcMain.on('shell:show', (_e, p: string) => shell.showItemInFolder(p));
  ipcMain.on('win:title', (_e, t: string) => win?.setTitle(t));
  ipcMain.on('theme:get', (e) => { e.returnValue = { pref: readSettings().theme ?? 'dark', dark: nativeTheme.shouldUseDarkColors }; });
  ipcMain.on('theme:set', (_e, pref: ThemePref) => {
    if (!['dark', 'light', 'system'].includes(pref)) return;
    writeSettings({ ...readSettings(), theme: pref });
    applyTheme(pref);
  });
  ipcMain.on('app:log', (_e, ...a: unknown[]) => log('renderer error:', ...a));
}

// неожиданная ошибка в главном процессе — в журнал, программа продолжает работать
process.on('uncaughtException', (e) => log('uncaught', e));
process.on('unhandledRejection', (e) => log('unhandled rejection', e));
// автотесты: ненастоящий микрофон без запроса разрешения
if (process.env.KADRO_FAKE_MEDIA) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}
// автотесты на машине без видеокарты: программная видеокарта (SwiftShader), чтобы проверить WebGL-хромакей
if (process.env.KADRO_SWIFTSHADER) {
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}
const lock = process.env.KADRO_MULTI ? true : app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    protocol.handle('kmedia', (req) => serveFile(req));
    registerIpc();
    nativeTheme.themeSource = readSettings().theme ?? 'dark';
    nativeTheme.on('updated', () => applyTheme(nativeTheme.themeSource as ThemePref));
    createWindow();
    setTimeout(() => { try { hasNvenc(); } catch { /* проверим позже */ } }, 3000);
    log('Kadro started', app.getVersion(), process.platform, 'ffmpeg:', ffmpegPath());
  });
  app.on('window-all-closed', () => {
    for (const w of workers.values()) w.kill();
    app.quit();
  });
}
