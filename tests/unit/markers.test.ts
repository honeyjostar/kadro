import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { fullArgs } from '../../src/shared/exportGraph';
import { addAsset, addToMain } from '../../src/shared/timeline';
import {
  addMarker, chapterTime, chaptersOf, clearMarkers, ffmetadataChapters, nextMarker, prevMarker, removeMarker, updateMarker, youtubeChapters,
} from '../../src/shared/markers';

const video = (id: string, d: number) => ({ id, kind: 'video', path: `/v/${id}.mp4`, name: `${id}.mp4`, duration: d, width: 640, height: 360, hasAudio: false, hasVideo: true, fps: 30 }) as any;
const proj = (len = 125) => {
  let p = addAsset(newProject('Мой ролик', '16:9'), video('a', len));
  p = addToMain(p, 'a', 0).project;
  return p;
};

describe('маркеры', () => {
  it('ставятся по времени, на тот же кадр второй не ставится; правка, удаление, соседние', () => {
    let p = proj();
    const a = addMarker(p, 30); p = a.project;
    const b = addMarker(p, 10.0004, { label: 'Начало обзора', color: 'green' }); p = b.project;
    expect(addMarker(p, 10.01).project).toBe(p); // в пределах кадра (30 к/с) — тот же маркер
    expect(addMarker(p, 10.01).id).toBe(b.id);
    expect(p.markers!.map((m) => [m.t, m.label, m.color])).toEqual([[10, 'Начало обзора', 'green'], [30, 'Маркер 1', 'pink']]);
    p = updateMarker(p, a.id, { t: 5, label: '  Вступление \n длинное  ' });
    expect(p.markers!.map((m) => m.label)).toEqual(['Вступление длинное', 'Начало обзора']);
    expect(updateMarker(p, 'nope', { t: 1 })).toBe(p);
    expect(nextMarker(p, 5)?.t).toBe(10);
    expect(nextMarker(p, 10)).toBeUndefined();
    expect(prevMarker(p, 10)?.t).toBe(5);
    expect(prevMarker(p, 5)).toBeUndefined();
    p = removeMarker(p, a.id);
    expect(p.markers).toHaveLength(1);
    expect(clearMarkers(p).markers).toEqual([]);
    expect(clearMarkers(clearMarkers(p))).toEqual(clearMarkers(p));
  });

  it('время глав как у YouTube', () => {
    expect(chapterTime(0)).toBe('0:00');
    expect(chapterTime(65.9)).toBe('1:05');
    expect(chapterTime(3723)).toBe('1:02:03');
  });

  it('главы: с 0:00 («Начало», если маркера в начале нет), за концом ролика — не в счёт, одна секунда — одна глава', () => {
    let p = proj(125);
    for (const [t, label] of [[15, 'Распаковка'], [60.4, 'Тест'], [60.8, 'Тест камеры'], [200, 'За концом']] as const) p = addMarker(p, t, { label }).project;
    expect(chaptersOf(p)).toEqual([
      { start: 0, end: 15, title: 'Начало' },
      { start: 15, end: 60, title: 'Распаковка' },
      { start: 60, end: 125, title: 'Тест камеры' },
    ]);
    const yt = youtubeChapters(p);
    expect(yt.text).toBe('0:00 Начало\n0:15 Распаковка\n1:00 Тест камеры');
    expect(yt.problems).toEqual([]);
    // маркер в самом начале — первая глава под его именем
    const q = addMarker(proj(125), 0.3, { label: 'Привет' }).project;
    expect(chaptersOf(q)[0]).toEqual({ start: 0, end: 125, title: 'Привет' });
    expect(youtubeChapters(q).problems[0]).toMatch(/хотя бы три/);
    // короткая глава
    let r = proj(40);
    for (const t of [0, 5, 20]) r = addMarker(r, t).project;
    expect(youtubeChapters(r).problems).toEqual(['Короче 10 секунд: «Маркер 1» — YouTube такие главы не покажет.']);
    expect(youtubeChapters(proj()).text).toBe('');
  });

  it('главы в MP4: файл метаданных FFmpeg, особые знаки экранируются; последним входом в ffmpeg', () => {
    let p = proj(30);
    p = addMarker(p, 0, { label: 'Старт = 1; #важно' }).project;
    p = addMarker(p, 12.5, { label: 'Финал' }).project;
    expect(ffmetadataChapters(p, 'Мой ролик')).toBe([
      ';FFMETADATA1', 'title=Мой ролик', '',
      '[CHAPTER]', 'TIMEBASE=1/1000', 'START=0', 'END=12000', 'title=Старт \\= 1\\; \\#важно', '',
      '[CHAPTER]', 'TIMEBASE=1/1000', 'START=12000', 'END=30000', 'title=Финал', '',
    ].join('\n'));
    expect(ffmetadataChapters(proj())).toBeNull();
    const g = { inputs: [['-i', 'a.mp4'], ['-framerate', '30', '-i', 'b_%05d.png']], filter: '', vOut: '[vout]', aOut: '[aout]', duration: 30 };
    const args = fullArgs(g, 'graph.txt', 7, 'x264', 'high', 30, 'out.mp4', 'chapters.txt');
    expect(args.join(' ')).toContain('-i b_%05d.png -f ffmetadata -i chapters.txt -/filter_complex graph.txt');
    expect(args.join(' ')).toContain('-map_metadata 2 -map_chapters 2');
    expect(fullArgs(g, 'graph.txt', 7, 'x264', 'high', 30, 'out.mp4').join(' ')).not.toContain('ffmetadata');
  });
});
