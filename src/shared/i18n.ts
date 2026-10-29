// Язык интерфейса. Исходный текст программы — русский: tx('Закрыть') возвращает его как есть или перевод из
// словаря (src/shared/i18n/en.json). Подстановки — {0}, {1}…: tx('Вышел Kadro {0}', v).
// Язык известен до загрузки остального кода: в окне — из preload (window.kadro.lang), в главном процессе и
// ИИ-процессе — из переменной KADRO_LANG (главный процесс ставит её сам, см. src/main/lang.ts).
import en from './i18n/en.json';

export type Lang = 'ru' | 'en';
export const LANGS_UI: { id: Lang; label: string }[] = [{ id: 'ru', label: 'Русский' }, { id: 'en', label: 'English' }];

function detect(): Lang {
  const w = (globalThis as { kadro?: { lang?: string } }).kadro;
  const v = w?.lang ?? (typeof process !== 'undefined' ? process.env?.KADRO_LANG : undefined);
  return v === 'en' ? 'en' : 'ru';
}

let lang: Lang = detect();
const dicts: Record<Lang, Record<string, string>> = { ru: {}, en: en as Record<string, string> };

export const uiLang = (): Lang => lang;
/** Для автотестов и предпросмотра; в программе язык меняется перезапуском. */
export function setUiLang(l: Lang): void { lang = l; }
/** Локаль для дат и чисел. */
export const uiLocale = (): string => (lang === 'en' ? 'en-US' : 'ru-RU');

/** Перевод строки интерфейса; {0}, {1}… — подстановки. Нет перевода — исходный текст. */
export function tx(s: string, ...a: unknown[]): string {
  const t = lang === 'ru' ? s : (dicts[lang][s] || s);
  return a.length ? t.replace(/\{(\d+)\}/g, (m, i) => (Number(i) < a.length ? String(a[Number(i)]) : m)) : t;
}

/** Перевод строки, пришедшей из данных (имя шейдера, дорожки): только если она есть в словаре. */
export const txData = (s: string | undefined): string | undefined => (s === undefined ? s : tx(s));

/**
 * Русские формы числа (1 файл, 2 файла, 5 файлов); в английском — одна и «много»
 * (переводы форм: tx('файл') → file, tx('файлов') → files).
 */
export function pluralForm(n: number, one: string, few: string, many: string): string {
  if (lang !== 'ru') return Math.abs(n) === 1 ? one : many;
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
