// Маркеры на линейке таймлайна: щелчок — перейти, двойной щелчок — переименовать, потянуть — сдвинуть,
// правая кнопка — цвет, главы для YouTube, удалить. Ставятся клавишей M там, где линия времени.
import { tx } from '../../shared/i18n';
import { Bookmark, ClipboardList, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MARKER_COLORS, addMarker, clearMarkers, markerCss, markersOf, removeMarker, updateMarker } from '../../shared/markers';
import { snapFrame } from '../../shared/timeline';
import type { Marker } from '../../shared/types';
import { copyChapters } from '../actions';
import { getState, useStore } from '../store';
import { fmtTime } from '../util';
import { useMenu, type MenuEntry } from './Menu';

const PAD = 16; // как в Timeline.tsx
const xOf = (t: number, pps: number) => PAD + t * pps;

const colorItems = (m: Marker): MenuEntry[] => MARKER_COLORS.map((c) => ({
  label: c.label,
  icon: <span className="mk-dot" style={{ background: c.css }} />,
  hint: m.color === c.id ? '✓' : undefined,
  onClick: () => getState().commit((p) => updateMarker(p, m.id, { color: c.id })),
  testId: `mk-color-${c.id}`,
}));

/** Пункты меню линейки (правая кнопка по пустому месту): поставить маркер, главы, удалить все. */
export function rulerMenuItems(t: number): MenuEntry[] {
  const has = markersOf(getState().project).length > 0;
  return [
    { label: tx('Поставить маркер здесь'), icon: <Bookmark size={14} />, hint: tx('M — у линии времени'), onClick: () => getState().commit((p) => addMarker(p, t).project), testId: 'ruler-add-marker' },
    { label: tx('Скопировать главы для YouTube'), icon: <ClipboardList size={14} />, disabled: !has, onClick: () => void copyChapters(), testId: 'ruler-chapters' },
    'sep',
    { label: tx('Удалить все маркеры'), icon: <Trash2 size={14} />, danger: true, disabled: !has, onClick: () => getState().commit(clearMarkers), testId: 'ruler-clear-markers' },
  ];
}

export function MarkerLayer({ pps, timeAt }: { pps: number; timeAt: (clientX: number) => number }) {
  const markers = useStore((s) => s.project.markers);
  const fps = useStore((s) => s.project.settings.fps);
  const [drag, setDrag] = useState<{ id: string; t: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const menu = useMenu();
  const list = markers ?? [];

  const onDown = (e: React.PointerEvent, m: Marker) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (editing) return;
    const x0 = e.clientX;
    let moved = false;
    let t = m.t;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - x0) < 4) return;
      moved = true;
      t = snapFrame(timeAt(ev.clientX), fps);
      setDrag({ id: m.id, t });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      const s = getState();
      if (moved) s.commit((p) => updateMarker(p, m.id, { t }));
      else { s.setPlaying(false); s.setPlayhead(m.t); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onMenu = (e: React.MouseEvent, m: Marker) => menu.open(e, [
    { label: tx('Переименовать'), icon: <Pencil size={14} />, hint: tx('двойной щелчок'), onClick: () => setEditing(m.id), testId: 'mk-rename' },
    'sep',
    ...colorItems(m),
    'sep',
    { label: tx('Скопировать главы для YouTube'), icon: <ClipboardList size={14} />, onClick: () => void copyChapters(), testId: 'mk-chapters' },
    { label: tx('Удалить маркер'), icon: <Trash2 size={14} />, danger: true, onClick: () => getState().commit((p) => removeMarker(p, m.id)), testId: 'mk-delete' },
  ]);

  return (
    <>
      {list.map((m, i) => {
        const t = drag?.id === m.id ? drag.t : m.t;
        const next = list[i + 1];
        // подпись не наезжает на следующий маркер
        const room = next ? Math.max(0, (next.t - m.t) * pps - 18) : 160;
        return (
          <div key={m.id} className={`marker ${drag?.id === m.id ? 'drag' : ''}`} style={{ left: xOf(t, pps), ['--mk' as string]: markerCss(m.color) }}
            data-testid="marker" data-id={m.id}
            title={tx('{0} · {1}\nЩелчок — перейти, двойной — переименовать, потянуть — сдвинуть, правая кнопка — цвет и главы', m.label, fmtTime(m.t, fps, true))}
            onPointerDown={(e) => onDown(e, m)} onDoubleClick={(e) => { e.stopPropagation(); setEditing(m.id); }}
            onContextMenu={(e) => onMenu(e, m)}>
            <span className="mk-flag" />
            {editing === m.id
              ? <MarkerInput m={m} onDone={() => setEditing(null)} />
              : room > 14 && <span className="mk-label" style={{ maxWidth: room }}>{m.label}</span>}
          </div>
        );
      })}
      {menu.node}
    </>
  );
}

function MarkerInput({ m, onDone }: { m: Marker; onDone: () => void }) {
  const [v, setV] = useState(m.label);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  const save = () => { if (v.trim() && v !== m.label) getState().commit((p) => updateMarker(p, m.id, { label: v })); onDone(); };
  return (
    <input ref={ref} className="mk-input" value={v} autoFocus maxLength={100} data-testid="marker-input"
      onPointerDown={(e) => e.stopPropagation()} onChange={(e) => setV(e.target.value)} onBlur={save}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone(); }} />
  );
}
