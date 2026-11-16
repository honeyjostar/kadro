// Дорожки: соло (слышно только дорожки с соло) и замок (клипы нельзя удалить); в экспорте соло тоже работает.
import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { buildGraph } from '../../src/shared/exportGraph';
import { addAsset, addFree, addToMain, clipLocked, mainTrack, setTrackFlag, trackSilent } from '../../src/shared/timeline';
import type { MediaAsset } from '../../src/shared/types';

const asset = (id: string, kind: 'video' | 'audio'): MediaAsset => ({ id, kind, path: `/m/${id}`, previewPath: `/m/${id}`, name: id, duration: 10, width: kind === 'video' ? 640 : 0, height: kind === 'video' ? 360 : 0, fps: 30, hasVideo: kind === 'video', hasAudio: true, proxy: 'none' } as MediaAsset);

function proj() {
  let p = addAsset(addAsset(newProject('t'), asset('v', 'video')), asset('m', 'audio'));
  p = addToMain(p, 'v', 0).project;
  p = addFree(p, 'm', 0).project;
  return p;
}

describe('дорожки: соло и замок', () => {
  it('соло: без соло слышно всё; соло у музыки — основная дорожка молчит', () => {
    let p = proj();
    const music = p.tracks.find((t) => t.kind === 'audio')!;
    expect(trackSilent(p, mainTrack(p))).toBe(false);
    p = setTrackFlag(p, music.id, { solo: true });
    expect(trackSilent(p, mainTrack(p))).toBe(true);
    expect(trackSilent(p, p.tracks.find((t) => t.kind === 'audio')!)).toBe(false);
    // в экспорте: без соло звук видео берётся вторым входом того же файла, с соло у музыки — нет
    const uses = (q: typeof p) => buildGraph(q, { width: 640, height: 360, fps: 30, textLayers: [] }).inputs.filter((a) => a.includes('/m/v')).length;
    expect(uses(p)).toBe(uses(proj()) - 1);
  });
  it('замок: клипы дорожки помечены как закрытые', () => {
    let p = proj();
    const id = mainTrack(p).clips[0].id;
    expect(clipLocked(p, id)).toBe(false);
    p = setTrackFlag(p, mainTrack(p).id, { locked: true });
    expect(clipLocked(p, id)).toBe(true);
  });
});
