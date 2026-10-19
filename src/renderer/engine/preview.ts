// Движок превью: синхронное воспроизведение всех дорожек и сборка кадра на canvas.
// Геометрия, цвет, переходы и текст — те же функции/формулы, что и в экспорте.
import { aiSource, audioSource, videoSource } from '../../shared/ai';
import { mediaPropsAt } from '../../shared/anim';
import { maskBytes } from '../../shared/mask';
import { fxGeometry, particleEffects, sortedEffects } from '../../shared/effects';
import { drawParticles } from '../../shared/particles';
import { applyPixelEffects } from './effectsPreview';
import { ChromaKeyer } from './chroma';
import { effectiveColor, isIdentity, svgFilterMarkup } from '../../shared/color';
import { gradeActive } from '../../shared/grade';
import { GradeProcessor, lutFor, setLutListener } from './grade';
import { BLUR_SIGMA_1080, placeOnCanvas, unitScale } from '../../shared/geometry';
import { drawText } from '../../shared/textRender';
import { clipDuration, clipEnd, projectDuration } from '../../shared/timeline';
import { drawTransition } from '../../shared/transitions';
import type { BlendMode, Mask, MediaAsset, MediaClip, Project, Track } from '../../shared/types';

const COMPOSITE: Record<Exclude<BlendMode, 'normal'>, GlobalCompositeOperation> = {
  multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', add: 'lighter',
};

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
  private muted = false;
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

  constructor(private canvas: HTMLCanvasElement, private mediaUrl: (p: string) => string, private readLut: (p: string) => Promise<string | null> = async () => null) {
    setLutListener(() => { this.dirty = true; });
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

  /** Всё загружено, перемотано и нарисовано (для автотестов и снимков кадра). */
  settled(): boolean {
    if (this.dirty || this.playing) return false;
    for (const e of this.media.values()) {
      if (!e.ready) return false;
      if (e.kind === 'video') {
        const v = e.el as HTMLVideoElement;
        if (v.seeking || v.readyState < 2) return false;
      }
    }
    return true;
  }

  /** Заглушить звук превью (во время записи голоса — чтобы не попадал в микрофон). */
  setMuted(b: boolean): void {
    this.muted = b;
    if (this.master) this.master.gain.value = b ? 0 : 1;
  }

  /** Текущий кадр как картинка (для тестов и стоп-кадра). */
  snapshot(): string { return this.canvas.toDataURL('image/png'); }

  // ---------- элементы ----------
  private ensureAudio(): void {
    if (this.ac) return;
    this.ac = new AudioContext({ latencyHint: 'playback' });
    this.master = this.ac.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
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
      // после перемотки кадр на видеокарте может появиться чуть позже события — перерисуем ещё пару раз
      m.onseeked = () => {
        this.dirty = true;
        setTimeout(() => { this.dirty = true; }, 60);
        setTimeout(() => { this.dirty = true; }, 250);
      };
      if (kind === 'video') {
        const v = m as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
        const onFrame = () => { this.dirty = true; if (v.src) v.requestVideoFrameCallback?.(onFrame); };
        v.requestVideoFrameCallback?.(onFrame);
      }
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
        if (a.kind === 'audio') {
          const as = audioSource(c);
          want.set(`${c.id}:a`, { kind: 'audio', path: as ? as.path : a.previewPath || a.path, offset: as ? as.offset : 0 });
          continue;
        }
        const vs = videoSource(c);
        want.set(`${c.id}:v`, { kind: 'video', path: vs ? vs.path : a.previewPath || a.path, offset: vs ? vs.offset : 0 });
        const as = audioSource(c);
        if (as) want.set(`${c.id}:a`, { kind: 'audio', path: as.path, offset: as.offset });
        else if (vs && a.hasAudio) want.set(`${c.id}:a`, { kind: 'audio', path: a.previewPath || a.path, offset: 0 });
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
    } else if (this.dirty) {
      // после любой перемены ещё ~0.6 с перерисовываем каждый кадр: на видеокарте кадр видео после перемотки
      // может стать доступен чуть позже событий — так он точно попадёт на экран
      this.settleUntil = performance.now() + 600;
    } else if (performance.now() > this.settleUntil) {
      return;
    }
    this.syncPlayback(this.t);
    this.render(this.t);
    this.dirty = false;
  }
  private settleUntil = 0;

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
        const asset = p.assets.find((x) => x.id === c.assetId);
        const loopDur = asset?.loop && asset.duration > 0 ? asset.duration : 0; // GIF: время по кругу
        const wrap = (s: number) => (loopDur ? ((s % loopDur) + loopDur) % loopDur : s);
        for (const e of [ve, ae]) {
          if (!e || e.kind === 'image') continue;
          const m = e.el as HTMLMediaElement;
          const start = c.start;
          const end = clipEnd(c);
          const active = t >= start - EPS && t < end - EPS;
          const desired = wrap(c.in + (t - start) * c.speed - e.offset);
          if (loopDur && !m.loop) m.loop = true;
          const separateAudio = e === ve && !!ae;
          if (e.gain && this.ac) e.gain.gain.setTargetAtTime(this.gainFor(c, track, prevTr, t, separateAudio), this.ac.currentTime, 0.01);
          if (this.playing && active) {
            if (Math.abs(m.playbackRate - c.speed) > 0.001 && m.paused) m.playbackRate = c.speed;
            if (m.paused) {
              if (Math.abs(m.currentTime - desired) > 0.04) m.currentTime = Math.max(0, desired);
              m.playbackRate = c.speed;
              void m.play().catch(() => undefined);
            } else {
              let drift = m.currentTime - desired;
              if (loopDur) drift -= Math.round(drift / loopDur) * loopDur; // переход через конец круга — не рассинхрон
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
            const pre = wrap(c.in - e.offset);
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

  private drawLayer(c2d: CanvasRenderingContext2D, c: MediaClip, asset: MediaAsset, isMain: boolean, t: number): void {
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
    const mp = mediaPropsAt(c, t);
    if (mp.opacity <= 0.001) return;
    const local = t - c.start;
    const g = fxGeometry(c.effects, local, clipDuration(c));
    const pl = placeOnCanvas(W, H, asset.width, asset.height, c.fit, { x: mp.x + g.dx, y: mp.y + g.dy, scale: mp.scale * g.scale, rotation: mp.rotation + g.drot });
    let img: CanvasImageSource = src.el;
    if (c.chroma) {
      const sc = Math.min(1, 1920 / Math.max(src.w, src.h));
      img = this.keyer().process(src.el as TexImageSource, Math.max(1, Math.round(src.w * sc)), Math.max(1, Math.round(src.h * sc)), c.chroma) ?? src.el;
    }
    const colorFilter = isIdentity(effectiveColor(c.color)) ? 'none' : `url(#kf-${c.id})`;
    c2d.save();
    c2d.globalAlpha = Math.min(1, mp.opacity);
    if (!isMain && c.blend && c.blend !== 'normal') c2d.globalCompositeOperation = COMPOSITE[c.blend];
    c2d.translate(pl.cx, pl.cy);
    if (pl.rotation) c2d.rotate((pl.rotation * Math.PI) / 180);
    c2d.imageSmoothingQuality = 'high';
    const fx = sortedEffects(c.effects);
    const cube = lutFor(c.grade?.lut?.path, this.readLut);
    const graded = gradeActive(c.grade, !!cube, c.color);
    if (c.mask || fx.length || graded) {
      // слой нужного размера: цвет → эффекты → маска (destination-in) → на холст
      const w = Math.max(1, Math.round(pl.w));
      const h = Math.max(1, Math.round(pl.h));
      const layer = this.canvasFor(`${c.id}:layer`, w, h);
      const lc = layer.getContext('2d', { willReadFrequently: true })!;
      lc.save();
      lc.globalCompositeOperation = 'copy';
      lc.filter = colorFilter;
      lc.imageSmoothingQuality = 'high';
      lc.drawImage(img, 0, 0, w, h);
      lc.filter = 'none';
      lc.restore();
      if (graded) this.grader().apply(layer, c.grade ?? {}, cube, c.color);
      if (fx.length) applyPixelEffects(layer, c, local, (l, key, tb) => this.grader().applyTable(l, key, tb));
      if (c.mask) {
        lc.save();
        lc.globalCompositeOperation = 'destination-in';
        lc.drawImage(this.maskCanvas(c.id, c.mask, w, h), 0, 0, w, h);
        lc.restore();
      }
      c2d.drawImage(layer, -pl.w / 2, -pl.h / 2, pl.w, pl.h);
    } else {
      c2d.filter = colorFilter;
      c2d.drawImage(img, -pl.w / 2, -pl.h / 2, pl.w, pl.h);
    }
    c2d.restore();
  }

  private graderInst: GradeProcessor | null = null;
  private grader(): GradeProcessor { this.graderInst ??= new GradeProcessor(); return this.graderInst; }
  private keyerInst: ChromaKeyer | null = null;
  private keyer(): ChromaKeyer { this.keyerInst ??= new ChromaKeyer(); return this.keyerInst; }
  private canvases = new Map<string, HTMLCanvasElement>();
  private canvasFor(key: string, w: number, h: number): HTMLCanvasElement {
    let cv = this.canvases.get(key);
    if (!cv) { cv = document.createElement('canvas'); this.canvases.set(key, cv); }
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return cv;
  }
  private maskKeys = new Map<string, string>();
  /** Маска считается той же функцией, что и PNG для экспорта; пересчёт — только при смене размера или формы. */
  private maskCanvas(id: string, m: Mask, w: number, h: number): HTMLCanvasElement {
    const mw = Math.max(1, Math.min(w, 960));
    const mh = Math.max(1, Math.round((h * mw) / w));
    const key = `${JSON.stringify(m)}:${mw}x${mh}`;
    const cv = this.canvasFor(`${id}:mask`, mw, mh);
    if (this.maskKeys.get(id) === key) return cv;
    const bytes = maskBytes(m, mw, mh);
    const img = new ImageData(mw, mh);
    for (let i = 0; i < bytes.length; i++) { img.data[i * 4 + 3] = bytes[i]; }
    cv.getContext('2d')!.putImageData(img, 0, 0);
    this.maskKeys.set(id, key);
    return cv;
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
        if (aA) this.drawLayer(ca, A, aA, true, t);
        if (aB) this.drawLayer(cb, B, aB, true, t);
        if (tr) drawTransition(ctx, tr.type, (t - B.start) / tr.duration, this.layerA, this.layerB, W, H, this.scratch);
        else ctx.drawImage(this.layerB, 0, 0);
      } else if (act.length === 1) {
        const c = main.clips[act[0]] as MediaClip;
        const a = assetOf(c);
        if (a) this.drawLayer(ctx, c, a, true, t);
      }
    }
    for (const track of p.tracks) {
      if (track.hidden || track.kind === 'main' || track.kind === 'audio') continue;
      for (const c of track.clips) {
        if (t < c.start - EPS || t >= clipEnd(c) - EPS) continue;
        if (c.type === 'text') drawText(ctx, c, W, H, t - c.start);
        else {
          const a = assetOf(c);
          if (a && a.kind !== 'audio') this.drawLayer(ctx, c, a, false, t);
        }
      }
    }
    // частицы (снег, конфетти…) — поверх всего, как отдельный слой в экспорте
    for (const track of p.tracks) {
      if (track.hidden || track.kind === 'audio' || track.kind === 'text') continue;
      for (const c of track.clips) {
        if (c.type !== 'media' || t < c.start - EPS || t >= clipEnd(c) - EPS) continue;
        const pe = particleEffects(c.effects);
        if (pe.length) drawParticles(ctx, pe, t - c.start, W, H);
      }
    }
    ctx.restore();
  }
}
