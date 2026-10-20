import { describe, expect, it } from 'vitest';
import { FONTS, TEXT_PRESETS, TRANSITIONS, newProject } from '../../src/shared/defaults';
import { FILTER_PRESETS } from '../../src/shared/color';
import { EFFECTS } from '../../src/shared/effects';
import {
  AUTO_STYLES, HL_H, HL_W, autoEdit, beatGrid, bestWindow, frameStat, goodSeconds, longestShot, pickWindows, scoreFrames, type AutoInput, type Highlights,
} from '../../src/shared/autoEdit';
import { clipDuration, clipEnd, mainTrack, projectDuration } from '../../src/shared/timeline';
import type { MediaAsset, MediaClip, TextClip } from '../../src/shared/types';

function asset(id: string, kind: MediaAsset['kind'], duration: number, extra: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id, kind, path: `/m/${id}`, previewPath: `/m/${id}`, name: id, duration, width: 1920, height: 1080, fps: 30,
    hasVideo: kind !== 'audio', hasAudio: kind !== 'image', size: 1, rotation: 0, proxy: 'none', ...extra,
  };
}
/** Музыка 120 ударов в минуту с первой долей на 0.5 с. */
function song(duration: number, first = 0.5, bpm = 120): MediaAsset {
  const beats: number[] = [];
  for (let t = first; t < duration; t += 60 / bpm) beats.push(Math.round(t * 1000) / 1000);
  return asset('music', 'audio', duration, { beats, bpm });
}
const base = (over: Partial<AutoInput> = {}): AutoInput => ({
  media: [{ asset: asset('v1', 'video', 20) }, { asset: asset('img', 'image', 0) }, { asset: asset('v2', 'video', 9) }],
  music: song(60), style: 'energy', aspect: '9:16', length: 'auto', title: 'Лето', videoSound: 'off', seed: 7, ...over,
});
const mainClips = (p: ReturnType<typeof autoEdit>['project']) => mainTrack(p).clips as MediaClip[];

describe('авто-ролик: разбор видео', () => {
  const frame = (fn: (x: number, y: number) => number) => {
    const g = new Uint8Array(HL_W * HL_H);
    for (let y = 0; y < HL_H; y++) for (let x = 0; x < HL_W; x++) g[y * HL_W + x] = fn(x, y);
    return g;
  };
  it('резкий кадр резче размытого, движение и склейка видны', () => {
    const sharp = frame((x, y) => ((x >> 2) + (y >> 2)) % 2 ? 200 : 60);
    const flat = frame(() => 130);
    expect(frameStat(sharp, null).s).toBeGreaterThan(frameStat(flat, null).s * 10);
    expect(frameStat(flat, sharp).m).toBeGreaterThan(40);
    expect(frameStat(sharp, sharp).m).toBe(0);
    // 3 с спокойного резкого видео, склейка, 3 с тёмного плоского
    const st = [];
    let prev: Uint8Array | null = null;
    for (let i = 0; i < 24; i++) {
      const g = i < 12 ? frame((x, y) => (((x + i) >> 2) + (y >> 2)) % 2 ? 190 : 70) : frame(() => 20);
      st.push(frameStat(g, prev));
      prev = g;
    }
    const hl = scoreFrames(st, 0.25);
    expect(hl.score).toHaveLength(24);
    expect(hl.cuts).toEqual([2.875]);
    const early = hl.score.slice(1, 10).reduce((a, b) => a + b) / 9;
    const late = hl.score.slice(14).reduce((a, b) => a + b) / 10;
    expect(early).toBeGreaterThan(late + 0.3);
  });
  it('лучшее окно: в хорошем месте и не через склейку', () => {
    const score = Array.from({ length: 80 }, (_, i) => (i >= 40 && i < 56 ? 0.9 : 0.4)); // 10..14 с — лучшее
    const hl: Highlights = { step: 0.25, score, cuts: [12] };
    const s = bestWindow(hl, 1.5, 0, 20);
    expect(s).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(s + 1.5).toBeLessThanOrEqual(12 + 1e-6); // склейка на 12 с — окно до неё
    expect(bestWindow(null, 2, 4, 10)).toBeCloseTo(6, 5); // без разбора — середина
    expect(bestWindow(hl, 5, 3, 7)).toBe(3);              // места ровно на окно
  });
  it('несколько кусков из одного видео: лучшие места, по порядку, без наложений', () => {
    // 20 с: хорошо 2..5 и 14..18, плохо остальное, склейка на 16
    const score = Array.from({ length: 80 }, (_, i) => ((i >= 8 && i < 20) || (i >= 56 && i < 72) ? 0.9 : 0.3));
    const hl: Highlights = { step: 0.25, score, cuts: [16] };
    const needs = [1.5, 1, 1.5];
    const s = pickWindows(hl, needs, 0.2, 19.8);
    s.forEach((x, r) => {
      const good = (x >= 2 - 0.13 && x + needs[r] <= 5 + 0.13) || (x >= 14 - 0.13 && x + needs[r] <= 18 + 0.13);
      expect(good, `кусок ${r}: ${x}`).toBe(true);
      expect(x < 16 - 0.08 && x + needs[r] > 16 + 0.08, `через склейку: ${x}`).toBe(false);
      if (r > 0) expect(x).toBeGreaterThanOrEqual(s[r - 1] + needs[r - 1] - 1e-6);
    });
    expect(goodSeconds(hl, 0.2, 19.8)).toBeCloseTo(7, 0);
    expect(longestShot(hl, 0.2, 19.8)).toBeCloseTo(15.8, 5);
    // без разбора — по частям видео, по порядку
    const flat = pickWindows(null, [2, 2], 0, 20);
    expect(flat[0]).toBeLessThan(10);
    expect(flat[1]).toBeGreaterThanOrEqual(flat[0] + 2);
  });
});

describe('авто-ролик: сборка', () => {
  it('сетка долей: тихое вступление пропускается, сетка до конца музыки', () => {
    const g = beatGrid(song(30, 2.0), 120, 600);
    expect(g.onBeats).toBe(true);
    expect(g.musicIn).toBeCloseTo(1.95, 5);
    expect(g.beat).toBeCloseTo(0.5, 5);
    expect(g.grid[0]).toBe(0);
    expect(g.grid[1]).toBeCloseTo(0.55, 5);
    expect(g.grid[g.grid.length - 1]).toBeLessThanOrEqual(30 - 1.95 + 1e-6);
    const flat = beatGrid(null, 100, 10);
    expect(flat.onBeats).toBe(false);
    expect(flat.grid[1]).toBeCloseTo(0.6, 5);
  });

  it.each(AUTO_STYLES.map((s) => [s.label, s.id] as const))('%s: склейки на долях, музыка и надпись по длине ролика', (_l, style) => {
    const inp = base({ style });
    const { project: p, summary } = autoEdit(newProject('x'), inp);
    const grid = beatGrid(inp.music, 120, 600).grid;
    const cl = mainClips(p);
    expect(cl.length).toBeGreaterThan(3);
    expect(summary.cuts).toBe(cl.length - 1);
    expect(summary.onBeats).toBe(true);
    // каждый следующий кадр начинается на доле
    for (const c of cl) expect(grid.some((g) => Math.abs(g - c.start) < 0.002), `начало ${c.start}`).toBe(true);
    const total = projectDuration(p);
    expect(grid.some((g) => Math.abs(g - total) < 0.002), `конец ${total}`).toBe(true);
    expect(summary.duration).toBeCloseTo(total, 2);
    // все файлы вошли, видео — внутри файла, по порядку и без наложений
    expect(summary.used).toBe(3);
    const byAsset = new Map<string, MediaClip[]>();
    for (const c of cl) byAsset.set(c.assetId, [...(byAsset.get(c.assetId) ?? []), c]);
    for (const [id, cs] of byAsset) {
      const a = inp.media.find((m) => m.asset.id === id)!.asset;
      if (a.kind !== 'video') continue;
      cs.forEach((c, i) => {
        expect(c.in).toBeGreaterThanOrEqual(0);
        expect(c.out).toBeLessThanOrEqual(a.duration + 1e-6);
        if (i > 0) expect(c.in).toBeGreaterThanOrEqual(cs[i - 1].out - 1e-6);
      });
    }
    // переходы не длиннее 45% соседей; последний — без перехода, с затуханием
    cl.forEach((c, i) => {
      if (c.transitionOut) expect(c.transitionOut.duration).toBeLessThanOrEqual(0.45 * Math.min(clipDuration(c), clipDuration(cl[i + 1])) + 1e-6);
      expect(c.muted).toBe(c.assetId !== 'img');
    });
    expect(cl[cl.length - 1].transitionOut).toBeUndefined();
    expect(cl[cl.length - 1].anim?.out?.type).toBe('fade');
    const music = p.tracks.find((t) => t.kind === 'audio')!.clips[0] as MediaClip;
    expect(music.assetId).toBe('music');
    expect(clipEnd(music)).toBeCloseTo(total, 3);
    expect(music.fadeOut).toBeGreaterThan(0);
    const title = p.tracks.find((t) => t.kind === 'text')!.clips[0] as TextClip;
    expect(title.text).toBe('Лето');
    expect(clipEnd(title)).toBeLessThanOrEqual(total);
    expect(p.name).toBe('Лето');
  });

  it('стили ссылаются на существующие переходы, эффекты, фильтры, шрифты', () => {
    const fonts = new Set(FONTS.map((f) => f.family));
    for (const s of AUTO_STYLES) {
      for (const t of s.trans) expect(TRANSITIONS.some((x) => x.type === t), t).toBe(true);
      for (const e of [...s.effects, ...(s.accent ? [s.accent] : [])]) expect(EFFECTS.some((x) => x.type === e.type), e.type).toBe(true);
      expect(FILTER_PRESETS.some((x) => x.id === s.color.preset), s.color.preset).toBe(true);
      expect(fonts.has(s.title.style.font!), s.title.style.font).toBe(true);
      expect(TEXT_PRESETS.some((x) => x.id === s.title.preset)).toBe(true);
    }
  });

  it('из видео берётся лучший кусок', () => {
    const score = Array.from({ length: 120 }, (_, i) => (i >= 60 && i < 80 ? 0.95 : 0.3)); // 15..20 с
    const { project: p } = autoEdit(newProject('x'), base({
      media: [{ asset: asset('v1', 'video', 30), hl: { step: 0.25, score, cuts: [] } }], style: 'cinema', length: 4,
    }));
    const c = mainClips(p)[0];
    expect(c.in).toBeGreaterThanOrEqual(15 - 0.125); // точность — полшага разбора
    expect(c.out).toBeLessThanOrEqual(20 + 0.125);
  });

  it('длина на выбор: 15 с — ролик 15 с (± доля), лишнее не влезает, материала мало — повторы', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ asset: asset(`p${i}`, 'image', 0) }));
    const r = autoEdit(newProject('x'), base({ media: many, length: 15, style: 'smooth' }));
    expect(Math.abs(r.summary.duration - 15)).toBeLessThanOrEqual(2.01);
    expect(r.summary.dropped).toBeGreaterThan(0);
    const few = autoEdit(newProject('x'), base({ media: [{ asset: asset('a', 'image', 0) }, { asset: asset('b', 'image', 0) }], length: 30 }));
    expect(few.summary.repeated).toBe(true);
    expect(Math.abs(few.summary.duration - 30)).toBeLessThanOrEqual(2.01);
    // мало видео на длинный ролик — повторы, но длина как просили
    const shortVid = autoEdit(newProject('x'), base({ media: [{ asset: asset('v', 'video', 4) }, { asset: asset('p', 'image', 0) }], length: 15 }));
    expect(shortVid.summary.repeated).toBe(true);
    expect(Math.abs(shortVid.summary.duration - 15)).toBeLessThanOrEqual(2.01);
    const ids = mainClips(few.project).map((c) => c.assetId);
    expect(ids.slice(0, 4)).toEqual(['a', 'b', 'a', 'b']); // повторы вперемешку, а не подряд
  });

  it('без музыки — ровная сетка темпа стиля, звук видео остаётся', () => {
    const { project: p, summary } = autoEdit(newProject('x'), base({ music: null, videoSound: 'on', title: '' }));
    expect(summary.onBeats).toBe(false);
    expect(summary.bpm).toBe(124);
    expect(p.tracks.some((t) => t.kind === 'audio' || t.kind === 'text')).toBe(false);
    for (const c of mainClips(p)) if (c.assetId !== 'img') expect(c.muted).toBe(false);
    expect(p.name).toBe('Авто-ролик');
  });

  it('музыка короче материала — ролик по музыке', () => {
    const { project: p } = autoEdit(newProject('x'), base({ music: song(8, 0), style: 'smooth' }));
    expect(projectDuration(p)).toBeLessThanOrEqual(8 + 1e-6);
  });

  it('короткое видео почти не замедляется — доли уходят соседям', () => {
    const { project: p } = autoEdit(newProject('x'), base({
      media: [{ asset: asset('img', 'image', 0) }, { asset: asset('short', 'video', 0.8) }, { asset: asset('img2', 'image', 0) }], style: 'cinema',
    }));
    const c = mainClips(p).find((x) => x.assetId === 'short')!;
    expect(c.speed).toBeGreaterThanOrEqual(0.8 - 1e-6);
    const grid = beatGrid(song(60), 120, 600).grid;
    for (const x of mainClips(p)) expect(grid.some((g) => Math.abs(g - x.start) < 0.002)).toBe(true);
  });

  it('вертикальное видео в горизонтальном ролике — целиком, с размытым фоном; горизонтальное в вертикальном — на весь кадр', () => {
    const { project: p } = autoEdit(newProject('x'), base({
      aspect: '16:9', media: [{ asset: asset('tall', 'video', 10, { width: 1080, height: 1920 }) }, { asset: asset('wide', 'video', 10) }],
    }));
    const cl = mainClips(p);
    expect(cl.find((c) => c.assetId === 'tall')!.fit).toBe('contain');
    expect(cl.find((c) => c.assetId === 'wide')!.fit).toBe('cover');
    expect(p.settings.background).toBe('blur');
    // горизонтальное в вертикальном — на весь кадр
    const v = autoEdit(newProject('x'), base({ aspect: '9:16', media: [{ asset: asset('wide', 'video', 10) }] }));
    expect(mainClips(v.project)[0].fit).toBe('cover');
    expect(v.project.settings.background).not.toBe('blur');
  });

  it('один seed — один ролик, другой seed — другой вариант', () => {
    const a = JSON.stringify(mainClips(autoEdit(newProject('x'), base()).project).map((c) => [c.in, c.transitionOut?.type]));
    const b = JSON.stringify(mainClips(autoEdit(newProject('x'), base()).project).map((c) => [c.in, c.transitionOut?.type]));
    const c = JSON.stringify(mainClips(autoEdit(newProject('x'), base({ seed: 99 })).project).map((x) => [x.in, x.transitionOut?.type]));
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it('нет видео и фото — понятная ошибка', () => {
    expect(() => autoEdit(newProject('x'), base({ media: [{ asset: song(10) }] }))).toThrow('Нужны видео или фото');
  });
});
