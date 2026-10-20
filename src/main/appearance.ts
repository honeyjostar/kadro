// Оформление в главном процессе: значок окна и ярлыков Windows, размер интерфейса,
// «своё оформление» — custom.css и theme.json из папки данных, подхватываются на лету.
import fs from 'node:fs';
import path from 'node:path';
import { app, nativeImage, shell, type BrowserWindow } from 'electron';
import { bundledFile, dataDir } from './bins';
import {
  CUSTOM_CSS_TEMPLATE, CUSTOM_README, THEME_JSON_TEMPLATE, pngToIco, shortcutPaths, themeJsonToCss, updateShortcutIcons,
  type Appearance,
} from '../shared/appearance';
import type { CustomStatus } from '../shared/ipc';

export const customDir = (): string => path.join(dataDir(), 'custom');
const iconsDir = (): string => path.join(dataDir(), 'icons');

/** Папка «своего оформления» с заготовками (существующие файлы не трогаем). */
export function ensureCustomFiles(): string {
  const dir = customDir();
  fs.mkdirSync(dir, { recursive: true });
  const put = (name: string, text: string) => { const f = path.join(dir, name); if (!fs.existsSync(f)) fs.writeFileSync(f, text); };
  put('custom.css', CUSTOM_CSS_TEMPLATE);
  put('theme.json', THEME_JSON_TEMPLATE);
  put('README.txt', CUSTOM_README.replace(/\n/g, '\r\n'));
  return dir;
}

// ---------- значок ----------
/** PNG значка для окна (панель задач, Alt+Tab). */
export function iconPng(a: Appearance): string {
  if (a.icon === 'custom' && a.iconFile) {
    const png = a.iconFile.replace(/\.ico$/i, '.png');
    if (fs.existsSync(png)) return png;
  }
  const id = a.icon === 'custom' ? 'black' : a.icon;
  return bundledFile('icons', `kadro-${id}.png`);
}

/**
 * .ico для ярлыков. Чёрный (обычный) — null: ярлык берёт значок из Kadro.exe.
 * Остальные копируем в папку данных: путь не меняется при обновлении программы и переносе zip-версии,
 * а у каждого цвета свой файл — иначе Windows покажет старый значок из кэша.
 */
export function iconIco(a: Appearance): string | null {
  if (a.icon === 'black') return null;
  if (a.icon === 'custom') return a.iconFile && fs.existsSync(a.iconFile) ? a.iconFile : null;
  const src = bundledFile('icons', `kadro-${a.icon}.ico`);
  if (!fs.existsSync(src)) return null;
  fs.mkdirSync(iconsDir(), { recursive: true });
  const dst = path.join(iconsDir(), `kadro-${a.icon}.ico`);
  if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(src).size) fs.copyFileSync(src, dst);
  return dst;
}

export function applyWindowIcon(win: BrowserWindow | null, a: Appearance): void {
  if (!win || win.isDestroyed()) return;
  const img = nativeImage.createFromPath(iconPng(a));
  if (!img.isEmpty()) win.setIcon(img);
}

/** Значок у ярлыков на рабочем столе, в «Пуске» и на панели задач (только Windows). Возвращает число изменённых. */
export function applyShortcutIcons(a: Appearance): number {
  if (process.platform !== 'win32') return 0;
  const paths = shortcutPaths(app.getPath('desktop'), app.getPath('appData'));
  return updateShortcutIcons(paths, iconIco(a), {
    exists: (p) => fs.existsSync(p),
    read: (p) => { const s = shell.readShortcutLink(p); return { target: s.target, icon: s.icon }; },
    update: (p, icon) => shell.writeShortcutLink(p, 'update', { ...shell.readShortcutLink(p), icon, iconIndex: 0 }),
  });
}

/** Свой значок из картинки (PNG, JPG, ICO): квадрат 256×256 → .png и .ico в папке данных. */
export function makeCustomIcon(file: string): string {
  let img = nativeImage.createFromPath(file);
  if (img.isEmpty()) throw new Error('Не получилось открыть картинку. Подойдут PNG, JPG или ICO.');
  const { width, height } = img.getSize();
  const side = Math.min(width, height);
  img = img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side }).resize({ width: 256, height: 256, quality: 'best' });
  const png = img.toPNG();
  fs.mkdirSync(iconsDir(), { recursive: true });
  const base = path.join(iconsDir(), `custom-${Date.now().toString(36)}`);
  // старые свои значки больше не нужны
  for (const f of fs.readdirSync(iconsDir())) if (f.startsWith('custom-')) { try { fs.rmSync(path.join(iconsDir(), f)); } catch { /* занят */ } }
  fs.writeFileSync(`${base}.png`, png);
  fs.writeFileSync(`${base}.ico`, pngToIco(png, 256, 256));
  return `${base}.ico`;
}

// ---------- своё оформление ----------

/** Подключает custom.css и theme.json к окну и следит за их изменением. */
export class CustomStyles {
  private keys: string[] = [];
  private watcher: fs.FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private on = false;

  constructor(private win: () => BrowserWindow | null, private report: (s: CustomStatus) => void) {}

  setEnabled(on: boolean): void {
    this.on = on;
    if (on) { ensureCustomFiles(); this.watch(); } else this.unwatch();
    void this.apply();
  }

  /** После загрузки страницы (в том числе перезагрузки окна) вставленные стили пропадают — вставляем снова. */
  reattach(): void {
    this.keys = [];
    if (this.on) void this.apply();
  }

  private watch(): void {
    if (this.watcher) return;
    try {
      this.watcher = fs.watch(customDir(), () => {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.apply(), 150);
      });
    } catch { /* папку удалили — применим при следующем включении */ }
  }
  private unwatch(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  async apply(): Promise<void> {
    const w = this.win();
    if (!w || w.isDestroyed()) return;
    const wc = w.webContents;
    for (const k of this.keys) { try { await wc.removeInsertedCSS(k); } catch { /* страница перезагружена */ } }
    this.keys = [];
    const status: CustomStatus = { on: this.on, dir: customDir() };
    if (this.on) {
      const parts: string[] = [];
      const errors: string[] = [];
      try {
        const raw = fs.readFileSync(path.join(customDir(), 'theme.json'), 'utf8').replace(/^﻿/, '');
        const r = themeJsonToCss(JSON.parse(raw));
        if (r.css) parts.push(r.css);
        if (r.skipped.length) status.skipped = r.skipped;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(`theme.json: ${e instanceof Error ? e.message : String(e)}`);
      }
      try { parts.push(fs.readFileSync(path.join(customDir(), 'custom.css'), 'utf8').replace(/^﻿/, '')); } catch { /* файла нет — ладно */ }
      for (const css of parts) {
        if (!css.trim()) continue;
        try { this.keys.push(await wc.insertCSS(css)); } catch (e) { errors.push(`custom.css: ${e instanceof Error ? e.message : String(e)}`); }
      }
      if (errors.length) status.error = errors.join('\n');
    }
    this.report(status);
  }
}
