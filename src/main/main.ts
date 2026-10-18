// Главный процесс Kadro: окно, доступ к файлам, импорт, экспорт, ИИ-задачи.
import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, utilityProcess, type UtilityProcess } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { AiJob, AiResponse, ExportReq, ModelInfo } from '../shared/ipc';
import type { MediaAsset, Project } from '../shared/types';
import { ASR_MODELS, asrModelReady } from './ai/models';
import { denoise } from './ai/denoise';
import { cacheDir, dataDir, ffmpegPath, ffprobePath, modelsDir } from './bins';
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

function createWindow(): void {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#15131a',
    title: 'Kadro',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32' ? { color: '#15131a', symbolColor: '#d9d3e3', height: 40 } : false,
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
  win.webContents.on('render-process-gone', (_e, d) => log('renderer gone', d));
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
  const lane: Lane = msg.kind === 'removeBg' ? 'vision' : 'speech';
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
      return { ok: true, output: { kind: 'removeBg', path: out, range: [job.in, job.out] } };
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
    for (const k of ['removeBg', 'denoise'] as const) {
      const r = c[k];
      if (r.status === 'ready' && (!r.path || !fs.existsSync(r.path))) c[k] = { enabled: r.enabled, status: 'none' };
    }
  }
  // обновления уйдут в окно, когда оно уже подхватит проект
  if (later.length) setTimeout(() => later.forEach((f) => f()), 400);
  return project;
}

// ---------- проекты ----------
const settingsFile = () => path.join(dataDir(), 'settings.json');
function readSettings(): { lastProject?: string | null } {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
function writeSettings(s: { lastProject?: string | null }): void {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); } catch { /* не критично */ }
}
const autosaveFile = () => path.join(dataDir(), 'autosave.kadro');

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
    writeSettings({ ...readSettings(), lastProject: target });
    return target;
  });
  ipcMain.handle('project:open', async () => {
    const r = await dialog.showOpenDialog(win!, { title: 'Открыть проект', properties: ['openFile'], filters: [{ name: 'Проект Kadro', extensions: ['kadro'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    let project: Project;
    try {
      project = await refreshProject(JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')) as Project);
    } catch {
      dialog.showErrorBox('Kadro', 'Этот файл не похож на проект Kadro или повреждён.');
      return null;
    }
    writeSettings({ ...readSettings(), lastProject: r.filePaths[0] });
    return { project, path: r.filePaths[0] };
  });
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
  ipcMain.handle('ai:run', (_e, job: AiJob) => runAi(job));
  ipcMain.on('ai:cancel', (_e, jobId: string) => {
    aiAborts.get(jobId)?.abort();
    for (const w of workers.values()) w.postMessage({ cancel: jobId });
  });
  ipcMain.on('shell:show', (_e, p: string) => shell.showItemInFolder(p));
  ipcMain.on('win:title', (_e, t: string) => win?.setTitle(t));
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
    createWindow();
    setTimeout(() => { try { hasNvenc(); } catch { /* проверим позже */ } }, 3000);
    log('Kadro started', app.getVersion(), process.platform, 'ffmpeg:', ffmpegPath());
  });
  app.on('window-all-closed', () => {
    for (const w of workers.values()) w.kill();
    app.quit();
  });
}
