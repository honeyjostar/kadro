import { X } from 'lucide-react';
import { cancelJob } from '../actions';
import { useStore } from '../store';
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
              {j.cancellable && <button className="icon-btn" style={{ width: 22, height: 22 }} title="Отменить" onClick={() => cancelJob(j.id)}><X size={14} /></button>}
            </span>
          </div>
          <Progress value={j.progress} />
        </div>
      ))}
    </div>
  );
}
