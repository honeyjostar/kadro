import { tx, uiLang } from '../shared/i18n';
import { createRoot } from 'react-dom/client';
import './fonts';
import './styles.css';
import * as timeline from '../shared/timeline';
import * as effects from '../shared/effects';
import * as color from '../shared/color';
import * as actions from './actions';
import * as preflight from './preflight';
import * as templates from '../shared/templates';
import { App } from './components/App';
import { api, getState, useStore } from './store';
import { CrashGuard } from './components/Crash';
import { setTextWarper } from '../shared/textRender';
import type { Appearance } from '../shared/appearance';
import { warper } from './engine/warp';
import * as glReg from './glRegistry';
import { glRunner } from './engine/gl';

document.documentElement.lang = uiLang();

// доступ для автотестов (window.__kadro) — в обычной работе не используется
(window as unknown as { __kadro: unknown }).__kadro = { useStore, actions, timeline, effects, color, preflight, templates, gl: { ...glReg, runner: glRunner } };
// каталог шейдеров (переходы gl-transitions) — в фоне, не задерживая окно
void glReg.loadGlCatalog();
// плагины пользователя (папка %USERPROFILE%\\.kadro\\plugins) — при запуске и после каждой правки файла
void api.plugins?.().then(glReg.applyPluginFiles).catch(() => undefined);
api.onPluginsChanged?.(glReg.applyPluginFiles);

// ошибки вне React (обработчики, промисы) не роняют окно: в журнал и короткое сообщение
const report = (msg: string) => {
  try { api.logError(msg); } catch { /* журнал недоступен */ }
  try { getState().toast(tx('Произошла ошибка: {0}', msg.split('\n')[0].slice(0, 160)), 'err'); } catch { /* интерфейс ещё не готов */ }
};
window.addEventListener('error', (e) => { if (e.error) report(e.error instanceof Error ? e.error.stack ?? e.error.message : String(e.error)); });
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  // отменённое пользователем — не ошибка
  if (r instanceof DOMException && r.name === 'AbortError') return;
  report(r instanceof Error ? r.stack ?? r.message : String(r));
});

// тема: главный процесс знает выбор и тему Windows и сообщает, тёмная она сейчас или светлая
const applyTheme = (dark: boolean) => {
  const t = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  getState().setTheme(t);
};
applyTheme(api.initialTheme?.dark !== false);
api.onThemeChanged((t) => { useStore.setState({ themePref: t.pref }); applyTheme(t.dark); });

// цвет акцента (кнопки, курсор, выделение) — data-accent на <html>; стили в styles.css
const applyAccent = (a: Appearance) => { document.documentElement.dataset.accent = a.accent; };
applyAccent(getState().appearance);
api.onAppearanceChanged((a) => { getState().setAppearance(a); applyAccent(a); });
// своё оформление: ошибка в theme.json или custom.css — сообщаем один раз на каждое новое сообщение
let lastCustomError = '';
api.onCustomStatus((st) => {
  getState().setCustomStatus(st);
  if (st.error && st.error !== lastCustomError) getState().toast(tx('Своё оформление: {0}', st.error), 'err');
  lastCustomError = st.error ?? '';
});

// наклон текста в перспективе — на видеокарте (и в плеере, и для кадров экспорта)
setTextWarper((W, H, draw, quad) => warper().warpDrawn(W, H, draw, quad));

createRoot(document.getElementById('root')!).render(<CrashGuard><App /></CrashGuard>);
