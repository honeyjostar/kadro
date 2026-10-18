// Движок превью: синхронное воспроизведение всех дорожек и сборка кадра на canvas.
// Геометрия, цвет, переходы и текст — те же функции/формулы, что и в экспорте.
import { aiSource } from '../../shared/ai';
import { effectiveColor, isIdentity, svgFilterMarkup } from '../../shared/color';
import { BLUR_SIGMA_1080, placeOnCanvas, unitScale } from '../../shared/geometry';
import { drawText } from '../../shared/textRender';
import { clipDuration, clipEnd, projectDuration } from '../../shared/timeline';
import { drawTransition } from '../../shared/transitions';
import type { MediaAsset, MediaClip, Project, Track } from '../../shared/types';

type MediaEl = HTMLVideoElement | HTMLAudioElement | HTMLImageElement;

interface Entry {
  key: string;
  el: MediaEl;
  src: string;
  offset: number;       // время 0 в файле = этот момент исходника
  kind: 'video' | 'audio' | 'image';
  node?: MediaElementAudioSourceNode;
  gain?: GainNode;
  ready: boolean;
  fallback?: Entry;     // прежний файл клипа: показываем его, пока новый не загрузился (без чёрной вспышки)
}

const EPS = 1e-3;

export class PreviewEngine {
  private ctx: CanvasRenderingContext2D;
  private layerA = document.createElement('canvas');
  private layerB = document.createElement('canvas');
  private scratch = document.createElement('canvas');
  private media = new Map<string, Entry>();
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private project: Project | null = null;
  private raf = 0;
  private playing = false;
  private wallStart = 0;
  private tStart = 0;
  private t = 0;
  private dirty = true;
  private filterDefs: SVGDefsElement | null;
  private filterKeys = new Map<string, string>();
  W = 0;
  H = 0;
  onTime?: (t: number) => void;
  onEnded?: () => void;

  constructor(private canvas: HTMLCanvasElement, private mediaUrl: (p: string) => string) {
    this.ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    this.filterDefs = document.querySelector('#kadro-filters defs');
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  get time(): number { return this.t; }
  get isPlaying(): boolean { return this.playing; }

  setSize(w: number, h: number): void {
    w = Math.max(2, Math.round(w));
    h = Math.max(2, Math.round(h));
    if (w === this.W && h === this.H) return;
    this.W = w;
    this.H = h;
    for (const c of [this.canvas, this.layerA, this.layerB, this.scratch]) { c.width = w; c.height = h; }
    this.dirty = true;
  }

  setProject(p: Project): void {
    this.project = p;
    this.syncFilters();
    this.syncElements();
    this.dirty = true;
  }

  seek(t: number): void {
    this.t = Math.max(0, t);
    this.tStart = this.t;
    this.wallStart = performance.now();
    this.dirty = true;
  }

  async play(from?: number): Promise<void> {
    if (!this.project) return;
    if (from !== undefined) this.seek(from);
    const dur = projectDuration(this.project);
    if (this.t >= dur - 0.02) this.seek(0);
    this.ensureAudio();
    if (this.ac?.state === 'suspended') await this.ac.resume().catch(() => undefined);
    this.playing = true;
    this.tStart = this.t;
    this.wallStart = performance.now();
    this.dirty = true;
  }

  pause(): void {
    this.playing = false;
    for (const e of this.media.values()) if (e.kind !== 'image') (e.el as HTMLMediaElement).pause();
    this.dirty = true;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    for (const e of this.media.values()) { this.dropFallback(e); this.dispose(e); }
    this.media.clear();
    void this.ac?.close();
  }

  /** Текущий кадр как картинка (для тестов и стоп-кадра). */
  snapshot(): string { return this.canvas.toDataURL('image/png'); }

  // ---------- элементы ----------
  private ensureAudio(): void {
    if (this.ac) return;
    this.ac = new AudioContext({ latencyHint: 'playback' });
    this.master = this.ac.createGain();
    this.master.connect(this.ac.destination);
    for (const e of this.media.values()) this.connect(e);
  }

  private connect(e: Entry): void {
    if (!this.ac || !this.master || e.kind === 'image' || e.node) return;
    try {
      e.node = this.ac.createMediaElementSource(e.el as HTMLMediaElement);
      e.gain = this.ac.createGain();
      e.gain.gain.value = 0;
      e.node.connect(e.gain).connect(this.master);
    } catch {
      /* элемент уже подключён */
    }
  }

  private dispose(e: Entry): void {
    if (e.kind !== 'image') {
      const m = e.el as HTMLMediaElement;
      m.pause();
      m.removeAttribute('src');
      m.load();
    }
    try { e.node?.disconnect(); e.gain?.disconnect(); } catch { /* уже отключён */ }
  }

  private makeEntry(key: string, kind: Entry['kind'], path: string, offset: number): Entry {
    const src = this.mediaUrl(path);
    let el: MediaEl;
    if (kind === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => { entry.ready = true; this.dropFallback(entry); this.dirty = true; };
      img.src = src;
      el = img;
    } else {
      const m = document.createElement(kind === 'video' ? 'video' : 'audio');
      m.crossOrigin = 'anonymous';
      m.preload = 'auto';
      (m as HTMLVideoElement).playsInline = true;
      m.preservesPitch = true;
      m.onloadeddata = () => { entry.ready = true; this.dropFallback(entry); this.dirty = true; };
      m.onseeked = () => { this.dirty = true; };
      m.onerror = () => { entry.ready = false; };
      m.src = src;
      el = m;
    }
    const entry: Entry = { key, el, src, offset, kind, ready: false };
    this.connect(entry);
    return entry;
  }

  private dropFallback(e: Entry): void {
    if (!e.fallback) return;
    this.dispose(e.fallback);
    e.fallback = undefined;
  }

  /** Какие элементы нужны каждому клипу: картинка/видео и, при чистке голоса, отдельный звук. */
  private wanted(): Map<string, { kind: Entry['kind']; path: string; offset: number }> {
    const want = new Map<string, { kind: Entry['kind']; path: string; offset: number }>();
    const p = this.project;
    if (!p) return want;
    for (const track of p.tracks) {
      for (const c of track.clips) {
        if (c.type !== 'media') continue;
        const a = p.assets.find((x) => x.id === c.assetId);
        if (!a) continue;
        if (a.kind === 'image') { want.set(`${c.id}:v`, { kind: 'image', path: a.previewPath || a.path, offset: 0 }); continue; }
        if (a.kind === 'audio') { want.set(`${c.id}:a`, { kind: 'audio', path: a.previewPath || a.path, offset: 0 }); continue; }
        const bg = aiSource(c, 'removeBg');
        want.set(`${c.id}:v`, { kind: 'video', path: bg ? bg.path : a.previewPath || a.path, offset: bg ? bg.offset : 0 });
        const den = aiSource(c, 'denoise');
        if (den) want.set(`${c.id}:a`, { kind: 'audio', path: den.path, offset: den.offset });
        else if (bg && a.hasAudio) want.set(`${c.id}:a`, { kind: 'audio', path: a.previewPath || a.path, offset: 0 });
      }
    }
    return want;
  }

  private syncElements(): void {
    const want = this.wanted();
    for (const [key, e] of this.media) {
      const w = want.get(key);
      if (!w || this.mediaUrl(w.path) !== e.src || w.kind !== e.kind) {
        this.media.delete(key);
        if (w && w.kind === e.kind && e.kind !== 'audio' && (e.ready || e.fallback)) {
          // файл клипа сменился (прокси готов, фон удалён): старый кадр держим до готовности нового
          const n = this.makeEntry(key, w.kind, w.path, w.offset);
          n.fallback = e.ready ? e : e.fallback;
          if (e.ready) this.dropFallback(e); else this.dispose(e);
          if (n.fallback && n.fallback.kind !== 'image') (n.fallback.el as HTMLMediaElement).pause();
          if (n.fallback?.gain) n.fallback.gain.gain.value = 0;
          this.media.set(key, n);
        } else {
          this.dropFallback(e);
          this.dispose(e);
        }
      } else {
        e.offset = w.offset;
      }
    }
    for (const [key, w] of want) {
      if (!this.media.has(key)) this.media.set(key, this.makeEntry(key, w.kind, w.path, w.offset));
    }
  }

  private syncFilters(): void {
    if (!this.filterDefs || !this.project) return;
    const seen = new Set<string>();
    for (const t of this.project.tracks) for (const c of t.clips) {
      if (c.type !== 'media') continue;
      const e = effectiveColor(c.color);
      if (isIdentity(e)) continue;
      const id = `kf-${c.id}`;
      seen.add(id);
      const markup = svgFilterMarkup(id, e);
      if (this.filterKeys.get(id) === markup) continue;
      this.filterDefs.querySelector(`#${CSS.escape(id)}`)?.remove();
      this.filterDefs.insertAdjacentHTML('beforeend', markup);
      this.filterKeys.set(id, markup);
    }
    for (const id of [...this.filterKeys.keys()]) {
      if (!seen.has(id)) { this.filterDefs.querySelector(`#${CSS.escape(id)}`)?.remove(); this.filterKeys.delete(id); }
    }
  }

  // ---------- каждый кадр ----------
  private frame(): void {
    const p = this.project;
    if (!p) return;
    if (this.playing) {
      const dur = projectDuration(p);
      this.t = this.tStart + (performance.now() - this.wallStart) / 1000;
      if (this.t >= dur) {
        this.t = dur;
        this.pause();
        this.onTime?.(this.t);
        this.onEnded?.();
      } else {
        this.onTime?.(this.t);
      }
    } else if (!this.dirty) {
      return;
    }
    this.syncPlayback(this.t);
    this.render(this.t);
    this.dirty = false;
  }

  private gainFor(c: MediaClip, track: Track, prevTr: number, t: number, isVisualEntryWithSeparateAudio: boolean): number {
    if (isVisualEntryWithSeparateAudio || track.muted || c.muted) return 0;
    let v = c.volume;
    const local = t - c.start;
    const dur = clipDuration(c);
    const fi = Math.max(c.fadeIn, prevTr);
    const fo = Math.max(c.fadeOut, track.kind === 'main' ? c.transitionOut?.duration ?? 0 : 0);
    if (fi > 0.001 && local < fi) v *= Math.max(0, local / fi);
    if (fo > 0.001 && dur - local < fo) v *= Math.max(0, (dur - local) / fo);
    return v;
  }

  private syncPlayback(t: number): void {
    const p = this.project!;
    for (const track of p.tracks) {
      track.clips.forEach((c, i) => {
        if (c.type !== 'media') return;
        const prev = track.kind === 'main' && i > 0 ? track.clips[i - 1] : undefined;
        const prevTr = prev && prev.type === 'media' ? prev.transitionOut?.duration ?? 0 : 0;
        const ve = this.media.get(`${c.id}:v`);
        const ae = this.media.get(`${c.id}:a`);
        for (const e of [ve, ae]) {
          if (!e || e.kind === 'image') continue;
          const m = e.el as HTMLMediaElement;
          const start = c.start;
          const end = clipEnd(c);
          const active = t >= start - EPS && t < end - EPS;
          const desired = c.in + (t - start) * c.speed - e.offset;
          const separateAudio = e === ve && !!ae;
          if (e.gain && this.ac) e.gain.gain.setTargetAtTime(this.gainFor(c, track, prevTr, t, separateAudio), this.ac.currentTime, 0.01);
          if (this.playing && active) {
            if (Math.abs(m.playbackRate - c.speed) > 0.001 && m.paused) m.playbackRate = c.speed;
            if (m.paused) {
              if (Math.abs(m.currentTime - desired) > 0.04) m.currentTime = Math.max(0, desired);
              m.playbackRate = c.speed;
              void m.play().catch(() => undefined);
            } else {
              const drift = m.currentTime - desired;
              if (Math.abs(drift) > 0.2) {
                m.currentTime = Math.max(0, desired);
              } else {
                // мягкая подстройка скорости вместо рывков
                const k = Math.max(-0.08, Math.min(0.08, drift * 0.6));
                m.playbackRate = c.speed * (1 - k);
              }
            }
          } else if (this.playing && t < start && start - t < 0.8) {
            if (!m.paused) m.pause();
            const pre = c.in - e.offset;
            if (Math.abs(m.currentTime - pre) > 0.04) m.currentTime = Math.max(0, pre);
          } else {
            if (!m.paused) m.pause();
            if (!this.playing && active && e === ve && Math.abs(m.currentTime - desired) > 1 / 90) m.currentTime = Math.max(0, desired);
          }
        }
      });
    }
  }

  private source(clipId: string): { el: CanvasImageSource; w: number; h: number } | null {
    const cur = this.media.get(`${clipId}:v`);
    const e = cur?.ready ? cur : cur?.fallback?.ready ? cur.fallback : undefined;
    if (!e) return null;
    if (e.kind === 'image') {
      const img = e.el as HTMLImageElement;
      return img.complete && img.naturalWidth ? { el: img, w: img.naturalWidth, h: img.naturalHeight } : null;
    }
    const v = e.el as HTMLVideoElement;
    if (v.readyState < 2 || !v.videoWidth) return null;
    return { el: v, w: v.videoWidth, h: v.videoHeight };
  }

  private drawLayer(c2d: CanvasRenderingContext2D, c: MediaClip, asset: MediaAsset, isMain: boolean): void {
    const { W, H } = this;
    const src = this.source(c.id);
    const bgRemoved = !!aiSource(c, 'removeBg');
    if (isMain) {
      const bg = this.project!.settings.background;
      c2d.save();
      c2d.globalAlpha = 1;
      c2d.filter = 'none';
      c2d.fillStyle = bg === 'white' ? '#fff' : '#000';
      c2d.fillRect(0, 0, W, H);
      if (bg === 'blur' && !bgRemoved && src) {
        const cov = Math.max(W / asset.width, H / asset.height);
        const cw = asset.width * cov;
        const ch = asset.height * cov;
        c2d.filter = `blur(${BLUR_SIGMA_1080 * unitScale(W, H)}px)`;
        c2d.drawImage(src.el, (W - cw) / 2, (H - ch) / 2, cw, ch);
      }
      c2d.restore();
    }
    if (!src) return;
    const pl = placeOnCanvas(W, H, asset.width, asset.height, c.fit, c.transform);
    c2d.save();
    c2d.translate(pl.cx, pl.cy);
    if (pl.rotation) c2d.rotate((pl.rotation * Math.PI) / 180);
    const e = effectiveColor(c.color);
    c2d.filter = isIdentity(e) ? 'none' : `url(#kf-${c.id})`;
    c2d.imageSmoothingQuality = 'high';
    c2d.drawImage(src.el, -pl.w / 2, -pl.h / 2, pl.w, pl.h);
    c2d.restore();
  }

  private render(t: number): void {
    const p = this.project!;
    const { ctx, W, H } = this;
    if (!W || !H) return;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const assetOf = (c: MediaClip) => p.assets.find((a) => a.id === c.assetId);
    const main = p.tracks.find((tr) => tr.kind === 'main');
    if (main && !main.hidden) {
      const act: number[] = [];
      main.clips.forEach((c, i) => { if (t >= c.start - EPS && t < clipEnd(c) - EPS) act.push(i); });
      if (act.length >= 2) {
        const A = main.clips[act[0]] as MediaClip;
        const B = main.clips[act[1]] as MediaClip;
        const tr = A.transitionOut;
        const aA = assetOf(A);
        const aB = assetOf(B);
        const ca = this.layerA.getContext('2d')!;
        const cb = this.layerB.getContext('2d')!;
        if (aA) this.drawLayer(ca, A, aA, true);
        if (aB) this.drawLayer(cb, B, aB, true);
        if (tr) drawTransition(ctx, tr.type, (t - B.start) / tr.duration, this.layerA, this.layerB, W, H, this.scratch);
        else ctx.drawImage(this.layerB, 0, 0);
      } else if (act.length === 1) {
        const c = main.clips[act[0]] as MediaClip;
        const a = assetOf(c);
        if (a) this.drawLayer(ctx, c, a, true);
      }
    }
    for (const track of p.tracks) {
      if (track.hidden || track.kind === 'main' || track.kind === 'audio') continue;
      for (const c of track.clips) {
        if (t < c.start - EPS || t >= clipEnd(c) - EPS) continue;
        if (c.type === 'text') drawText(ctx, c, W, H);
        else {
          const a = assetOf(c);
          if (a && a.kind !== 'audio') this.drawLayer(ctx, c, a, false);
        }
      }
    }
    ctx.restore();
  }
}
