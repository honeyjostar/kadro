// «Первый ролик за 3 шага» — обучение для новичков: карточка поверх редактора, шаги отмечаются сами
// (видео на таймлайне, надпись, удачный экспорт). Крестик — скрыть; вернуть — «Настройки» → «Помощь».
import { tx } from '../../shared/i18n';
import { Check, GraduationCap, X } from 'lucide-react';
import { COACH_STEPS, coachProgress } from '../../shared/coach';
import { addText } from '../../shared/timeline';
import { importPaths, loadDemoFiles, pickAndImport } from '../actions';
import { getState, useStore } from '../store';
import { Beacon, startTour } from './Tour';

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

/** Куда показать на шаге: сначала раздел слева, когда он открыт — на саму кнопку. */
function beaconFor(step: string, leftTab: string): { target: string; label: string } {
  if (step === 'video') return leftTab === 'media' ? { target: '[data-testid=import-btn]', label: tx('Добавь видео или фото') } : { target: '[data-testid=tab-media]', label: tx('Открой «Медиа»') };
  if (step === 'text') return leftTab === 'text' ? { target: '[data-testid=add-text]', label: tx('Добавь надпись') } : { target: '[data-testid=tab-text]', label: tx('Открой «Текст»') };
  return { target: '[data-testid=export-open]', label: tx('Сохрани ролик') };
}

export function CoachPanel() {
  const coach = useStore((s) => s.coach);
  const home = useStore((s) => s.home);
  const project = useStore((s) => s.project);
  const exported = useStore((s) => s.coachExported);
  const leftTab = useStore((s) => s.leftTab);
  const exportOpen = useStore((s) => s.exportOpen);
  const tour = useStore((s) => s.tour);
  if (home || tour !== null) return null;
  // ещё не предлагали (обновились со старой версии или пропустили первый запуск) — предлагаем
  if (coach === null) {
    return (
      <div className="coach" role="complementary" aria-label={tx('Обучение')} data-testid="coach-offer">
        <GraduationCap size={16} />
        <span className="coach-text"><b>{tx('Впервые в Kadro?')}</b> {tx('Покажу, что где, за 30 секунд — или смонтируем первый ролик вместе.')}</span>
        <button className="btn primary small" onClick={startTour} data-testid="coach-tour">{tx('Экскурсия')}</button>
        <button className="btn small" onClick={() => getState().setCoach('active')} data-testid="coach-start">{tx('Первый ролик за 3 шага')}</button>
        <button className="icon-btn" onClick={() => getState().setCoach('off')} title={tx('Не надо')} data-testid="coach-close"><X size={15} /></button>
      </div>
    );
  }
  if (coach !== 'active') return null;
  const { done, current } = coachProgress(project, exported);
  const hide = () => { getState().setCoach('off'); getState().toast(tx('Обучение можно пройти снова: «Настройки» → «Помощь»')); };
  const finished = current >= COACH_STEPS.length;
  const st = COACH_STEPS[Math.min(current, COACH_STEPS.length - 1)];
  const beacon = finished || exportOpen ? null : beaconFor(st.id, leftTab);
  // полоса над таймлайном (как «Где пролистнут»): шаги точками, текущий — с подсказкой и кнопкой;
  // нужная кнопка в окне подсвечивается пульсирующей рамкой
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
          <button className="btn ghost small" onClick={startTour} title={tx('Показать, где что в окне')} data-testid="coach-tour">{tx('Где что?')}</button>
        </>
      )}
      <button className="icon-btn" onClick={hide} title={tx('Скрыть обучение')} data-testid="coach-close"><X size={15} /></button>
      {beacon && <Beacon target={beacon.target} label={beacon.label} />}
    </div>
  );
}
