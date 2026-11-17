// «Проверка охватов»: водяные знаки, заставка в конце, рамка, пустое начало, звук и качество — на синтетических кадрах.
import { describe, expect, it } from 'vitest';
import { analyzeReach, barsOf, findMarks, scanFps, scanSize, staticIslands, type ReachInput } from '../../src/shared/reach';

const FW = 144, FH = 256;
function rng(seed: number) { let a = seed >>> 0 || 1; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

/** Кадр: меняющийся «шум» (снято с рук), по желанию — неподвижный логотип в рамке. */
function frame(k: number, opts: { logo?: { x: number; y: number; w: number; h: number }; still?: boolean; bars?: number; dark?: boolean; litDot?: boolean } = {}): Uint8Array {
  const f = new Uint8Array(FW * FH);
  const r = rng(opts.still ? 7 : 1000 + k * 17);
  for (let i = 0; i < f.length; i++) f[i] = opts.dark ? 4 : 40 + Math.floor(r() * 170);
  if (opts.bars) {
    const b = Math.round(FH * opts.bars / 2);
    for (let y = 0; y < FH; y++) if (y < b || y >= FH - b) for (let x = 0; x < FW; x++) f[y * FW + x] = 2;
  }
  if (opts.logo) {
    const { x, y, w, h } = opts.logo;
    for (let yy = Math.round(y * FH); yy < Math.round((y + h) * FH); yy++) for (let xx = Math.round(x * FW); xx < Math.round((x + w) * FW); xx++) {
      f[yy * FW + xx] = ((Math.floor(xx / 2) + Math.floor(yy / 2)) % 2) ? 250 : 10;
    }
  }
  if (opts.litDot) for (let yy = 120; yy < 136; yy++) for (let xx = 60; xx < 84; xx++) f[yy * FW + xx] = 230;
  return f;
}

function input(frames: Uint8Array[], extra: Partial<ReachInput> = {}): ReachInput {
  const step = 0.5;
  const D = frames.length * step;
  return {
    frames, fw: FW, fh: FH, step, duration: D, width: 1080, height: 1920, fps: 30, mbps: 8, hasAudio: true,
    rms: Array.from({ length: Math.round(D / 0.1) }, () => 0.1), rmsStep: 0.1, lufs: -14, peak: -1.5, ...extra,
  };
}

const LOGO = { x: 0.72, y: 0.04, w: 0.22, h: 0.06 };

describe('водяные знаки', () => {
  it('неподвижный логотип в углу поверх меняющейся картинки — находится, с рамкой там, где он есть', () => {
    const fr = Array.from({ length: 12 }, (_, k) => frame(k, { logo: LOGO }));
    const b = staticIslands(fr, FW, FH);
    expect(b.length).toBe(1);
    expect(b[0].x).toBeLessThanOrEqual(LOGO.x + 0.02);
    expect(b[0].x + b[0].w).toBeGreaterThanOrEqual(LOGO.x + LOGO.w - 0.08);
    expect(b[0].y).toBeLessThan(0.1);
  });
  it('без логотипа и в неподвижной сцене (штатив) — ничего', () => {
    expect(staticIslands(Array.from({ length: 12 }, (_, k) => frame(k)), FW, FH)).toEqual([]);
    expect(staticIslands(Array.from({ length: 12 }, (_, k) => frame(k, { still: true, logo: LOGO })), FW, FH)).toEqual([]);
  });
  it('надпись в середине кадра — не знак', () => {
    expect(staticIslands(Array.from({ length: 12 }, (_, k) => frame(k, { logo: { x: 0.35, y: 0.45, w: 0.3, h: 0.06 } })), FW, FH)).toEqual([]);
  });
  it('по всему ролику: знак с 0 до конца — одна запись со временем', () => {
    const fr = Array.from({ length: 30 }, (_, k) => frame(k, { logo: LOGO }));
    const m = findMarks(fr, FW, FH, 0.5, 15);
    expect(m.length).toBe(1);
    expect(m[0].t0).toBe(0);
    expect(m[0].t1).toBeGreaterThanOrEqual(14);
    const r = analyzeReach(input(fr), 'reels');
    const mark = r.issues.find((i) => i.kind === 'mark')!;
    expect(mark.level).toBe('cut');
    expect(mark.fix).toBe('hideMark');
    expect(mark.title).toContain('сверху справа');
  });
});

describe('рамка, заставка, начало', () => {
  it('чёрные поля сверху и снизу — «видео в рамке»', () => {
    expect(barsOf(frame(0, { bars: 0.3 }), FW, FH)).toBeGreaterThan(0.25);
    expect(barsOf(frame(0), FW, FH)).toBe(0);
    const r = analyzeReach(input(Array.from({ length: 20 }, (_, k) => frame(k, { bars: 0.3 }))), 'tiktok');
    const f = r.issues.find((i) => i.kind === 'frame')!;
    expect(f.fix).toBe('fill');
    expect(f.at).toBeGreaterThan(0.25);
  });
  it('заставка с логотипом в конце — резать с её начала', () => {
    const fr = [...Array.from({ length: 16 }, (_, k) => frame(k)), ...Array.from({ length: 4 }, () => frame(0, { dark: true, litDot: true }))];
    const e = analyzeReach(input(fr), null).issues.find((i) => i.kind === 'endcard')!;
    expect(e.fix).toBe('trimEnd');
    expect(e.at).toBe(8);
  });
  it('чёрный экран в начале', () => {
    const fr = [...Array.from({ length: 3 }, () => frame(0, { dark: true })), ...Array.from({ length: 17 }, (_, k) => frame(k))];
    const b = analyzeReach(input(fr), null).issues.find((i) => i.kind === 'blackStart')!;
    expect(b.at).toBe(1.5);
    expect(b.fix).toBe('trimStart');
  });
  it('первые 3 секунды ничего не происходит и тихо — предлагает начать с действия', () => {
    const fr = [...Array.from({ length: 6 }, () => frame(0, { still: true })), ...Array.from({ length: 14 }, (_, k) => frame(k + 1))];
    const rms = Array.from({ length: 100 }, (_, i) => (i < 30 ? 0.001 : 0.1));
    const d = analyzeReach(input(fr, { rms }), null).issues.find((i) => i.kind === 'deadStart')!;
    expect(d.fix).toBe('trimStart');
    expect(d.at).toBeCloseTo(2.5, 1);
    // со звуком в начале — уже не «пусто»
    expect(analyzeReach(input(fr), null).issues.some((i) => i.kind === 'deadStart')).toBe(false);
  });
});

describe('звук и качество', () => {
  const fr = Array.from({ length: 20 }, (_, k) => frame(k));
  it('тихо, перегруз, без звука, тишина в середине', () => {
    expect(analyzeReach(input(fr, { lufs: -26 }), null).issues.find((i) => i.kind === 'quiet')?.fix).toBe('loudnorm');
    expect(analyzeReach(input(fr, { peak: 0.4 }), null).issues.some((i) => i.kind === 'clip')).toBe(true);
    expect(analyzeReach(input(fr, { hasAudio: false, rms: [] }), null).issues.some((i) => i.kind === 'noAudio')).toBe(true);
    const rms = Array.from({ length: 100 }, (_, i) => (i >= 40 && i < 80 ? 0 : 0.1));
    const s = analyzeReach(input(fr, { rms }), null).issues.find((i) => i.kind === 'silence')!;
    expect([s.t0, s.t1]).toEqual([4, 8]);
  });
  it('480p, сильное сжатие, 15 к/с, горизонталь для Reels, длиннее лимита', () => {
    const r = analyzeReach(input(fr, { width: 854, height: 480, mbps: 0.15, fps: 15, duration: 200 }), 'reels');
    const kinds = r.issues.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['lowRes', 'bitrate', 'fps', 'aspect', 'long']));
    // сначала то, что режет показы
    expect(r.issues[0].level).toBe('cut');
  });
  it('хороший ролик — замечаний нет', () => {
    expect(analyzeReach(input(fr), 'tiktok').issues).toEqual([]);
  });
  it('размер кадров и частота разбора', () => {
    expect(scanSize(1080, 1920)).toEqual({ fw: 144, fh: 256 });
    expect(scanSize(1920, 1080)).toEqual({ fw: 256, fh: 144 });
    expect(scanFps(30)).toBe(2);
    expect(scanFps(1800)).toBe(0.25);
  });
});
