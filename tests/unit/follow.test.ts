// Слежение: путь объекта по холсту (с учётом положения видео), ключи для текста и стикера, прореживание ключей.
import { describe, expect, it } from 'vitest';
import { canvasToSource, followKeys, objectPath, thinKeys } from '../../src/shared/follow';
import type { MediaClip, TextClip } from '../../src/shared/types';

const under = { id: 'u', type: 'media', assetId: 'a', start: 10, in: 2, out: 8, speed: 1, fit: 'contain', transform: { x: 0, y: 0, scale: 1, rotation: 0 } } as unknown as MediaClip;
const asset = { width: 1920, height: 1080 };
const W = 1080, H = 1920; // вертикальный проект, видео 16:9 вписано по ширине: 1080×607.5 по центру

describe('слежение', () => {
  it('рамка кадра → точка холста и обратно', () => {
    const path = objectPath(under, asset, [{ t: 3, x: 0.25, y: 0.5, w: 0.1, h: 0.1 }], W, H);
    expect(path[0].T).toBeCloseTo(11);
    expect(path[0].x).toBeCloseTo(0.25);
    expect(path[0].y).toBeCloseTo(0.5);
    expect(path[0].s).toBeCloseTo(0.1);
    const back = canvasToSource(under, asset, W, H, 11, { x: 0.25, y: 0.5 + (0.25 * 607.5) / H, w: 0.1, h: 0.05 });
    expect(back.x).toBeCloseTo(0.25);
    expect(back.y).toBeCloseTo(0.75);
    expect(back.h).toBeCloseTo((0.05 * H) / 607.5);
  });

  it('текст: в момент обводки стоит на месте, дальше смещается как объект; ключи — от начала текста', () => {
    const path = [0, 1, 2, 3].map((i) => ({ T: 11 + i, x: 0.2 + i * 0.1, y: 0.5, s: 0.1 + i * 0.02 }));
    const text = { id: 't', type: 'text', start: 11.5, duration: 2, x: 0.5, y: 0.3, text: 'Привет', style: {} } as unknown as TextClip;
    const k = followKeys(text, path, 12, true);
    // в 12 с (в клипе — 0.5 с) объект на 0.3, текст — на 0.5; в 13 с объект на 0.4 → текст на 0.6
    const at = (t: number) => { const a = k.x!.find((x) => Math.abs(x.t - t) < 1e-6); return a?.v; };
    expect(at(0.5)).toBeCloseTo(0.5);
    expect(at(1.5)).toBeCloseTo(0.6);
    expect(k.y!.every((x) => Math.abs(x.v - 0.3) < 1e-6)).toBe(true);
    expect(k.scale!.find((x) => Math.abs(x.t - 1.5) < 1e-6)!.v).toBeCloseTo(0.14 / 0.12);
    // ключи только на время текста
    expect(Math.min(...k.x!.map((x) => x.t))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...k.x!.map((x) => x.t))).toBeLessThanOrEqual(2);
  });

  it('стикер (видео поверх): ключи — во времени его исходника, смещение от центра', () => {
    const st = { id: 's', type: 'media', assetId: 'b', start: 11, in: 0, out: 3, speed: 2, fit: 'contain', transform: { x: -0.1, y: 0.2, scale: 0.5, rotation: 0 } } as unknown as MediaClip;
    const path = [{ T: 11, x: 0.4, y: 0.4, s: 0.1 }, { T: 12, x: 0.5, y: 0.45, s: 0.1 }];
    const k = followKeys(st, path, 11, false);
    expect(k.scale).toBeUndefined();
    expect(k.x!.map((x) => x.t)).toEqual([0, 2]); // скорость 2: секунда таймлайна — 2 с исходника
    expect(k.x![1].v).toBeCloseTo(0);
    expect(k.y![1].v).toBeCloseTo(0.25);
  });

  it('прореживание: точки на прямой выкидываются', () => {
    const k = Array.from({ length: 10 }, (_, i) => ({ t: i, v: i < 5 ? i * 0.1 : 0.4 }));
    expect(thinKeys(k, 0.001).map((x) => x.t)).toEqual([0, 4, 9]);
  });
});
