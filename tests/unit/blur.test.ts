// Скрыть лица и номера: разбор YuNet, связывание находок в дорожки, рамка во времени, маска, трекер предмета.
import { describe, expect, it } from 'vitest';
import { blurGroups, blurMaskBytes, boxAt, compactBoxes, decodeYunet, iou, linkTracks, newRegion, nms, padFace, type DetFrame } from '../../src/shared/blur';
import { ObjectTracker, trackFrames, type Gray } from '../../src/shared/objTrack';
import { parseOne } from '../../src/shared/commands';
import { buildGraph, blurMaskKey } from '../../src/shared/exportGraph';
import { newProject } from '../../src/shared/defaults';
import type { BlurRegion, MediaAsset, MediaClip, Project } from '../../src/shared/types';

describe('YuNet: разбор ответа', () => {
  it('лицо из клетки сетки: центр, размер, уверенность √(cls·obj)', () => {
    const S = 640;
    const out: Record<string, Float32Array> = {};
    for (const s of [8, 16, 32]) {
      const n = (S / s) ** 2;
      out[`cls_${s}`] = new Float32Array(n);
      out[`obj_${s}`] = new Float32Array(n);
      out[`bbox_${s}`] = new Float32Array(n * 4);
    }
    // шаг 16: клетка (строка 10, столбец 20), сдвиг 0.5, размер e^1.5·16
    const cols = S / 16, i = 10 * cols + 20;
    out.cls_16[i] = 0.9; out.obj_16[i] = 0.81;
    out.bbox_16.set([0.5, 0.5, 1.5, 1.7], i * 4);
    // соседняя клетка — дубль того же лица, слабее
    out.cls_16[i + 1] = 0.8; out.obj_16[i + 1] = 0.8;
    out.bbox_16.set([-0.4, 0.5, 1.5, 1.7], (i + 1) * 4);
    const d = decodeYunet(out, S);
    expect(d).toHaveLength(1);
    expect(d[0].x).toBeCloseTo(20.5 * 16);
    expect(d[0].y).toBeCloseTo(10.5 * 16);
    expect(d[0].w).toBeCloseTo(Math.exp(1.5) * 16);
    expect(d[0].h).toBeCloseTo(Math.exp(1.7) * 16);
    expect(d[0].score).toBeCloseTo(Math.sqrt(0.9 * 0.81));
  });

  it('слабые находки отбрасываются, пересекающиеся — остаётся сильнейшая', () => {
    expect(iou({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 0, w: 2, h: 2 })).toBeCloseTo(1 / 3);
    const n = nms([{ x: 0, y: 0, w: 2, h: 2, score: 0.7 }, { x: 0.2, y: 0, w: 2, h: 2, score: 0.9 }, { x: 5, y: 5, w: 1, h: 1, score: 0.8 }], 0.3);
    expect(n.map((x) => x.score)).toEqual([0.9, 0.8]);
  });
});

const det = (x: number, y: number, s = 0.9) => ({ x, y, w: 0.1, h: 0.12, score: s });

describe('находки → дорожки', () => {
  it('два лица идут навстречу — каждое остаётся своей дорожкой', () => {
    const frames: DetFrame[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i * 0.125;
      frames.push({ t, dets: [det(0.2 + i * 0.02, 0.4), det(0.8 - i * 0.02, 0.45)] });
    }
    const tr = linkTracks(frames);
    expect(tr).toHaveLength(2);
    expect(tr[0]).toHaveLength(17);
    const left = tr.find((b) => b[0].x < 0.5)!;
    expect(left[left.length - 1].x).toBeCloseTo(0.52, 1);
  });

  it('детектор моргнул — пропуск заполняется; ушло надолго — новая дорожка', () => {
    const frames: DetFrame[] = [];
    for (let i = 0; i <= 30; i++) {
      const t = i * 0.125;
      const miss = (i >= 6 && i <= 8) || (i >= 14 && i <= 24); // 0.375 с и 1.4 с без лица
      frames.push({ t, dets: miss ? [] : [det(0.5, 0.5)] });
    }
    const tr = linkTracks(frames, { maxGap: 0.8 });
    expect(tr).toHaveLength(2);
    expect(tr[0][0].t).toBe(0);
    expect(tr[0][tr[0].length - 1].t).toBeCloseTo(13 * 0.125);
    // в пропуске рамка есть (между точками)
    const r = newRegion('f', 'face', tr[0]);
    expect(boxAt(r, 0.9)).not.toBeNull();
  });

  it('одиночная слабая находка — шум, сильная — лицо', () => {
    const weak = linkTracks([{ t: 0, dets: [det(0.5, 0.5, 0.65)] }, { t: 0.125, dets: [] }]);
    expect(weak).toHaveLength(0);
    const strong = linkTracks([{ t: 0, dets: [det(0.5, 0.5, 0.95)] }]);
    expect(strong).toHaveLength(1);
  });

  it('лицо с запасом: шире, выше и чуть вверх (лоб, волосы)', () => {
    const p = padFace({ t: 0, x: 0.5, y: 0.5, w: 0.1, h: 0.1 });
    expect(p.w).toBeGreaterThan(0.12);
    expect(p.h).toBeGreaterThan(p.w);
    expect(p.y).toBeLessThan(0.5);
  });
});

describe('рамка во времени и маска', () => {
  const reg: BlurRegion = newRegion('o', 'object', [{ t: 1, x: 0.2, y: 0.5, w: 0.1, h: 0.1 }, { t: 3, x: 0.6, y: 0.5, w: 0.2, h: 0.1 }]);

  it('между точками — по прямой, до и после — недолго держится, потом пропадает', () => {
    const b = boxAt(reg, 2)!;
    expect(b.x).toBeCloseTo(0.4);
    expect(b.w).toBeCloseTo(0.15);
    expect(boxAt(reg, 0.9)).not.toBeNull();
    expect(boxAt(reg, 0.5)).toBeNull();
    expect(boxAt(reg, 3.6)).toBeNull();
  });

  it('лишние точки на прямой выкидываются, повороты остаются', () => {
    const pts = Array.from({ length: 11 }, (_, i) => ({ t: i / 10, x: i < 6 ? 0.1 + i * 0.05 : 0.35, y: 0.5, w: 0.1, h: 0.1 }));
    const c = compactBoxes(pts);
    expect(c.length).toBe(3);
    expect(c[1].t).toBeCloseTo(0.5);
  });

  it('маска: внутри — 255, снаружи — 0, край мягкий; у предмета — прямоугольник', () => {
    const W = 100, H = 50;
    const m = blurMaskBytes([reg], 2, W, H);
    expect(m[25 * W + 40]).toBe(255);           // центр (0.4, 0.5)
    expect(m[25 * W + 90]).toBe(0);             // далеко справа
    expect(m[25 * W + 47]).toBe(255);           // внутри по ширине (0.075·100 = 7.5)
    const edge = m[25 * W + 48];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
    // угол прямоугольника закрыт, у эллипса — нет
    expect(m[(25 - 2) * W + 40 + 7]).toBe(255);
    const oval = { ...reg, shape: 'ellipse' as const };
    expect(blurMaskBytes([oval], 2, W, H)[(25 - 2) * W + 40 + 7]).toBeLessThan(255);
    // выключенная область не рисуется
    expect(blurGroups([{ ...reg, off: true }])).toHaveLength(0);
  });

  it('разные виды скрытия — разные проходы', () => {
    const a = newRegion('a', 'face', reg.boxes), b = { ...newRegion('b', 'face', reg.boxes), style: 'pixel' as const }, c = newRegion('c', 'object', reg.boxes);
    const g = blurGroups([a, b, c]);
    expect(g).toHaveLength(2);
    expect(g[0].regions.map((x) => x.id)).toEqual(['a', 'c']);
  });
});

/** Кадр: шум + яркий «номер» (с узором) в точке (x, y). */
function frame(w: number, h: number, x: number, y: number, seed: number): Gray {
  const d = new Uint8Array(w * h);
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < d.length; i++) d[i] = 60 + rnd() * 50;
  for (let j = -8; j < 8; j++) {
    for (let i = -20; i < 20; i++) {
      const px = Math.round(x + i), py = Math.round(y + j);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      d[py * w + px] = ((i >> 2) + (j >> 2)) & 1 ? 240 : 20; // шашечки, как буквы на номере
    }
  }
  return { data: d, w, h };
}

describe('трекер предмета', () => {
  it('едет за номером по кадру', () => {
    const W = 320, H = 180;
    const frames = Array.from({ length: 30 }, (_, i) => frame(W, H, 60 + i * 6, 90 + Math.sin(i / 5) * 20, i + 1));
    const out = trackFrames(frames, { x: 60, y: 90, w: 40, h: 16 });
    expect(out).toHaveLength(30);
    for (let i = 0; i < 30; i++) {
      expect(Math.abs(out[i].box.x - (60 + i * 6))).toBeLessThan(3);
      expect(Math.abs(out[i].box.y - (90 + Math.sin(i / 5) * 20))).toBeLessThan(3);
    }
  });

  it('предмет пропал из кадра — трекер это понимает и останавливается', () => {
    const W = 320, H = 180;
    const frames = [
      ...Array.from({ length: 10 }, (_, i) => frame(W, H, 100 + i * 2, 90, i + 1)),
      ...Array.from({ length: 20 }, (_, i) => frame(W, H, -100, -100, i + 50)), // номера больше нет
    ];
    const out = trackFrames(frames, { x: 100, y: 90, w: 40, h: 16 }, 4);
    expect(out.length).toBeGreaterThanOrEqual(10);
    expect(out.length).toBeLessThan(14);
    const tr = new ObjectTracker(frames[0], { x: 100, y: 90, w: 40, h: 16 }, 2);
    let lost = false;
    for (let i = 10; i < 20 && !lost; i++) lost = tr.update(frames[i]).lost;
    expect(lost).toBe(true);
  });
});

describe('команды словами и экспорт', () => {
  it('«скрой лица», «размой лица» — скрытие лиц; «спрячь субтитры» — нет', () => {
    expect(parseOne('скрой лица')).toEqual({ kind: 'hideFaces' });
    expect(parseOne('размой лицо')).toEqual({ kind: 'hideFaces' });
    expect(parseOne('blur faces')).toEqual({ kind: 'hideFaces' });
    expect(parseOne('спрячь субтитры')).toEqual({ kind: 'noCaptions' });
    expect(parseOne('убери паузы')).toEqual({ kind: 'pauses' });
  });

  it('граф экспорта: размытая копия слоя смешивается с ним по маске', () => {
    const p: Project = newProject('t');
    const asset: MediaAsset = { id: 'a1', kind: 'video', path: '/v.mp4', name: 'v', duration: 5, width: 1280, height: 720, fps: 30, hasAudio: false } as MediaAsset;
    p.assets.push(asset);
    const reg = newRegion('f1', 'face', [{ t: 0, x: 0.5, y: 0.5, w: 0.2, h: 0.3 }, { t: 2, x: 0.6, y: 0.5, w: 0.2, h: 0.3 }]);
    const c = { id: 'c1', type: 'media', assetId: 'a1', start: 0, in: 0, out: 3, speed: 1, volume: 1, muted: false, fit: 'contain', fadeIn: 0, fadeOut: 0,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 }, color: { preset: 'none', presetAmount: 1, brightness: 1, contrast: 1, saturation: 1, warmth: 0 }, blurs: [reg] } as unknown as MediaClip;
    p.tracks[0].clips.push(c);
    const key = blurMaskKey('c1', blurGroups([reg])[0].key);
    const g = buildGraph(p, { width: 1280, height: 720, fps: 30, textLayers: [], blurMasks: { [key]: '/tmp/mask.mkv' } });
    expect(g.inputs.some((x) => x.includes('/tmp/mask.mkv'))).toBe(true);
    expect(g.filter).toMatch(/boxblur=luma_radius=\d+:luma_power=2/);
    expect(g.filter).toContain('maskedmerge');
    // два вида скрытия — два прохода, без пустых фильтров
    const reg2 = { ...newRegion('o1', 'object', reg.boxes), style: 'black' as const };
    const p2 = { ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, clips: [{ ...c, blurs: [reg, reg2] }] } : t)) };
    const masks = Object.fromEntries(blurGroups([reg, reg2]).map((x, i) => [blurMaskKey('c1', x.key), `/tmp/m${i}.mkv`]));
    const g3 = buildGraph(p2, { width: 1280, height: 720, fps: 30, textLayers: [], blurMasks: masks });
    expect(g3.filter.match(/maskedmerge/g)).toHaveLength(2);
    expect(g3.filter).toContain('lut=c0=0:c1=0:c2=0');
    expect(g3.filter.split(';').filter((ch) => /^\[[^\]]+\]\[[^\]]+\]$/.test(ch.trim()))).toEqual([]);
    // без маски (не успели сделать) — граф как раньше
    const g2 = buildGraph(p, { width: 1280, height: 720, fps: 30, textLayers: [] });
    expect(g2.filter).not.toContain('maskedmerge');
  });
});
