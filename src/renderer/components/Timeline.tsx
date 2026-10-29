import {
  Activity, AudioLines, Blend, Bookmark, Copy, Eye, EyeOff, Film, Group, Layers, Maximize2, Mic, Plus, Ungroup, Redo2, Rewind, Scissors, Snowflake, Trash2, Type, Undo2, Volume2, VolumeX, Wand2,
  ZoomIn, ZoomOut,
} from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FILTER_PRESETS } from '../../shared/color';
import {
  addFree, addToMain, beatTimes, clipDuration, clipEnd, findClip, mainToOverlay, moveClip, moveClipsBy, projectDuration, reorderMain, reorderMainMany,
  setTrackFlag, trimClip,
} from '../../shared/timeline';
import type { Clip, MediaAsset, MediaClip, Project, Track } from '../../shared/types';
import { addMarkerAtPlayhead, alignToBeats, extractAudio, placeLibraryFiles, deleteSelection, duplicateSelection, freezeFrame, groupSelection, importPaths, ungroupSelection, removePauses, retimeClip, splitAtPlayhead, startRecording, stopRecording } from '../actions';
import { useSelected } from '../hooks';
import { recPrefs } from '../recorder';
import { keyTimesOnTimeline } from '../animEdit';
import { api, getState, useStore } from '../store';
import { fmtDur, peakLevel } from '../util';
import { MarkerLayer, rulerMenuItems } from './Markers';
import { useMenu } from './Menu';

const PAD = 16;
const RULER_H = 26;
const TOP_PAD = 22; // пустая полоса над дорожками: бросить сюда — новая дорожка поверх
const ROW_H: Record<Track['kind'], number> = { main: 70, video: 50, text: 32, audio: 46 };
const MIN_PPS = 4;
const MAX_PPS = 800;

interface View { left: number; width: number; top: number; height: number }
interface Row { track: Track; top: number; height: number }
interface DragState {
  id: string;
  mode: 'move' | 'reorder';
  start: number;           // где сейчас клип (время)
  rowTrackId: string;      // над какой дорожкой ('new' — новая дорожка сверху)
  insertIndex?: number;    // для перестановки на основной
  snap?: number;           // время линии привязки
  multi?: { ids: string[]; dt: number }; // тянем несколько выделенных клипов: все сдвигаются на dt
}
/** Рамка выделения мышью — в координатах содержимого таймлайна (y — от верха дорожек). */
interface Box { x0: number; y0: number; x1: number; y1: number }

const xOf = (t: number, pps: number) => PAD + t * pps;

function displayRows(p: Project): Row[] {
  const visual = p.tracks.filter((t) => t.kind === 'video' || t.kind === 'text').reverse();
  const main = p.tracks.filter((t) => t.kind === 'main');
  const audio = p.tracks.filter((t) => t.kind === 'audio');
  let top = TOP_PAD;
  return [...visual, ...main, ...audio].map((track) => {
    const r = { track, top, height: ROW_H[track.kind] };
    top += r.height;
    return r;
  });
}

function snapPoints(p: Project, exclude: string | string[], playhead: number): number[] {
  const pts = [0, playhead, ...beatTimes(p), ...(p.markers ?? []).map((m) => m.t)];
  const ex = Array.isArray(exclude) ? exclude : [exclude];
  for (const t of p.tracks) for (const c of t.clips) {
    if (ex.includes(c.id)) continue;
    pts.push(c.start, clipEnd(c));
  }
  return pts;
}

function snapTo(t: number, pts: number[], thr: number): { t: number; line?: number } {
  let best = thr;
  let out: { t: number; line?: number } = { t };
  for (const q of pts) {
    const d = Math.abs(q - t);
    if (d < best) { best = d; out = { t: q, line: q }; }
  }
  return out;
}

function tickStep(pps: number): { major: number; minor: number } {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const major = steps.find((s) => s * pps >= 70) ?? 600;
  const minor = major >= 60 ? major / 6 : major === 15 ? 5 : major / 5;
  return { major, minor };
}

function rulerLabel(t: number, major: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  if (major < 1) return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  return `${m}:${String(Math.round(s)).padStart(2, '0')}`;
}

// ---------- линейка ----------
function Ruler({ pps, view, width, onScrub, timeAt }: { pps: number; view: View; width: number; onScrub: (e: React.PointerEvent) => void; timeAt: (clientX: number) => number }) {
  const menu = useMenu();
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useStore((s) => s.theme);
  useLayoutEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(view.width * dpr));
    c.height = RULER_H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, view.width, RULER_H);
    const { major, minor } = tickStep(pps);
    const t0 = Math.max(0, Math.floor((view.left - PAD) / pps / minor) * minor);
    const t1 = (view.left + view.width - PAD) / pps;
    const css = getComputedStyle(document.documentElement);
    ctx.font = '10.5px Onest, sans-serif';
    ctx.textBaseline = 'top';
    for (let i = 0; ; i++) {
      const t = t0 + i * minor;
      if (t > t1 + minor) break;
      const x = Math.round(xOf(t, pps) - view.left) + 0.5;
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      ctx.fillStyle = isMajor ? css.getPropertyValue('--faint') : css.getPropertyValue('--line');
      ctx.fillRect(x - 0.5, isMajor ? RULER_H - 9 : RULER_H - 5, 1, isMajor ? 9 : 5);
      if (isMajor) ctx.fillText(rulerLabel(t, major), x + 4, 5);
    }
  }, [pps, view.left, view.width, theme]);
  return (
    <div className="ruler" style={{ width }} onPointerDown={onScrub} data-testid="ruler"
      onContextMenu={(e) => menu.open(e, rulerMenuItems(timeAt(e.clientX)))}>
      <canvas ref={ref} style={{ position: 'absolute', left: view.left, top: 0, width: view.width, height: RULER_H }} />
      <MarkerLayer pps={pps} timeAt={timeAt} />
      {menu.node}
    </div>
  );
}

// ---------- кнопка панели: значок и подпись ----------
function Tool({ icon, label, title, onClick, disabled, on, testId, className }: {
  icon: ReactNode; label: string; title: string; onClick: () => void; disabled?: boolean; on?: boolean; testId?: string; className?: string;
}) {
  return (
    <button className={`tool ${on ? 'on' : ''} ${className ?? ''}`} title={title} onClick={onClick} disabled={disabled} data-testid={testId}>
      {icon}<span>{label}</span>
    </button>
  );
}

// ---------- волна звука ----------
function Wave({ asset, clip, pps, clipLeft, clipWidth, view, height, color, top = 0 }: {
  asset: MediaAsset; clip: MediaClip; pps: number; clipLeft: number; clipWidth: number; view: View; height: number; color: string; top?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useStore((s) => s.theme);
  const visL = Math.max(clipLeft, view.left - 50);
  const visR = Math.min(clipLeft + clipWidth, view.left + view.width + 50);
  const w = Math.max(0, Math.floor(visR - visL));
  useLayoutEffect(() => {
    const c = ref.current;
    const peaks = asset.peaks;
    if (!c || !peaks?.length || w <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(height * dpr));
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, height);
    ctx.fillStyle = color.startsWith('--') ? getComputedStyle(document.documentElement).getPropertyValue(color).trim() || '#5fe0c9' : color;
    const per = peaks.length / Math.max(0.001, asset.duration); // точек на секунду исходника
    const gain = clip.muted ? 0.15 : Math.min(1.6, Math.max(0.15, clip.volume));
    for (let x = 0; x < w; x += 2) {
      const ta = (visL + x - clipLeft) / pps;
      const tb = (visL + x + 2 - clipLeft) / pps;
      const a = Math.floor((clip.in + ta * clip.speed) * per);
      const b = Math.max(a + 1, Math.ceil((clip.in + tb * clip.speed) * per));
      let m = 0;
      for (let i = Math.max(0, a); i < Math.min(peaks.length, b); i++) if (peaks[i] > m) m = peaks[i];
      const h = Math.max(1, peakLevel(Math.min(1, m * gain)) * (height - 2));
      ctx.fillRect(x, (height - h) / 2, 1.5, h);
    }
  }, [asset.peaks, asset.duration, clip.in, clip.speed, clip.volume, clip.muted, pps, visL, w, height, color, clipLeft, theme]);
  if (!asset.peaks?.length || w <= 0) return null;
  return <canvas ref={ref} className="wave" style={{ left: visL - clipLeft, top, width: w, height }} />;
}

// ---------- клип ----------
interface ClipProps {
  clip: Clip; track: Track; asset?: MediaAsset; pps: number; view: View; selected: boolean; rowH: number;
  ghost?: boolean; left?: number;
  onDown: (e: React.PointerEvent, clip: Clip, track: Track, mode: 'body' | 'l' | 'r') => void;
}

const ClipView = memo(function ClipView({ clip, track, asset, pps, view, selected, rowH, ghost, left: leftOverride, onDown }: ClipProps) {
  const dur = clipDuration(clip);
  const left = leftOverride ?? xOf(clip.start, pps);
  const width = Math.max(2, dur * pps);
  let cls = 'clip';
  let label: React.ReactNode;
  let content: React.ReactNode = null;
  if (clip.type === 'text') {
    cls += clip.role === 'caption' ? ' caption' : ' text';
    label = <><Type size={11} className="clip-icon" /><span className="ellipsis">{clip.text || 'Пустой текст'}</span></>;
  } else {
    const isAudio = asset?.kind === 'audio';
    cls += isAudio ? ' audio' : track.kind === 'main' ? ' video' : ' overlay';
    const tags: string[] = [];
    if (clip.speed !== 1) tags.push(`${+clip.speed.toFixed(2)}×`);
    if (clip.muted) tags.push('без звука');
    if (clip.removeBg.enabled) tags.push('без фона');
    if (clip.denoise.enabled) tags.push('чистый голос');
    if (clip.color.preset !== 'none') tags.push(FILTER_PRESETS.find((f) => f.id === clip.color.preset)?.label ?? '');
    label = (
      <>
        <span className="ellipsis">{asset?.name ?? 'Файл не найден'}</span>
        {width > 120 && <span className="clip-dur">{fmtDur(dur)}</span>}
        {width > 80 && tags.map((t) => <span key={t} className="tag">{t}</span>)}
      </>
    );
    if (asset && !isAudio) {
      const showWave = track.kind === 'main' && asset.hasAudio && !!asset.peaks?.length;
      const stripH = showWave ? rowH - 8 - 18 : rowH - 8;
      const thumbs = asset.thumbs ?? [];
      const ar = asset.width && asset.height ? asset.width / asset.height : 16 / 9;
      const tileW = Math.max(24, Math.min(stripH * 2, stripH * ar));
      const tiles: React.ReactNode[] = [];
      if (thumbs.length) {
        const first = Math.max(0, Math.floor((view.left - left) / tileW) - 1);
        const last = Math.min(Math.ceil(width / tileW), Math.ceil((view.left + view.width - left) / tileW) + 1);
        for (let i = first; i < last; i++) {
          const raw = asset.kind === 'image' ? 0 : clip.in + (((i + 0.5) * tileW) / pps) * clip.speed; // кадр середины плитки
          const src = asset.loop && asset.duration > 0 ? raw % asset.duration : raw; // GIF по кругу
          const idx = asset.kind === 'image' ? 0 : Math.min(thumbs.length - 1, Math.max(0, Math.floor((src / Math.max(0.001, asset.duration)) * thumbs.length)));
          tiles.push(<div key={i} style={{ left: i * tileW, width: tileW, backgroundImage: `url("${api.mediaUrl(thumbs[idx])}")` }} />);
        }
      }
      content = (
        <>
          <div className="strip" style={{ height: stripH }}>{tiles}</div>
          {showWave && <div className="wave-band"><Wave asset={asset} clip={clip} pps={pps} clipLeft={left} clipWidth={width} view={view} height={16} color="rgba(255,255,255,0.55)" /></div>}
        </>
      );
    } else if (asset && isAudio) {
      const beats = (asset.beats ?? []).filter((b) => b >= clip.in && b <= clip.out).map((b) => (b - clip.in) / clip.speed * pps)
        .filter((x) => x >= view.left - left - 4 && x <= view.left + view.width - left + 4);
      content = (
        <>
          <Wave asset={asset} clip={clip} pps={pps} clipLeft={left} clipWidth={width} view={view} height={rowH - 8} color="--audio-wave" />
          {beats.length > 0 && <div className="beat-marks">{beats.map((x, i) => <i key={i} style={{ left: x }} />)}</div>}
        </>
      );
      label = <><AudioLines size={11} className="clip-icon" />{label}</>;
    }
  }
  if (selected) cls += ' selected';
  if (ghost) cls += ' ghost';
  if (track.hidden) cls += ' dim';
  const kfs = keyTimesOnTimeline(clip);
  return (
    <div className={cls} style={{ left, width }} data-testid="clip" data-clip={clip.id}
      onPointerDown={(e) => onDown(e, clip, track, 'body')}>
      {content}
      <div className="clip-label">{label}</div>
      {kfs.length > 0 && (
        <div className="kf-marks">{kfs.map((t) => <i key={t} style={{ left: (t - clip.start) * pps }} />)}</div>
      )}
      {!ghost && <div className="trim l" onPointerDown={(e) => onDown(e, clip, track, 'l')} />}
      {!ghost && <div className="trim r" onPointerDown={(e) => onDown(e, clip, track, 'r')} />}
    </div>
  );
});

// ---------- плейхед ----------
function Playhead({ pps, height, scrollRef, view }: { pps: number; height: number; scrollRef: React.RefObject<HTMLDivElement | null>; view: View }) {
  const t = useStore((s) => s.playhead);
  const playing = useStore((s) => s.playing);
  const x = xOf(t, pps);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 80);
  }, [x, playing, scrollRef]);
  return <div className="playhead" style={{ left: x, top: view.top, height: height }} data-testid="playhead" />;
}

// ---------- шапки дорожек ----------
function TrackHead({ row }: { row: Row }) {
  const commit = useStore((s) => s.commit);
  const t = row.track;
  const icon = t.kind === 'main' ? <Film size={13} /> : t.kind === 'video' ? <Layers size={13} /> : t.kind === 'text' ? <Type size={13} /> : <AudioLines size={13} />;
  const isCaption = t.kind === 'text' && t.name === 'Субтитры';
  return (
    <div className={`track-head ${t.kind}`} style={{ height: row.height }}>
      {icon}
      <span className="name">{isCaption ? 'Субтитры' : t.kind === 'main' ? 'Основная' : t.name}</span>
      {t.kind !== 'audio' && (
        <button className={`icon-btn ${t.hidden ? 'on' : ''}`} title={t.hidden ? 'Показать дорожку' : 'Скрыть дорожку'}
          onClick={() => commit((p) => setTrackFlag(p, t.id, { hidden: !t.hidden }))}>{t.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
      )}
      {t.kind !== 'text' && (
        <button className={`icon-btn ${t.muted ? 'on' : ''}`} title={t.muted ? 'Включить звук дорожки' : 'Выключить звук дорожки'} data-testid="track-mute"
          onClick={() => commit((p) => setTrackFlag(p, t.id, { muted: !t.muted }))}>{t.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
      )}
    </div>
  );
}

// ---------- таймлайн ----------
export function Timeline() {
  const project = useStore((s) => s.project);
  const pps = useStore((s) => s.pxPerSec);
  const selection = useStore((s) => s.selection);
  const junction = useStore((s) => s.junction);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const sel = useSelected();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headsRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ left: 0, width: 800, top: 0, height: 300 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [trimSnap, setTrimSnap] = useState<number | null>(null);
  const [dropRow, setDropRow] = useState<string | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const zoomAnchor = useRef<{ t: number; px: number } | null>(null);

  const rows = useMemo(() => displayRows(project), [project]);
  const rowsH = TOP_PAD + rows.reduce((s, r) => s + r.height, 0);

  // «показать клип»: только что добавленный или найденный по файлу — прокрутить к нему и подсветить
  const reveal = useStore((s) => s.reveal);
  useEffect(() => {
    const el = scrollRef.current;
    const f = reveal ? findClip(getState().project, reveal.id) : undefined;
    if (!reveal || !el || !f) return;
    const pps0 = getState().pxPerSec;
    const x0 = xOf(f.clip.start, pps0);
    const x1 = xOf(clipEnd(f.clip), pps0);
    if (x0 < el.scrollLeft + 10 || x0 > el.scrollLeft + el.clientWidth - 80 || (x1 < el.scrollLeft + 10)) el.scrollLeft = Math.max(0, x0 - 80);
    let top = TOP_PAD;
    const all = displayRows(getState().project);
    for (const r of all) { if (r.track.id === f.track.id) break; top += r.height; }
    const h = all.find((r) => r.track.id === f.track.id)?.height ?? 40;
    if (top < el.scrollTop || top + h > el.scrollTop + el.clientHeight - RULER_H) el.scrollTop = Math.max(0, top - 10);
    let off = 0;
    const t = window.setTimeout(() => {
      const n = el.querySelector(`[data-clip="${reveal.id}"]`);
      if (!n) return;
      n.classList.remove('flash');
      void (n as HTMLElement).offsetWidth; // перезапуск анимации
      n.classList.add('flash');
      off = window.setTimeout(() => n.classList.remove('flash'), 1300);
    }, 40);
    return () => { clearTimeout(t); clearTimeout(off); };
  }, [reveal]);
  const duration = projectDuration(project);
  const contentW = Math.max(view.width, xOf(duration + Math.max(20, view.width / pps / 3), pps));
  const contentH = rowsH + 40;
  const assets = useMemo(() => new Map(project.assets.map((a) => [a.id, a])), [project.assets]);

  // видимая область — для линейки, миниатюр и волн
  useLayoutEffect(() => {
    const el = scrollRef.current!;
    let raf = 0;
    const upd = () => {
      raf = 0;
      setView({ left: el.scrollLeft, width: el.clientWidth, top: el.scrollTop, height: el.clientHeight });
      if (headsRef.current) headsRef.current.scrollTop = el.scrollTop;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(upd); };
    el.addEventListener('scroll', onScroll);
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    upd();
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  // масштаб вокруг точки под курсором
  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    const el = scrollRef.current;
    if (!a || !el) return;
    el.scrollLeft = Math.max(0, xOf(a.t, pps) - a.px);
    zoomAnchor.current = null;
  }, [pps]);

  const zoomTo = useCallback((next: number, anchorPx?: number) => {
    const el = scrollRef.current!;
    const px = anchorPx ?? el.clientWidth / 2;
    const s = getState();
    const t = anchorPx === undefined && s.playhead > 0 ? s.playhead : (el.scrollLeft + px - PAD) / s.pxPerSec;
    zoomAnchor.current = { t, px: anchorPx === undefined && s.playhead > 0 ? xOf(s.playhead, s.pxPerSec) - el.scrollLeft : px };
    s.setZoom(next);
  }, []);

  const fit = useCallback(() => {
    const el = scrollRef.current!;
    const d = projectDuration(getState().project);
    if (d <= 0) return;
    getState().setZoom(Math.min(MAX_PPS, Math.max(MIN_PPS, (el.clientWidth - PAD * 2 - 20) / d)));
    requestAnimationFrame(() => { el.scrollLeft = 0; });
  }, []);

  // первый клип в пустом проекте — подгоняем масштаб под ролик
  const prevDur = useRef(duration);
  useEffect(() => {
    if (prevDur.current <= 0 && duration > 0) fit();
    prevDur.current = duration;
  }, [duration, fit]);

  useEffect(() => {
    const el = scrollRef.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const s = getState();
      const next = Math.min(MAX_PPS, Math.max(MIN_PPS, s.pxPerSec * Math.exp(-e.deltaY * 0.0022)));
      const px = e.clientX - rect.left;
      zoomAnchor.current = { t: (el.scrollLeft + px - PAD) / s.pxPerSec, px };
      s.setZoom(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const timeAt = (clientX: number) => {
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + el.scrollLeft - PAD) / getState().pxPerSec);
  };
  const rowAt = (clientY: number): Row | 'new' | undefined => {
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    const y = clientY - rect.top + el.scrollTop - RULER_H;
    if (y < TOP_PAD) return 'new';
    return rows.find((r) => y >= r.top && y < r.top + r.height);
  };

  // перемотка по линейке
  const onScrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const s = getState();
    s.setPlaying(false);
    const dur = projectDuration(s.project);
    const go = (x: number) => s.setPlayhead(Math.min(dur, timeAt(x)));
    go(e.clientX);
    const move = (ev: PointerEvent) => go(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** Пустое место: щелчок — перемотка, протянуть — рамка выделения (с Ctrl или Shift — добавить к выделенному). */
  const onEmptyDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const s = getState();
    const add = e.ctrlKey || e.metaKey || e.shiftKey;
    const base = add ? s.selection.slice() : [];
    if (!add) s.select([]);
    s.setPlaying(false);
    s.setPlayhead(Math.min(projectDuration(s.project), timeAt(e.clientX)));
    const el = scrollRef.current!;
    const pos = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: ev.clientX - r.left + el.scrollLeft, y: ev.clientY - r.top + el.scrollTop - RULER_H };
    };
    const a = pos(e);
    let started = false;
    const move = (ev: PointerEvent) => {
      const b = pos(ev);
      if (!started && Math.abs(b.x - a.x) < 5 && Math.abs(b.y - a.y) < 5) return;
      started = true;
      const bx = { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
      setBox(bx);
      const pps0 = getState().pxPerSec;
      const hit: string[] = [];
      for (const r of rows) {
        if (r.top + r.height < bx.y0 || r.top > bx.y1) continue;
        for (const c of r.track.clips) {
          const x0 = xOf(c.start, pps0);
          const x1 = xOf(clipEnd(c), pps0);
          if (x1 >= bx.x0 && x0 <= bx.x1) hit.push(c.id);
        }
      }
      getState().select([...new Set([...base, ...hit])]);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setBox(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** Shift+щелчок: все клипы от прошлого выделенного до этого (на одной дорожке — по порядку, на разных — по времени). */
  const rangeSelect = (clip: Clip, track: Track) => {
    const s = getState();
    const anchorId = s.selection[s.selection.length - 1];
    const anchor = anchorId ? findClip(s.project, anchorId) : undefined;
    if (!anchor) { s.select([clip.id]); return; }
    let ids: string[];
    if (anchor.track.id === track.id) {
      const i0 = track.clips.findIndex((c) => c.id === anchorId);
      const i1 = track.clips.findIndex((c) => c.id === clip.id);
      ids = track.clips.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).map((c) => c.id);
    } else {
      const t0 = Math.min(anchor.clip.start, clip.start);
      const t1 = Math.max(clipEnd(anchor.clip), clipEnd(clip));
      const tracks = rows.slice(Math.min(rows.findIndex((r) => r.track.id === anchor.track.id), rows.findIndex((r) => r.track.id === track.id)),
        Math.max(rows.findIndex((r) => r.track.id === anchor.track.id), rows.findIndex((r) => r.track.id === track.id)) + 1);
      ids = tracks.flatMap((r) => r.track.clips.filter((c) => clipEnd(c) > t0 + 1e-6 && c.start < t1 - 1e-6).map((c) => c.id));
    }
    s.select([...new Set([...s.selection, ...ids])]);
  };

  /** Тянем один из нескольких выделенных клипов — двигаются все. */
  const startMultiDrag = (e: React.PointerEvent, clip: Clip, track: Track) => {
    const s = getState();
    const ids = s.selection.slice();
    const p0 = s.project;
    const mainT = p0.tracks.find((t) => t.kind === 'main');
    const mainIds = ids.filter((id) => mainT?.clips.some((c) => c.id === id));
    const freeIds = ids.filter((id) => !mainIds.includes(id));
    const isMain = track.kind === 'main';
    const x0 = e.clientX;
    const y0 = e.clientY;
    const pps0 = s.pxPerSec;
    const thr = 8 / pps0;
    const pts = snapPoints(p0, ids, s.playhead);
    const freeStarts = freeIds.map((id) => findClip(p0, id)?.clip.start ?? 0);
    const minFree = freeStarts.length ? Math.min(...freeStarts) : 0;
    const dur = clipDuration(clip);
    let started = false;
    let last: DragState | null = null;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!started && Math.abs(dx) < 3 && Math.abs(ev.clientY - y0) < 3) return;
      started = true;
      const raw = clip.start + dx / pps0;
      let start = raw;
      let line: number | undefined;
      const a = snapTo(raw, pts, thr);
      const b = snapTo(raw + dur, pts, thr);
      if (a.line !== undefined) { start = a.t; line = a.line; } else if (b.line !== undefined) { start = b.t - dur; line = b.line; }
      let dt = start - clip.start;
      dt = Math.max(dt, -minFree);
      if (isMain && mainT) {
        const others = mainT.clips.filter((c) => !mainIds.includes(c.id));
        const tPtr = raw + dur / 2;
        let idx = others.findIndex((c) => tPtr < c.start + clipDuration(c) / 2);
        if (idx < 0) idx = others.length;
        last = { id: clip.id, mode: 'reorder', start: Math.max(0, raw), rowTrackId: track.id, insertIndex: idx, multi: { ids, dt } };
      } else {
        last = { id: clip.id, mode: 'move', start: Math.max(0, clip.start + dt), rowTrackId: track.id, snap: line, multi: { ids, dt } };
      }
      setDrag(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      const d = last;
      if (!started || !d) { getState().select([clip.id]); return; } // просто щелчок — выделить один
      getState().commit((p) => {
        let q = p;
        if (isMain && mainIds.length && d.insertIndex !== undefined) q = reorderMainMany(q, mainIds, d.insertIndex);
        if (freeIds.length && Math.abs(d.multi!.dt) > 1e-6) q = moveClipsBy(q, freeIds, d.multi!.dt);
        return q;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // перетаскивание клипа и обрезка краёв
  const onClipDown = useCallback((e: React.PointerEvent, clip: Clip, track: Track, mode: 'body' | 'l' | 'r') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const s = getState();
    s.setPlaying(false);
    if (e.ctrlKey || e.metaKey) {
      s.select(s.selection.includes(clip.id) ? s.selection.filter((x) => x !== clip.id) : [...s.selection, clip.id]);
      return;
    }
    if (e.shiftKey) { rangeSelect(clip, track); return; }
    if (mode === 'body' && s.selection.includes(clip.id) && s.selection.length > 1) { startMultiDrag(e, clip, track); return; }
    if (!s.selection.includes(clip.id) || s.selection.length > 1) s.select([clip.id]);
    const p0 = s.project;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const pps0 = s.pxPerSec;
    const thr = 8 / pps0;
    const pts = snapPoints(p0, clip.id, s.playhead);
    const key = `${mode}-${clip.id}-${Date.now()}`;
    let started = false;
    let last: DragState | null = null;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!started && Math.abs(dx) < 3 && Math.abs(ev.clientY - y0) < 3) return;
      started = true;
      const dt = dx / pps0;
      if (mode === 'l' || mode === 'r') {
        const edge0 = mode === 'l' ? clip.start : clipEnd(clip);
        const sn = snapTo(edge0 + dt, pts, thr);
        setTrimSnap(sn.line ?? null);
        getState().commit(() => trimClip(p0, clip.id, mode === 'l' ? 'start' : 'end', sn.t), key);
        return;
      }
      const hit = rowAt(ev.clientY);
      const row = hit === 'new' ? undefined : hit;
      const dur = clipDuration(clip);
      let start = Math.max(0, clip.start + dt);
      const a = snapTo(start, pts, thr);
      const b = snapTo(start + dur, pts, thr);
      let line: number | undefined;
      if (a.line !== undefined && (b.line === undefined || Math.abs(a.t - start) <= Math.abs(b.t - start - dur))) { start = a.t; line = a.line; }
      else if (b.line !== undefined) { start = b.t - dur; line = b.line; }
      start = Math.max(0, start);
      if (track.kind === 'main') {
        const target = hit === 'new' ? 'new' : row && (row.track.kind === 'video' || row.track.kind === 'text') ? row.track.id : undefined;
        if (target) {
          last = { id: clip.id, mode: 'move', start, rowTrackId: target, snap: line };
        } else {
          const others = track.clips.filter((c) => c.id !== clip.id);
          const tPtr = clip.start + dt + dur / 2;
          let idx = others.findIndex((c) => tPtr < c.start + clipDuration(c) / 2);
          if (idx < 0) idx = others.length;
          last = { id: clip.id, mode: 'reorder', start: Math.max(0, clip.start + dt), rowTrackId: track.id, insertIndex: idx };
        }
      } else {
        const isAudioClip = clip.type === 'media' && p0.assets.find((x) => x.id === clip.assetId)?.kind === 'audio';
        let target: string = track.id;
        if (hit === 'new') target = isAudioClip ? track.id : 'new';
        else if (row) {
          const ok = row.track.kind === track.kind || (clip.type === 'media' && !isAudioClip && (row.track.kind === 'video' || row.track.kind === 'main'));
          if (ok) target = row.track.id;
        }
        last = { id: clip.id, mode: 'move', start, rowTrackId: target, snap: line };
      }
      setDrag(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      setTrimSnap(null);
      const d = last;
      if (!started || !d) return;
      if (d.mode === 'reorder') {
        const i = track.clips.findIndex((c) => c.id === clip.id);
        if (d.insertIndex !== undefined && d.insertIndex !== i) getState().commit((p) => reorderMain(p, clip.id, d.insertIndex!));
      } else if (track.kind === 'main') {
        getState().commit((p) => mainToOverlay(p, clip.id, d.start, d.rowTrackId));
      } else if (Math.abs(d.start - clip.start) > 1e-6 || d.rowTrackId !== track.id) {
        getState().commit((p) => moveClip(p, clip.id, d.start, d.rowTrackId));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  // rows меняются вместе с проектом — пересоздаём обработчик
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // бросание файлов из медиатеки или из проводника
  const onRowDragOver = (e: React.DragEvent, row: Row | null) => {
    const types = e.dataTransfer.types;
    if (!types.includes('application/x-kadro-asset') && !types.includes('application/x-kadro-paths') && !types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropRow(row?.track.id ?? 'empty');
  };
  const onRowDrop = (e: React.DragEvent, row: Row | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDropRow(null);
    const t = timeAt(e.clientX);
    const assetId = e.dataTransfer.getData('application/x-kadro-asset');
    const kind = row?.track.kind;
    const libPaths = e.dataTransfer.getData('application/x-kadro-paths');
    if (libPaths) {
      // из библиотеки: на дорожку под мышью (наложение — если бросили на дорожку наложений)
      void placeLibraryFiles(JSON.parse(libPaths) as string[], { mode: kind && kind !== 'main' && kind !== 'audio' ? 'overlay' : 'auto', at: t });
      return;
    }
    if (assetId) {
      const a = getState().project.assets.find((x) => x.id === assetId);
      if (!a) return;
      let id = '';
      getState().commit((p) => {
        const r = a.kind === 'audio' || (kind && kind !== 'main') ? addFree(p, assetId, t) : addToMain(p, assetId, t);
        id = r.clipId;
        return r.project;
      });
      if (id) getState().select([id]);
      return;
    }
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
    if (paths.length) void importPaths(paths, { mode: kind && kind !== 'main' && kind !== 'audio' ? 'overlay' : 'auto', at: t });
  };

  // стыки основной дорожки — кнопки переходов
  const main = rows.find((r) => r.track.kind === 'main');
  const junctions = main ? main.track.clips.slice(0, -1).map((a, i) => {
    const b = main.track.clips[i + 1];
    const has = a.type === 'media' && !!a.transitionOut;
    const center = (b.start + clipEnd(a)) / 2;
    return { id: a.id, x: xOf(center, pps), has };
  }) : [];

  // кнопка «+» (добавить переход) — только у стыка под мышью, чтобы не мешала резать и подрезать;
  // стыки с переходом видны всегда
  const [hoverJ, setHoverJ] = useState<string | null>(null);
  const onMainHover = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag || e.buttons) { if (hoverJ) setHoverJ(null); return; }
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best: string | null = null;
    let bd = 14;
    for (const j of junctions) { const d = Math.abs(j.x - x); if (d <= bd) { bd = d; best = j.id; } }
    if (best !== hoverJ) setHoverJ(best);
  };

  const selClip = sel?.clip.type === 'media' ? (sel.clip as MediaClip) : null;
  const recording = useStore((s) => s.recording);
  const hasBeats = project.assets.some((a) => a.beats?.length);
  const canPauses = !!selClip && !!sel?.asset?.hasAudio;
  const zoomVal = Math.log(pps / MIN_PPS) / Math.log(MAX_PPS / MIN_PPS);
  const noClips = project.tracks.every((t) => t.clips.length === 0);
  const dragClip = drag ? findClip(project, drag.id) : undefined;
  const snapLine = drag?.snap ?? trimSnap;

  return (
    <section className="timeline" data-testid="timeline">
      <div className="tl-toolbar" role="toolbar" aria-label="Инструменты таймлайна">
        <Tool icon={<Undo2 size={17} />} label="Отменить" title="Отменить последнее действие (Ctrl+Z)" disabled={!canUndo} onClick={() => getState().undo()} testId="undo" />
        <Tool icon={<Redo2 size={17} />} label="Вернуть" title="Вернуть отменённое (Ctrl+Y)" disabled={!canRedo} onClick={() => getState().redo()} testId="redo" />
        <span className="sep" />
        <Tool icon={<Scissors size={17} />} label="Разрезать" title="Разрезать клип там, где розовая линия времени (S)" onClick={splitAtPlayhead} disabled={noClips} testId="split" />
        <Tool icon={<Trash2 size={17} />} label="Удалить" title="Удалить выделенное (Delete)" onClick={deleteSelection} disabled={!selection.length} testId="delete" />
        <Tool icon={<Copy size={17} />} label="Копия" title="Сделать копию выделенного клипа (Ctrl+D)" onClick={duplicateSelection} disabled={selection.length !== 1} testId="duplicate" />
        {selClip?.group && selection.length === 1
          ? <Tool icon={<Ungroup size={17} />} label="Разгруппировать" title="Разобрать группу обратно на клипы (Ctrl+Shift+G)" onClick={ungroupSelection} testId="tl-ungroup" />
          : <Tool icon={<Group size={17} />} label="Группа" title="Склеить выделенные клипы в одну группу — выдели несколько с Ctrl (Ctrl+G)" onClick={() => void groupSelection()} disabled={selection.length < 2} testId="tl-group" />}
        <Tool icon={<Bookmark size={17} />} label="Маркер" title="Поставить маркер там, где линия времени (M). Shift+M — к следующему, Ctrl+Shift+M — к предыдущему. Из маркеров получаются главы для YouTube"
          onClick={() => addMarkerAtPlayhead()} testId="tl-marker" />
        <Tool icon={<Snowflake size={17} />} label="Стоп-кадр" title="Остановить кадр там, где розовая линия времени" onClick={() => void freezeFrame()} disabled={noClips} testId="tl-freeze" />
        <Tool icon={<Rewind size={17} />} label="Реверс" title="Проиграть выделенный клип задом наперёд" on={!!selClip?.retime?.reverse} disabled={!selClip || sel?.asset?.kind === 'image'}
          onClick={() => selClip && void retimeClip(selClip.id, { reverse: !selClip.retime?.reverse })} testId="tl-reverse" />
        <Tool icon={<AudioLines size={17} />} label="Звук отдельно" title="Извлечь звук видео на отдельную аудиодорожку (у видео звук выключится)"
          disabled={!selClip || !sel?.asset?.hasAudio || sel.asset.kind === 'audio'} onClick={() => selClip && void extractAudio(selClip.id)} testId="tl-extract" />
        <Tool icon={<Mic size={17} />} label={recording ? 'Стоп' : 'Голос'} title={recording ? 'Остановить запись голоса' : 'Записать голос с микрофона от розовой линии времени'} className={recording ? 'rec-on' : ''} testId="tl-rec"
          onClick={() => { if (recording) void stopRecording(); else { getState().setLeftTab('audio'); void startRecording(recPrefs.mic, recPrefs.mute); } }} />
        <span className="sep" />
        <Tool icon={<Wand2 size={17} />} label="Убрать паузы" title="Вырезать тишину между фразами в выделенном клипе" disabled={!canPauses}
          onClick={() => selClip && void removePauses(selClip.id)} />
        <Tool icon={<Activity size={17} />} label="Под бит" title="Подогнать склейки основной дорожки под доли такта музыки (сначала найди ритм во вкладке «Аудио»)" disabled={!hasBeats}
          onClick={() => alignToBeats()} testId="tl-beats" />
        <Tool icon={<Blend size={17} />} label="Переход" title="Выбрать переход для стыка двух клипов" disabled={!junction && !(selClip && sel?.track.kind === 'main')}
          onClick={() => getState().setLeftTab('transitions')} />
        <div className="grow" />
        <Tool icon={<ZoomOut size={17} />} label="Мельче" title="Уменьшить масштаб таймлайна (−)" onClick={() => zoomTo(pps / 1.4)} />
        <input type="range" className="zoom" min={0} max={1} step={0.001} value={zoomVal} aria-label="Масштаб таймлайна" title="Масштаб таймлайна"
          onChange={(e) => zoomTo(MIN_PPS * Math.pow(MAX_PPS / MIN_PPS, Number(e.target.value)))} />
        <Tool icon={<ZoomIn size={17} />} label="Крупнее" title="Увеличить масштаб таймлайна (+)" onClick={() => zoomTo(pps * 1.4)} />
        <Tool icon={<Maximize2 size={16} />} label="Весь ролик" title="Показать весь ролик целиком" onClick={fit} />
      </div>
      <div className="tl-body">
        <div className="tl-heads">
          <div className="tl-corner" style={{ height: RULER_H }} />
          <div className="tl-heads-list" ref={headsRef}>
            <div style={{ height: TOP_PAD }} />
            {rows.map((r) => <TrackHead key={r.track.id} row={r} />)}
            <div style={{ height: 400 }} />
          </div>
        </div>
        <div className="tl-scroll" ref={scrollRef}>
          <div className="tl-content" style={{ width: contentW, height: contentH + RULER_H }}>
            <Ruler pps={pps} view={view} width={contentW} onScrub={onScrub} timeAt={timeAt} />
            <div className="tl-rows" style={{ height: contentH }} onPointerDown={onEmptyDown}
              onDragOver={(e) => onRowDragOver(e, null)} onDragLeave={() => setDropRow(null)} onDrop={(e) => onRowDrop(e, null)}>
              <div className={`new-zone ${drag?.rowTrackId === 'new' ? 'drop' : ''}`} style={{ height: TOP_PAD }}>
                {drag?.rowTrackId === 'new' && <span>Новая дорожка</span>}
              </div>
              {rows.map((r) => {
                const isDropTarget = dropRow === r.track.id || (drag && drag.mode === 'move' && drag.rowTrackId === r.track.id && drag.rowTrackId !== dragClip?.track.id);
                return (
                  <div key={r.track.id} className={`track-row ${r.track.kind} ${isDropTarget ? 'drop' : ''}`} style={{ height: r.height }}
                    data-track={r.track.kind}
                    onPointerMove={r.track.kind === 'main' ? (e) => onMainHover(e) : undefined}
                    onPointerLeave={r.track.kind === 'main' ? () => setHoverJ(null) : undefined}
                    onDragOver={(e) => { e.stopPropagation(); onRowDragOver(e, r); }} onDrop={(e) => onRowDrop(e, r)}>
                    {r.track.clips.map((c) => {
                      if (drag && c.id === drag.id) return null;
                      // несколько выделенных: движущиеся клипы рисуем ниже — призраками на новом месте
                      if (drag?.multi?.ids.includes(c.id) && (r.track.kind !== 'main' ? Math.abs(drag.multi.dt) > 1e-6 : drag.mode === 'reorder')) return null;
                      return <ClipView key={c.id} clip={c} track={r.track} asset={c.type === 'media' ? assets.get(c.assetId) : undefined}
                        pps={pps} view={view} selected={selection.includes(c.id)} rowH={r.height} onDown={onClipDown} />;
                    })}
                    {drag && dragClip && drag.rowTrackId === r.track.id && (
                      <ClipView clip={dragClip.clip} track={r.track} asset={dragClip.clip.type === 'media' ? assets.get(dragClip.clip.assetId) : undefined}
                        pps={pps} view={view} selected rowH={r.height} ghost left={xOf(drag.start, pps)} onDown={onClipDown} />
                    )}
                    {drag?.multi && r.track.kind !== 'main' && Math.abs(drag.multi.dt) > 1e-6 && r.track.clips
                      .filter((c) => c.id !== drag.id && drag.multi!.ids.includes(c.id))
                      .map((c) => (
                        <ClipView key={`g-${c.id}`} clip={c} track={r.track} asset={c.type === 'media' ? assets.get(c.assetId) : undefined}
                          pps={pps} view={view} selected rowH={r.height} ghost left={xOf(c.start + drag.multi!.dt, pps)} onDown={onClipDown} />
                      ))}
                    {r.track.kind === 'main' && !drag && junctions.filter((j) => j.has || j.id === hoverJ || j.id === junction).map((j) => (
                      <button key={j.id} className={`junction ${j.has ? 'has' : ''} ${junction === j.id ? 'active' : ''}`} style={{ left: j.x }}
                        title={j.has ? 'Переход — нажми, чтобы изменить' : 'Добавить переход'} data-testid="junction"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => { getState().select([], j.id); getState().setLeftTab('transitions'); }}>
                        {j.has ? <Blend size={12} /> : <Plus size={12} />}
                      </button>
                    ))}
                    {r.track.kind === 'main' && drag?.mode === 'reorder' && drag.insertIndex !== undefined && (() => {
                      const others = r.track.clips.filter((c) => c.id !== drag.id && !drag.multi?.ids.includes(c.id));
                      const tIns = drag.insertIndex < others.length ? others[drag.insertIndex].start : others.length ? clipEnd(others[others.length - 1]) : 0;
                      return <div className="insert-mark" style={{ left: xOf(tIns, pps) }} />;
                    })()}
                    {r.track.kind === 'main' && noClips && (
                      <div className="tl-empty">Перетащи сюда видео или фото из медиатеки</div>
                    )}
                  </div>
                );
              })}
            </div>
            {snapLine !== null && snapLine !== undefined && <div className="snap-line" style={{ left: xOf(snapLine, pps), top: RULER_H, height: contentH }} />}
            {box && <div className="tl-marquee" data-testid="tl-marquee" style={{ left: box.x0, top: box.y0 + RULER_H, width: box.x1 - box.x0, height: box.y1 - box.y0 }} />}
            <Playhead pps={pps} height={Math.min(view.height, contentH + RULER_H)} scrollRef={scrollRef} view={view} />
          </div>
        </div>
      </div>
    </section>
  );
}
