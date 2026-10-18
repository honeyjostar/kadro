import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyColorToPixel, effectiveColor } from '../../src/shared/color';
import { newProject, settingsFor, TRANSITIONS } from '../../src/shared/defaults';
import {
  addAsset, addFree, addToMain, keepSourceRanges, mainTrack, setSettings, setTransition, splitClip, updateClip,
} from '../../src/shared/timeline';
import type { MediaClip, Project } from '../../src/shared/types';
import {
  assetFromFile, makeColorSeconds, makeImage, makeSolid, makeTone, meanVolume, near, pixelAt, probe, runExport,
  tmpDir, zeroCrossFreq, ff,
} from '../helpers/media';

const D = tmpDir('export');
const f = (n: string) => path.join(D, n);
const RED = [254, 0, 0];
const BLUE = [0, 0, 254];

// цвета секунд: 0 red, 1 lime, 2 blue, 3 yellow, 4 magenta, 5 cyan, 6 white, 7 orange
const SEC = ['red', 'lime', 'blue', 'yellow', 'magenta', 'cyan', 'white', 'orange'];
const SEC_RGB: Record<string, number[]> = {
  red: [254, 0, 0], lime: [0, 255, 1], blue: [0, 0, 254], yellow: [255, 255, 0], magenta: [254, 0, 254],
  cyan: [0, 255, 255], white: [255, 255, 255], orange: [255, 165, 0],
};

beforeAll(() => {
  if (!fs.existsSync(f('seconds.mp4'))) makeColorSeconds(f('seconds.mp4'), SEC, 640, 360, 30);
  if (!fs.existsSync(f('red.mp4'))) makeSolid(f('red.mp4'), 'red', 6, 640, 360, 30, 440);
  if (!fs.existsSync(f('blue.mp4'))) makeSolid(f('blue.mp4'), 'blue', 4, 480, 360, 25, 880);
  if (!fs.existsSync(f('portrait.mp4'))) makeSolid(f('portrait.mp4'), 'green', 3, 360, 640, 30, 300);
  if (!fs.existsSync(f('yellow.png'))) makeImage(f('yellow.png'), 'yellow', 200, 200);
  if (!fs.existsSync(f('tone300.mp3'))) makeTone(f('tone300.mp3'), 300, 12);
});

function proj(): Project {
  let p = newProject('t', '9:16');
  p = addAsset(p, assetFromFile('sec', f('seconds.mp4'), 'video'));
  p = addAsset(p, assetFromFile('red', f('red.mp4'), 'video'));
  p = addAsset(p, assetFromFile('blue', f('blue.mp4'), 'video'));
  p = addAsset(p, assetFromFile('por', f('portrait.mp4'), 'video'));
  p = addAsset(p, assetFromFile('img', f('yellow.png'), 'image'));
  p = addAsset(p, assetFromFile('mus', f('tone300.mp3'), 'audio'));
  return p;
}
const main = (p: Project) => mainTrack(p).clips as MediaClip[];

describe('экспорт: базовый монтаж', () => {
  it('один клип: длительность, размер, леттербокс, звук', () => {
    let p = addToMain(proj(), 'red', 0).project;
    runExport(p, f('o1.mp4'));
    const pr = probe(f('o1.mp4'));
    expect(pr.width).toBe(540);
    expect(pr.height).toBe(960);
    expect(Math.abs(pr.duration - 6)).toBeLessThan(0.1);
    expect(pr.hasAudio).toBe(true);
    expect(near(pixelAt(f('o1.mp4'), 2, 270, 480), RED)).toBe(true);   // центр — красный
    expect(near(pixelAt(f('o1.mp4'), 2, 270, 50), [0, 0, 0])).toBe(true); // сверху — чёрные поля
    expect(Math.abs(zeroCrossFreq(f('o1.mp4'), 1, 2) - 440)).toBeLessThan(15);
  });

  it('два клипа подряд и обрезка: правильные куски в правильное время', () => {
    let p = proj();
    p = addToMain(p, 'sec', 0).project;
    p = addToMain(p, 'blue', 100).project;
    const c0 = main(p)[0].id;
    p = updateClip(p, c0, { in: 2, out: 5 }); // синий(2), жёлтый(3), пурпурный(4)
    runExport(p, f('o2.mp4'));
    const pr = probe(f('o2.mp4'));
    expect(Math.abs(pr.duration - 7)).toBeLessThan(0.1);
    expect(near(pixelAt(f('o2.mp4'), 0.5, 270, 480), SEC_RGB.blue)).toBe(true);
    expect(near(pixelAt(f('o2.mp4'), 1.5, 270, 480), SEC_RGB.yellow)).toBe(true);
    expect(near(pixelAt(f('o2.mp4'), 2.5, 270, 480), SEC_RGB.magenta)).toBe(true);
    expect(near(pixelAt(f('o2.mp4'), 4.5, 270, 480), BLUE)).toBe(true);
  });

  it('скорость 2× и 0.5×', () => {
    let p = addToMain(proj(), 'sec', 0).project;
    p = updateClip(p, main(p)[0].id, { speed: 2 });
    runExport(p, f('o3.mp4'));
    expect(Math.abs(probe(f('o3.mp4')).duration - 4)).toBeLessThan(0.1);
    expect(near(pixelAt(f('o3.mp4'), 1.25, 270, 480), SEC_RGB.blue)).toBe(true); // 1.25с → исходник 2.5с
    expect(Math.abs(zeroCrossFreq(f('o3.mp4'), 0.5, 1) - 440)).toBeLessThan(20); // высота тона сохранена

    p = updateClip(p, main(p)[0].id, { speed: 0.5, out: 2 });
    runExport(p, f('o3b.mp4'));
    expect(Math.abs(probe(f('o3b.mp4')).duration - 4)).toBeLessThan(0.1);
    expect(near(pixelAt(f('o3b.mp4'), 2.5, 270, 480), SEC_RGB.lime)).toBe(true); // 2.5с → исходник 1.25с
  });

  it('вырезание пауз: куски одного файла склеиваются одной группой, без рассинхрона', () => {
    let p = addToMain(proj(), 'sec', 0).project;
    p = keepSourceRanges(p, main(p)[0].id, [[0, 1], [3, 4], [6, 8]]);
    expect(main(p).length).toBe(3);
    const { filter } = runExport(p, f('o4.mp4'));
    expect((filter.match(/[^a]select=/g) || []).length).toBe(1); // одна группа → один select
    const pr = probe(f('o4.mp4'));
    expect(Math.abs(pr.duration - 4)).toBeLessThan(0.1);
    expect(near(pixelAt(f('o4.mp4'), 0.5, 270, 480), SEC_RGB.red)).toBe(true);
    expect(near(pixelAt(f('o4.mp4'), 1.5, 270, 480), SEC_RGB.yellow)).toBe(true);
    expect(near(pixelAt(f('o4.mp4'), 2.5, 270, 480), SEC_RGB.white)).toBe(true);
    expect(near(pixelAt(f('o4.mp4'), 3.5, 270, 480), SEC_RGB.orange)).toBe(true);
    // граница кадра: 0.98 ещё красный, 1.02 уже жёлтый
    expect(near(pixelAt(f('o4.mp4'), 0.96, 270, 480), SEC_RGB.red)).toBe(true);
    expect(near(pixelAt(f('o4.mp4'), 1.04, 270, 480), SEC_RGB.yellow)).toBe(true);
  });

  it('много кусков (60) — экспорт работает и длительность точная', () => {
    let p = addToMain(proj(), 'sec', 0).project;
    const ranges: [number, number][] = [];
    for (let i = 0; i < 60; i++) ranges.push([i * 0.13, i * 0.13 + 0.07]);
    p = keepSourceRanges(p, main(p)[0].id, ranges.map(([a, b]) => [a, b + 0.03]));
    const total = main(p).reduce((s, c) => s + (c.out - c.in), 0);
    runExport(p, f('o4b.mp4'));
    expect(Math.abs(probe(f('o4b.mp4')).duration - total)).toBeLessThan(0.1);
  });

  it('картинка на основной дорожке и фон «размытие»', () => {
    let p = addToMain(proj(), 'img', 0).project;
    p = addToMain(p, 'red', 100).project;
    p = setSettings(p, { background: 'blur' });
    runExport(p, f('o5.mp4'));
    expect(Math.abs(probe(f('o5.mp4')).duration - 9)).toBeLessThan(0.1);
    expect(near(pixelAt(f('o5.mp4'), 1, 270, 480), [255, 255, 0])).toBe(true);
    // фон — размытая копия: сверху не чёрный, а красноватый
    const top = pixelAt(f('o5.mp4'), 5, 270, 40);
    expect(top[0]).toBeGreaterThan(150);
  });
});

describe('экспорт: переходы', () => {
  it('растворение: середина перехода — смесь двух клипов, длина с перекрытием', () => {
    let p = addToMain(proj(), 'red', 0).project;
    p = addToMain(p, 'blue', 100).project;
    p = setTransition(p, main(p)[0].id, { type: 'fade', duration: 1 });
    runExport(p, f('o6.mp4'));
    expect(Math.abs(probe(f('o6.mp4')).duration - 9)).toBeLessThan(0.1);
    expect(near(pixelAt(f('o6.mp4'), 3, 270, 480), RED)).toBe(true);
    const mid = pixelAt(f('o6.mp4'), 5.5, 270, 480);
    expect(mid[0]).toBeGreaterThan(90);
    expect(mid[2]).toBeGreaterThan(90);
    expect(near(pixelAt(f('o6.mp4'), 7, 270, 480), BLUE)).toBe(true);
  });

  it('все 11 переходов собираются и рендерятся', () => {
    for (const t of TRANSITIONS) {
      let p = addToMain(proj(), 'red', 0).project;
      p = addToMain(p, 'blue', 100).project;
      p = updateClip(p, main(p)[0].id, { out: 2 });
      p = updateClip(p, main(p)[1].id, { out: 2 });
      p = setTransition(p, main(p)[0].id, { type: t.type, duration: 0.6 });
      runExport(p, f(`tr_${t.type}.mp4`));
      expect(Math.abs(probe(f(`tr_${t.type}.mp4`)).duration - 3.4)).toBeLessThan(0.1);
    }
  });
});

describe('экспорт: цвет, наложения, звук', () => {
  it('цветокоррекция в экспорте совпадает с эталоном превью', () => {
    let p = addToMain(proj(), 'red', 0).project;
    const color = { brightness: 0.8, contrast: 1.2, saturation: 0.5, warmth: 0.3, preset: 'none', presetAmount: 1 };
    p = updateClip(p, main(p)[0].id, { color });
    runExport(p, f('o7.mp4'));
    const got = pixelAt(f('o7.mp4'), 2, 270, 480);
    const want = applyColorToPixel([254, 0, 0], effectiveColor(color));
    expect(near(got, want, 8)).toBe(true);
  });

  it('наложение картинки появляется только в своё время и в своём месте', () => {
    let p = addToMain(proj(), 'red', 0).project;
    const r = addFree(p, 'img', 2);
    p = updateClip(r.project, r.clipId, { transform: { scale: 0.5, x: 0.25, y: 0.25, rotation: 0 } } as any);
    runExport(p, f('o8.mp4'));
    // центр наложения: (0.5+0.25)·540, (0.5+0.25)·960
    expect(near(pixelAt(f('o8.mp4'), 1, 405, 720), [0, 0, 0])).toBe(true);
    expect(near(pixelAt(f('o8.mp4'), 3, 405, 720), [255, 255, 0])).toBe(true);
    expect(near(pixelAt(f('o8.mp4'), 5.5, 405, 720), [0, 0, 0])).toBe(true);
    expect(near(pixelAt(f('o8.mp4'), 3, 270, 480), RED)).toBe(true);
  });

  it('музыка на аудиодорожке, громкость и отключение звука клипа', () => {
    let p = addToMain(proj(), 'red', 0).project;
    p = addFree(p, 'mus', 0).project;
    p = updateClip(p, main(p)[0].id, { muted: true });
    runExport(p, f('o9.mp4'));
    expect(Math.abs(zeroCrossFreq(f('o9.mp4'), 1, 2) - 300)).toBeLessThan(15); // слышна только музыка
    const loud = meanVolume(f('o9.mp4'), 1, 2);
    const mus = p.tracks.find((t) => t.kind === 'audio')!.clips[0];
    p = updateClip(p, mus.id, { volume: 0.25 });
    runExport(p, f('o9b.mp4'));
    const quiet = meanVolume(f('o9b.mp4'), 1, 2);
    expect(loud - quiet).toBeGreaterThan(10); // −12 дБ ≈ ×0.25
  });

  it('музыка длиннее видео — ролик длится до конца музыки', () => {
    let p = addToMain(proj(), 'red', 0).project;
    p = addFree(p, 'mus', 0).project;
    runExport(p, f('o10.mp4'));
    expect(Math.abs(probe(f('o10.mp4')).duration - 12)).toBeLessThan(0.15);
  });

  it('портретное видео в горизонтальном проекте и поворот', () => {
    let p = proj();
    p = setSettings(p, settingsFor('16:9'));
    p = addToMain(p, 'por', 0).project;
    p = updateClip(p, main(p)[0].id, { transform: { scale: 1, x: 0, y: 0, rotation: 90 } } as any);
    runExport(p, f('o11.mp4'), { width: 960, height: 540 });
    const pr = probe(f('o11.mp4'));
    expect(pr.width).toBe(960);
    // повёрнутое на 90° портретное видео лежит горизонтально: точка у правого края зелёная
    expect(pixelAt(f('o11.mp4'), 1, 700, 270)[1]).toBeGreaterThan(100);
  });

  it('текстовый слой (concat PNG) накладывается в своё время', () => {
    const png = f('txt.png');
    const blank = f('blank.png');
    ff(['-f', 'lavfi', '-i', "color=c=black:s=540x960,format=rgba,geq=r=255:g=255:b=255:a='if(between(X\\,200\\,340)*between(Y\\,400\\,560)\\,255\\,0)'", '-frames:v', '1', png]);
    ff(['-f', 'lavfi', '-i', 'color=c=black@0.0:s=540x960,format=rgba', '-frames:v', '1', blank]);
    const list = f('text.txt');
    fs.writeFileSync(list, `ffconcat version 1.0\nfile '${blank}'\nduration 1\nfile '${png}'\nduration 2\nfile '${blank}'\nduration 3\nfile '${blank}'\n`);
    let p = addToMain(proj(), 'red', 0).project;
    runExport(p, f('o12.mp4'), { textLayers: [list] });
    expect(near(pixelAt(f('o12.mp4'), 0.5, 270, 480), RED)).toBe(true);
    expect(near(pixelAt(f('o12.mp4'), 2, 270, 480), [255, 255, 255])).toBe(true);
    expect(near(pixelAt(f('o12.mp4'), 4, 270, 480), RED)).toBe(true);
    expect(near(pixelAt(f('o12.mp4'), 2, 100, 480), RED)).toBe(true); // прозрачная часть PNG
  });

  it('скрытая и заглушённая дорожка', () => {
    let p = addToMain(proj(), 'red', 0).project;
    p = addFree(p, 'img', 0).project;
    const ov = p.tracks.find((t) => t.kind === 'video')!;
    p = { ...p, tracks: p.tracks.map((t) => (t.id === ov.id ? { ...t, hidden: true } : t.kind === 'main' ? { ...t, muted: true } : t)) };
    runExport(p, f('o13.mp4'));
    expect(near(pixelAt(f('o13.mp4'), 1, 270, 480), RED)).toBe(true);
    expect(meanVolume(f('o13.mp4'), 1, 2)).toBeLessThan(-60);
  });

  it('разрез + разные настройки кусков (не склеиваются в группу)', () => {
    let p = addToMain(proj(), 'sec', 0).project;
    p = splitClip(p, main(p)[0].id, 4).project;
    p = updateClip(p, main(p)[1].id, { speed: 2 });
    const { filter } = runExport(p, f('o14.mp4'));
    expect((filter.match(/[^a]select=/g) || []).length).toBe(2);
    expect(Math.abs(probe(f('o14.mp4')).duration - 6)).toBeLessThan(0.1);
    expect(near(pixelAt(f('o14.mp4'), 4.75, 270, 480), SEC_RGB.cyan)).toBe(true); // 4.75 → исходник 5.5
  });
});
