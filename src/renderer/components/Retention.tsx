// «Где пролистнут»: полоса над таймлайном с найденными местами (по одному, со стрелками) и красные отметки на линейке.
import { tx } from '../../shared/i18n';
import { ChevronLeft, ChevronRight, ScanEye, Wrench, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RetFix, RetIssue } from '../../shared/retention';
import { fixRetention, showRetention } from '../actions';
import { getState, useStore } from '../store';
import { fmtTime } from '../util';

const PAD = 16; // как в Timeline.tsx

export const FIX_LABEL: Record<RetFix, string> = {
  hookZoom: tx('Наезд камеры'), staticZoom: tx('Медленный зум'), louder: tx('Сделать громче'),
  trimStart: tx('Обрезать начало'), music: tx('Добавить музыку'), pauses: tx('Убрать паузы'),
};

/** Одно найденное место: текст и кнопки. */
export function RetentionItem({ i, onShow }: { i: RetIssue; onShow?: () => void }) {
  const [busy, setBusy] = useState(false);
  const fps = useStore((s) => s.project.settings.fps);
  return (
    <>
      <span className="ret-time">{fmtTime(i.t0, fps)}</span>
      <span className="ret-text" data-testid="ret-text">{i.text}</span>
      <button className="btn small" onClick={() => { showRetention(i); onShow?.(); }} data-testid="ret-show">{tx('Показать')}</button>
      {i.fix && <button className="btn small primary" disabled={busy} data-testid="ret-fix"
        onClick={() => { setBusy(true); void fixRetention(i).finally(() => setBusy(false)); }}><Wrench size={13} />{FIX_LABEL[i.fix]}</button>}
    </>
  );
}

/** Полоса над таймлайном: «Где могут пролистнуть: 2 из 3». */
export function RetentionBar() {
  const list = useStore((s) => s.retention);
  const [k, setK] = useState(0);
  useEffect(() => { setK(0); }, [list]);
  if (!list) return null;
  const close = () => getState().setRetention(null);
  if (!list.length) {
    return (
      <div className="ret-bar ok" data-testid="ret-bar">
        <ScanEye size={15} />
        <span className="ret-text" data-testid="ret-text">{tx('Слабых мест не нашёл: начало цепляет, планы меняются, звук в порядке.')}</span>
        <button className="icon-btn" onClick={close} title={tx('Скрыть')} data-testid="ret-close"><X size={15} /></button>
      </div>
    );
  }
  const i = list[Math.min(k, list.length - 1)];
  return (
    <div className="ret-bar" data-testid="ret-bar">
      <ScanEye size={15} />
      <span className="ret-count">{tx('Где пролистнут: {0} из {1}', Math.min(k, list.length - 1) + 1, list.length)}</span>
      <button className="icon-btn" disabled={k <= 0} onClick={() => { setK(k - 1); showRetention(list[k - 1]); }} title={tx('Предыдущее')} data-testid="ret-prev"><ChevronLeft size={15} /></button>
      <button className="icon-btn" disabled={k >= list.length - 1} onClick={() => { setK(k + 1); showRetention(list[k + 1]); }} title={tx('Следующее')} data-testid="ret-next"><ChevronRight size={15} /></button>
      <RetentionItem i={i} />
      <button className="icon-btn" onClick={close} title={tx('Скрыть')} data-testid="ret-close"><X size={15} /></button>
    </div>
  );
}

/** Красные отметки на линейке таймлайна. */
export function RetentionMarks({ pps }: { pps: number }) {
  const list = useStore((s) => s.retention);
  if (!list?.length) return null;
  return (
    <>
      {list.filter((i) => i.kind !== 'quiet' && i.kind !== 'noSound').map((i) => ( // на весь ролик — отметка не нужна
        <div key={i.id} className="ret-mark" data-testid="ret-mark" title={i.text}
          style={{ left: PAD + i.t0 * pps, width: Math.max(4, (i.t1 - i.t0) * pps) }}
          onPointerDown={(e) => { e.stopPropagation(); showRetention(i); }} />
      ))}
    </>
  );
}
