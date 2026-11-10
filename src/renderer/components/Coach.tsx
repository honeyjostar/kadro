// «Первый ролик за 3 шага» — обучение для новичков: карточка поверх редактора, шаги отмечаются сами
// (видео на таймлайне, надпись, удачный экспорт). Крестик — скрыть; вернуть — «Настройки» → «Помощь».
import { tx } from '../../shared/i18n';
import { Check, GraduationCap, X } from 'lucide-react';
import { COACH_STEPS, coachProgress } from '../../shared/coach';
import { addText } from '../../shared/timeline';
import { importPaths, loadDemoFiles, pickAndImport } from '../actions';
import { getState, useStore } from '../store';

async function demoClips(): Promise<void> {
  const demo = await loadDemoFiles();
  const files = Object.values(demo.scenes).slice(0, 3);
  if (files.length) await importPaths(files, { mode: 'main', at: 0 });
  else await pickAndImport({ mode: 'main' });
}

function addTitle(): void {
  const s = getState();
  s.setLeftTab('text');
  let id = '';
  s.commit((p) => { const r = addText(p, s.playhead, tx('Мой первый ролик')); id = r.clipId; return r.project; });
  if (id) { s.select([id]); setTimeout(() => window.dispatchEvent(new Event('kadro:edit-text')), 30); }
}

export function CoachPanel() {
  const coach = useStore((s) => s.coach);
  const home = useStore((s) => s.home);
  const project = useStore((s) => s.project);
  const exported = useStore((s) => s.coachExported);
  if (coach !== 'active' || home) return null;
  const { done, current } = coachProgress(project, exported);
  const hide = () => { getState().setCoach('off'); getState().toast(tx('Обучение можно пройти снова: «Настройки» → «Помощь»')); };
  const finished = current >= COACH_STEPS.length;
  const st = COACH_STEPS[Math.min(current, COACH_STEPS.length - 1)];
  // полоса над таймлайном (как «Где пролистнут»): шаги точками, текущий — с подсказкой и кнопкой
  return (
    <div className={`coach ${finished ? 'ok' : ''}`} role="complementary" aria-label={tx('Первый ролик за 3 шага')} data-testid="coach">
      <GraduationCap size={16} />
      <ol className="coach-steps">
        {COACH_STEPS.map((x, i) => (
          <li key={x.id} className={done[i] ? 'done' : i === current ? 'now' : ''} title={x.title} data-testid={`coach-step-${x.id}`}>
            {done[i] ? <Check size={11} /> : i + 1}
          </li>
        ))}
      </ol>
      {finished ? (
        <>
          <span className="coach-text"><b>{tx('Первый ролик готов!')}</b> {tx('Ты смонтировал и сохранил ролик. Дальше попробуй авто-ролик под музыку, субтитры как у блогеров и мем-кнопки в разделе «Эффекты».')}</span>
          <button className="btn primary small" onClick={() => getState().setCoach('done')} data-testid="coach-done">{tx('Спасибо, дальше сам')}</button>
        </>
      ) : (
        <>
          <span className="coach-text" title={st.hint}><b>{st.title}.</b> {st.hint}</span>
          {st.id === 'video' && <>
            <button className="btn primary small" onClick={() => void demoClips()} data-testid="coach-demo">{tx('Взять кадры Kadro')}</button>
            <button className="btn small" onClick={() => void pickAndImport({ mode: 'main' })}>{tx('Свои файлы…')}</button>
          </>}
          {st.id === 'text' && <button className="btn primary small" onClick={addTitle} data-testid="coach-text">{tx('Добавить надпись')}</button>}
          {st.id === 'export' && <button className="btn primary small" onClick={() => getState().setExportOpen(true)} data-testid="coach-export">{tx('Открыть экспорт')}</button>}
        </>
      )}
      <button className="icon-btn" onClick={hide} title={tx('Скрыть обучение')} data-testid="coach-close"><X size={15} /></button>
    </div>
  );
}
