// Переезд из CapCut: проект CapCut (draft_content.json) → проект Kadro: склейки, обрезка, скорость, громкость,
// видео поверх, музыка, надписи; зашифрованный проект — понятная ошибка.
import { describe, expect, it } from 'vitest';
import { capcutToProject, draftFiles, parseDraft, resolvePath, textOf, type CcDraft } from '../../src/shared/capcut';
import { mainTrack, projectDuration } from '../../src/shared/timeline';
import type { MediaAsset, MediaClip, TextClip } from '../../src/shared/types';

const DIR = 'C:\\Users\\me\\AppData\\Local\\CapCut\\User Data\\Projects\\com.lveditor.draft\\0A1B';
const asset = (id: string, path: string, kind: MediaAsset['kind'], duration: number): MediaAsset => ({
  id, kind, path, previewPath: path, name: id, duration, width: kind === 'audio' ? 0 : 1080, height: kind === 'audio' ? 0 : 1920, fps: 30,
  hasVideo: kind !== 'audio', hasAudio: kind !== 'image', size: 1, rotation: 0, proxy: 'none',
});

const draft: CcDraft = {
  canvas_config: { width: 1080, height: 1920 }, fps: 30, duration: 14e6,
  materials: {
    videos: [
      { id: 'v1', path: 'D:/clips/beach.mp4', type: 'video', duration: 20e6 },
      { id: 'v2', path: '##_draftpath_placeholder_0E685133-18CE-45ED-8CB8-2904A212EC80_##\\Resources\\city.mp4', type: 'video', duration: 30e6 },
      { id: 'p1', path: 'D:/clips/logo.png', type: 'photo', duration: 10800e6 },
      { id: 'gone', path: 'D:/clips/missing.mp4', type: 'video', duration: 5e6 },
    ],
    audios: [{ id: 'a1', path: 'D:/music/beat.mp3', duration: 60e6, name: 'beat' }],
    texts: [{ id: 't1', content: JSON.stringify({ text: 'Лето 2026', styles: [] }) }],
    transitions: [{ id: 'tr1' }],
  },
  tracks: [
    { type: 'video', segments: [
      { material_id: 'v1', target_timerange: { start: 0, duration: 4e6 }, source_timerange: { start: 2e6, duration: 4e6 }, speed: 1, volume: 0.5 },
      { material_id: 'v2', target_timerange: { start: 4e6, duration: 5e6 }, source_timerange: { start: 0, duration: 10e6 }, speed: 2 },
      { material_id: 'gone', target_timerange: { start: 9e6, duration: 5e6 }, source_timerange: { start: 0, duration: 5e6 } },
    ] },
    { type: 'video', segments: [
      { material_id: 'p1', target_timerange: { start: 1e6, duration: 3e6 }, source_timerange: null, clip: { scale: { x: 0.3, y: 0.3 }, transform: { x: 0.6, y: 0.7 }, rotation: 10, alpha: 0.8 } },
    ] },
    { type: 'audio', segments: [{ material_id: 'a1', target_timerange: { start: 0, duration: 9e6 }, source_timerange: { start: 0, duration: 9e6 }, volume: 0.7 }] },
    { type: 'text', segments: [{ material_id: 't1', target_timerange: { start: 0.5e6, duration: 2e6 }, clip: { transform: { x: 0, y: 0.6 } } }] },
    { type: 'effect', segments: [{ material_id: 'fx', target_timerange: { start: 0, duration: 1e6 } }] },
  ],
};

describe('проект CapCut', () => {
  it('зашифрованный или не тот файл — понятная причина', () => {
    expect('error' in parseDraft('\u0001\u0002binary')).toBe(true);
    expect((parseDraft('\u0001') as { error: string }).error).toContain('зашифрован');
    expect((parseDraft('{"a":1}') as { error: string }).error).toContain('не проект CapCut');
    expect('draft' in parseDraft(JSON.stringify(draft))).toBe(true);
  });
  it('пути: заглушка CapCut → папка проекта; список файлов без повторов', () => {
    expect(resolvePath('##_draftpath_placeholder_X_##\\Resources\\city.mp4', DIR)).toBe(`${DIR}\\Resources\\city.mp4`);
    expect(resolvePath('D:/a.mp4', DIR)).toBe('D:/a.mp4');
    expect(draftFiles(draft, DIR)).toHaveLength(5);
  });
  it('текст надписи из JSON и из старого формата с тегами', () => {
    expect(textOf('{"text":"Привет"}')).toBe('Привет');
    expect(textOf('<font id="" path="x">[Привет]</font>')).toBe('Привет');
  });
  it('склейки, обрезка, скорость, громкость, видео поверх, музыка, надпись; пропавший файл и эффекты — в отчёт', () => {
    const files = new Map<string, MediaAsset>([
      ['D:/clips/beach.mp4', asset('beach', 'D:/clips/beach.mp4', 'video', 20)],
      [`${DIR}\\Resources\\city.mp4`, asset('city', `${DIR}\\Resources\\city.mp4`, 'video', 30)],
      ['D:/clips/logo.png', asset('logo', 'D:/clips/logo.png', 'image', 0)],
      ['D:/music/beat.mp3', asset('beat', 'D:/music/beat.mp3', 'audio', 60)],
    ]);
    const r = capcutToProject(draft, DIR, 'Мой проект CapCut', (p) => files.get(p));
    const p = r.project;
    expect(p.settings.aspect).toBe('9:16');
    expect(r.missing).toEqual(['D:/clips/missing.mp4']);
    expect(r.skipped).toBe(2); // эффект + переход
    const main = mainTrack(p).clips as MediaClip[];
    expect(main).toHaveLength(2);
    expect([main[0].in, main[0].out, main[0].volume]).toEqual([2, 6, 0.5]);
    expect([main[1].in, main[1].out, main[1].speed]).toEqual([0, 10, 2]);
    expect(projectDuration(p)).toBeCloseTo(9, 3);
    const over = p.tracks.find((t) => t.kind === 'video')!.clips[0] as MediaClip;
    expect(over.start).toBe(1);
    expect(over.out).toBe(3);
    expect(over.transform).toEqual({ x: 0.3, y: -0.35, scale: 0.3, rotation: 10 });
    expect(over.opacity).toBe(0.8);
    const mus = p.tracks.find((t) => t.kind === 'audio')!.clips[0] as MediaClip;
    expect([mus.out - mus.in, mus.volume]).toEqual([9, 0.7]);
    const txt = p.tracks.find((t) => t.kind === 'text')!.clips[0] as TextClip;
    expect([txt.text, txt.start, txt.duration, txt.y]).toEqual(['Лето 2026', 0.5, 2, 0.2]);
  });
});
