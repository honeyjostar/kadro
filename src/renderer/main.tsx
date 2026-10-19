import { createRoot } from 'react-dom/client';
import './fonts';
import './styles.css';
import * as timeline from '../shared/timeline';
import * as effects from '../shared/effects';
import * as color from '../shared/color';
import * as actions from './actions';
import { App } from './components/App';
import { api, getState, useStore } from './store';
import { CrashGuard } from './components/Crash';

// доступ для автотестов (window.__kadro) — в обычной работе не используется
(window as unknown as { __kadro: unknown }).__kadro = { useStore, actions, timeline, effects, color };

// ошибки вне React (обработчики, промисы) не роняют окно: в журнал и короткое сообщение
const report = (msg: string) => {
  try { api.logError(msg); } catch { /* журнал недоступен */ }
  try { getState().toast(`Произошла ошибка: ${msg.split('\n')[0].slice(0, 160)}`, 'err'); } catch { /* интерфейс ещё не готов */ }
};
window.addEventListener('error', (e) => { if (e.error) report(e.error instanceof Error ? e.error.stack ?? e.error.message : String(e.error)); });
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  // отменённое пользователем — не ошибка
  if (r instanceof DOMException && r.name === 'AbortError') return;
  report(r instanceof Error ? r.stack ?? r.message : String(r));
});

createRoot(document.getElementById('root')!).render(<CrashGuard><App /></CrashGuard>);
