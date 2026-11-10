import { tx } from '../../shared/i18n';
import { Gauge, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cancelJob } from '../actions';
import { api, useStore } from '../store';
import { Progress } from './controls';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`} data-testid="toast">{t.text}</div>)}
    </div>
  );
}

export function Jobs() {
  const jobs = useStore((s) => s.jobs);
  const list = Object.values(jobs);
  if (!list.length) return null;
  return (
    <div className="jobs">
      {list.map((j) => (
        <div key={j.id} className="job" data-testid="job">
          <div className="row">
            <span>{j.stage && j.stage !== j.label ? `${j.label} · ${j.stage}` : j.label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="value">{Math.round(j.progress * 100)}%</span>
              {j.cancellable && <button className="icon-btn" style={{ width: 22, height: 22 }} title={tx('Отменить')} onClick={() => cancelJob(j.id)}><X size={14} /></button>}
            </span>
          </div>
          <Progress value={j.progress} />
        </div>
      ))}
    </div>
  );
}

/**
 * Слабый компьютер: после первой заставки — один раз спросить, не выключить ли её.
 * Ответ запоминается; потом заставка включается и выключается в «Настройки» → «Заставка при запуске».
 */
export function IntroOffer() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!api.intro?.offer || !api.intro.shown) return;
    const open = () => setShow(true);
    if (!document.getElementById('kadro-intro')) { open(); return; }
    window.addEventListener('kadro-intro-done', open, { once: true });
    return () => window.removeEventListener('kadro-intro-done', open);
  }, []);
  if (!show) return null;
  const answer = (off: boolean) => { if (off) api.setIntro(false); else api.introAsked(); setShow(false); };
  return (
    <div className="intro-offer star-ask" role="dialog" data-testid="intro-offer">
      <Gauge size={22} className="star-ico" />
      <b>{tx('Компьютер не самый быстрый — выключить заставку?')}</b>
      <p>{tx('Kadro будет открываться сразу на главном экране. Включить обратно — «Настройки» → «Заставка при запуске».')}</p>
      <div className="star-btns">
        <button className="btn primary small" onClick={() => answer(true)} data-testid="intro-off">{tx('Выключить')}</button>
        <button className="btn ghost small" onClick={() => answer(false)} data-testid="intro-keep">{tx('Оставить')}</button>
      </div>
    </div>
  );
}
