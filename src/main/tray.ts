// Значок Kadro возле часов и ход экспорта на кнопке в панели задач. Решения — в shared/tray.ts.
import { app, Menu, Notification, Tray, nativeImage, shell, type BrowserWindow, type NativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { tx } from '../shared/i18n';
import { afterBackground, BG_QUIT_MS, closeAction, TRAY_IDLE, trayItems, trayTooltip, type TrayItemId, type TrayState } from '../shared/tray';

export interface TrayDeps {
  win: () => BrowserWindow | null;
  /** путь к значку: .ico на Windows (там есть все размеры), PNG — на остальных системах */
  icon: () => string;
  cancelExport: () => void;
  log: (...a: unknown[]) => void;
  /** через сколько выйти после фонового экспорта (автотесты — быстрее) */
  quitMs?: number;
}

export class KadroTray {
  private tray: Tray | null = null;
  private st: TrayState = { ...TRAY_IDLE };
  private quitTimer: NodeJS.Timeout | null = null;
  private lastPct = -1;
  /** выход по-настоящему (меню «Выйти», выключение Windows) — окно не прячем */
  quitting = false;

  constructor(private d: TrayDeps) {}

  get state(): TrayState { return { ...this.st }; }
  get items(): { id: TrayItemId; label: string; enabled: boolean }[] { return trayItems(this.st); }
  get tooltip(): string { return trayTooltip(this.st); }
  get created(): boolean { return !!this.tray && !this.tray.isDestroyed(); }

  private image(): NativeImage {
    let img = nativeImage.createFromPath(this.d.icon());
    if (!img.isEmpty() && process.platform !== 'win32') img = img.resize({ width: 22, height: 22, quality: 'best' });
    return img;
  }

  create(): void {
    try {
      this.tray = new Tray(this.image());
      this.tray.on('click', () => this.open());
      this.tray.on('double-click', () => this.open());
      this.tray.on('balloon-click', () => this.showDone());
      this.refresh();
    } catch (e) {
      this.d.log('tray', e); // без значка Kadro работает как раньше
      this.tray = null;
    }
  }

  /** Сменили значок программы в настройках. */
  refreshIcon(): void {
    if (!this.created) return;
    try { this.tray!.setImage(this.image()); } catch (e) { this.d.log('tray icon', e); }
  }

  private refresh(): void {
    if (!this.created) return;
    const t = this.tray!;
    t.setToolTip(this.tooltip);
    const act: Record<TrayItemId, () => void> = {
      open: () => this.open(),
      progress: () => undefined,
      cancel: () => this.d.cancelExport(),
      show: () => this.showDone(),
      quit: () => this.quit(),
    };
    const items = this.items;
    t.setContextMenu(Menu.buildFromTemplate([
      ...items.slice(0, -1).map((i) => ({ label: i.label, enabled: i.enabled, click: act[i.id] })),
      { type: 'separator' as const },
      ...items.slice(-1).map((i) => ({ label: i.label, enabled: i.enabled, click: act[i.id] })),
    ]));
  }

  /** Показать окно (значок, второй запуск Kadro, уведомление). */
  open(): void {
    const w = this.d.win();
    if (!w || w.isDestroyed()) return;
    if (this.quitTimer) { clearTimeout(this.quitTimer); this.quitTimer = null; }
    this.st.background = false;
    if (!w.isVisible()) w.show();
    if (w.isMinimized()) w.restore();
    w.focus();
    this.refresh();
  }

  private showDone(): void {
    const p = this.st.done?.path;
    if (p && fs.existsSync(p)) shell.showItemInFolder(p);
    else this.open();
  }

  private quit(): void {
    this.quitting = true;
    if (this.st.exporting) this.d.cancelExport();
    app.quit();
  }

  private notify(title: string, body: string): void {
    try {
      // на Windows уведомление от значка у часов показывается всегда (обычному нужен ярлык с AppUserModelID)
      if (process.platform === 'win32' && this.created) { this.tray!.displayBalloon({ title, content: body, iconType: 'info' }); return; }
      if (Notification.isSupported()) {
        const n = new Notification({ title, body, silent: false });
        n.on('click', () => this.showDone());
        n.show();
      }
    } catch (e) { this.d.log('notify', e); }
  }

  /** Окно просят закрыть. true — закрытие отменено (окно спрятано, экспорт идёт дальше). */
  onClose(): boolean {
    const w = this.d.win();
    if (!w || closeAction({ exporting: this.st.exporting, quitting: this.quitting }) === 'close') return false;
    if (!this.created) this.create();
    this.st.background = true;
    w.hide();
    this.refresh();
    this.notify(tx('Kadro доделает экспорт'), tx('Окно закрыто, ролик сохранится в фоне. Ход — на значке Kadro возле часов.'));
    this.d.log('export continues in background');
    return true;
  }

  exportStart(): void {
    if (this.quitTimer) { clearTimeout(this.quitTimer); this.quitTimer = null; }
    this.st = { ...this.st, exporting: true, progress: 0, done: null };
    this.lastPct = -1;
    this.progress(0);
  }

  progress(p: number): void {
    this.st.progress = p;
    const w = this.d.win();
    if (w && !w.isDestroyed()) w.setProgressBar(Math.min(1, Math.max(0, p)));
    const v = Math.round(p * 100);
    if (v !== this.lastPct) { this.lastPct = v; this.refresh(); } // меню и подсказка — не чаще раза на процент
  }

  exportEnd(r: { ok: boolean; path?: string; error?: string }, cancelled: boolean): void {
    const bg = this.st.background;
    this.st = { ...this.st, exporting: false, progress: r.ok ? 1 : this.st.progress, done: { ok: r.ok, path: r.path } };
    const w = this.d.win();
    if (w && !w.isDestroyed()) {
      w.setProgressBar(-1);
      if (r.ok && !bg && !w.isFocused()) w.flashFrame(true); // кнопка в панели задач мигает: готово
    }
    this.refresh();
    if (!bg || this.quitting) return;
    const next = afterBackground({ ok: r.ok, cancelled });
    if (next === 'quit') { this.quit(); return; }
    if (next === 'show-window') { this.open(); return; }
    this.notify(tx('Ролик готов'), r.path ? tx('{0} — нажми, чтобы показать в папке', path.basename(r.path)) : tx('Экспорт закончен'));
    this.quitTimer = setTimeout(() => { if (this.st.background) this.quit(); }, this.d.quitMs ?? BG_QUIT_MS);
  }
}
