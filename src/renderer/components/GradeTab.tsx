// Вкладка «Цвет» → кривые, HSL по цветам, свой LUT.
import { tx } from '../../shared/i18n';
import { txj } from '../txj';
import { RotateCcw, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { HSL_BANDS, IDENTITY_CURVE, curveFn } from '../../shared/grade';
import { updateClip } from '../../shared/timeline';
import type { CurvePoint, Grade, HslBand, MediaClip } from '../../shared/types';
import { api, getState, useStore } from '../store';
import { Seg, Slider } from './controls';

type Ch = 'all' | 'r' | 'g' | 'b';
const CH_COLOR: Record<Ch, string> = { all: 'var(--text)', r: '#ff5a5a', g: '#4fd18b', b: '#5a8cff' };

function useGrade(clip: MediaClip) {
  const commit = useStore((s) => s.commit);
  const g: Grade = clip.grade ?? {};
  const set = (next: Grade, key: string) => {
    const clean: Grade = {
      curves: next.curves && Object.values(next.curves).some(Boolean) ? next.curves : undefined,
      hsl: next.hsl && Object.keys(next.hsl).length ? next.hsl : undefined,
      lut: next.lut,
    };
    const empty = !clean.curves && !clean.hsl && !clean.lut;
    commit((p) => updateClip(p, clip.id, { grade: empty ? undefined : clean }), `${key}-${clip.id}`);
  };
  return { g, set };
}

export function CurvesPanel({ clip }: { clip: MediaClip }) {
  const { g, set } = useGrade(clip);
  const [ch, setCh] = useState<Ch>('all');
  const pts = g.curves?.[ch] ?? IDENTITY_CURVE;
  const put = (next: CurvePoint[] | undefined) => set({ ...g, curves: { ...g.curves, [ch]: next } }, `curve-${ch}`);
  return (
    <>
      <Seg value={ch} onChange={setCh} options={[{ value: 'all', label: 'RGB' }, { value: 'r', label: 'R' }, { value: 'g', label: 'G' }, { value: 'b', label: 'B' }]} />
      <CurveEditor key={ch} points={pts} color={CH_COLOR[ch]} onChange={(p) => put(isIdentity(p) ? undefined : p)}
        others={(['all', 'r', 'g', 'b'] as Ch[]).filter((c) => c !== ch && g.curves?.[c]).map((c) => ({ pts: g.curves![c]!, color: CH_COLOR[c] }))} />
      <p className="hint small">{tx('Тяни точки: вверх — светлее, вниз — темнее. Двойной клик добавляет точку, двойной клик по точке — убирает.')}</p>
      <div className="row-btns">
        <button className="btn" onClick={() => put(undefined)} disabled={!g.curves?.[ch]}><RotateCcw size={14} />{tx('Сбросить канал')}</button>
        <button className="btn" onClick={() => set({ ...g, curves: undefined }, 'curves')} disabled={!g.curves}>{tx('Все кривые')}</button>
      </div>
    </>
  );
}

function isIdentity(p: CurvePoint[]): boolean {
  return p.length === 2 && p[0].x === 0 && p[0].y === 0 && p[1].x === 1 && p[1].y === 1;
}

const S = 256;
const PAD = 8;
function CurveEditor({ points, color, onChange, others }: { points: CurvePoint[]; color: string; onChange: (p: CurvePoint[]) => void; others: { pts: CurvePoint[]; color: string }[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const pts = [...points].sort((a, b) => a.x - b.x);
  const at = (e: { clientX: number; clientY: number }) => {
    const b = svg.current!.getBoundingClientRect();
    // поле 8 единиц вокруг графика — чтобы крайние точки было видно и удобно хватать
    const ux = ((e.clientX - b.left) / b.width) * (S + 2 * PAD) - PAD;
    const uy = ((e.clientY - b.top) / b.height) * (S + 2 * PAD) - PAD;
    return { x: Math.min(1, Math.max(0, ux / S)), y: Math.min(1, Math.max(0, 1 - uy / S)) };
  };
  const path = (p: CurvePoint[]) => {
    const f = curveFn(p) ?? ((x: number) => x);
    return Array.from({ length: 129 }, (_, i) => { const x = i / 128; return `${(x * S).toFixed(1)},${((1 - Math.min(1, Math.max(0, f(x)))) * S).toFixed(1)}`; }).join(' ');
  };
  return (
    <svg ref={svg} className="curve-editor" viewBox={`${-PAD} ${-PAD} ${S + 2 * PAD} ${S + 2 * PAD}`} data-testid="curve-editor"
      onPointerMove={(e) => {
        const i = drag.current;
        if (i === null) return;
        const q = at(e);
        const next = pts.map((p) => ({ ...p }));
        const lo = i === 0 ? 0 : next[i - 1].x + 0.02;
        const hi = i === next.length - 1 ? 1 : next[i + 1].x - 0.02;
        next[i] = { x: i === 0 ? 0 : i === next.length - 1 ? 1 : Math.min(hi, Math.max(lo, q.x)), y: Math.round(q.y * 1000) / 1000 };
        onChange(next);
      }}
      onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}
      onDoubleClick={(e) => {
        if ((e.target as Element).tagName === 'circle') return;
        const q = at(e);
        const f = curveFn(pts) ?? ((x: number) => x);
        if (pts.some((p) => Math.abs(p.x - q.x) < 0.03)) return;
        onChange([...pts, { x: q.x, y: Math.min(1, Math.max(0, f(q.x))) }].sort((a, b) => a.x - b.x));
      }}>
      <rect x={0} y={0} width={S} height={S} className="frame" />
      {[0.25, 0.5, 0.75].map((v) => (
        <g key={v} className="grid"><line x1={v * S} x2={v * S} y1={0} y2={S} /><line y1={v * S} y2={v * S} x1={0} x2={S} /></g>
      ))}
      <line x1={0} y1={S} x2={S} y2={0} className="diag" />
      {others.map((o, i) => <polyline key={i} points={path(o.pts)} className="other" style={{ stroke: o.color }} />)}
      <polyline points={path(pts)} className="curve" style={{ stroke: color }} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x * S} cy={(1 - p.y) * S} r={6} style={{ stroke: color }} data-testid={`curve-pt-${i}`}
          onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = i; }}
          onDoubleClick={() => { if (i > 0 && i < pts.length - 1) onChange(pts.filter((_, j) => j !== i)); }} />
      ))}
    </svg>
  );
}

export function HslPanel({ clip }: { clip: MediaClip }) {
  const { g, set } = useGrade(clip);
  const [band, setBand] = useState<HslBand>('red');
  const a = g.hsl?.[band] ?? { h: 0, s: 0, l: 0 };
  const put = (patch: Partial<{ h: number; s: number; l: number }>) => {
    const v = { ...a, ...patch };
    const hsl = { ...g.hsl };
    if (Math.abs(v.h) < 1e-3 && Math.abs(v.s) < 1e-3 && Math.abs(v.l) < 1e-3) delete hsl[band];
    else hsl[band] = v;
    set({ ...g, hsl }, `hsl-${band}`);
  };
  const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;
  return (
    <>
      <div className="hsl-bands">
        {HSL_BANDS.map((b) => {
          const changed = !!g.hsl?.[b.id];
          return (
            <button key={b.id} className={`hsl-dot ${band === b.id ? 'active' : ''} ${changed ? 'changed' : ''}`} style={{ background: b.color }}
              title={b.label} aria-label={b.label} onClick={() => setBand(b.id)} data-testid={`hsl-${b.id}`} />
          );
        })}
      </div>
      <p className="hint small" style={{ marginBottom: 4 }}>{txj('{0}: меняются только эти оттенки в кадре.', HSL_BANDS.find((b) => b.id === band)!.label)}</p>
      <Slider label={tx('Оттенок')} min={-1} max={1} value={a.h} format={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 30)}°`} testId="hsl-h"
        onChange={(v) => put({ h: v })} onReset={() => put({ h: 0 })} />
      <Slider label={tx('Насыщенность')} min={-1} max={1} value={a.s} format={pct} testId="hsl-s"
        onChange={(v) => put({ s: v })} onReset={() => put({ s: 0 })} />
      <Slider label={tx('Яркость')} min={-1} max={1} value={a.l} format={pct} testId="hsl-l"
        onChange={(v) => put({ l: v })} onReset={() => put({ l: 0 })} />
      <button className="btn block" disabled={!g.hsl} onClick={() => set({ ...g, hsl: undefined }, 'hsl')}><RotateCcw size={14} />{tx('Сбросить все цвета')}</button>
    </>
  );
}

export function LutPanel({ clip }: { clip: MediaClip }) {
  const { g, set } = useGrade(clip);
  const [list, setList] = useState<{ path: string; name: string }[]>([]);
  const refresh = () => void api.listLuts().then(setList);
  useEffect(refresh, []);
  const load = async () => {
    const r = await api.pickLut();
    if (!r) return;
    if ('error' in r) { getState().toast(tx('LUT не загрузился: {0}', r.error), 'err'); return; }
    set({ ...g, lut: { path: r.path, name: r.name, amount: g.lut?.amount ?? 1 } }, 'lut');
    refresh();
  };
  const cur = g.lut;
  const opts = cur && !list.some((l) => l.path === cur.path) ? [...list, { path: cur.path, name: cur.name }] : list;
  return (
    <>
      <p className="hint">{tx('LUT — готовая «цветовая таблица» из Premiere, DaVinci или от колористов (файл .cube).')}</p>
      <button className="btn block" onClick={() => void load()} data-testid="lut-load" style={{ marginTop: 10 }}><Upload size={14} />{tx('Загрузить .cube')}</button>
      {opts.length > 0 && (
        <select className="input" style={{ width: '100%', marginTop: 10 }} value={cur?.path ?? ''} data-testid="lut-select"
          onChange={(e) => {
            const l = opts.find((x) => x.path === e.target.value);
            set({ ...g, lut: l ? { path: l.path, name: l.name, amount: cur?.amount ?? 1 } : undefined }, 'lut');
          }}>
          <option value="">{tx('Без LUT')}</option>
          {opts.map((l) => <option key={l.path} value={l.path}>{l.name}</option>)}
        </select>
      )}
      {cur && (
        <Slider label={tx('Сила')} min={0} max={1} value={cur.amount} format={(v) => `${Math.round(v * 100)}%`} testId="lut-amount"
          extra={<button className="icon-btn" style={{ width: 22, height: 22 }} title={tx('Убрать LUT')} onClick={() => set({ ...g, lut: undefined }, 'lut')}><X size={13} /></button>}
          onChange={(v) => set({ ...g, lut: { ...cur, amount: v } }, 'lutamt')} onReset={() => set({ ...g, lut: { ...cur, amount: 1 } }, 'lutamt')} />
      )}
    </>
  );
}
