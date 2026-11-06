// Язык интерфейса для главного процесса — до загрузки остального кода (некоторые подписи считаются при
// загрузке модулей). Порядок: KADRO_LANG (автотесты) → настройки → для нового пользователя язык Windows.
// Результат кладётся в process.env.KADRO_LANG: его читают src/shared/i18n.ts и ИИ-процесс.
// При самом первом запуске — ещё и отметка welcome: 'pending': окно покажет выбор языка.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function pick(): 'ru' | 'en' {
  const env = process.env.KADRO_LANG;
  if (env === 'ru' || env === 'en') return env;
  const file = path.join(process.env.KADRO_DATA || path.join(os.homedir(), '.kadro'), 'settings.json');
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8')) as { lang?: string };
    if (s.lang === 'ru' || s.lang === 'en') return s.lang;
    return 'ru'; // настройки есть, а языка нет — человек уже пользовался Kadro по-русски
  } catch { /* первый запуск */ }
  const loc = (Intl.DateTimeFormat().resolvedOptions().locale || process.env.LANG || '').toLowerCase();
  return /^(ru|uk|be|kk|ky|uz|tg|hy|az)\b/.test(loc) ? 'ru' : 'en';
}

process.env.KADRO_LANG = pick();

// первый запуск (настроек ещё нет): язык угадан по Windows — записываем его сразу (чтобы при закрытии окна
// приветствия Kadro не решил, что человек уже пользовался им по-русски) и просим показать выбор языка
(() => {
  if (process.env.KADRO_SKIP_WELCOME) return; // автотесты
  const dir = process.env.KADRO_DATA || path.join(os.homedir(), '.kadro');
  const file = path.join(dir, 'settings.json');
  if (fs.existsSync(file)) return;
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify({ lang: process.env.KADRO_LANG, welcome: 'pending' }, null, 2)); } catch { /* не критично */ }
})();
