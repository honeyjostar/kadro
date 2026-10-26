// Контекстное меню (правая кнопка мыши или кнопка «⋯»): список действий у курсора, закрывается щелчком мимо,
// Esc, прокруткой или выбором пункта.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  testId?: string;
}
export type MenuEntry = MenuItem | 'sep';

interface Open { x: number; y: number; items: MenuEntry[] }

export function useMenu(): { open: (e: React.MouseEvent, items: MenuEntry[]) => void; node: ReactNode } {
  const [m, setM] = useState<Open | null>(null);
  const open = (e: React.MouseEvent, items: MenuEntry[]) => {
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // по правой кнопке — у курсора, по кнопке «⋯» — под ней
    const atPointer = e.type === 'contextmenu';
    setM({ x: atPointer ? e.clientX : r.left, y: atPointer ? e.clientY : r.bottom + 4, items });
  };
  return { open, node: m ? <MenuPop {...m} onClose={() => setM(null)} /> : null };
}

function MenuPop({ x, y, items, onClose }: Open & { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setPos({ x: Math.max(6, Math.min(x, window.innerWidth - w - 6)), y: Math.max(6, y + h > window.innerHeight - 6 ? y - h : y) });
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [x, y]);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const bs = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const i = bs.indexOf(document.activeElement as HTMLButtonElement);
        bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus();
      }
    };
    const close = () => onClose();
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('wheel', close);
      window.removeEventListener('blur', close);
    };
  }, [onClose]);
  return createPortal(
    <div className="ctx-menu" ref={ref} role="menu" style={{ left: pos.x, top: pos.y }} data-testid="ctx-menu"
      onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => it === 'sep'
        ? <div key={`s${i}`} className="ctx-sep" role="separator" />
        : (
          <button key={it.label} role="menuitem" className={it.danger ? 'danger' : ''} disabled={it.disabled} data-testid={it.testId}
            onClick={() => { onClose(); it.onClick(); }}>
            <span className="ctx-icon">{it.icon}</span>
            <span className="ctx-label">{it.label}</span>
            {it.hint && <span className="ctx-hint">{it.hint}</span>}
          </button>
        ))}
    </div>,
    document.body,
  );
}
