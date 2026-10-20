import { describe, expect, it } from 'vitest';
import {
  ACCENTS, APP_ICONS, DEFAULT_APPEARANCE, THEME_JSON_TEMPLATE, normalizeAppearance, pngToIco, shortcutPaths, themeJsonToCss,
  updateShortcutIcons, type ShortcutApi,
} from '../../src/shared/appearance';

describe('оформление', () => {
  it('битые настройки → значения по умолчанию, хорошие — как есть', () => {
    expect(normalizeAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ accent: 'green' as never, icon: 'gold' as never, uiScale: 3, custom: 'yes' as never })).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ accent: 'violet', icon: 'blue', uiScale: 1.25, custom: true }))
      .toEqual({ accent: 'violet', icon: 'blue', uiScale: 1.25, custom: true, iconFile: undefined });
    // свой значок без файла — обычный
    expect(normalizeAppearance({ icon: 'custom' }).icon).toBe('black');
    expect(normalizeAppearance({ icon: 'custom', iconFile: 'C:\\x.ico' })).toMatchObject({ icon: 'custom', iconFile: 'C:\\x.ico' });
    expect(ACCENTS.map((a) => a.id)).toEqual(['pink', 'violet', 'blue', 'mono']);
    expect(APP_ICONS.map((a) => a.id)).toEqual(['black', 'white', 'pink', 'violet', 'blue']);
  });

  it('theme.json → CSS: переменные для тёмной, светлой и обеих тем; опасное пропускается', () => {
    const r = themeJsonToCss({
      _help: 'комментарий',
      dark: { '--accent': '#00d1c1', '--bg': ' #0c1118 ', _note: 'x' },
      light: { '--accent': 'rgb(0 127 117)' },
      all: { '--radius-m': '14px', '--radius-s': 8 },
      // попытки выйти из правила или подсунуть не переменную
      evil: { '--x': 'red' },
    });
    expect(r.css).toContain(":root:not([data-theme='light']) {\n  --accent: #00d1c1 !important;\n  --bg: #0c1118 !important;\n}");
    expect(r.css).toContain(":root[data-theme='light'] {\n  --accent: rgb(0 127 117) !important;\n}");
    expect(r.css).toContain(':root {\n  --radius-m: 14px !important;\n  --radius-s: 8 !important;\n}');
    expect(r.skipped).toEqual(['evil']);
    const bad = themeJsonToCss({ dark: { '--a': 'red; } body { display: none', 'color': 'red', '--b': '<script>', '--c': 'url(x)\\' } });
    expect(bad.css).toBe('');
    expect(bad.skipped).toEqual(['dark.--a', 'dark.color', 'dark.--b', 'dark.--c']);
    expect(themeJsonToCss([1, 2]).css).toBe('');
    expect(themeJsonToCss(JSON.parse(THEME_JSON_TEMPLATE)).css).toContain('--accent: #ff3d7f');
  });

  it('PNG → ICO: заголовок значка, размер 256 записан как 0, картинка внутри как есть', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);
    const ico = pngToIco(png, 256, 256);
    const v = new DataView(ico.buffer);
    expect(v.getUint16(2, true)).toBe(1);
    expect(v.getUint16(4, true)).toBe(1);
    expect(ico[6]).toBe(0);
    expect(ico[7]).toBe(0);
    expect(v.getUint16(12, true)).toBe(32);
    expect(v.getUint32(14, true)).toBe(png.length);
    expect(v.getUint32(18, true)).toBe(22);
    expect([...ico.slice(22)]).toEqual([...png]);
    expect(pngToIco(png, 48, 48)[6]).toBe(48);
  });

  it('ярлыки: меняется значок только у ярлыков Kadro, обычный значок — из самой программы', () => {
    const paths = shortcutPaths('C:\\Users\\T\\Desktop', 'C:\\Users\\T\\AppData\\Roaming');
    expect(paths[0]).toBe('C:\\Users\\T\\Desktop\\Kadro.lnk');
    expect(paths[1]).toBe('C:\\Users\\T\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Kadro.lnk');
    expect(paths[2]).toContain('User Pinned\\TaskBar\\Kadro.lnk');
    const exe = 'C:\\Users\\T\\AppData\\Local\\Programs\\Kadro\\Kadro.exe';
    const links: Record<string, { target: string; icon?: string }> = {
      [paths[0]]: { target: exe },
      [paths[1]]: { target: 'C:\\Other\\app.exe' },  // чужой ярлык с тем же именем — не трогаем
    };
    const writes: [string, string][] = [];
    const sh: ShortcutApi = {
      exists: (p) => p in links,
      read: (p) => links[p],
      update: (p, icon) => { writes.push([p, icon]); links[p] = { ...links[p], icon }; return true; },
    };
    expect(updateShortcutIcons(paths, 'C:\\Users\\T\\.kadro\\icons\\kadro-pink.ico', sh)).toBe(1);
    expect(writes).toEqual([[paths[0], 'C:\\Users\\T\\.kadro\\icons\\kadro-pink.ico']]);
    // тот же значок второй раз — ничего не пишем
    expect(updateShortcutIcons(paths, 'C:\\Users\\T\\.kadro\\icons\\kadro-pink.ico', sh)).toBe(0);
    // вернуть обычный — значок из Kadro.exe
    expect(updateShortcutIcons(paths, null, sh)).toBe(1);
    expect(links[paths[0]].icon).toBe(exe);
    // битый ярлык не роняет остальное
    const broken: ShortcutApi = { exists: () => true, read: () => { throw new Error('locked'); }, update: () => true };
    expect(updateShortcutIcons(paths, null, broken)).toBe(0);
  });
});
