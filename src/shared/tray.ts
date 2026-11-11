// Значок Kadro возле часов (область уведомлений Windows): открыть окно, ход экспорта, отмена, выход.
// Закрыли окно во время экспорта — окно прячется, экспорт доделывается в фоне, потом всплывает «Ролик готов»
// и через полминуты Kadro закрывается сам. Здесь — чистые решения (проверяются без Electron), значок — src/main/tray.ts.
import { tx } from './i18n';

export interface TrayState {
  exporting: boolean;
  /** 0…1 */
  progress: number;
  /** окно закрыли во время экспорта — оно спрятано, Kadro работает в фоне */
  background: boolean;
  /** последний экспорт (для «Показать готовый ролик») */
  done: { ok: boolean; path?: string } | null;
}

export const TRAY_IDLE: TrayState = { exporting: false, progress: 0, background: false, done: null };

/** Через сколько Kadro закрывается сам после фонового экспорта (успеть нажать на уведомление). */
export const BG_QUIT_MS = 30_000;

export const pct = (p: number): number => Math.round(Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0)) * 100);

export function trayTooltip(s: TrayState): string {
  if (s.exporting) return tx('Kadro — экспорт {0}%', pct(s.progress));
  return 'Kadro';
}

export type TrayItemId = 'open' | 'progress' | 'cancel' | 'show' | 'quit';
export interface TrayItem { id: TrayItemId; label: string; enabled: boolean }

/** Пункты меню по правой кнопке на значке. */
export function trayItems(s: TrayState): TrayItem[] {
  const items: TrayItem[] = [{ id: 'open', label: tx('Открыть Kadro'), enabled: true }];
  if (s.exporting) {
    items.push({ id: 'progress', label: tx('Экспорт: {0}%', pct(s.progress)), enabled: false });
    items.push({ id: 'cancel', label: tx('Отменить экспорт'), enabled: true });
  } else if (s.done?.ok && s.done.path) {
    items.push({ id: 'show', label: tx('Показать готовый ролик'), enabled: true });
  }
  items.push({ id: 'quit', label: s.exporting ? tx('Выйти (экспорт прервётся)') : tx('Выйти'), enabled: true });
  return items;
}

/** Нажали «закрыть» у окна: во время экспорта — спрятать и доделать в фоне, иначе — закрыть как обычно. */
export function closeAction(s: { exporting: boolean; quitting: boolean }): 'hide' | 'close' {
  return s.exporting && !s.quitting ? 'hide' : 'close';
}

/** Экспорт закончился, пока окно было спрятано: что сделать дальше. */
export function afterBackground(r: { ok: boolean; cancelled?: boolean }): 'notify-and-quit' | 'show-window' | 'quit' {
  if (r.ok) return 'notify-and-quit';
  return r.cancelled ? 'quit' : 'show-window'; // ошибка — показываем окно, там её текст
}
