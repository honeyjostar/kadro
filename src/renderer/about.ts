// Ответы «О тебе»: из установщика (settings.json) или из приветствия — хранятся в настройках окна.
import { formatFor, type About } from '../shared/survey';
import { modeForLevel } from '../shared/uiMode';
import { api, getState } from './store';

export const ABOUT_KEY = 'kadro.about';

export function readAbout(): About {
  try { return { edit: [], ...(JSON.parse(localStorage.getItem(ABOUT_KEY) ?? '{}') as Partial<About>) }; } catch { return { edit: [] }; }
}
export function writeAbout(a: About): void {
  try { localStorage.setItem(ABOUT_KEY, JSON.stringify(a)); } catch { /* не страшно */ }
}

/** Установщик спросил «О тебе» — применить один раз: режим по уровню, формат по тому, что человек монтирует. */
export function applyInstallerAbout(): void {
  const a = api.aboutFromInstaller;
  if (!a) return;
  try { if (localStorage.getItem(ABOUT_KEY)) return; } catch { return; }
  writeAbout(a);
  if (a.level) getState().setUiMode(modeForLevel(a.level));
  const f = formatFor(a.edit);
  if (f) getState().setDefaultFormat(f);
}
