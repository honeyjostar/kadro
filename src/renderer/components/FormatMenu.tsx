// Формат кадра под плеером — как «Соотношение сторон» в CapCut: кнопка с текущим форматом, по нажатию —
// плитки форматов, «как у видео», фон за видео, разрешение и частота кадров проекта. Меняется на лету.
import { ChevronDown, Film } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ASPECTS, FPS_LIST, RESOLUTIONS, shortSideOf, sizeFor } from '../../shared/defaults';
import { setSettings, updateClip } from '../../shared/timeline';
import type { AspectKey, ProjectSettings } from '../../shared/types';
import { aspectFor } from '../actions';
import { getState, useStore } from '../store';
import { Seg } from './controls';

const WHERE: Record<AspectKey, string> = {
  '9:16': 'TikTok, Reels', '16:9': 'YouTube', '1:1': 'Квадрат', '4:5': 'Instagram',
  '3:4': 'Портрет', '4:3': 'Старое ТВ', '21:9': 'Кино',
};

function Frame({ a, size = 22 }: { a: AspectKey; size?: number }) {
  const { w, h } = ASPECTS[a];
  const k = size / Math.max(w, h);
  return <span className="aspect-icon" style={{ width: Math.round(w * k), height: Math.round(h * k) }} />;
}

export function FormatMenu() {
  const settings = useStore((s) => s.project.settings);
  // «как у видео» — по первому видео или фото на основной дорожке
  const original = useStore((s) => {
    const main = s.project.tracks.find((t) => t.kind === 'main');
    for (const c of main?.clips ?? []) {
      if (c.type !== 'media') continue;
      const a = s.project.assets.find((x) => x.id === c.assetId);
      if (a && a.kind !== 'audio' && a.width && a.height) return aspectFor(a.width, a.height);
    }
    return null;
  });
  // как вписаны клипы основной дорожки: все «Заполнить» — cover, иначе contain
  const fit = useStore((s) => {
    const cl = (s.project.tracks.find((t) => t.kind === 'main')?.clips ?? []).filter((c) => c.type === 'media');
    return cl.length && cl.every((c) => c.type === 'media' && c.fit === 'cover') ? 'cover' : 'contain';
  });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // окно над кнопкой — не выше верха окна программы (иначе прокрутка внутри)
  const [maxH, setMaxH] = useState(560);
  useLayoutEffect(() => {
    if (open && ref.current) setMaxH(Math.max(220, ref.current.getBoundingClientRect().top - 16));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); };
  }, [open]);

  const set = (patch: Partial<ProjectSettings>) => getState().commit((p) => setSettings(p, patch));
  const short = shortSideOf(settings);
  // смена формата сохраняет разрешение (1080p остаётся 1080p)
  const pick = (a: AspectKey) => set({ aspect: a, ...sizeFor(a, short) });
  const setShort = (v: number) => set(sizeFor(settings.aspect, v));
  const fitAll = (v: 'contain' | 'cover') => getState().commit((p) => {
    let q = p;
    for (const c of p.tracks.find((t) => t.kind === 'main')?.clips ?? []) if (c.type === 'media') q = updateClip(q, c.id, { fit: v });
    return q;
  });

  return (
    <div className="format-menu" ref={ref}>
      <button className={`btn small format-btn ${open ? 'active' : ''}`} onClick={() => setOpen(!open)} title="Формат кадра: соотношение сторон и фон"
        aria-expanded={open} data-testid="aspect">
        <Frame a={settings.aspect} size={14} /><b>{settings.aspect}</b><span className="format-res">{RESOLUTIONS.find((r) => r.short === short)?.label}</span><ChevronDown size={13} />
      </button>
      {open && (
        <div className="format-pop" role="dialog" aria-label="Формат кадра" data-testid="format-pop" style={{ maxHeight: maxH }}>
          <div className="format-title">Формат кадра</div>
          {original && (
            <button className={`format-orig ${settings.aspect === original ? 'active' : ''}`} onClick={() => pick(original)} data-testid="aspect-original">
              <Film size={15} /><span>Как у видео</span><em>{original}</em>
            </button>
          )}
          <div className="format-grid">
            {(Object.keys(ASPECTS) as AspectKey[]).map((a) => (
              <button key={a} className={`format-tile ${settings.aspect === a ? 'active' : ''}`} onClick={() => pick(a)}
                title={ASPECTS[a].label} data-testid={`fmt-${a.replace(':', '-')}`}>
                <span className="format-frame"><Frame a={a} /></span>
                <b>{a}</b>
                <span className="format-where">{WHERE[a]}</span>
              </button>
            ))}
          </div>
          <div className="format-title">Фон за видео</div>
          <Seg value={settings.background} onChange={(v) => set({ background: v })} options={[
            { value: 'black', label: 'Чёрный' }, { value: 'blur', label: 'Размытие' }, { value: 'white', label: 'Белый' },
          ]} />
          <div className="format-title format-row">Разрешение<span>{settings.width}×{settings.height}</span></div>
          <Seg value={short} onChange={setShort} options={RESOLUTIONS.map((r) => ({ value: r.short, label: r.label }))} />
          <div className="format-title">Кадров в секунду</div>
          <Seg value={settings.fps} onChange={(v) => set({ fps: v })} options={FPS_LIST.map((f) => ({ value: f as number, label: String(f) }))} />
          <div className="format-title">Клипы основной дорожки</div>
          <Seg value={fit} onChange={fitAll} options={[{ value: 'contain', label: 'Целиком, с фоном' }, { value: 'cover', label: 'Заполнить кадр' }]} />
          <p className="hint small">«Целиком» — видео другого формата видно полностью, по краям фон. «Заполнить» — без полос, края обрезаются. Разрешение и частота — значения для экспорта по умолчанию.</p>
        </div>
      )}
    </div>
  );
}
