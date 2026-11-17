import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { autoEdit, evenLight, fullBudgets, loopedBeats, shootingOrder, type AutoInput, type Highlights } from '../../src/shared/autoEdit';
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
    // первый кадр — «тизер» (лучший момент), дальше — по порядку съёмки
    expect(summary.hook).toBe(true);
    expect(cl[0].effects?.some((e) => e.type === 'flash')).toBe(true);
    const names = cl.slice(1).map((c) => project.assets.find((a) => a.id === c.assetId)!.name);
    const nums = names.map((n) => Number(n.slice(4)));
    for (let i = 1; i < nums.length; i++) expect(nums[i]).toBeGreaterThanOrEqual(nums[i - 1]);
    // куски одного файла — по времени, не пересекаются, внутри файла
    const by = new Map<string, MediaClip[]>();
    for (const c of cl.slice(1)) by.set(c.assetId, [...(by.get(c.assetId) ?? []), c]);
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

describe('фильм: склейки в паузах речи', () => {
  it('со звуком видео начало и конец кусков попадают в тишину', async () => {
    const { cutCost, SPEECH_STEP } = await import('../../src/shared/autoEdit');
    // речь: фразы по 2.6 с, между ними паузы 0.5 с
    const speechOf = (dur: number) => Array.from({ length: Math.ceil(dur / SPEECH_STEP) }, (_, i) => ((i * SPEECH_STEP) % 3.1 < 2.6 ? 0.3 : 0.004));
    const media = sixty().slice(0, 12).map((m) => ({ ...m, hl: { ...m.hl!, speech: speechOf(m.asset.duration) } }));
    const { project } = autoEdit(newProject('t', '16:9'), input({ media, music: null, videoSound: 'on', length: 'full' }));
    const cl = mainTrack(project).clips as MediaClip[];
    const hlOf = (id: string) => media.find((m) => m.asset.id === id)!.hl;
    const quiet = (c: MediaClip, t: number) => cutCost(hlOf(c.assetId), t) < 0.3;
    const ok = cl.filter((c) => quiet(c, c.in) && quiet(c, c.out)).length;
    expect(ok / cl.length).toBeGreaterThan(0.6); // без учёта речи — около 10%
  });
});

describe('нагрузка ПК', () => {
  it('пики копятся по делам, совет — по тому, что упирается', async () => {
    const { addPeaks, bottleneck } = await import('../../src/shared/sysmon');
    const s = (cpu: number, activity: string[], gpu: number | null = 30) => ({ t: 0, cpu, cpuTemp: null, cores: 8, ram: 8000, ramTotal: 16000, appCpu: 5, appRam: 900, gpu, gpuEnc: 40, gpuDec: 10, gpuMem: 1000, gpuMemTotal: 6000, gpuTemp: 60, gpuName: 'GTX 1060', activity });
    let p = addPeaks([], s(20, []), 'idle');
    p = addPeaks(p, s(97, ['Экспорт']), 'idle');
    p = addPeaks(p, s(80, ['Экспорт']), 'idle');
    expect(p.find((x) => x.label === 'Экспорт')).toMatchObject({ cpu: 97, secs: 2, gpuEnc: 40 });
    expect(p.find((x) => x.label === 'idle')?.cpu).toBe(20);
    expect(bottleneck(s(97, []))).toBe('cpu');
    expect(bottleneck({ ...s(10, []), gpuTemp: 90 })).toBe('hot');
    expect(bottleneck(s(10, []))).toBeNull();
  });
});

describe('тематический текст', () => {
  it('шрифты тем есть в Kadro', async () => {
    const { TEXT_THEMES } = await import('../../src/shared/textThemes');
    const { FONTS } = await import('../../src/shared/defaults');
    for (const t of TEXT_THEMES) expect(FONTS.some((f) => f.family === t.style.font), t.id).toBe(true);
  });
});

describe('фильм: тизер и дубли', () => {
  it('без «тизера» — всё строго по порядку; дубль (одна и та же сцена в двух файлах подряд) выбрасывается', async () => {
    const { project, summary } = autoEdit(newProject('t', '16:9'), input({ hook: false }));
    expect(summary.hook).toBe(false);
    const cl = mainTrack(project).clips as MediaClip[];
    expect(cl[0].effects?.some((e) => e.type === 'flash') ?? false).toBe(false);
    // два файла с одинаковыми отпечатками кадров = два дубля
    const { SIG_N } = await import('../../src/shared/autoEdit');
    const same = (dur: number, k: number) => ({ ...hl(dur, k), sig: Array.from({ length: Math.ceil(dur / 0.5) * SIG_N }, (_, i) => (i % SIG_N) * 10) });
    const media = [
      { asset: asset('DJI_0001', 'video', 20), hl: same(20, 1) },
      { asset: asset('DJI_0002', 'video', 20), hl: { ...same(20, 2), score: same(20, 2).score.map((v) => v * 0.6) } },
    ];
    const r = autoEdit(newProject('t', '16:9'), input({ media, music: null, videoSound: 'on', hook: false }));
    expect(r.summary.dupes).toBeGreaterThan(0);
    const used = new Set((mainTrack(r.project).clips as MediaClip[]).map((c) => r.project.assets.find((a) => a.id === c.assetId)!.name));
    expect(used.has('DJI_0001')).toBe(true); // лучший дубль остался
  });
});

describe('ровный свет', () => {
  const hl = (lum: number) => ({ step: 0.5, score: new Array(40).fill(0.6), cuts: [], lum: new Array(40).fill(lum) });
  const clip = (id: string) => ({ assetId: id, in: 2, out: 6, speed: 1, color: { brightness: 1 } } as unknown as MediaClip);
  it('тёмный и пересвеченный куски подтягиваются к середине, обычные не трогаются', () => {
    const media = [{ asset: asset('a', 'video', 20), hl: hl(120) }, { asset: asset('b', 'video', 20), hl: hl(125) }, { asset: asset('c', 'video', 20), hl: hl(60) }, { asset: asset('d', 'video', 20), hl: hl(200) }, { asset: asset('e', 'video', 20), hl: hl(118) }];
    const clips = ['a', 'b', 'c', 'd', 'e'].map(clip);
    expect(evenLight(clips, media)).toBe(2);
    expect(clips[0].color.brightness).toBe(1);
    expect(clips[2].color.brightness).toBeGreaterThan(1.1);
    expect(clips[2].color.brightness).toBeLessThanOrEqual(1.2);
    expect(clips[3].color.brightness).toBeLessThan(0.9);
  });
  it('ночная съёмка целиком остаётся ночной; без разбора — ничего', () => {
    const media = ['a', 'b', 'c'].map((id) => ({ asset: asset(id, 'video', 20), hl: hl(40 + id.charCodeAt(0) % 3) }));
    const clips = ['a', 'b', 'c'].map(clip);
    expect(evenLight(clips, media)).toBe(0);
    expect(evenLight(['a', 'b', 'c'].map(clip), ['a', 'b', 'c'].map((id) => ({ asset: asset(id, 'video', 20) })))).toBe(0);
  });
});

describe('дубли — без ложных срабатываний', () => {
  it('похоже в среднем, но по времени по-разному (пролёт дрона) — не дубль; у дублей — всё время одинаково', async () => {
    const { SIG_N, sigSeq, seqSimilarity, windowSig, sigSimilarity } = await import('../../src/shared/autoEdit');
    const frames = 40;
    // A: светлое сверху → снизу; B: наоборот → снизу вверх. В среднем одинаковые, по времени — разные
    const make = (flip: boolean) => ({ step: 0.5, score: new Array(frames).fill(0.6), cuts: [], sig: Array.from({ length: frames * SIG_N }, (_, i) => {
      const f = Math.floor(i / SIG_N); const t = flip ? 1 - f / (frames - 1) : f / (frames - 1);
      return Math.round(60 + 140 * t);
    }) });
    const a = make(false); const b = make(true);
    expect(sigSimilarity(windowSig(a, 0, 20), windowSig(b, 0, 20))).toBeGreaterThan(0.92);
    expect(seqSimilarity(sigSeq(a, 0, 20), sigSeq(b, 0, 20))).toBeLessThan(0.5);
    expect(seqSimilarity(sigSeq(a, 0, 20), sigSeq(make(false), 0, 20))).toBe(1);
  });
});
