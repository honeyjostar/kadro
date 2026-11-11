// Значок Kadro у часов: пункты меню, подсказка, что делать при закрытии окна во время экспорта.
import { describe, expect, it } from 'vitest';
import { afterBackground, closeAction, pct, TRAY_IDLE, trayItems, trayTooltip } from '../../src/shared/tray';

describe('значок у часов', () => {
  it('без экспорта: открыть и выйти', () => {
    expect(trayItems(TRAY_IDLE).map((i) => i.id)).toEqual(['open', 'quit']);
    expect(trayTooltip(TRAY_IDLE)).toBe('Kadro');
  });

  it('во время экспорта: проценты, отмена, выход предупреждает', () => {
    const s = { ...TRAY_IDLE, exporting: true, progress: 0.473 };
    const items = trayItems(s);
    expect(items.map((i) => i.id)).toEqual(['open', 'progress', 'cancel', 'quit']);
    expect(items[1]).toMatchObject({ label: 'Экспорт: 47%', enabled: false });
    expect(items[3].label).toContain('прервётся');
    expect(trayTooltip(s)).toBe('Kadro — экспорт 47%');
  });

  it('после экспорта — показать готовый ролик (только если удался и есть путь)', () => {
    expect(trayItems({ ...TRAY_IDLE, done: { ok: true, path: 'C:/v.mp4' } }).map((i) => i.id)).toEqual(['open', 'show', 'quit']);
    expect(trayItems({ ...TRAY_IDLE, done: { ok: false } }).map((i) => i.id)).toEqual(['open', 'quit']);
  });

  it('проценты: границы и мусор', () => {
    expect(pct(-1)).toBe(0);
    expect(pct(2)).toBe(100);
    expect(pct(Number.NaN)).toBe(0);
    expect(pct(0.995)).toBe(100);
  });

  it('закрытие окна: во время экспорта — прятать, при выходе и без экспорта — закрывать', () => {
    expect(closeAction({ exporting: true, quitting: false })).toBe('hide');
    expect(closeAction({ exporting: true, quitting: true })).toBe('close');
    expect(closeAction({ exporting: false, quitting: false })).toBe('close');
  });

  it('конец фонового экспорта: готово — уведомить и выйти, ошибка — показать окно, отмена — выйти', () => {
    expect(afterBackground({ ok: true })).toBe('notify-and-quit');
    expect(afterBackground({ ok: false })).toBe('show-window');
    expect(afterBackground({ ok: false, cancelled: true })).toBe('quit');
  });
});
