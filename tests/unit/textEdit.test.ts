// Монтаж через текст: удалённые слова вырезаются из видео, субтитры и всё после выреза сдвигаются, музыка не режется.
import { describe, expect, it } from 'vitest';
import { CAPTION_STYLE, newProject } from '../../src/shared/defaults';
import { addAsset, addFree, addToMain, clipDuration, mainTrack, projectDuration, setCaptions } from '../../src/shared/timeline';
import { cutRanges, cutTimeline, fillerIndices, mapTime, transcriptWords } from '../../src/shared/textEdit';
import type { MediaAsset, MediaClip, Project, TextClip } from '../../src/shared/types';

function asset(id: string, kind: MediaAsset['kind'], duration: number): MediaAsset {
  return { id, kind, path: `/m/${id}`, previewPath: `/m/${id}`, name: id, duration, width: 1920, height: 1080, fps: 30, hasVideo: kind !== 'audio', hasAudio: kind !== 'image', size: 1, rotation: 0, proxy: 'none' };
}
// 10 с говорящей головы: «Привет э это Kadro бесплатный монтаж» + музыка на 20 с
function base(): Project {
  let p = newProject('t');
  p = addAsset(p, asset('v10', 'video', 10));
  p = addAsset(p, asset('mus', 'audio', 20));
  p = addToMain(p, 'v10', 0).project;
  p = addFree(p, 'mus', 0).project;
  const w = (text: string, start: number, end: number) => ({ text, start, end });
  return setCaptions(p, [
    { start: 0.5, end: 3.0, text: 'Привет э это', words: [w('Привет', 0.5, 1.0), w('э', 1.4, 1.6), w('это', 2.0, 2.4)] },
    { start: 4.0, end: 7.5, text: 'Kadro бесплатный монтаж', words: [w('Kadro', 4.0, 4.6), w('бесплатный', 5.0, 6.0), w('монтаж', 6.4, 7.0)] },
  ], CAPTION_STYLE);
}

describe('монтаж через текст', () => {
  it('слова из субтитров — по порядку, со временем на таймлайне; паразиты находятся', () => {
    const ws = transcriptWords(base());
    expect(ws.map((x) => x.text)).toEqual(['Привет', 'э', 'это', 'Kadro', 'бесплатный', 'монтаж']);
    expect(ws[3]).toMatchObject({ start: 4, end: 4.6 });
    expect(fillerIndices(ws)).toEqual([1]);
    expect(fillerIndices([{ text: 'как', start: 0, end: 1, clipId: '' }, { text: 'бы', start: 1, end: 2, clipId: '' }, { text: 'ну,', start: 2, end: 3, clipId: '' }])).toEqual([0, 1, 2]);
  });

  it('вырез — от середины паузы до середины паузы; соседние слова сливаются в один вырез', () => {
    const ws = transcriptWords(base());
    expect(cutRanges(ws, [1])).toEqual([[1.2, 1.8]]);
    expect(cutRanges(ws, [1, 2])).toEqual([[1.2, 3.2]]);
    expect(cutRanges(ws, [5])).toEqual([[6.2, 7.05]]);
    expect(mapTime(5, [[1.2, 1.8], [3, 4]])).toBe(3.4);
    expect(mapTime(1.5, [[1.2, 1.8]])).toBe(1.2);
  });

  it('удалил «э» — видео короче на 0,6 с, субтитры без «э» и сдвинуты, музыка цела', () => {
    const p = base();
    const ws = transcriptWords(p);
    const q = cutTimeline(p, cutRanges(ws, [1]));
    const main = mainTrack(q).clips as MediaClip[];
    expect(main).toHaveLength(2);
    expect(main.map((c) => [c.in, c.out])).toEqual([[0, 1.2], [1.8, 10]]);
    expect(projectDuration(q)).toBeGreaterThanOrEqual(19.9); // музыка 20 с не режется
    const mus = q.tracks.find((t) => t.kind === 'audio')!.clips[0];
    expect(clipDuration(mus)).toBe(20);
    const w2 = transcriptWords(q);
    expect(w2.map((x) => x.text)).toEqual(['Привет', 'это', 'Kadro', 'бесплатный', 'монтаж']);
    expect(w2[1].start).toBeCloseTo(1.4, 5);
    expect(w2[2].start).toBeCloseTo(3.4, 5);
    const cap = q.tracks.find((t) => t.kind === 'text')!.clips[0] as TextClip;
    expect(cap.text).toBe('Привет это');
  });

  it('удалил целую фразу — её субтитр исчезает, вторая фраза встаёт раньше', () => {
    const p = base();
    const q = cutTimeline(p, cutRanges(transcriptWords(p), [0, 1, 2]));
    const caps = q.tracks.find((t) => t.kind === 'text')!.clips as TextClip[];
    expect(caps).toHaveLength(1);
    expect(caps[0].text).toBe('Kadro бесплатный монтаж');
    // вырез — с 0,45 (начало фразы минус запас) до середины паузы перед «Kadro» (3,2)
    expect(transcriptWords(q)[0].start).toBeCloseTo(4 - 2.75, 5);
    expect(clipDuration(mainTrack(q).clips[0])).toBeCloseTo(0.45, 1); // склейки — по кадрам
  });
});
