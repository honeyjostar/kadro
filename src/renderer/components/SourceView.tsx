// «Взять кусок»: просмотр файла из медиатеки с отметками начала и конца (I и O, как в Premiere и CapCut).
// На таймлайн ложится только выбранный кусок; окно не закрывается — можно взять из того же файла ещё.
import { ArrowRightToLine, Layers, Pause, Play, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { projectDuration } from '../../shared/timeline';
import { addAssetToTimeline } from '../actions';
import { api, getState, useStore } from '../store';
import { fmtTime } from '../util';

const MIN_PIECE = 0.1;
/** Секунды с десятыми: «12,4», «1:05,2». */
const sec = (x: number): string => {
  const m = Math.floor(x / 60);
  const s = x - m * 60;
  const ss = s.toFixed(1).replace('.', ',');
  return m ? `${m}:${s < 10 ? '0' : ''}${ss}` : ss;
};

export function SourceView() {
  const id = useStore((s) => s.sourceView);
  const asset = useStore((s) => s.project.assets.find((a) => a.id === s.sourceView));
  const fps = useStore((s) => s.project.settings.fps);
  const close = () => getState().setSourceView(null);
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const dur = asset?.duration ?? 0;
  const [t, setT] = useState(0);
  const [range, setRange] = useState({ in: 0, out: dur });
  const [playing, setPlaying] = useState(false);
  const [added, setAdded] = useState(0);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  useEffect(() => { setRange({ in: 0, out: dur }); setT(0); setAdded(0); }, [id, dur]);

  // время из видео; дошли до конца куска — пауза (смотрим только выбранное)
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      setT(v.currentTime);
      if (!v.paused && v.currentTime >= rangeRef.current.out - 0.02 && rangeRef.current.out < dur - 0.05) { v.pause(); v.currentTime = rangeRef.current.out; }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); };
  }, [id, dur]);

  const seek = (x: number) => {
    const v = video.current;
    const nt = Math.max(0, Math.min(dur, x));
    if (v) v.currentTime = nt;
    setT(nt);
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      // с конца куска — играем кусок сначала
      if (v.currentTime >= range.out - 0.05 || v.currentTime < range.in) v.currentTime = range.in;
      void v.play();
    } else v.pause();
  };
  const markIn = (x = t) => setRange((r) => ({ in: Math.min(x, dur - MIN_PIECE), out: r.out - Math.min(x, dur - MIN_PIECE) < MIN_PIECE ? dur : r.out }));
  const markOut = (x = t) => setRange((r) => ({ in: x - r.in < MIN_PIECE ? 0 : r.in, out: Math.max(x, MIN_PIECE) }));

  const add = (mode: 'cursor' | 'end' | 'overlay') => {
    if (!asset) return;
    video.current?.pause();
    const r = { in: range.in, out: range.out };
    const at = mode === 'end' ? projectDuration(getState().project) : undefined;
    const clipId = addAssetToTimeline(asset.id, mode === 'overlay' ? 'overlay' : mode === 'end' ? 'main' : 'auto', at, r);
    if (!clipId) return;
    setAdded((n) => n + 1);
    getState().toast(`Кусок ${sec(r.in)}–${sec(r.out)} с на таймлайне`, 'ok');
  };

  // клавиши: пробел, I/O (и русские Ш/Щ), стрелки — кадр, Enter — на таймлайн, Esc — закрыть.
  // Перехватываем раньше общих клавиш редактора, чтобы пробел не запускал таймлайн.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      const step = e.shiftKey ? 1 : 1 / fps;
      let done = true;
      if (e.code === 'Space') toggle();
      else if (k === 'i' || k === 'ш') markIn(video.current?.currentTime ?? t);
      else if (k === 'o' || k === 'щ') markOut(video.current?.currentTime ?? t);
      else if (e.key === 'ArrowLeft') seek((video.current?.currentTime ?? t) - step);
      else if (e.key === 'ArrowRight') seek((video.current?.currentTime ?? t) + step);
      else if (e.key === 'Enter') add('cursor');
      else if (e.key === 'Escape') close();
      else done = false;
      if (done) { e.preventDefault(); e.stopImmediatePropagation(); }
      else if (!(e.ctrlKey || e.metaKey)) e.stopImmediatePropagation(); // остальные клавиши редактора (S, Delete…) — не трогаем таймлайн
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // перетаскивание: курсор, начало или конец куска
  const drag = (e: React.PointerEvent, what: 'seek' | 'in' | 'out') => {
    e.preventDefault();
    e.stopPropagation();
    const el = bar.current;
    if (!el || !dur) return;
    const r = el.getBoundingClientRect();
    const at = (x: number) => Math.max(0, Math.min(dur, ((x - r.left) / r.width) * dur));
    const apply = (x: number) => {
      const v = at(x);
      if (what === 'seek') seek(v);
      else if (what === 'in') { const nv = Math.min(v, rangeRef.current.out - MIN_PIECE); setRange((q) => ({ ...q, in: Math.max(0, nv) })); seek(Math.max(0, nv)); }
      else { const nv = Math.max(v, rangeRef.current.in + MIN_PIECE); setRange((q) => ({ ...q, out: Math.min(dur, nv) })); seek(Math.min(dur, nv)); }
    };
    video.current?.pause();
    apply(e.clientX);
    const move = (ev: PointerEvent) => apply(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const strip = useMemo(() => asset?.thumbs ?? [], [asset?.thumbs]);
  if (!asset) return null;
  const isAudio = asset.kind === 'audio';
  const pct = (x: number) => `${dur ? (x / dur) * 100 : 0}%`;
  const len = range.out - range.in;
  const whole = range.in <= 0.001 && range.out >= dur - 0.001;

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal source-modal" role="dialog" aria-label="Взять кусок" data-testid="source-view">
        <div className="modal-head">
          <h3 className="ellipsis">{asset.name}</h3>
          <button className="icon-btn" onClick={close} title="Закрыть (Esc)"><X size={17} /></button>
        </div>
        <div className={`source-stage ${isAudio ? 'audio' : ''}`} onClick={toggle}>
          <video ref={video} src={api.mediaUrl(asset.previewPath || asset.path)} playsInline preload="auto" data-testid="source-video" />
          {isAudio && <Wave peaks={asset.peaks} />}
        </div>
        <div className="source-time">
          <button className="play-btn" onClick={toggle} title="Пуск / пауза (пробел)" data-testid="source-play">
            {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <span className="tc"><b>{fmtTime(t, fps, true)}</b> / {fmtTime(dur, fps, true)}</span>
          <span className="source-len" data-testid="source-len">{whole ? 'Весь файл' : `Кусок ${sec(range.in)}–${sec(range.out)} с · длина ${sec(len)} с`}</span>
        </div>
        <div className="source-bar" ref={bar} onPointerDown={(e) => drag(e, 'seek')} data-testid="source-bar">
          <div className="source-strip">
            {strip.length > 0 && strip.map((s, i) => <div key={i} style={{ backgroundImage: `url("${api.mediaUrl(s)}")` }} />)}
          </div>
          <div className="source-dim" style={{ left: 0, width: pct(range.in) }} />
          <div className="source-dim" style={{ left: pct(range.out), right: 0 }} />
          <div className="source-range" style={{ left: pct(range.in), width: pct(len) }}>
            <span className="source-h in" onPointerDown={(e) => drag(e, 'in')} title="Начало куска (I)" data-testid="source-in" />
            <span className="source-h out" onPointerDown={(e) => drag(e, 'out')} title="Конец куска (O)" data-testid="source-out" />
          </div>
          <div className="source-head" style={{ left: pct(t) }} />
        </div>
        <div className="source-marks">
          <button className="btn small" onClick={() => markIn()} title="Начало куска там, где курсор — клавиша I" data-testid="source-mark-in">Начало здесь <kbd>I</kbd></button>
          <button className="btn small" onClick={() => markOut()} title="Конец куска там, где курсор — клавиша O" data-testid="source-mark-out">Конец здесь <kbd>O</kbd></button>
          {!whole && <button className="btn ghost small" onClick={() => setRange({ in: 0, out: dur })}>Весь файл</button>}
        </div>
        <div className="source-actions">
          <button className="btn primary" onClick={() => add('cursor')} data-testid="source-add"><Plus size={15} />На таймлайн к курсору <kbd>Enter</kbd></button>
          {!isAudio && <button className="btn" onClick={() => add('end')} data-testid="source-add-end"><ArrowRightToLine size={15} />В конец</button>}
          {!isAudio && <button className="btn" onClick={() => add('overlay')} data-testid="source-add-overlay"><Layers size={15} />Поверх</button>}
        </div>
        <p className="hint small">
          Отметь начало и конец (тяни края на полосе или жми I и O на нужном кадре) — на таймлайн ляжет только этот кусок. Окно не закрывается: бери из файла сколько нужно кусков.
          {added > 0 && <b data-testid="source-added"> Добавлено: {added}.</b>}
        </p>
      </div>
    </div>
  );
}

function Wave({ peaks }: { peaks?: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !peaks?.length) return;
    const w = (c.width = c.clientWidth * 2);
    const h = (c.height = c.clientHeight * 2);
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    g.fillStyle = getComputedStyle(c).color;
    const n = peaks.length;
    for (let x = 0; x < w; x += 3) {
      const v = peaks[Math.floor((x / w) * n)] ?? 0;
      const bh = Math.max(2, v * h * 0.9);
      g.fillRect(x, (h - bh) / 2, 2, bh);
    }
  }, [peaks]);
  return <canvas ref={ref} className="source-wave" />;
}
