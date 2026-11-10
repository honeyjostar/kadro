import { describe, expect, it } from 'vitest';
import { coachProgress } from '../../src/shared/coach';
import { addAsset, addText, addToMain, setCaptions } from '../../src/shared/timeline';
import { newProject } from '../../src/shared/defaults';
import type { MediaAsset } from '../../src/shared/types';

const v = { id: 'v', kind: 'video', path: '/v.mp4', name: 'v', duration: 5, width: 640, height: 360, fps: 30, hasAudio: true } as unknown as MediaAsset;

describe('первый ролик за 3 шага', () => {
  it('шаги отмечаются по проекту: видео, надпись (не субтитр), экспорт', () => {
    let p = newProject();
    expect(coachProgress(p, false)).toEqual({ done: [false, false, false], current: 0 });
    p = addToMain(addAsset(p, v), 'v', 0).project;
    expect(coachProgress(p, false).current).toBe(1);
    const withCaption = setCaptions(p, [{ start: 0, end: 1, text: 'привет' }] as never, { size: 40 } as never);
    expect(coachProgress(withCaption, false).current).toBe(1);
    p = addText(p, 0, 'Мой ролик').project;
    expect(coachProgress(p, false).current).toBe(2);
    expect(coachProgress(p, true)).toEqual({ done: [true, true, true], current: 3 });
  });
  it('экспорт без видео не считается', () => {
    expect(coachProgress(newProject(), true).done[2]).toBe(false);
  });
});
