import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FONT_CATS, FONTS, type FontCat } from '../../shared/defaults';

export function Slider(props: {
  label: string; value: number; min: number; max: number; step?: number;
  format?: (v: number) => string; onChange: (v: number) => void; onReset?: () => void; testId?: string; extra?: ReactNode;
}) {
  const { label, value, min, max, step = 0.01, format, onChange, onReset, testId, extra } = props;
  return (
    <div className="field">
      <div className="field-row">
        <label onDoubleClick={onReset} title={onReset ? 'Двойной клик — сбросить' : undefined}>{label}</label>
        <span className="value-wrap"><span className="value">{format ? format(value) : value.toFixed(2)}</span>{extra}</span>
      </div>
      <input
        className="slider" type="range" min={min} max={max} step={step} value={value} data-testid={testId}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={onReset}
      />
    </div>
  );
}

export function Toggle(props: { label: ReactNode; on: boolean; onChange: (v: boolean) => void; hint?: string; testId?: string }) {
  return (
    <div className="toggle" role="switch" aria-checked={props.on} tabIndex={0} data-testid={props.testId}
      onClick={() => props.onChange(!props.on)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onChange(!props.on); } }}>
      <div>
        <div>{props.label}</div>
        {props.hint && <div className="hint small">{props.hint}</div>}
      </div>
      <div className={`switch ${props.on ? 'on' : ''}`} />
    </div>
  );
}

export function Seg<T extends string | number>(props: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {props.options.map((o) => (
        <button key={String(o.value)} className={o.value === props.value ? 'active' : ''} onClick={() => props.onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Field(props: { label: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="field">
      <div className="field-row"><label>{props.label}</label>{props.right}</div>
      {props.children}
    </div>
  );
}

export function ColorField(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field-row" style={{ margin: '10px 0' }}>
      <label>{props.label}</label>
      <input type="color" className="color-input" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return <div className="progress"><div style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} /></div>;
}

export function useLocal<T>(initial: T): [T, (v: T) => void] {
  const [v, set] = useState(initial);
  return [v, set];
}

/** Ромбик ключевого кадра: пустой — свойство не анимировано, контур — анимировано, залитый — ключ в этом моменте. */
export function KeyButton({ state, onClick, testId }: { state: 'none' | 'animated' | 'here'; onClick: () => void; testId?: string }) {
  const title = state === 'here' ? 'Убрать ключ в этом моменте' : 'Поставить ключ — свойство начнёт меняться во времени';
  return (
    <button className={`key-btn ${state}`} onClick={onClick} title={title} data-testid={testId} aria-label={title}>
      <svg viewBox="0 0 12 12" aria-hidden><path d="M6 1 11 6 6 11 1 6Z" /></svg>
    </button>
  );
}

/** Выбор шрифта: поиск, группы, каждый шрифт показан самим собой. */
export function FontPicker({ value, onChange, testId }: { value: string; onChange: (family: string) => void; testId?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<FontCat | 'all'>('all');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  const needle = q.trim().toLowerCase();
  const list = FONTS.filter((f) => (cat === 'all' || f.cat === cat) && (!needle || f.label.toLowerCase().includes(needle)));
  const groups = FONT_CATS.map((c) => ({ ...c, fonts: list.filter((f) => f.cat === c.id) })).filter((g) => g.fonts.length);
  const label = FONTS.find((f) => f.family === value)?.label ?? value;
  return (
    <div className="font-picker" ref={box}>
      <button type="button" className="input font-picker-btn" onClick={() => setOpen(!open)} data-testid={testId} style={{ fontFamily: `'${value}'` }}
        aria-haspopup="listbox" aria-expanded={open}>
        <span>{label}</span><svg viewBox="0 0 12 12" aria-hidden><path d="M3 4.5 6 7.5 9 4.5" /></svg>
      </button>
      {open && (
        <div className="font-pop" role="listbox">
          <input className="input" autoFocus placeholder={`Поиск среди ${FONTS.length} шрифтов`} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="chips">
            <button className={cat === 'all' ? 'active' : ''} onClick={() => setCat('all')}>Все</button>
            {FONT_CATS.map((c) => <button key={c.id} className={cat === c.id ? 'active' : ''} onClick={() => setCat(c.id)}>{c.label}</button>)}
          </div>
          <div className="font-pop-list">
            {groups.map((g) => (
              <div key={g.id}>
                <div className="font-pop-cat">{g.label}</div>
                {g.fonts.map((f) => (
                  <button key={f.family} role="option" aria-selected={f.family === value} className={`font-row ${f.family === value ? 'active' : ''}`}
                    style={{ fontFamily: `'${f.family}'` }} onClick={() => { onChange(f.family); setOpen(false); }}>
                    {f.label} <span>Привет, мир</span>
                  </button>
                ))}
              </div>
            ))}
            {!groups.length && <div className="hint small">Ничего не нашлось</div>}
          </div>
        </div>
      )}
    </div>
  );
}
