// «Проверка охватов»: проверить готовый ролик и поправить найденное — в текущем проекте или открыв файл в Kadro.
import { tx } from '../shared/i18n';
import { newProject } from '../shared/defaults';
import type { ReachIssue, ReachReport } from '../shared/reach';
import { fillFrame, hideMark, make1080, makeVertical, trimEnd, trimStart } from '../shared/reachFix';
import { aspectOf } from '../shared/refEdit';
import type { Platform } from '../shared/safezones';
import { importPaths, replaceProject, runJob } from './actions';
import { api, getState } from './store';
import { uidShort } from './util';

export async function reachCheck(file: string, platform: Platform | null): Promise<ReachReport | null> {
  const r = await runJob(tx('Проверка охватов'), { kind: 'reach', jobId: `reach_${uidShort()}`, path: file, platform });
  if (!r.ok || r.output?.kind !== 'reach') {
    if (r.error !== tx('Отменено')) getState().toast(tx('Не получилось проверить: {0}', r.error ?? ''), 'err');
    return null;
  }
  api.track('reach');
  return r.output.report;
}

/** Открыть проверенный файл новым проектом (кадр — по его пропорциям), чтобы поправить и сохранить заново. */
export async function openForFix(file: string, report: ReachReport): Promise<boolean> {
  const name = file.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? tx('Ролик');
  await replaceProject(newProject(name, aspectOf(report.width, report.height)));
  const ids = await importPaths([file], { mode: 'main', at: 0 });
  return ids.length > 0;
}

/** Что поправить по замечанию в текущем проекте. Возвращает текст для подсказки, null — нечего делать. */
export async function applyReachFix(i: ReachIssue): Promise<string | null> {
  const s = getState();
  switch (i.fix) {
    case 'hideMark': {
      if (!i.box || i.t0 === undefined || i.t1 === undefined) return null;
      const r = hideMark(s.project, i.box, i.t0, i.t1, () => `mark_${uidShort()}`);
      if (!r.clips) return tx('В это время на основной дорожке нет видео — закрой знак вручную: клип → «Скрыть» → «Обвести предмет»');
      s.commit(() => r.project);
      return tx('Знак закрыт размытием. Посмотреть или поменять — клип → «Скрыть»');
    }
    case 'trimStart':
      if (i.at === undefined) return null;
      s.commit((p) => trimStart(p, i.at!));
      return tx('Начало обрезано: ролик теперь начинается с {0} с', i.at.toFixed(1));
    case 'trimEnd':
      if (i.at === undefined) return null;
      s.commit((p) => trimEnd(p, i.at!));
      return tx('Конец обрезан');
    case 'fill':
      s.commit((p) => fillFrame(p, i.at ?? 0.2));
      return tx('Видео растянуто на весь кадр');
    case 'vertical':
      s.commit((p) => makeVertical(p));
      return tx('Кадр теперь 9:16');
    case 'loudnorm': {
      const { presetExport } = await import('./components/ExportDialog');
      presetExport({ loudnorm: true });
      return tx('В экспорте включено «Выровнять громкость для соцсетей»');
    }
    case 'sharper': {
      const { presetExport } = await import('./components/ExportDialog');
      presetExport({ quality: 'high' });
      s.commit((p) => make1080(p));
      return tx('Экспорт: 1080p, высокое качество');
    }
    default:
      return null;
  }
}
