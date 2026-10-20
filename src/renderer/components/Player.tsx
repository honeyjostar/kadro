import { Maximize2, Pause, Play, SkipBack, SkipForward, Upload } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ASPECTS } from '../../shared/defaults';
import { placeOnCanvas } from '../../shared/geometry';
import { mediaPropsAt } from '../../shared/anim';
import { textBounds } from '../../shared/textRender';
import { propValue, writeProps } from '../animEdit';
import { activeClipsAt, projectDuration, setSettings, updateClip } from '../../shared/timeline';
import type { AspectKey, Clip, MediaClip, Project, TextClip } from '../../shared/types';
import { pickAndImport } from '../actions';
import { PreviewEngine } from '../engine/preview';
import { api, getState, useStore } from '../store';
import { fmtTime } from '../util';

interface Box { id: string; cx: number; cy: number; w: number; h: number; rot: number; kind: 'media' | 'text' }

const measure = document.createElement('canvas').getContext('2d')!;

/** Рамка клипа в координатах окна просмотра в момент t (с учётом анимации). */
function boxOf(p: Project, c: Clip, W: number, H: number, t: number): Box | null {
  if (c.type === 'text') {
    const b = textBounds(measure, c, W, H, t - c.start);
    return { id: c.id, cx: b.cx, cy: b.cy, w: b.w, h: b.h, rot: b.rotation, kind: 'text' };
  }
  const a = p.assets.find((x) => x.id === c.assetId);
  if (!a || a.kind === 'audio') return null;
  const mp = mediaPropsAt(c, t);
  const pl = placeOnCanvas(W, H, a.width, a.height, c.fit, { x: mp.x, y: mp.y, scale: mp.scale, rotation: mp.rotation });
  return { id: c.id, cx: pl.cx, cy: pl.cy, w: pl.w, h: pl.h, rot: pl.rotation, kind: 'media' };
}

function inside(b: Box, x: number, y: number): boolean {
  const r = (-b.rot * Math.PI) / 180;
  const dx = x - b.cx;
  const dy = y - b.cy;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2;
}

export function Player() {
  const project = useStore((s) => s.project);
  const playing = useStore((s) => s.playing);
  const playhead = useStore((s) => s.playhead);
  const selection = useStore((s) => s.selection);
  const recording = useStore((s) => s.recording);
  const areaRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PreviewEngine | null>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const [fontsTick, setFontsTick] = useState(0);
  const { width: PW, height: PH, aspect } = project.settings;
  const duration = projectDuration(project);

  // движок превью живёт всё время работы окна
  useEffect(() => {
    const eng = new PreviewEngine(canvasRef.current!, api.mediaUrl, api.readLut);
    engineRef.current = eng;
    (window as unknown as { __kadroEngine: PreviewEngine }).__kadroEngine = eng;
    eng.onTime = (t) => getState().setPlayhead(t);
    eng.onEnded = () => getState().setPlaying(false);
    eng.setProject(getState().project);
    eng.seek(getState().playhead);
    const unsub = useStore.subscribe((s, prev) => {
      if (s.project !== prev.project) eng.setProject(s.project);
      if (s.playing !== prev.playing) {
        if (s.playing) {
          if (projectDuration(s.project) <= 0) queueMicrotask(() => getState().setPlaying(false));
          else void eng.play(s.playhead);
        } else eng.pause();
      }
      if (s.playhead !== prev.playhead && Math.abs(s.playhead - eng.time) > 1e-3) eng.seek(s.playhead);
      if (s.recording !== prev.recording) eng.setMuted(!!s.recording?.muted);
    });
    document.fonts.addEventListener('loadingdone', () => { setFontsTick((n) => n + 1); eng.setProject(getState().project); });
    return () => { unsub(); eng.destroy(); };
  }, []);

  useLayoutEffect(() => {
    const el = areaRef.current!;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setArea({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // размер кадра в окне: вписываем пропорции проекта
  const k = PW / PH;
  const availW = Math.max(40, area.w - 28);
  const availH = Math.max(40, area.h - 28);
  const dispW = Math.floor(Math.min(availW, availH * k));
  const dispH = Math.floor(dispW / k);

  useEffect(() => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let cw = dispW * dpr;
    let ch = dispH * dpr;
    const short = Math.min(cw, ch);
    if (short > 1080) { cw = (cw * 1080) / short; ch = (ch * 1080) / short; }
    engineRef.current?.setSize(cw, ch);
  }, [dispW, dispH]);

  // рамка выделенного клипа, если он виден в текущий момент
  const box = useMemo(() => {
    void fontsTick;
    if (selection.length !== 1 || !dispW) return null;
    const act = activeClipsAt(project, playhead).find((x) => x.clip.id === selection[0]);
    if (!act || act.track.kind === 'audio') return null;
    return boxOf(project, act.clip, dispW, dispH, playhead);
  }, [project, playhead, selection, dispW, dispH, fontsTick]);

  const selectAt = (x: number, y: number) => {
    const p = getState().project;
    const act = activeClipsAt(p, getState().playhead);
    const ordered = [...act].filter((a) => a.track.kind !== 'audio' && !a.track.hidden)
      .sort((a, b) => p.tracks.indexOf(b.track) - p.tracks.indexOf(a.track));
    for (const a of ordered) {
      const b = boxOf(p, a.clip, dispW, dispH, getState().playhead);
      if (b && inside(b, x, y)) { getState().select([a.clip.id]); return a.clip; }
    }
    getState().select([]);
    return null;
  };

  /** Перетаскивание: move — сдвиг, scale — угол рамки, rotate — поворот. */
  const startDrag = (e: React.PointerEvent, mode: 'move' | 'scale' | 'rotate', clipArg?: Clip) => {
    const p0 = getState().project;
    const id = clipArg?.id ?? selection[0];
    const f = p0.tracks.flatMap((t) => t.clips).find((c) => c.id === id);
    if (!f) return;
    e.stopPropagation();
    e.preventDefault();
    getState().setPlaying(false);
    const rect = wrapRef.current!.getBoundingClientRect();
    const ph = getState().playhead;
    const b0 = boxOf(p0, f, dispW, dispH, ph);
    if (!b0) return;
    const x0 = e.clientX - rect.left;
    const y0 = e.clientY - rect.top;
    const d0 = Math.max(4, Math.hypot(x0 - b0.cx, y0 - b0.cy));
    const a0 = Math.atan2(y0 - b0.cy, x0 - b0.cx);
    const key = `${mode}-${id}-${Date.now()}`;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      if (!moved && Math.hypot(x - x0, y - y0) < 2) return;
      moved = true;
      if (mode === 'move') {
        let cx = (b0.cx + (x - x0)) / dispW;
        let cy = (b0.cy + (y - y0)) / dispH;
        const snapV = Math.abs(cx - 0.5) < 0.012;
        const snapH = Math.abs(cy - 0.5) < 0.012;
        if (snapV) cx = 0.5;
        if (snapH) cy = 0.5;
        setGuides({ v: snapV, h: snapH });
        // у текста x, y — центр в долях холста, у видео — смещение центра от середины
        const vals = f.type === 'text' ? { x: cx, y: cy } : { x: cx - 0.5, y: cy - 0.5 };
        getState().commit((p) => writeProps(p, f, vals, ph), key);
      } else if (mode === 'scale') {
        const r = Math.hypot(x - b0.cx, y - b0.cy) / d0;
        if (f.type === 'text' && !(f.keyframes?.scale?.length)) {
          const size = Math.round(Math.min(400, Math.max(8, f.style.size * r)));
          getState().commit((p) => updateClip(p, id, { style: { ...f.style, size } } as Partial<TextClip>), key);
        } else {
          const scale = Math.min(10, Math.max(0.05, propValue(f, 'scale', ph) * r));
          getState().commit((p) => writeProps(p, f, { scale: Math.round(scale * 1000) / 1000 }, ph), key);
        }
      } else if (mode === 'rotate') {
        let deg = propValue(f, 'rotation', ph) + ((Math.atan2(y - b0.cy, x - b0.cx) - a0) * 180) / Math.PI;
        deg = ((deg + 540) % 360) - 180;
        const near = Math.round(deg / 90) * 90;
        if (Math.abs(deg - near) < 4) deg = near;
        getState().commit((p) => writeProps(p, f, { rotation: Math.round(deg * 10) / 10 }, ph), key);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setGuides({ v: false, h: false });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onStageDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const hit = selectAt(e.clientX - rect.left, e.clientY - rect.top);
    if (hit) startDrag(e, 'move', hit);
  };

  const toggle = () => { if (duration > 0) getState().setPlaying(!getState().playing); };
  const fps = project.settings.fps;
  const pending = project.assets.some((a) => a.proxy === 'pending');
  const empty = duration <= 0;

  return (
    <section className="stage">
      <div className="stage-area" ref={areaRef}>
        <div className="canvas-wrap" ref={wrapRef} style={{ width: dispW, height: dispH }} onPointerDown={onStageDown}
          onDoubleClick={() => { if (box?.kind === 'text') window.dispatchEvent(new CustomEvent('kadro:edit-text')); }}>
          <canvas ref={canvasRef} data-testid="preview" />
          {guides.v && <div className="guide v" />}
          {guides.h && <div className="guide h" />}
          {box && (
            <div className="sel-box" style={{ left: box.cx - box.w / 2, top: box.cy - box.h / 2, width: box.w, height: box.h, transform: box.rot ? `rotate(${box.rot}deg)` : undefined }}
              onPointerDown={(e) => startDrag(e, 'move')} data-testid="sel-box">
              {(['nw', 'ne', 'sw', 'se'] as const).map((c) => (
                <div key={c} className={`sel-handle ${c}`} onPointerDown={(e) => startDrag(e, 'scale')} title="Тяни, чтобы изменить размер" />
              ))}
              <div className="sel-rotate" onPointerDown={(e) => startDrag(e, 'rotate')} title="Тяни, чтобы повернуть" />
            </div>
          )}
          {empty && (
            <div className="empty-stage">
              <h2>Начни с видео</h2>
              <p>Перетащи файлы в окно или нажми кнопку. Kadro понимает MP4, MOV, MKV, фото и музыку.</p>
              <div className="row-btns">
                <button className="btn primary" onClick={() => void pickAndImport({ mode: 'auto', at: 0 })} data-testid="empty-import"><Upload size={15} />Добавить файлы</button>
                <button className="btn" onClick={() => getState().setHome(true)} data-testid="empty-home">Демо и шаблоны</button>
              </div>
            </div>
          )}
        </div>
        {pending && <div className="stage-chip">Готовлю превью для тяжёлого видео…</div>}
        {recording && <div className="stage-chip rec" data-testid="rec-chip"><span className="rec-dot blink" />Идёт запись голоса{recording.muted ? ' · звук проекта выключен' : ''}</div>}
      </div>
      <div className="transport">
        <div className="timecode" data-testid="timecode"><b>{fmtTime(playhead, fps, true)}</b> / {fmtTime(duration, fps, true)}</div>
        <div className="transport-center">
          <button className="icon-btn" title="В начало (Home)" onClick={() => { getState().setPlaying(false); getState().setPlayhead(0); }}><SkipBack size={17} /></button>
          <button className="play-btn" onClick={toggle} title="Пуск / пауза (пробел)" data-testid="play">{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" style={{ marginLeft: 2 }} />}</button>
          <button className="icon-btn" title="В конец (End)" onClick={() => { getState().setPlaying(false); getState().setPlayhead(duration); }}><SkipForward size={17} /></button>
        </div>
        <div className="transport-right">
          <select className="input aspect-select" value={aspect} title="Формат кадра" data-testid="aspect"
            onChange={(e) => {
              const a = e.target.value as AspectKey;
              getState().commit((p) => setSettings(p, { aspect: a, width: ASPECTS[a].w, height: ASPECTS[a].h }));
            }}>
            {(Object.keys(ASPECTS) as AspectKey[]).map((a) => <option key={a} value={a}>{ASPECTS[a].label}</option>)}
          </select>
          <button className="icon-btn" title="Во весь экран" onClick={() => void wrapRef.current?.requestFullscreen()}><Maximize2 size={16} /></button>
        </div>
      </div>
    </section>
  );
}
