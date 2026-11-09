// Дубляж: фразы, время на фразу, ускорение голоса, раскладка по дорожке, оригинал тише.
import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { addAsset, addFree, addToMain } from '../../src/shared/timeline';
import { captionCues, dubPhrases, fitSpeed, placeDub, quietOriginal, slotOf } from '../../src/shared/dub';
import { setCaptions } from '../../src/shared/timeline';
import { CAPTION_STYLE } from '../../src/shared/defaults';
import type { MediaAsset, MediaClip } from '../../src/shared/types';

const asset = (id: string, kind: MediaAsset['kind'], duration: number): MediaAsset => ({
  id, kind, path: `/m/${id}`, previewPath: `/m/${id}`, name: id, duration, width: 1920, height: 1080, fps: 30,
  hasVideo: kind !== 'audio', hasAudio: kind !== 'image', size: 1, rotation: 0, proxy: 'none',
});

describe('дубляж', () => {
  it('фразы — из соседних субтитров до точки', () => {
    const cues = [
      { text: 'Привет, сегодня', start: 0.5, end: 1.5 }, { text: 'я покажу Kadro.', start: 1.6, end: 2.8 },
      { text: 'Это бесплатно', start: 4, end: 5 },
    ];
    const ph = dubPhrases(cues);
    expect(ph.map((p) => p.text)).toEqual(['Привет, сегодня я покажу Kadro.', 'Это бесплатно']);
    expect(ph[0]).toMatchObject({ start: 0.5, end: 2.8, cues: [0, 1] });
    expect(slotOf(ph, 0, 10)).toBeCloseTo(3.42, 2);   // до следующей фразы
    expect(slotOf(ph, 1, 10)).toBeCloseTo(5.92, 2);   // до конца ролика
  });
  it('не влезает — голос быстрее, но не больше чем в 1,45 раза', () => {
    expect(fitSpeed(2, 3)).toBe(1);
    expect(fitSpeed(3.1, 3)).toBe(1);
    expect(fitSpeed(3.6, 3)).toBe(1.2);
    expect(fitSpeed(9, 3)).toBe(1.45);
  });
  it('озвучка — на своей дорожке, без наездов', () => {
    let p = newProject('t');
    for (const [id, d] of [['d1', 2], ['d2', 1.5], ['d3', 1]] as const) p = addAsset(p, asset(id, 'audio', d));
    const q = placeDub(p, [{ assetId: 'd2', start: 1.5 }, { assetId: 'd1', start: 0 }, { assetId: 'd3', start: 5 }], 'Дубляж (английский)');
    const t = q.tracks[q.tracks.length - 1];
    expect(t).toMatchObject({ kind: 'audio', name: 'Дубляж (английский)' });
    expect(t.clips.map((c) => [(c as MediaClip).assetId, Math.round(c.start * 100) / 100])).toEqual([['d1', 0], ['d2', 2.02], ['d3', 5]]);
  });
  it('оригинал: тихо или выключить — только звук видео, музыка как была', () => {
    let p = addAsset(addAsset(newProject('t'), asset('v', 'video', 10)), asset('m', 'audio', 10));
    p = addToMain(p, 'v', 0).project;
    p = addFree(p, 'm', 0).project;
    const vol = (q: typeof p, kind: string) => q.tracks.find((t) => t.kind === kind)!.clips[0] as MediaClip;
    const duck = quietOriginal(p, 'duck');
    expect(vol(duck, 'main').volume).toBe(0.15);
    expect(vol(duck, 'audio').volume).toBe(1);
    const mute = quietOriginal(p, 'mute');
    expect(vol(mute, 'main').muted).toBe(true);
    expect(vol(mute, 'audio').muted).toBe(false);
  });
  it('субтитры для озвучки — первая строка, по времени', () => {
    const p = setCaptions(newProject('t'), [{ start: 2, end: 3, text: 'второй' }, { start: 0, end: 1, text: 'первый' }], CAPTION_STYLE);
    expect(captionCues(p).map((c) => c.text)).toEqual(['первый', 'второй']);
  });
});
