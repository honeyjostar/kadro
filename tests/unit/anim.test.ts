import { describe, expect, it } from 'vitest';
import { kfExpr, mediaPropsAt, putKeyframe, valueAt } from '../../src/shared/anim';
import { newMediaClip, newProject, newTextClip } from '../../src/shared/defaults';
import { activeWordAt, textStateAt } from '../../src/shared/textRender';
import { addAsset, addText, addToMain, mainTrack, setKeyframe, splitClip, trimClip } from '../../src/shared/timeline';
import type { MediaAsset, MediaClip, TextClip } from '../../src/shared/types';

/** Простой вычислитель выражений FFmpeg (if, lt, + - * /, скобки) — проверяем, что экспорт считает как превью. */
function evalFF(expr: string, vars: Record<string, number>): number {
  const src = expr.replace(/\\,/g, ',');
  let i = 0;
  const peek = () => src[i];
  const num = (): number => {
    if (peek() === '(') { i++; const v = add(); i++; return v; }
    if (peek() === '-') { i++; return -num(); }
    const m = /^(if|lt|PI|in|[0-9.]+(e-?\d+)?)/.exec(src.slice(i));
    if (!m) throw new Error(`разбор: ${src.slice(i, i + 20)}`);
    i += m[0].length;
    if (m[0] === 'PI') return Math.PI;
    if (m[0] === 'in') return vars.in;
    if (m[0] === 'if' || m[0] === 'lt') {
      i++; const a = add(); i++; const b = add();
      if (m[0] === 'lt') { i++; return a < b ? 1 : 0; }
      i++; const c = add(); i++;
      return a ? b : c;
    }
    return Number(m[0]);
  };
  const mul = (): number => { let v = num(); while (peek() === '*' || peek() === '/') { const op = src[i++]; const r = num(); v = op === '*' ? v * r : v / r; } return v; };
  const add = (): number => { let v = mul(); while (peek() === '+' || peek() === '-') { const op = src[i++]; const r = mul(); v = op === '+' ? v + r : v - r; } return v; };
  return add();
}

const asset: MediaAsset = { id: 'a', kind: 'video', path: '/x.mp4', previewPath: '/x.mp4', name: 'x', duration: 10, width: 1920, height: 1080, fps: 30, hasVideo: true, hasAudio: true, size: 1, rotation: 0, proxy: 'none' };

describe('ключевые кадры', () => {
  it('линейная и плавная интерполяция, края', () => {
    const k = [{ t: 1, v: 0, ease: 'linear' as const }, { t: 3, v: 10, ease: 'smooth' as const }, { t: 5, v: 20 }];
    expect(valueAt(k, 99, 0)).toBe(0);
    expect(valueAt(k, 99, 2)).toBe(5);
    expect(valueAt(k, 99, 4)).toBeCloseTo(15, 6); // smooth на середине = 0.5
    expect(valueAt(k, 99, 3.5)).toBeCloseTo(10 + 10 * (0.25 * 0.25 * (3 - 0.5)), 6);
    expect(valueAt(k, 99, 9)).toBe(20);
    expect(valueAt(undefined, 7, 1)).toBe(7);
  });

  it('выражение FFmpeg даёт те же значения, что и превью', () => {
    const k = [{ t: 2, v: -0.3, ease: 'smooth' as const }, { t: 4, v: 0.25, ease: 'linear' as const }, { t: 4.5, v: 0.1 }];
    // клип с in = 1.5 и скоростью 2: время ключа t → время клипа (t - 1.5) / 2
    const expr = kfExpr(k, 0, '(in/30)', (t) => (t - 1.5) / 2);
    for (let n = 0; n < 120; n++) {
      const local = n / 30;
      expect(evalFF(expr, { in: n })).toBeCloseTo(valueAt(k, 0, 1.5 + local * 2), 6);
    }
  });

  it('ставить ключ: замена в том же моменте и сортировка', () => {
    let l = putKeyframe(undefined, 2, 1, 0.01);
    l = putKeyframe(l, 1, 5, 0.01);
    l = putKeyframe(l, 2.005, 9, 0.01);
    expect(l.map((x) => [x.t, x.v])).toEqual([[1, 5], [2.005, 9]]);
  });

  it('ключи видео привязаны к исходнику: обрезка и разрезание не сдвигают анимацию', () => {
    let p = addAsset(newProject(), asset);
    p = addToMain(p, 'a', 0).project;
    const id = mainTrack(p).clips[0].id;
    p = setKeyframe(p, id, 'x', 2, -0.5);
    p = setKeyframe(p, id, 'x', 6, 0.5);
    const before = mediaPropsAt(mainTrack(p).clips[0] as MediaClip, 4).x;
    expect(before).toBeCloseTo(0, 6);
    // обрезаем слева на 1 с: тот же кадр исходника (4 с) теперь на 3 с таймлайна
    p = trimClip(p, id, 'start', 1);
    expect(mediaPropsAt(mainTrack(p).clips[0] as MediaClip, 3).x).toBeCloseTo(0, 6);
    // разрезаем на 2 с: правая часть продолжает ту же анимацию
    p = splitClip(p, id, 2).project;
    const [l, r] = mainTrack(p).clips as MediaClip[];
    expect(mediaPropsAt(l, 1).x).toBeCloseTo(valueAt(l.keyframes!.x, 0, 2), 6);
    expect(mediaPropsAt(r, 3).x).toBeCloseTo(0, 6);
  });

  it('текст: разрезание сдвигает ключи и слова правой части', () => {
    let p = newProject();
    p = addText(p, 1, 'раз два три').project;
    const t = p.tracks.find((x) => x.kind === 'text')!;
    const id = t.clips[0].id;
    p = setKeyframe(p, id, 'opacity', 0, 0);
    p = setKeyframe(p, id, 'opacity', 2, 1);
    const c0 = p.tracks.find((x) => x.kind === 'text')!.clips[0] as TextClip;
    c0.words = [{ text: 'раз', start: 0, end: 0.8 }, { text: 'два', start: 1, end: 1.8 }, { text: 'три', start: 2, end: 2.8 }];
    p = splitClip(p, id, 2.5).project; // 1.5 с от начала клипа
    const [a, b] = p.tracks.find((x) => x.kind === 'text')!.clips as TextClip[];
    expect(a.words!.map((w) => w.text)).toEqual(['раз', 'два']);
    expect(b.words!.map((w) => w.text)).toEqual(['три']);
    expect([a.text, b.text]).toEqual(['раз два', 'три']);
    expect(b.words![0].start).toBeCloseTo(0.5, 6);
    expect(b.keyframes!.opacity!.map((k) => k.t)).toEqual([-1.5, 0.5]);
  });

  it('анимация текста: появление и подсветка слова', () => {
    const c = newTextClip(0, 'раз два три');
    c.duration = 3;
    c.anim = { in: { type: 'fade', dur: 0.5 }, out: { type: 'typewriter', dur: 1 } };
    expect(textStateAt(c, 0).opacity).toBe(0);
    expect(textStateAt(c, 0.25).opacity).toBeCloseTo(0.5, 6);
    expect(textStateAt(c, 1).opacity).toBe(1);
    expect(textStateAt(c, 2.5).reveal).toBe(Math.floor(0.5 * 9));
    const words = [{ text: 'раз', start: 0, end: 0.5 }, { text: 'два', start: 0.6, end: 1 }, { text: 'три', start: 1.2, end: 2 }];
    expect(activeWordAt(words, 0.55)).toBe(0);
    expect(activeWordAt(words, 0.6)).toBe(1);
    expect(activeWordAt(words, 5)).toBe(2);
    void newMediaClip;
  });
});
