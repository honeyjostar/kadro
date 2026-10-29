// Прослушать звук до того, как класть его на таймлайн: один общий плеер на всё окно — новый трек
// останавливает прошлый; запуск ролика на таймлайне останавливает прослушивание.
import { useSyncExternalStore } from 'react';
import { api, useStore } from './store';

interface State { key: string | null; t: number; dur: number; playing: boolean }
let st: State = { key: null, t: 0, dur: 0, playing: false };
const subs = new Set<() => void>();
const emit = (s: Partial<State>) => { st = { ...st, ...s }; subs.forEach((f) => f()); };
let el: HTMLAudioElement | null = null;
let raf = 0;

function audio(): HTMLAudioElement {
  if (el) return el;
  el = new Audio();
  el.preload = 'auto';
  el.addEventListener('ended', () => { cancelAnimationFrame(raf); emit({ playing: false, t: 0 }); });
  el.addEventListener('pause', () => { cancelAnimationFrame(raf); emit({ playing: false }); });
  el.addEventListener('loadedmetadata', () => emit({ dur: el!.duration || 0 }));
  return el;
}
const tick = () => { if (el) emit({ t: el.currentTime }); raf = requestAnimationFrame(tick); };

/** Слушать файл с начала или с доли from (0..1); тот же трек — пауза / продолжить. */
export function togglePreview(key: string, path: string, from?: number): void {
  const a = audio();
  if (st.key === key && from === undefined) {
    if (st.playing) { a.pause(); return; }
  } else if (st.key !== key) {
    a.pause();
    a.src = api.mediaUrl(path);
    emit({ key, t: 0, dur: 0 });
  }
  const go = () => {
    if (from !== undefined && a.duration) a.currentTime = from * a.duration;
    void a.play().then(() => { emit({ playing: true }); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); }).catch(() => emit({ playing: false }));
  };
  if (from !== undefined && !a.duration) a.addEventListener('loadedmetadata', go, { once: true }); else go();
}

export function stopPreview(): void { if (el && !el.paused) el.pause(); }

/** Состояние прослушивания для строки с ключом key. */
export function usePreview(key: string): { playing: boolean; progress: number } {
  const s = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st);
  return s.key === key ? { playing: s.playing, progress: s.dur ? s.t / s.dur : 0 } : { playing: false, progress: 0 };
}

// запустили ролик на таймлайне — прослушивание останавливается
useStore.subscribe((s, prev) => { if (s.playing && !prev.playing) stopPreview(); });
