import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { autoEdit, fullBudgets, loopedBeats, shootingOrder, type AutoInput, type Highlights } from '../../src/shared/autoEdit';
import { mainTrack } from '../../src/shared/timeline';
import type { MediaAsset, MediaClip } from '../../src/shared/types';

function asset(id: string, kind: MediaAsset['kind'], duration: number, extra: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id, kind, path: `/m/${id}`, previewPath: `/m/${id}`, name: id, duration, width: 3840, height: 2160, fps: 30,
    hasVideo: kind !== 'audio', hasAudio: kind !== 'image', size: 5e8, rotation: 0, proxy: 'none', ...extra,
  };
}
function song(duration: number, bpm = 120): MediaAsset {
  const beats: number[] = [];
  for (let t = 0.5; t < duration; t += 60 / bpm) beats.push(Math.round(t * 1000) / 1000);
  return asset('music', 'audio', duration, { beats, bpm });
}
/** Видео с хорошими и плохими местами: волна оценки, у каждого файла своя. */
function hl(dur: number, k: number): Highlights {
  const step = 0.5;
  const score = Array.from({ length: Math.ceil(dur / step) }, (_, i) => Math.round((0.5 + 0.4 * Math.sin(i / (3 + (k % 5)))) * 1000) / 1000);
  return { step, score, cuts: [] };
}
/** 60 файлов по 30–150 с (как у друга: 60 кусков на 30 ГБ), в случайном порядке имён. */
function sixty(): AutoInput['media'] {
  return Array.from({ length: 60 }, (_, k) => {
    const n = (k * 37) % 60;
    const dur = 30 + ((k * 53) % 121);
    return { asset: asset(`VID_${String(n + 1).padStart(4, '0')}`, 'video', dur), hl: hl(dur, k) };
  });
}
const input = (over: Partial<AutoInput> = {}): AutoInput => ({
  media: sixty(), music: song(150), style: 'energy', aspect: '16:9', length: 'full', title: 'Поездка', videoSound: 'quiet', seed: 3, ...over,
});

describe('фильм из всего материала', () => {
  it('60 файлов → ролик на минуты, все файлы по порядку съёмки, куски без наложений', () => {
    const { project, summary } = autoEdit(newProject('t', '16:9'), input());
    const cl = mainTrack(project).clips as MediaClip[];
    expect(summary.duration).toBeGreaterThan(5 * 60);
    expect(summary.used).toBe(60);
    expect(summary.dropped).toBe(0);
    // порядок съёмки: номера файлов не убывают
    const names = cl.map((c) => project.assets.find((a) => a.id === c.assetId)!.name);
    const nums = names.map((n) => Number(n.slice(4)));
    for (let i = 1; i < nums.length; i++) expect(nums[i]).toBeGreaterThanOrEqual(nums[i - 1]);
    // куски одного файла — по времени, не пересекаются, внутри файла
    const by = new Map<string, MediaClip[]>();
    for (const c of cl) by.set(c.assetId, [...(by.get(c.assetId) ?? []), c]);
    for (const [id, cs] of by) {
      const a = project.assets.find((x) => x.id === id)!;
      cs.forEach((c, i) => {
        expect(c.in).toBeGreaterThanOrEqual(0);
        expect(c.out).toBeLessThanOrEqual(a.duration + 1e-6);
        if (i) expect(c.in).toBeGreaterThanOrEqual(cs[i - 1].out - 1e-3);
      });
    }
    // кадры — не мельтешат: в среднем от 2 секунд
    expect(summary.duration / cl.length).toBeGreaterThan(2);
    // звук видео — тихо под музыкой
    expect(cl.every((c) => !c.muted && c.volume === 0.3)).toBe(true);
  });

  it('музыка идёт по кругу до конца ролика', () => {
    const { project, summary } = autoEdit(newProject('t', '16:9'), input());
    const mus = project.tracks.find((t) => t.kind === 'audio')!.clips as MediaClip[];
    expect(mus.length).toBeGreaterThan(2);
    const end = mus[mus.length - 1].start + (mus[mus.length - 1].out - mus[mus.length - 1].in);
    expect(Math.abs(end - summary.duration)).toBeLessThan(0.05);
    expect(summary.onBeats).toBe(true);
  });

  it('длина на выбор (10 минут) — держится; «Сколько получится» — по-прежнему короткий клип', () => {
    const ten = autoEdit(newProject('t', '16:9'), input({ length: 600 })).summary;
    expect(Math.abs(ten.duration - 600)).toBeLessThan(30);
    const short = autoEdit(newProject('t', '16:9'), input({ length: 'auto' })).summary;
    expect(short.duration).toBeLessThanOrEqual(48);
  });

  it('другой seed — другой вариант', () => {
    const a = autoEdit(newProject('t', '16:9'), input()).project;
    const b = autoEdit(newProject('t', '16:9'), input({ seed: 99 })).project;
    const ins = (p: typeof a) => (mainTrack(p).clips as MediaClip[]).map((c) => c.in).join();
    expect(ins(a)).not.toBe(ins(b));
  });
});

describe('фильм: части', () => {
  it('порядок съёмки по номерам в имени', () => {
    const m = ['IMG_10', 'IMG_9', 'IMG_100'].map((n) => ({ asset: asset(n, 'video', 5) }));
    expect(shootingOrder(m).map((x) => x.asset.name)).toEqual(['IMG_9', 'IMG_10', 'IMG_100']);
  });
  it('доли музыки по кругу', () => {
    const b = loopedBeats(song(10), 0, 30);
    expect(b.length).toBeGreaterThan(55);
    expect(b[b.length - 1]).toBeGreaterThan(30);
  });
  it('бюджеты: каждый файл хотя бы кадром, не больше 90% файла, сумма — цель', () => {
    const good = [50, 5, 20, 1];
    const lens = [60, 6, 30, 2];
    const b = fullBudgets(good, [0.6, 0.5, 0.7, 0.4], lens, [true, true, true, true], 60, 3, 2.5);
    expect(b.every((x) => x > 0)).toBe(true);
    b.forEach((x, i) => expect(x).toBeLessThanOrEqual(lens[i] * 0.9 + 1e-6));
    expect(Math.abs(b.reduce((s, x) => s + x, 0) - 60)).toBeLessThan(1);
  });
});
