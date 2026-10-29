// «Сообщить об ошибке»: текст Issue для GitHub — что случилось, версия, система и хвост журнала.
// Журнал чистится от личного: путь к папке пользователя заменяется на %USERPROFILE%.

export const ISSUES_NEW = 'https://github.com/honeyjostar/kadro/issues/new';
/** GitHub и браузеры режут слишком длинные ссылки — укладываемся с запасом. */
export const MAX_URL = 7500;

export interface BugInfo { version: string; os: string; electron: string; gpu: string; log: string }

/** Убрать из журнала личные пути: C:\Users\Имя\… → %USERPROFILE%\…, /home/имя/… → ~/… */
export function scrubLog(text: string, home: string): string {
  let s = text;
  if (home) {
    const esc = home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(esc, 'gi'), '%USERPROFILE%');
    const fwd = home.replace(/\\/g, '/');
    if (fwd !== home) s = s.replace(new RegExp(fwd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '%USERPROFILE%');
  }
  return s
    .replace(/[A-Z]:\\Users\\[^\\\s"']+/gi, '%USERPROFILE%')
    .replace(/\/(home|Users)\/[^/\s"']+/g, '~');
}

export function bugTitle(what: string): string {
  const first = what.trim().split(/\r?\n/)[0].replace(/\s+/g, ' ');
  return first.length > 80 ? `${first.slice(0, 77)}…` : first || 'Ошибка в Kadro';
}

/** Текст Issue в Markdown; журнал — последние строки, сколько влезает в ссылку. */
export function bugBody(what: string, steps: string, info: BugInfo, withLog: boolean, budget = 4000): string {
  const parts = [
    '### Что случилось', what.trim() || '—', '',
    ...(steps.trim() ? ['### Что делал перед этим', steps.trim(), ''] : []),
    '### Система',
    `- Kadro ${info.version}`, `- ${info.os}`, `- Electron ${info.electron}`, `- Видеокарта (WebGL): ${info.gpu}`, '',
  ];
  if (withLog && info.log.trim()) {
    const lines = info.log.trim().split(/\r?\n/);
    const keep: string[] = [];
    let n = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i].length > 400 ? `${lines[i].slice(0, 400)}…` : lines[i];
      if (n + l.length + 1 > budget) break;
      keep.unshift(l);
      n += l.length + 1;
    }
    parts.push('<details><summary>Журнал (последние строки)</summary>', '', '```', ...keep, '```', '</details>');
  }
  return parts.join('\n');
}

/** Ссылка «новый Issue» с заполненными полями; длинный журнал укорачивается, пока ссылка не влезет. */
export function issueUrl(what: string, steps: string, info: BugInfo, withLog: boolean): string {
  let budget = 4000;
  for (;;) {
    const url = `${ISSUES_NEW}?title=${encodeURIComponent(bugTitle(what))}&labels=bug&body=${encodeURIComponent(bugBody(what, steps, info, withLog, budget))}`;
    if (url.length <= MAX_URL || budget < 200) return url;
    budget = Math.floor(budget * 0.7);
  }
}
