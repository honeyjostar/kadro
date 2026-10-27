import { describe, expect, it } from 'vitest';
import { captionCues, readingTime, scriptBase, scriptEdit, splitScript } from '../../src/shared/scriptVideo';
import { clipDuration, projectDuration } from '../../src/shared/timeline';
import type { MediaAsset } from '../../src/shared/types';

const video = (id: string, d: number): MediaAsset => ({ id, kind: 'video', path: `/v/${id}.mp4`, previewPath: `/v/${id}.mp4`, name: id, duration: d, width: 1920, height: 1080, fps: 30, hasVideo: true, hasAudio: true, size: 1, rotation: 0, proxy: 'none' });
const image = (id: string): MediaAsset => ({ ...video(id, 0), kind: 'image', hasAudio: false });
const audio = (id: string, d: number): MediaAsset => ({ ...video(id, d), kind: 'audio', hasVideo: false, width: 0, height: 0 });

describe('ролик по сценарию', () => {
  it('сценарий → сцены: абзацы; длинный абзац — по предложениям', () => {
    expect(splitScript('Привет!\n\nЭто Kadro.\nОн бесплатный.\n\n\n')).toEqual(['Привет!', 'Это Kadro. Он бесплатный.']);
    const long = 'Первое предложение довольно длинное, в нём много слов. Второе тоже не короткое, но поменьше. Третье! Четвёртое?';
    const sc = splitScript(long, 70);
    expect(sc.length).toBeGreaterThan(1);
    expect(sc.join(' ')).toBe(long);
    for (const s of sc) expect(s.length).toBeLessThanOrEqual(70);
  });

  it('время чтения: ~14 знаков в секунду, не меньше 2 с', () => {
    expect(readingTime('Да.')).toBe(2);
    expect(readingTime('а'.repeat(140))).toBeCloseTo(10.6, 1);
  });

  it('субтитры: куски по словам, весь текст, время сцены целиком, новое предложение — новый субтитр', () => {
    const cues = captionCues('Kadro — бесплатный видеоредактор. Монтаж, субтитры и шейдеры прямо на твоём компьютере.', 10, 6, 28);
    expect(cues[0].start).toBe(10);
    expect(cues[cues.length - 1].end).toBeCloseTo(16, 3);
    expect(cues.map((c) => c.text).join(' ')).toBe('Kadro — бесплатный видеоредактор. Монтаж, субтитры и шейдеры прямо на твоём компьютере.');
    expect(cues.some((c) => c.text.endsWith('видеоредактор.'))).toBe(true);
    for (const c of cues) {
      expect(c.text.length).toBeLessThanOrEqual(32);
      expect(c.words![0].start).toBeCloseTo(c.start, 3);
      for (let i = 1; i < cues.length; i++) expect(cues[i].start).toBeCloseTo(cues[i - 1].end, 3);
    }
  });

  it('сборка: длина = сумма сцен, кадры на всю длину, голос в начале сцен, музыка тише, субтитры', () => {
    const v1 = video('v1', 20); const v2 = video('v2', 2); const img = image('img');
    const voices = [audio('voice1', 3.2), audio('voice2', 5.1)];
    const music = audio('music', 60);
    const scenes = [{ text: 'Первая сцена про горы.', dur: 3.5, voice: voices[0] }, { text: 'Вторая сцена. Здесь море и солнце.', dur: 5.4, voice: voices[1] }];
    const { project: p, summary } = scriptEdit(scriptBase('9:16', 'Отпуск'), {
      scenes, media: [{ asset: v1 }, { asset: v2 }, { asset: img }], music, aspect: '9:16', title: 'Отпуск', captions: true, shot: 2.5, seed: 7,
    });
    expect(p.name).toBe('Отпуск');
    expect(p.settings.aspect).toBe('9:16');
    expect(summary).toMatchObject({ scenes: 2, voiced: true });
    const main = p.tracks.find((t) => t.kind === 'main')!.clips;
    expect(main.reduce((n, c) => n + clipDuration(c), 0)).toBeCloseTo(8.9, 3);
    expect(summary.shots).toBe(main.length);
    // соседние кадры — разные файлы
    for (let i = 1; i < main.length; i++) expect((main[i] as any).assetId).not.toBe((main[i - 1] as any).assetId);
    // у видео звук выключен, кадр заполняет экран
    for (const c of main as any[]) { expect(c.volume).toBe(0); expect(c.fit).toBe('cover'); }
    // короткое видео (2 с) в кадре длиннее — замедлено, а не обрезано
    const short = (main as any[]).find((c) => c.assetId === 'v2');
    if (short) expect(clipDuration(short)).toBeGreaterThan(1.9);
    const audioClips = p.tracks.filter((t) => t.kind === 'audio').flatMap((t) => t.clips) as any[];
    const v = audioClips.filter((c) => c.assetId.startsWith('voice')).sort((a, b) => a.start - b.start);
    expect(v.map((c) => c.start)).toEqual([0, 3.5]);
    const m = audioClips.find((c) => c.assetId === 'music');
    expect(m.volume).toBeLessThan(0.3);
    expect(clipDuration(m)).toBeCloseTo(8.9, 3);
    const caps = p.tracks.filter((t) => t.kind === 'text').flatMap((t) => t.clips) as any[];
    expect(caps.length).toBeGreaterThanOrEqual(2);
    expect(caps.every((c) => c.role === 'caption')).toBe(true);
    expect(caps.map((c) => c.text).join(' ')).toBe('Первая сцена про горы. Вторая сцена. Здесь море и солнце.');
    expect(projectDuration(p)).toBeCloseTo(8.9, 3);
  });

  it('без голоса и музыки, одно фото — тоже собирается; пустой сценарий — ошибка', () => {
    const { project: p, summary } = scriptEdit(scriptBase('16:9', ''), {
      scenes: [{ text: 'Один кадр.', dur: 2 }], media: [{ asset: image('img') }], aspect: '16:9', title: '', captions: false, shot: 3, seed: 1,
    });
    expect(summary.voiced).toBe(false);
    expect(p.tracks.filter((t) => t.kind === 'audio').flatMap((t) => t.clips)).toHaveLength(0);
    expect(p.tracks.find((t) => t.kind === 'main')!.clips).toHaveLength(1);
    expect(() => scriptEdit(scriptBase('16:9', ''), { scenes: [], media: [{ asset: image('i') }], aspect: '16:9', title: '', captions: false, shot: 3, seed: 1 })).toThrow('Сценарий пустой');
    expect(() => scriptEdit(scriptBase('16:9', ''), { scenes: [{ text: 'a', dur: 1 }], media: [], aspect: '16:9', title: '', captions: false, shot: 3, seed: 1 })).toThrow('Нужны видео или фото');
  });
});
