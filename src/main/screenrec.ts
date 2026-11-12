// Запись экрана и веб-камеры: список экранов и окон для выбора, обработчик getDisplayMedia (какой источник
// выбрал человек, звук компьютера — только Windows), запись кусками прямо на диск, сборка в MP4 в «Видео/Kadro».
import { app, desktopCapturer, globalShortcut, ipcMain, session, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { cacheDir } from './bins';
import { runFfmpeg } from './ffrun';

/** Сочетание, которое останавливает запись из любой программы, пока Kadro свёрнут. */
export const REC_STOP_KEY = 'CommandOrControl+Alt+R';

interface Rec { raw: string; fd: number; kind: 'screen' | 'cam'; mime: string }

export function initScreenRec(getWin: () => BrowserWindow | null, log: (...a: unknown[]) => void): void {
  let chosen: string | null = null;
  let systemAudio = false;
  const recs = new Map<string, Rec>();

  session.defaultSession.setDisplayMediaRequestHandler((_req, callback) => {
    void desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      const src = sources.find((s) => s.id === chosen) ?? sources.find((s) => s.id.startsWith('screen')) ?? sources[0];
      if (!src) { callback({}); return; }
      callback(systemAudio && process.platform === 'win32' ? { video: src, audio: 'loopback' } : { video: src });
    }).catch((e) => { log('display media failed', e); callback({}); });
  });

  ipcMain.handle('screen:sources', async () => {
    const own = getWin()?.getMediaSourceId();
    const list = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } });
    return list
      .filter((s) => s.id !== own && s.name)
      .map((s) => ({ id: s.id, name: s.name, screen: s.id.startsWith('screen'), thumb: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL() }));
  });
  ipcMain.handle('screen:choose', (_e, id: string | null, audio: boolean) => { chosen = id; systemAudio = !!audio; return process.platform === 'win32'; });

  // запись кусками: память не растёт, а при сбое на диске остаётся всё записанное
  ipcMain.handle('srec:begin', (_e, kind: 'screen' | 'cam', mime: string) => {
    const id = `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const raw = path.join(cacheDir('recordings'), `${id}.${/mp4/.test(mime) ? 'mp4' : 'webm'}`);
    recs.set(id, { raw, fd: fs.openSync(raw, 'w'), kind, mime });
    return id;
  });
  ipcMain.handle('srec:chunk', (_e, id: string, data: ArrayBuffer) => {
    const r = recs.get(id);
    if (r) fs.writeSync(r.fd, Buffer.from(data));
  });
  ipcMain.handle('srec:cancel', (_e, id: string) => {
    const r = recs.get(id);
    if (!r) return;
    recs.delete(id);
    fs.closeSync(r.fd);
    fs.rmSync(r.raw, { force: true });
  });
  /** Готовый файл: в «Видео/Kadro», MP4 (H.264 — как записалось, без пережатия; VP8/VP9 — пережимаем). */
  ipcMain.handle('srec:finish', async (_e, id: string, name: string) => {
    const r = recs.get(id);
    if (!r) return null;
    recs.delete(id);
    fs.closeSync(r.fd);
    const dir = process.env.KADRO_TEST_RECORDINGS || path.join(app.getPath('videos'), 'Kadro');
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(name || 'Kadro').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Kadro';
    let out = path.join(dir, `${safe}.mp4`);
    for (let i = 2; fs.existsSync(out); i++) out = path.join(dir, `${safe} (${i}).mp4`);
    const h264 = /h264|avc1/i.test(r.mime);
    try {
      await runFfmpeg(['-hide_banner', '-y', '-fflags', '+genpts', '-i', r.raw,
        ...(h264 ? ['-c:v', 'copy'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p']),
        '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
    } catch (e) {
      log('recording finish failed', e);
      // не собралось — отдаём как есть (WebM Kadro тоже открывает)
      const keep = out.replace(/\.mp4$/, path.extname(r.raw));
      fs.copyFileSync(r.raw, keep);
      out = keep;
    } finally {
      fs.rmSync(r.raw, { force: true });
    }
    return out;
  });

  // во время записи: Kadro можно свернуть, а остановить запись — сочетанием клавиш из любой программы
  ipcMain.handle('srec:hotkey', (_e, on: boolean) => {
    globalShortcut.unregister(REC_STOP_KEY);
    if (!on) return true;
    try {
      return globalShortcut.register(REC_STOP_KEY, () => getWin()?.webContents.send('srec:stop'));
    } catch {
      return false;
    }
  });
  ipcMain.handle('srec:minimize', () => { getWin()?.minimize(); });
  ipcMain.handle('srec:restore', () => { const w = getWin(); if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } });
  app.on('will-quit', () => globalShortcut.unregister(REC_STOP_KEY));
}
