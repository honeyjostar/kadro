// Мелочи к Kadro 1.0: логотип на всё видео, экспорт в GIF и MP3, просьба о звезде.
import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { addAsset, addToMain, setSettings } from '../../src/shared/timeline';
import { buildGraph, gifArgs, gifFilter, mp3Args } from '../../src/shared/exportGraph';
import { PROGRESS_DEFAULT, logoBox, newLogo, progressBox } from '../../src/shared/logo';
import { STAR_AGAIN_AT, afterExport, type StarState } from '../../src/shared/star';
import type { MediaAsset, Project } from '../../src/shared/types';

function asset(id: string, kind: MediaAsset['kind'], duration: number): MediaAsset {
  return {
    id, kind, path: `/m/${id}.mp4`, previewPath: `/m/${id}.mp4`, name: id, duration, width: 1920, height: 1080, fps: 30,
    hasVideo: kind !== 'audio', hasAudio: kind !== 'image', size: 1, rotation: 0, proxy: 'none',
  };
}
function project(): Project {
  let p = newProject('t');
  p = addAsset(p, asset('v', 'video', 4));
  return addToMain(p, 'v', 0).project;
}

describe('логотип на всё видео', () => {
  it('стоит в выбранном углу с отступом 4% короткой стороны, размеры чётные', () => {
    const l = newLogo('/l.png', 'l.png', 2);
    expect(l.corner).toBe('tr');
    const tr = logoBox(1080, 1920, l);
    expect(tr.w).toBe(Math.round((0.16 * 1080) / 2) * 2);
    expect(tr.h).toBe(Math.round(tr.w / 2 / 2) * 2);
    expect(tr.x + tr.w).toBe(1080 - Math.round(1080 * 0.04));
    expect(tr.y).toBe(Math.round(1080 * 0.04));
    const bl = logoBox(1920, 1080, { ...l, corner: 'bl' });
    expect(bl.x).toBe(Math.round(1080 * 0.04));
    expect(bl.y + bl.h).toBe(1080 - Math.round(1080 * 0.04));
    for (const v of [tr.w, tr.h, bl.w, bl.h]) expect(v % 2).toBe(0);
  });
  it('размер ограничен: не меньше 5% и не больше 50% короткой стороны', () => {
    expect(logoBox(1000, 1000, { ar: 1, corner: 'tl', size: 5 }).w).toBe(500);
    expect(logoBox(1000, 1000, { ar: 1, corner: 'tl', size: 0 }).w).toBe(50);
  });
  it('в экспорте — картинка поверх всего, на всё видео, с прозрачностью', () => {
    let p = project();
    p = setSettings(p, { logo: { ...newLogo('/logo.png', 'logo.png', 1), opacity: 0.5, corner: 'br' } });
    const g = buildGraph(p, { width: 1080, height: 1920, fps: 30, textLayers: [] });
    const inputs = g.inputs.map((i) => i.join(' '));
    const idx = inputs.findIndex((i) => i.includes('/logo.png'));
    expect(inputs[idx]).toContain('-loop 1');
    const b = logoBox(1080, 1920, p.settings.logo!);
    expect(g.filter).toContain(`[${idx}:v]scale=${b.w}:${b.h}`);
    expect(g.filter).toContain('colorchannelmixer=aa=0.5');
    expect(g.filter).toMatch(new RegExp(`overlay=x=${b.x}:y=${b.y}:shortest=1\\[v\\d+\\];\\n\\[v\\d+\\]format=yuv420p`));
  });
  it('без логотипа граф прежний', () => {
    const g = buildGraph(project(), { width: 1080, height: 1920, fps: 30, textLayers: [] });
    expect(g.filter).not.toContain('colorchannelmixer=aa');
    expect(g.inputs.some((i) => i.includes('-loop'))).toBe(false);
  });
});

describe('экспорт в GIF и MP3', () => {
  it('GIF: палитра на весь ролик, по кругу, без звука', () => {
    const g = buildGraph(project(), { width: 270, height: 480, fps: 15, textLayers: [] });
    const f = gifFilter(g);
    expect(f.startsWith(g.filter)).toBe(true);
    expect(f).toContain('[vout]split[gs1][gs2]');
    expect(f).toContain('palettegen');
    expect(f).toContain('paletteuse');
    expect(f).toContain('[aout]anullsink');
    const a = gifArgs(g, '/tmp/graph.txt', 7, '/out/x.gif');
    expect(a).toEqual(expect.arrayContaining(['-map', '[gif]', '-an', '-loop', '0']));
    expect(a[a.length - 1]).toBe('/out/x.gif');
    expect(a).not.toContain('[aout]');
  });
  it('MP3: только звук, битрейт и название', () => {
    const g = buildGraph(project(), { width: 16, height: 16, fps: 30, textLayers: [], audioOnly: true });
    const a = mp3Args(g, '/tmp/a.txt', 6, 320, 'Лето', '/out/x.mp3');
    expect(a).toEqual(expect.arrayContaining(['-map', '[aout]', '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', '-metadata', 'title=Лето']));
    expect(a).toContain('-filter_complex_script');
    expect(a[a.length - 1]).toBe('/out/x.mp3');
  });
});

describe('просьба о звезде', () => {
  it('после первого экспорта, ещё раз после 10-го и больше никогда', () => {
    let s: StarState = {};
    const asks: number[] = [];
    for (let i = 1; i <= 30; i++) {
      const r = afterExport(s);
      if (r.ask) asks.push(i);
      s = r.state;
    }
    expect(asks).toEqual([1, STAR_AGAIN_AT]);
    expect(s).toEqual({ exports: 30, star: 'never' });
  });
  it('поставили звезду — больше не просим', () => {
    let s: StarState = { exports: 1, star: 'done' };
    for (let i = 0; i < 20; i++) { const r = afterExport(s); expect(r.ask).toBe(false); s = r.state; }
    expect(s.star).toBe('done');
  });
  it('у тех, кто уже экспортировал до обновления, — один раз на ближайшем экспорте', () => {
    expect(afterExport({ exports: 57 }).ask).toBe(true);
  });
});

describe('полоска прогресса', () => {
  it('растёт от 0 до всей ширины, толщина — доля короткой стороны', () => {
    expect(progressBox(1080, 1920, PROGRESS_DEFAULT, 0, 10)).toEqual({ x: 0, y: 1920 - 13, w: 0, h: 13 });
    expect(progressBox(1080, 1920, PROGRESS_DEFAULT, 5, 10).w).toBe(540);
    expect(progressBox(1080, 1920, PROGRESS_DEFAULT, 12, 10).w).toBe(1080);
    expect(progressBox(1920, 1080, { ...PROGRESS_DEFAULT, place: 'top' }, 1, 10).y).toBe(0);
  });
  it('в экспорте — цветная полоса выезжает слева за весь ролик', () => {
    let p = project();
    p = setSettings(p, { progress: { ...PROGRESS_DEFAULT, color: '#00ff00' } });
    const g = buildGraph(p, { width: 1080, height: 1920, fps: 30, textLayers: [] });
    expect(g.filter).toContain('color=c=0x00ff00:s=1080x13:r=30:d=4');
    expect(g.filter).toContain("overlay=x='-1080+1080*t/4':y=1907");
  });
});
