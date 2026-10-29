import { tx } from '../../shared/i18n';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FONT_CATS, FONTS, type FontCat } from '../../shared/defaults';
import { FileUp, FolderOpen, Trash2, TriangleAlert } from 'lucide-react';
import { api, getState } from '../store';
import { ensureFamily, findFamily, loadSystemFonts, reportFontInstall, useFonts, type FontFamily } from '../userFonts';

export function Slider(props: {
  label: string; value: number; min: number; max: number; step?: number;
  format?: (v: number) => string; onChange: (v: number) => void; onReset?: () => void; testId?: string; extra?: ReactNode;
}) {
  const { label, value, min, max, step = 0.01, format, onChange, onReset, testId, extra } = props;
  return (
    <div className="field">
      <div className="field-row">
        <label onDoubleClick={onReset} title={onReset ? tx('Двойной клик — сбросить') : undefined}>{label}</label>
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

export function Seg<T extends string | number>(props: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; testId?: string }) {
  return (
    <div className="seg" data-testid={props.testId}>
      {props.options.map((o) => (
        <button key={String(o.value)} className={o.value === props.value ? 'active' : ''} onClick={() => props.onChange(o.value)} data-value={String(o.value)}>{o.label}</button>
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
  const title = state === 'here' ? tx('Убрать ключ в этом моменте') : tx('Поставить ключ — свойство начнёт меняться во времени');
  return (
    <button className={`key-btn ${state}`} onClick={onClick} title={title} data-testid={testId} aria-label={title}>
      <svg viewBox="0 0 12 12" aria-hidden><path d="M6 1 11 6 6 11 1 6Z" /></svg>
    </button>
  );
}

/** Выбор шрифта: поиск, группы, каждый шрифт показан самим собой. Свои шрифты (установлены в Kadro) — сверху,
 *  шрифты Windows — внизу; поставить новый — кнопкой или перетащив файл в окно. */
type PickCat = FontCat | 'all' | 'mine' | 'system';
const BUILTIN_NAMES = new Set(FONTS.map((f) => f.family.toLowerCase()));
export const systemFontsLabel = () => (navigator.userAgent.includes('Windows') ? tx('Шрифты Windows') : tx('Шрифты системы'));

export function FontPicker({ value, onChange, testId }: { value: string; onChange: (family: string) => void; testId?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<PickCat>('all');
  const user = useFonts((s) => s.user);
  const system = useFonts((s) => s.system);
  const sysLoading = useFonts((s) => s.systemLoading);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    void loadSystemFonts();
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  const needle = q.trim().toLowerCase();
  const match = (name: string) => !needle || name.toLowerCase().includes(needle);
  const userNames = new Set(user.map((f) => f.family.toLowerCase()));
  const mine = cat === 'all' || cat === 'mine' ? user.filter((f) => match(f.family)) : [];
  const sys = cat === 'all' || cat === 'system'
    ? (system ?? []).filter((f) => !BUILTIN_NAMES.has(f.family.toLowerCase()) && !userNames.has(f.family.toLowerCase()) && match(f.family)) : [];
  const builtin = cat === 'mine' || cat === 'system' ? [] : FONTS.filter((f) => (cat === 'all' || f.cat === cat) && match(f.label));
  const groups = FONT_CATS.map((c) => ({ ...c, fonts: builtin.filter((f) => f.cat === c.id) })).filter((g) => g.fonts.length);
  const label = FONTS.find((f) => f.family === value)?.label ?? value;
  const missing = !BUILTIN_NAMES.has(value.toLowerCase()) && !findFamily(value) && system !== null;
  const total = FONTS.length + user.length + (system?.filter((f) => !BUILTIN_NAMES.has(f.family.toLowerCase())).length ?? 0);
  const pick = (family: string) => { onChange(family); setOpen(false); void ensureFamily(family); };
  const remove = async (fam: FontFamily) => {
    if (await api.removeFonts(fam.files.map((f) => f.file))) getState().toast(tx('Шрифт «{0}» удалён', fam.family), 'info');
  };
  const row = (family: string, text: string, extra?: string) => (
    <button key={family} role="option" aria-selected={family === value} className={`font-row ${extra ?? ''} ${family === value ? 'active' : ''}`}
      style={{ fontFamily: `'${family}', 'Onest'` }} onClick={() => pick(family)} data-font={family}>
      {text} <span>{tx('Привет, мир')}</span>
    </button>
  );
  return (
    <div className="font-picker" ref={box}>
      <button type="button" className={`input font-picker-btn ${missing ? 'missing' : ''}`} onClick={() => setOpen(!open)} data-testid={testId} style={{ fontFamily: `'${value}', 'Onest'` }}
        aria-haspopup="listbox" aria-expanded={open} title={missing ? tx('Шрифта «{0}» нет на этом компьютере — надпись показана запасным шрифтом. Установи его: перетащи файл шрифта в окно Kadro.', value) : undefined}>
        <span>{label}</span>{missing && <TriangleAlert size={13} className="font-missing" />}<svg viewBox="0 0 12 12" aria-hidden><path d="M3 4.5 6 7.5 9 4.5" /></svg>
      </button>
      {open && (
        <div className="font-pop" role="listbox" data-testid="font-pop">
          <input className="input" autoFocus placeholder={tx('Поиск среди {0} шрифтов', total)} value={q} onChange={(e) => setQ(e.target.value)} data-testid="font-search" />
          <div className="chips">
            <button className={cat === 'all' ? 'active' : ''} onClick={() => setCat('all')}>{tx('Все')}</button>
            <button className={cat === 'mine' ? 'active' : ''} onClick={() => setCat('mine')} data-testid="font-cat-mine">{tx('Мои шрифты')}{user.length ? ` ${user.length}` : ''}</button>
            {FONT_CATS.map((c) => <button key={c.id} className={cat === c.id ? 'active' : ''} onClick={() => setCat(c.id)}>{c.label}</button>)}
            <button className={cat === 'system' ? 'active' : ''} onClick={() => setCat('system')} data-testid="font-cat-system">{systemFontsLabel()}</button>
          </div>
          <div className="font-pop-list">
            {mine.length > 0 && (
              <div data-testid="font-group-mine">
                <div className="font-pop-cat">{tx('Мои шрифты')}</div>
                {mine.map((f) => (
                  <div key={f.family} className="font-row-wrap">
                    {row(f.family, f.family, 'mine')}
                    <button className="icon-btn font-del" title={tx('Удалить шрифт «{0}» из Kadro', f.family)} onClick={() => void remove(f)} data-testid="font-remove"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            {cat === 'mine' && !user.length && <div className="hint small font-empty">{tx('Своих шрифтов пока нет. Нажми «Установить шрифт…» или перетащи файлы .ttf, .otf, .woff в окно Kadro.')}</div>}
            {groups.map((g) => (
              <div key={g.id}>
                <div className="font-pop-cat">{g.label}</div>
                {g.fonts.map((f) => row(f.family, f.label))}
              </div>
            ))}
            {(sys.length > 0 || ((cat === 'system' || cat === 'all') && sysLoading)) && (
              <div data-testid="font-group-system">
                <div className="font-pop-cat">{systemFontsLabel()}{sys.length ? ` (${sys.length})` : ''}</div>
                {sysLoading && !system && <div className="hint small">{tx('Читаю шрифты компьютера…')}</div>}
                {sys.map((f) => row(f.family, f.family, 'sys'))}
              </div>
            )}
            {!mine.length && !groups.length && !sys.length && !sysLoading && !(cat === 'mine' && !user.length) && <div className="hint small">{tx('Ничего не нашлось')}</div>}
          </div>
          <div className="font-pop-foot">
            <button className="btn small" onClick={() => void api.pickFonts().then(reportFontInstall)} data-testid="font-install"><FileUp size={13} />{tx('Установить шрифт…')}</button>
            <button className="btn ghost small" onClick={() => void api.openFontsDir()} title={tx('Папка своих шрифтов: положи туда файлы — они появятся в списке')}><FolderOpen size={13} />{tx('Папка')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
