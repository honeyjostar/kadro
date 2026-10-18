import { useState, type ReactNode } from 'react';

export function Slider(props: {
  label: string; value: number; min: number; max: number; step?: number;
  format?: (v: number) => string; onChange: (v: number) => void; onReset?: () => void; testId?: string;
}) {
  const { label, value, min, max, step = 0.01, format, onChange, onReset, testId } = props;
  return (
    <div className="field">
      <div className="field-row">
        <label onDoubleClick={onReset} title={onReset ? 'Двойной клик — сбросить' : undefined}>{label}</label>
        <span className="value">{format ? format(value) : value.toFixed(2)}</span>
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
