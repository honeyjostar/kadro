import { describe, expect, it } from 'vitest';
import { MAX_URL, bugBody, bugTitle, issueUrl, scrubLog, type BugInfo } from '../../src/shared/bugReport';

const info = (log = ''): BugInfo => ({ version: '0.6.0', os: 'Windows_NT 10.0.22631 (x64)', electron: '44.0.0', gpu: 'enabled', log });

describe('«Сообщить об ошибке»', () => {
  it('журнал без личных путей: папка пользователя → %USERPROFILE%, в любых слэшах и регистре', () => {
    const home = 'C:\\Users\\Тимофей';
    const log = [
      '[t] open C:\\Users\\Тимофей\\Videos\\отпуск.mp4',
      '[t] cache c:/users/тимофей/.kadro/cache',
      '[t] other C:\\Users\\Guest\\x.mp4 and /home/tim/a.mp4 and /Users/tim/b.mov',
    ].join('\n');
    const s = scrubLog(log, home);
    expect(s).not.toMatch(/Тимофей|тимофей|Guest|tim\b/);
    expect(s).toContain('%USERPROFILE%\\Videos\\отпуск.mp4');
    expect(s).toContain('%USERPROFILE%/.kadro/cache');
    expect(s).toContain('~/a.mp4');
  });

  it('заголовок — первая строка описания, не длиннее 80 знаков', () => {
    expect(bugTitle('  Экспорт падает\nна 80%')).toBe('Экспорт падает');
    expect(bugTitle('')).toBe('Ошибка в Kadro');
    expect(bugTitle('а'.repeat(200))).toHaveLength(78);
  });

  it('текст: описание, шаги, система; журнал — только если приложить, последние строки', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `[t] строка ${i}`).join('\n');
    const b = bugBody('Падает экспорт', 'Нажал «Экспорт»', info(lines), true, 400);
    expect(b).toContain('### Что случилось\nПадает экспорт');
    expect(b).toContain('### Что делал перед этим\nНажал «Экспорт»');
    expect(b).toContain('- Kadro 0.6.0');
    expect(b).toContain('строка 299');
    expect(b).not.toContain('строка 200');
    const noLog = bugBody('Падает экспорт', '', info(lines), false);
    expect(noLog).not.toContain('Журнал');
    expect(noLog).not.toContain('Что делал');
  });

  it('ссылка на новый Issue в репозитории Kadro, длинный журнал укорачивается до лимита', () => {
    const big = Array.from({ length: 2000 }, (_, i) => `[2026-10-29T10:00:00.000Z] очень длинная строка журнала номер ${i} с подробностями`).join('\n');
    const u = issueUrl('Падает', '', info(big), true);
    expect(u.startsWith('https://github.com/honeyjostar/kadro/issues/new?title=')).toBe(true);
    expect(u.length).toBeLessThanOrEqual(MAX_URL);
    const body = decodeURIComponent(new URL(u).searchParams.get('body')!);
    expect(body).toContain('номер 1999'); // самый конец журнала — на месте
    expect(new URL(u).searchParams.get('labels')).toBe('bug');
  });
});
