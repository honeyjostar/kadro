// Оформление: цвет акцента, значок программы, размер интерфейса и «своё оформление» (custom.css + theme.json
// в папке данных). Здесь — общие списки и чистые функции; применяет их главный процесс и окно.

export type AccentId = 'pink' | 'violet' | 'blue' | 'mono';
export type IconId = 'black' | 'white' | 'pink' | 'violet' | 'blue' | 'custom';

export interface Appearance {
  accent: AccentId;
  icon: IconId;
  iconFile?: string;     // свой значок (.ico в папке данных), если icon = 'custom'
  uiScale: number;       // 0.9 … 1.25
  custom: boolean;       // подключать custom.css и theme.json
}
export const DEFAULT_APPEARANCE: Appearance = { accent: 'pink', icon: 'black', uiScale: 1, custom: false };

export const ACCENTS: { id: AccentId; label: string; swatch: string }[] = [
  { id: 'pink', label: 'Розовый', swatch: '#ff3d7f' },
  { id: 'violet', label: 'Фиолетовый', swatch: '#8f6bff' },
  { id: 'blue', label: 'Синий', swatch: '#3d86ff' },
  { id: 'mono', label: 'Чёрно-белый', swatch: 'linear-gradient(135deg,#fff 0 50%,#111 50% 100%)' },
];

export const APP_ICONS: { id: Exclude<IconId, 'custom'>; label: string; bg: string; fg: string }[] = [
  { id: 'black', label: 'Чёрный', bg: '#000000', fg: '#ffffff' },
  { id: 'white', label: 'Белый', bg: '#ffffff', fg: '#000000' },
  { id: 'pink', label: 'Розовый', bg: '#ff3d7f', fg: '#ffffff' },
  { id: 'violet', label: 'Фиолетовый', bg: '#7c4dff', fg: '#ffffff' },
  { id: 'blue', label: 'Синий', bg: '#2f7bff', fg: '#ffffff' },
];

export const UI_SCALES: { value: number; label: string }[] = [
  { value: 0.9, label: '90%' }, { value: 1, label: '100%' }, { value: 1.1, label: '110%' }, { value: 1.25, label: '125%' },
];

const isAccent = (x: unknown): x is AccentId => ACCENTS.some((a) => a.id === x);
const isIcon = (x: unknown): x is IconId => x === 'custom' || APP_ICONS.some((a) => a.id === x);

/** Настройки из файла → правильные значения (битый или старый файл не ломает программу). */
export function normalizeAppearance(x: Partial<Appearance> | undefined | null): Appearance {
  const a = x ?? {};
  const icon = isIcon(a.icon) ? a.icon : DEFAULT_APPEARANCE.icon;
  return {
    accent: isAccent(a.accent) ? a.accent : DEFAULT_APPEARANCE.accent,
    icon: icon === 'custom' && !a.iconFile ? DEFAULT_APPEARANCE.icon : icon,
    iconFile: icon === 'custom' && typeof a.iconFile === 'string' ? a.iconFile : undefined,
    uiScale: UI_SCALES.some((s) => s.value === a.uiScale) ? a.uiScale! : DEFAULT_APPEARANCE.uiScale,
    custom: a.custom === true,
  };
}

// ---------- своё оформление ----------
/** Переменная оформления: --имя из латиницы, цифр и дефисов. */
const VAR = /^--[a-z0-9][a-z0-9-]{0,40}$/;
/** Значение: без символов, которыми можно «выйти» из правила CSS. */
const SAFE = /^[^;{}<>\\]{1,200}$/;

/**
 * theme.json → CSS. Формат: { "dark": { "--accent": "#00e5ff", … }, "light": { … }, "all": { "--radius-m": "14px" } }.
 * Ключи не по формату и опасные значения пропускаются (их список — в skipped).
 */
export function themeJsonToCss(json: unknown): { css: string; skipped: string[] } {
  const skipped: string[] = [];
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { css: '', skipped: ['файл — не объект { "dark": {…}, "light": {…} }'] };
  const blocks: string[] = [];
  const sel: Record<string, string> = {
    all: ':root',
    dark: ":root:not([data-theme='light'])",
    light: ":root[data-theme='light']",
  };
  for (const [part, vars] of Object.entries(json as Record<string, unknown>)) {
    if (part.startsWith('_')) continue; // комментарии вида "_help"
    if (!sel[part]) { skipped.push(part); continue; }
    if (!vars || typeof vars !== 'object' || Array.isArray(vars)) { skipped.push(part); continue; }
    const lines: string[] = [];
    for (const [k, v] of Object.entries(vars as Record<string, unknown>)) {
      if (k.startsWith('_')) continue;
      const val = typeof v === 'number' ? String(v) : v;
      if (!VAR.test(k) || typeof val !== 'string' || !SAFE.test(val.trim())) { skipped.push(`${part}.${k}`); continue; }
      lines.push(`  ${k}: ${val.trim()} !important;`);
    }
    // !important — чтобы перебить и встроенные темы, и выбранный в настройках акцент
    if (lines.length) blocks.push(`${sel[part]} {\n${lines.join('\n')}\n}`);
  }
  return { css: blocks.join('\n'), skipped };
}

export const CUSTOM_CSS_TEMPLATE = `/* Своё оформление Kadro.
   Этот файл подключается, если в «Настройки → Своё оформление» включён переключатель.
   Сохранил файл — программа сразу применит изменения. Сломал вид — выключи переключатель
   или переименуй этот файл. Подробная инструкция — README.txt рядом и docs/CUSTOMIZE.md на GitHub.

   Примеры (убери /* и */ вокруг нужного): */

/* Скруглённее кнопки и панели
:root { --radius-s: 10px; --radius-m: 16px; }
*/

/* Другой шрифт интерфейса (любой из установленных в Windows)
body { font-family: 'Segoe UI', sans-serif; }
*/

/* Картинка на главном экране
.home { background: url('file:///C:/Users/Me/Pictures/bg.jpg') center / cover; }
*/

/* Крупнее подписи клипов на таймлайне
.clip-label { font-size: 13px; }
*/
`;

export const THEME_JSON_TEMPLATE = JSON.stringify({
  _help: 'Цвета Kadro. dark — для тёмной темы, light — для светлой, all — для обеих. Ключ — переменная (список в README.txt), значение — цвет CSS. Удали строку — вернётся цвет по умолчанию.',
  dark: { '--accent': '#ff3d7f' },
  light: {},
  all: {},
}, null, 2);

export const CUSTOM_README = `Своё оформление Kadro
=====================

Здесь два файла, которые меняют вид программы:

  custom.css  — любые стили (CSS), как для сайта.
  theme.json  — только цвета и размеры: переменные оформления для тёмной (dark), светлой (light) или обеих (all) тем.

Как включить: Kadro → «Настройки» (шестерёнка на главном экране или вверху) → «Своё оформление» → включить.
Изменения применяются сразу после сохранения файла — перезапускать программу не нужно.

Если что-то сломалось и интерфейс не видно — выключи переключатель или переименуй custom.css и theme.json.

Главные переменные (theme.json):
  --bg          фон окна              --panel      фон панелей
  --raised      фон кнопок и плиток   --raised-2   то же, светлее
  --line        линии и рамки         --line-soft  тонкие линии
  --text        основной текст        --muted      второстепенный текст
  --accent      цвет акцента (кнопки, курсор, выделение)
  --on-accent   цвет текста на кнопке с акцентом
  --accent-soft полупрозрачная подсветка выделенного
  --video, --overlay, --audio, --textclip, --caption  — цвета клипов на таймлайне
  --radius-s, --radius-m  — скругления углов
  --font        шрифт интерфейса

Пример theme.json — бирюзовый акцент и синеватые панели в тёмной теме:
  {
    "dark": { "--accent": "#00d1c1", "--panel": "#121a24", "--bg": "#0c1118" },
    "all":  { "--radius-m": "14px" }
  }

Классы элементов удобно смотреть в инструментах разработчика: F12 в окне Kadro.
Полная инструкция с примерами: https://github.com/honeyjostar/kadro/blob/master/docs/CUSTOMIZE.md
`;

// ---------- свой значок ----------
/** PNG (до 256×256) → файл .ico с одной картинкой внутри (Windows Vista и новее читают PNG в .ico). */
export function pngToIco(png: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(6 + 16 + png.length);
  const v = new DataView(out.buffer);
  v.setUint16(0, 0, true);      // зарезервировано
  v.setUint16(2, 1, true);      // тип: значок
  v.setUint16(4, 1, true);      // картинок: 1
  v.setUint8(6, w >= 256 ? 0 : w);
  v.setUint8(7, h >= 256 ? 0 : h);
  v.setUint8(8, 0);             // палитра
  v.setUint8(9, 0);
  v.setUint16(10, 1, true);     // плоскостей
  v.setUint16(12, 32, true);    // бит на точку
  v.setUint32(14, png.length, true);
  v.setUint32(18, 22, true);    // где начинается картинка
  out.set(png, 22);
  return out;
}

/** Ярлыки Kadro, которым менять значок: рабочий стол, меню «Пуск», закреплённый на панели задач. */
export function shortcutPaths(desktop: string, appData: string, sep = '\\'): string[] {
  const j = (...p: string[]) => p.join(sep);
  return [
    j(desktop, 'Kadro.lnk'),
    j(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Kadro.lnk'),
    j(appData, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar', 'Kadro.lnk'),
  ];
}

export interface ShortcutApi {
  exists(p: string): boolean;
  read(p: string): { target: string; icon?: string };
  update(p: string, icon: string): boolean;
}
/**
 * Поменять значок у ярлыков Kadro (только у тех, что ведут на Kadro.exe). icon — путь к .ico или
 * null — вернуть значок самой программы. Возвращает, сколько ярлыков изменено.
 */
export function updateShortcutIcons(paths: string[], icon: string | null, sh: ShortcutApi): number {
  let n = 0;
  for (const p of paths) {
    try {
      if (!sh.exists(p)) continue;
      const sc = sh.read(p);
      if (!/kadro\.exe$/i.test(sc.target)) continue;
      const want = icon ?? sc.target;
      if ((sc.icon ?? '') === want) continue;
      if (sh.update(p, want)) n++;
    } catch { /* ярлык занят или битый — пропускаем */ }
  }
  return n;
}
