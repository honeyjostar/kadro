// История действий (всё, что сделано в этот раз, — щелчок возвращает к любому шагу) и версии проекта (снимки по времени).
import { Clock, History as HistoryIcon, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { historyItems } from '../../shared/history';
import { tx } from '../../shared/i18n';
import type { VersionInfo } from '../../shared/versions';
import { restoreVersion, snapshotNow } from '../actions';
import { api, getState, useStore } from '../store';
import { txj } from '../txj';
import { fmtDur } from '../util';

/** Кнопка «История» на панели таймлайна и выпадающий список шагов. */
export function HistoryButton() {
  const open = useStore((s) => s.historyOpen);
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);
  const ref = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || pop.current?.contains(t)) return;
      getState().setHistoryOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') getState().setHistoryOpen(false); };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className="history-wrap" ref={ref}>
      <button className={`tool ${open ? 'on' : ''}`} title={tx('История действий: вернуться к любому шагу')} onClick={() => getState().setHistoryOpen(!open)}
        disabled={!past.length && !future.length && !open} data-testid="history">
        <HistoryIcon size={17} /><span>{tx('История')}</span>
      </button>
      {open && ref.current && createPortal(<HistoryList anchor={ref.current.getBoundingClientRect()} innerRef={pop} />, document.body)}
    </div>
  );
}

function HistoryList({ anchor, innerRef }: { anchor: DOMRect; innerRef: React.RefObject<HTMLDivElement | null> }) {
  const past = useStore((s) => s.past);
  const project = useStore((s) => s.project);
  const future = useStore((s) => s.future);
  // подписи считаются по разнице соседних состояний — только пока список открыт
  const items = useMemo(() => historyItems(past, project, future).reverse(), [past, project, future]);
  return (
    <div className="history-pop" role="dialog" aria-label={tx('История действий')} data-testid="history-list" ref={innerRef}
      style={anchor.top > 400 ? { left: anchor.left, bottom: window.innerHeight - anchor.top + 6 } : { left: anchor.left, top: anchor.bottom + 6 }}>
      <div className="history-head">{tx('История действий')}<span className="hint small">{tx('щелчок — вернуться к шагу')}</span></div>
      <ol className="history-items">
        {items.map((it) => (
          <li key={it.index}>
            <button className={`history-item ${it.current ? 'current' : ''} ${it.future ? 'future' : ''}`} onClick={() => getState().jumpHistory(it.index)}
              data-testid="history-item" aria-current={it.current ? 'step' : undefined} title={it.future ? tx('Отменённый шаг — вернуть') : undefined}>
              <span className="dot" />{it.label}{it.current && <b className="history-now">{tx('сейчас')}</b>}
            </button>
          </li>
        ))}
      </ol>
      <button className="btn ghost small block" onClick={() => getState().setVersionsOpen(true)} data-testid="versions-open"><Clock size={13} />{tx('Версии проекта по времени…')}</button>
    </div>
  );
}

function when(t: number): string {
  const d = new Date(t), now = new Date();
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return tx('сегодня {0}', hm);
  if (diff === 1) return tx('вчера {0}', hm);
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'long' })} ${hm}`;
}

/** Окно «Версии проекта»: снимки, которые Kadro сохранил сам, — открыть любой. */
export function VersionsDialog() {
  const [list, setList] = useState<VersionInfo[] | null>(null);
  const close = () => getState().setVersionsOpen(false);
  const load = async () => setList(await api.versionList(getState().project));
  useEffect(() => { void (async () => { await snapshotNow(); await load(); })(); }, []);
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal versions-modal" role="dialog" aria-label={tx('Версии проекта')} data-testid="versions-dialog">
        <div className="modal-head">
          <h3>{tx('Версии проекта')}</h3>
          <button className="icon-btn" onClick={close} title={tx('Закрыть')}><X size={17} /></button>
        </div>
        <p className="hint">{tx('Kadro сам сохраняет снимок проекта раз в несколько минут работы и при каждом сохранении. Открой любой — текущий вариант тоже останется в списке, а Ctrl+Z вернёт как было.')}</p>
        {!list ? <p className="hint">{tx('Загружаю…')}</p> : list.length === 0 ? (
          <p className="hint" data-testid="versions-empty">{tx('Версий пока нет — первая появится через пару минут работы.')}</p>
        ) : (
          <ul className="versions-list" data-testid="versions-list">
            {list.map((v, i) => (
              <li key={v.file} className="version-row" data-testid="version-row">
                <div>
                  <b>{when(v.time)}</b>{i === 0 && <span className="hint small"> · {tx('последняя')}</span>}
                  <div className="hint small">{txj('{0} · клипов: {1} · {2}', v.name, v.clips, fmtDur(v.duration))}</div>
                </div>
                <button className="btn small" onClick={() => void restoreVersion(v.file, when(v.time))} data-testid="version-open">{tx('Открыть')}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
