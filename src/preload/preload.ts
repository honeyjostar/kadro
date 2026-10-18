import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { KadroApi } from '../shared/ipc';

function on<T extends unknown[]>(channel: string, cb: (...a: T) => void): () => void {
  const h = (_e: unknown, ...a: unknown[]) => cb(...(a as T));
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
}

const api: KadroApi = {
  info: () => ipcRenderer.invoke('app:info'),
  pickMedia: () => ipcRenderer.invoke('dialog:media'),
  importMedia: (paths) => ipcRenderer.invoke('media:import', paths),
  onAssetUpdate: (cb) => on('asset:update', cb),
  mediaUrl: (p) => `kmedia://f/${encodeURIComponent(p)}`,
  pathForFile: (f) => webUtils.getPathForFile(f),
  saveProject: (project, path) => ipcRenderer.invoke('project:save', project, path ?? null),
  openProject: () => ipcRenderer.invoke('project:open'),
  loadLast: () => ipcRenderer.invoke('project:last'),
  autosave: (project, path) => ipcRenderer.send('project:autosave', project, path),
  pickExportPath: (name) => ipcRenderer.invoke('dialog:exportPath', name),
  startExport: (req) => ipcRenderer.invoke('export:start', req),
  cancelExport: () => ipcRenderer.send('export:cancel'),
  onExportProgress: (cb) => on('export:progress', cb),
  models: () => ipcRenderer.invoke('ai:models'),
  ttsVoices: () => ipcRenderer.invoke('ai:voices'),
  runAi: (job) => ipcRenderer.invoke('ai:run', job),
  saveRecording: (data) => ipcRenderer.invoke('rec:save', data),
  cancelAi: (id) => ipcRenderer.send('ai:cancel', id),
  onAiProgress: (cb) => on('ai:progress', cb),
  showInFolder: (p) => ipcRenderer.send('shell:show', p),
  setTitle: (t) => ipcRenderer.send('win:title', t),
};

contextBridge.exposeInMainWorld('kadro', api);
