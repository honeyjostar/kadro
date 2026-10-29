// Окно «Ластик для хромакея»: кадр клипа с уже убранным фоном, на нём кистью — стереть то, что хромакей
// оставил (стойки, края зелёного полотна, тени), или вернуть то, что он съел (зелёная одежда, блики).
// Кисть действует на весь клип: это карта во весь кадр, одна на всё время клипа (как «мусорная маска»).
import { Eraser, Paintbrush, Trash2, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { tx } from '../../shared/i18n';
import { clipDuration, findClip, sourceTimeAt, updateClip } from '../../shared/timeline';
import type { MediaAsset, MediaClip } from '../../shared/types';
import { ChromaKeyer } from '../engine/chroma';
import { api, getState, useStore } from '../store';
import { Seg, Slider } from './controls';

type Tool = 'erase' | 'restore';
type View = 'result' | 'map';
const MAX_SIDE = 1280;
// один на все открытия окна: у браузера мало контекстов WebGL, лишние отнимают их у плеера
let sharedKeyer: ChromaKeyer | null = null;
const NEUTRAL = 128;

/** Размер карты кисти для кадра w×h: длинная сторона не больше 1280. */
export function paintSize(w: number, h: number): { w: number; h: number } {
  const k = Math.min(1, MAX_SIDE / Math.max(1, w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Карта нетронута (везде 128) — кисть не нужна. */
function untouched(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 0; i < d.length; i += 4) if (d[i] !== NEUTRAL) return false;
  return true;
}

export function ChromaPaintDialog({ clipId }: { clipId: string }) {
  const project = useStore((s) => s.project);
  const playhead = useStore((s) => s.playhead);
  const found = findClip(project, clipId);
  const clip = found?.clip.type === 'media' ? (found.clip as MediaClip) : null;
  const asset = clip ? (project.assets.find((a) => a.id === clip.assetId) as MediaAsset | undefined) : undefined;
  const close = () => getState().setChromaPaintClip(null);

  const [tool, setTool] = useState<Tool>('erase');
  const [size, setSize] = useState(0.06);    // доля ширины кадра
  const [soft, setSoft] = useState(0.5);
  const [view, setView] = useState<View>('result');
  const [t, setT] = useState(() => (clip ? Math.min(Math.max(playhead, clip.start), clip.start + clipDuration(clip) - 0.01) : 0));
  const [ver, setVer] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [busy, setBusy] = useState(false);

  const view$ = useRef<HTMLCanvasElement>(null);
  const cursor$ = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLVideoElement | HTMLImageElement | null>(null);
  const [frameOk, setFrameOk] = useState(false);
  const keyer = useMemo(() => (sharedKeyer ??= new ChromaKeyer()), []);
  const dims = useMemo(() => paintSize(asset?.width || 1280, asset?.height || 720), [asset?.width, asset?.height]);
  const paint = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = dims.w; c.height = dims.h;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.fillStyle = `rgb(${NEUTRAL},${NEUTRAL},${NEUTRAL})`;
    x.fillRect(0, 0, dims.w, dims.h);
    return c;
  }, [dims.w, dims.h]);
  const pctx = () => paint.getContext('2d', { willReadFrequently: true })!;
  const undo = useRef<ImageData[]>([]);
  const frameCanvas = useMemo(() => document.createElement('canvas'), []);

  // прежняя карта клипа — в холст кисти
  useEffect(() => {
    const p = clip?.chroma?.paint;
    if (!p) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { pctx().drawImage(img, 0, 0, dims.w, dims.h); setVer((v) => v + 1); };
    img.src = api.mediaUrl(p.path);
  }, []);

  // кадр клипа в момент t
  useEffect(() => {
    if (!asset) return;
    if (asset.kind === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { frame.current = img; setFrameOk(true); setVer((v) => v + 1); };
      img.src = api.mediaUrl(asset.previewPath || asset.path);
      return;
    }
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true; v.crossOrigin = 'anonymous';
    v.src = api.mediaUrl(asset.previewPath || asset.path);
    v.addEventListener('seeked', () => { frame.current = v; setFrameOk(true); setVer((n) => n + 1); });
    v.addEventListener('loadeddata', () => { v.currentTime = clip ? sourceTimeAt(clip, t) : 0; }, { once: true });
    frame.current = null;
    return () => { v.removeAttribute('src'); v.load(); };
  }, [asset?.id]);
  useEffect(() => {
    const v = frame.current;
    if (v instanceof HTMLVideoElement && clip && v.readyState >= 1) v.currentTime = Math.max(0, sourceTimeAt(clip, t));
  }, [t]);

  // нарисовать: результат (шахматка + кадр без фона) или карту (кадр притушен, стёртое — красным, возвращённое — зелёным)
  useEffect(() => {
    const cv = view$.current;
    const src = frame.current;
    if (!cv || !src || !clip?.chroma) return;
    let raf = requestAnimationFrame(() => {
      raf = 0;
      if (cv.width !== dims.w || cv.height !== dims.h) { cv.width = dims.w; cv.height = dims.h; }
      const ctx = cv.getContext('2d')!;
      ctx.clearRect(0, 0, dims.w, dims.h);
      // кадр — в холст нужного размера (видео может быть любого)
      if (frameCanvas.width !== dims.w || frameCanvas.height !== dims.h) { frameCanvas.width = dims.w; frameCanvas.height = dims.h; }
      const fc = frameCanvas.getContext('2d')!;
      fc.drawImage(src, 0, 0, dims.w, dims.h);
      if (view === 'result') {
        const out = keyer.process(frameCanvas, dims.w, dims.h, clip.chroma!, paint, ver);
        if (out) ctx.drawImage(out, 0, 0);
      } else {
        ctx.globalAlpha = 0.45;
        ctx.drawImage(frameCanvas, 0, 0);
        ctx.globalAlpha = 1;
        const m = pctx().getImageData(0, 0, dims.w, dims.h);
        const d = m.data;
        for (let i = 0; i < d.length; i += 4) {
          const v = d[i];
          if (v < NEUTRAL) { d[i] = 255; d[i + 1] = 40; d[i + 2] = 60; d[i + 3] = Math.round(((NEUTRAL - v) / NEUTRAL) * 200); }
          else if (v > NEUTRAL) { d[i] = 40; d[i + 1] = 220; d[i + 2] = 120; d[i + 3] = Math.round(((v - NEUTRAL) / 127) * 200); }
          else d[i + 3] = 0;
        }
        const tmp = document.createElement('canvas');
        tmp.width = dims.w; tmp.height = dims.h;
        tmp.getContext('2d')!.putImageData(m, 0, 0);
        ctx.drawImage(tmp, 0, 0);
      }
    });
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [ver, view, frameOk, clip?.chroma?.color, clip?.chroma?.similarity, clip?.chroma?.smoothness]);

  // кисть
  const radius = () => Math.max(1, size * dims.w / 2);
  const stamp = (x: number, y: number) => {
    const ctx = pctx();
    const r = radius();
    const col = tool === 'erase' ? '0,0,0' : '255,255,255';
    const g = ctx.createRadialGradient(x, y, r * (1 - soft) * 0.999, x, y, r);
    g.addColorStop(0, `rgba(${col},1)`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const toMask = (e: React.PointerEvent | PointerEvent) => {
    const r = view$.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * dims.w, y: ((e.clientY - r.top) / r.height) * dims.h };
  };
  const last = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    undo.current.push(pctx().getImageData(0, 0, dims.w, dims.h));
    if (undo.current.length > 25) undo.current.shift();
    setCanUndo(true);
    const p = toMask(e);
    last.current = p;
    stamp(p.x, p.y);
    setVer((v) => v + 1);
  };
  const moveCursor = (e: React.PointerEvent) => {
    const el = cursor$.current;
    const cv = view$.current;
    if (!el || !cv) return;
    const r = cv.getBoundingClientRect();
    const d = (radius() * 2 * r.width) / dims.w;
    el.style.width = el.style.height = `${d}px`;
    el.style.transform = `translate(${e.clientX - r.left - d / 2}px, ${e.clientY - r.top - d / 2}px)`;
    el.style.opacity = '1';
  };
  const onMove = (e: React.PointerEvent) => {
    moveCursor(e);
    if (!last.current) return;
    const p = toMask(e);
    const a = last.current;
    const step = Math.max(1, radius() * 0.25);
    const n = Math.max(1, Math.ceil(Math.hypot(p.x - a.x, p.y - a.y) / step));
    for (let i = 1; i <= n; i++) stamp(a.x + ((p.x - a.x) * i) / n, a.y + ((p.y - a.y) * i) / n);
    last.current = p;
    setVer((v) => v + 1);
  };
  const onUp = () => { last.current = null; };
  const doUndo = () => {
    const prev = undo.current.pop();
    if (prev) { pctx().putImageData(prev, 0, 0); setVer((v) => v + 1); }
    setCanUndo(undo.current.length > 0);
  };
  const clearAll = () => {
    undo.current.push(pctx().getImageData(0, 0, dims.w, dims.h));
    setCanUndo(true);
    const x = pctx();
    x.fillStyle = `rgb(${NEUTRAL},${NEUTRAL},${NEUTRAL})`;
    x.fillRect(0, 0, dims.w, dims.h);
    setVer((v) => v + 1);
  };

  const done = async () => {
    if (!clip?.chroma || busy) return;
    setBusy(true);
    try {
      if (untouched(pctx(), dims.w, dims.h)) {
        if (clip.chroma.paint) getState().commit((p) => updateClip(p, clip.id, { chroma: { ...clip.chroma!, paint: undefined } }));
        close();
        return;
      }
      const blob = await new Promise<Blob | null>((res) => paint.toBlob(res, 'image/png'));
      if (!blob) throw new Error(tx('не удалось сохранить карту кисти'));
      const file = await api.saveChromaPaint(new Uint8Array(await blob.arrayBuffer()));
      getState().commit((p) => updateClip(p, clip.id, { chroma: { ...clip.chroma!, paint: { path: file, w: dims.w, h: dims.h } } }));
      getState().toast(tx('Кисть хромакея применена ко всему клипу. Отменить — Ctrl+Z'), 'ok');
      close();
    } catch (e) {
      getState().toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  // клавиши окна: перехватываем раньше приложения (Ctrl+Z здесь — отмена штриха, а не правки проекта)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); return; }
      if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); void done(); return; }
      if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'я' || e.code === 'KeyZ')) { e.stopPropagation(); e.preventDefault(); doUndo(); return; }
      if (e.code === 'BracketLeft') { e.stopPropagation(); setSize((s) => Math.max(0.01, s / 1.25)); return; }
      if (e.code === 'BracketRight') { e.stopPropagation(); setSize((s) => Math.min(0.4, s * 1.25)); return; }
      if (e.code === 'KeyE') { e.stopPropagation(); setTool('erase'); return; }
      if (e.code === 'KeyR') { e.stopPropagation(); setTool('restore'); return; }
      e.stopPropagation(); // остальные клавиши (пробел, Delete, стрелки…) — не в монтаж под окном
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!clip || !asset || !clip.chroma) return null;
  const D = clipDuration(clip);
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal cpaint-modal" role="dialog" aria-label={tx('Ластик для хромакея')} data-testid="chroma-paint-dialog">
        <div className="modal-head">
          <h3><Eraser size={17} />{tx('Ластик для хромакея')}</h3>
          <button className="icon-btn" onClick={close} title={tx('Закрыть')}><X size={17} /></button>
        </div>
        <p className="hint">{tx('Сотри то, что хромакей оставил (стойки, края полотна, тени), или верни то, что он съел (зелёная одежда, блики). Кисть действует на весь клип — проверь другие моменты ползунком «Кадр».')}</p>
        <div className="cpaint-body">
          <div className="cpaint-stage" style={{ aspectRatio: `${dims.w} / ${dims.h}`, width: `min(100%, calc(62vh * ${(dims.w / dims.h).toFixed(4)}))` }}
            onPointerLeave={() => { if (cursor$.current) cursor$.current.style.opacity = '0'; }}>
            <canvas ref={view$} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} data-testid="chroma-paint-canvas" />
            <div ref={cursor$} className={`cpaint-cursor ${tool}`} aria-hidden />
            {!frameOk && <span className="cpaint-wait">{tx('Загружаю кадр…')}</span>}
          </div>
          <div className="cpaint-tools">
            <Seg value={tool} onChange={setTool} options={[
              { value: 'erase', label: <><Eraser size={13} />{tx('Стереть')}</> },
              { value: 'restore', label: <><Paintbrush size={13} />{tx('Вернуть')}</> },
            ]} />
            <Slider label={tx('Размер кисти')} min={0.01} max={0.4} step={0.005} value={size} format={(v) => `${Math.round(v * 100)}%`} onChange={setSize} testId="chroma-paint-size" />
            <Slider label={tx('Мягкость края')} min={0} max={1} step={0.05} value={soft} format={(v) => `${Math.round(v * 100)}%`} onChange={setSoft} />
            <Seg value={view} onChange={setView} options={[{ value: 'result', label: tx('Результат') }, { value: 'map', label: tx('Где кисть') }]} />
            {D > 0.05 && asset.kind !== 'image' && (
              <Slider label={tx('Кадр')} min={clip.start} max={clip.start + D - 0.01} step={0.01} value={t} format={(v) => `${(v - clip.start).toFixed(1)} ${tx('с')}`} onChange={setT} testId="chroma-paint-time" />
            )}
            <div className="cpaint-row">
              <button className="btn small" onClick={doUndo} disabled={!canUndo} title={tx('Отменить штрих (Ctrl+Z)')}><Undo2 size={13} />{tx('Отменить')}</button>
              <button className="btn ghost small" onClick={clearAll} data-testid="chroma-paint-clear-all"><Trash2 size={13} />{tx('Очистить')}</button>
            </div>
            <p className="hint small">{tx('[ и ] — размер кисти, E — стереть, R — вернуть.')}</p>
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={close}>{tx('Отмена')}</button>
          <button className="btn primary" onClick={() => void done()} disabled={busy} data-testid="chroma-paint-done">{tx('Готово')}</button>
        </div>
      </div>
    </div>
  );
}
