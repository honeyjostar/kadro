// Тесты ИИ на настоящих моделях. Модели берутся из KADRO_MODELS (по умолчанию ~/.cache/kadro-models).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.KADRO_MODELS = process.env.KADRO_MODELS || path.join(os.homedir(), '.cache', 'kadro-models');
process.env.KADRO_DATA = path.join(os.tmpdir(), 'kadro-tests', 'data');

import { newProject } from '../../src/shared/defaults';
import { addAsset, addToMain, keepSourceRanges, mainTrack, updateClip, addFree } from '../../src/shared/timeline';
import type { MediaClip } from '../../src/shared/types';
import { asrModelReady, ttsVoiceReady } from '../../src/main/ai/models';
import { readPcm16k, transcribe, detectSpeech } from '../../src/main/ai/speech';
import { findSpeechRanges } from '../../src/main/ai/audioFx';
import { denoise } from '../../src/main/ai/denoise';
import { removeBackground } from '../../src/main/ai/matting';
import { analyze, makePeaks, makeProxy, makeThumbs } from '../../src/main/media';
import { assetFromFile, ff, meanVolume, near, pixelAt, probe, runExport, tmpDir, FFMPEG, PERSON_IMG } from '../helpers/media';
import { spawnSync } from 'node:child_process';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sherpa = require('sherpa-onnx-node');

const D = tmpDir('ai');
const f = (n: string) => path.join(D, n);
const M = process.env.KADRO_MODELS!;
const PHRASES = ['Привет, это тестовый ролик для видеоредактора.', 'Сейчас мы проверим автоматические субтитры.', 'Паузы между фразами будут вырезаны.'];
let marks: [number, number][] = [];

function synth(): void {
  const tts = new sherpa.OfflineTts({
    model: { vits: { model: `${M}/vits-piper-ru_RU-irina-medium/ru_RU-irina-medium.onnx`, tokens: `${M}/vits-piper-ru_RU-irina-medium/tokens.txt`, dataDir: `${M}/vits-piper-ru_RU-irina-medium/espeak-ng-data` }, numThreads: 2 },
  });
  const sr = tts.sampleRate;
  const parts: Float32Array[] = [];
  let pos = 0;
  marks = [];
  for (const p of PHRASES) {
    parts.push(new Float32Array(Math.round(1.5 * sr))); pos += 1.5;
    const a = tts.generate({ text: p, sid: 0, speed: 1.0 });
    marks.push([pos, pos + a.samples.length / sr]); pos += a.samples.length / sr;
    parts.push(a.samples);
  }
  parts.push(new Float32Array(Math.round(1.5 * sr)));
  const total = parts.reduce((n, x) => n + x.length, 0);
  const buf = new Float32Array(total);
  let o = 0;
  for (const x of parts) { buf.set(x, o); o += x.length; }
  sherpa.writeWave(f('speech.wav'), { samples: buf, sampleRate: sr });
  fs.writeFileSync(f('marks.json'), JSON.stringify(marks));
  const dur = total / sr;
  // «запись с телефона»: видео + речь с фоновым шумом
  ff(['-f', 'lavfi', '-i', `testsrc2=s=640x360:r=30:d=${dur}`, '-i', f('speech.wav'),
    '-f', 'lavfi', '-i', `anoisesrc=color=pink:amplitude=0.05:sample_rate=48000:duration=${dur}`,
    '-filter_complex', '[1]aresample=48000[s];[s][2]amix=inputs=2:normalize=0:duration=first[a]',
    '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f('talk.mp4')]);
}

// речь для тестов синтезируется голосом «Ирина» (npm run models), фото человека — см. PERSON_IMG
const SPEECH = (fs.existsSync(f('talk.mp4')) && fs.existsSync(f('marks.json'))) || ttsVoiceReady('irina');
const PERSON = fs.existsSync(f('girl.mp4')) || !!PERSON_IMG;

beforeAll(() => {
  if (SPEECH) {
    if (!fs.existsSync(f('talk.mp4')) || !fs.existsSync(f('marks.json'))) synth();
    marks = JSON.parse(fs.readFileSync(f('marks.json'), 'utf8'));
  }
  if (PERSON && !fs.existsSync(f('girl.mp4'))) {
    ff(['-loop', '1', '-i', PERSON_IMG!, '-vf', "scale=960:-2,zoompan=z='1+0.002*on':d=1:s=960x638:fps=30", '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', f('girl.mp4')]);
  }
});

const norm = (s: string) => s.toLowerCase().replace(/[^а-яёa-z ]/g, '').replace(/\s+/g, ' ').trim();
/** Доля ошибочных слов (WER) — стандартная метрика распознавания речи. */
function wer(ref: string, hyp: string): number {
  const r = norm(ref).split(' ');
  const h = norm(hyp).split(' ');
  const d = Array.from({ length: r.length + 1 }, (_, i) => Array.from({ length: h.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  }
  return d[r.length][h.length] / r.length;
}
// синтезатор речи сам глотает слог в «видеоредактора» (на чистой записи обе модели слышат «видеоредакта»),
// поэтому допускаем 1 ошибочное слово из 16 и проверяем, что ни одно слово не потерялось
const ASR_OK = (text: string) => wer(PHRASES.join(' '), text) <= 1 / 16 + 1e-9 && norm(text).split(' ').length === norm(PHRASES.join(' ')).split(' ').length;

describe.skipIf(!SPEECH)('распознавание речи', () => {
  it('детектор речи находит фразы с точностью до 0.15 с', async () => {
    const pcm = await readPcm16k(f('talk.mp4'));
    const segs = detectSpeech(pcm);
    expect(segs.length).toBe(3);
    segs.forEach((s, i) => {
      expect(Math.abs(s.start - marks[i][0])).toBeLessThan(0.15);
      expect(Math.abs(s.end - marks[i][1])).toBeLessThan(0.5); // сырой детектор на шуме; точные границы — refineSegments
    });
  });

  for (const model of ['ru', 'multi'] as const) {
    it.skipIf(!asrModelReady(model))(`субтитры моделью ${model}: текст верный, тайминги совпадают с речью`, async () => {
      const pcm = await readPcm16k(f('talk.mp4'));
      const r = transcribe(pcm, model);
      expect(ASR_OK(r.text), r.text).toBe(true);
      // первая буква фраз заглавная
      expect(r.words[0].text[0]).toBe('П');
      expect(r.cues.length).toBeGreaterThanOrEqual(3);
      // субтитры не выходят за пределы речи (с запасом 0.4 с) и не перекрываются
      for (let i = 0; i < r.cues.length; i++) {
        const c = r.cues[i];
        const inside = marks.some(([a, b]) => c.start >= a - 0.4 && c.end <= b + 0.7);
        expect(inside).toBe(true);
        if (i > 0) expect(c.start).toBeGreaterThanOrEqual(r.cues[i - 1].end - 1e-6);
        expect(c.text.length).toBeLessThanOrEqual(40);
      }
    });
  }
});

describe.skipIf(!SPEECH)('звук', () => {
  it('убрать паузы: остаются только фразы (с небольшим запасом)', async () => {
    const pr = probe(f('talk.mp4'));
    const ranges = await findSpeechRanges(f('talk.mp4'), 0, pr.duration);
    expect(ranges.length).toBe(3);
    ranges.forEach(([a, b], i) => {
      expect(a).toBeLessThanOrEqual(marks[i][0] + 0.05);
      expect(a).toBeGreaterThan(marks[i][0] - 0.4);
      expect(b).toBeGreaterThanOrEqual(marks[i][1] - 0.2);
      expect(b).toBeLessThan(marks[i][1] + 0.75);
    });
    // в проекте: клип режется на 3 куска, экспорт короче исходника на длину пауз
    let p = newProject('t');
    p = addAsset(p, assetFromFile('talk', f('talk.mp4'), 'video'));
    p = addToMain(p, 'talk', 0).project;
    const c = mainTrack(p).clips[0] as MediaClip;
    p = keepSourceRanges(p, c.id, ranges);
    expect(mainTrack(p).clips.length).toBe(3);
    const kept = ranges.reduce((s, [a, b]) => s + (b - a), 0);
    runExport(p, f('cut.mp4'));
    expect(Math.abs(probe(f('cut.mp4')).duration - kept)).toBeLessThan(0.12);
    // и речь в результате распознаётся целиком
    if (asrModelReady('ru')) {
      const r = transcribe(await readPcm16k(f('cut.mp4')), 'ru');
      expect(ASR_OK(r.text), r.text).toBe(true);
    }
  });

  it('чистка голоса: шум в паузах тише минимум на 15 дБ, речь сохраняется', async () => {
    const pr = probe(f('talk.mp4'));
    await denoise(f('talk.mp4'), 0, pr.duration, f('clean.flac'));
    const noiseBefore = meanVolume(f('talk.mp4'), 0.2, 1);
    const noiseAfter = meanVolume(f('clean.flac'), 0.2, 1);
    expect(noiseBefore - noiseAfter).toBeGreaterThan(15);
    const speechBefore = meanVolume(f('talk.mp4'), marks[0][0] + 0.3, 1.5);
    const speechAfter = meanVolume(f('clean.flac'), marks[0][0] + 0.3, 1.5);
    expect(Math.abs(speechBefore - speechAfter)).toBeLessThan(4); // часть «громкости до» — это сам шум
    expect(Math.abs(probe(f('clean.flac')).duration - pr.duration)).toBeLessThan(0.05);
  });
});

describe.skipIf(!SPEECH || !PERSON)('удаление фона', () => {
  it('человек остаётся, фон становится прозрачным', async () => {
    await removeBackground({ src: f('girl.mp4'), ss: 0, dur: 2, fps: 30, width: 960, height: 638, out: f('girl.webm') });
    const pr = probe(f('girl.webm'));
    expect(pr.vcodec).toBe('vp9');
    expect(Math.abs(pr.duration - 2)).toBeLessThan(0.1);
    // кладём на зелёный и проверяем: угол (небо) — зелёный, лицо — не зелёное
    const comp = f('girl_on_green.png');
    const r = spawnSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x00ff00:s=${pr.width}x${pr.height}:d=2`, '-c:v', 'libvpx-vp9', '-i', f('girl.webm'),
      '-filter_complex', '[0][1]overlay=format=auto,select=eq(n\\,30)', '-frames:v', '1', '-update', '1', comp]);
    expect(r.status).toBe(0);
    const W = pr.width!;
    const Hh = pr.height!;
    expect(near(pixelAt(comp, 0, 20, 20), [0, 255, 0], 30)).toBe(true);                 // небо → прозрачно
    expect(near(pixelAt(comp, 0, Math.round(W * 0.93), Math.round(Hh * 0.5)), [0, 255, 0], 30)).toBe(true); // горы справа → прозрачно
    const face = pixelAt(comp, 0, Math.round(W * 0.42), Math.round(Hh * 0.5));
    expect(near(face, [0, 255, 0], 60)).toBe(false);                                       // лицо осталось
  });

  it('экспорт с вырезанным фоном и чищеным звуком', async () => {
    let p = newProject('t', '16:9');
    p = addAsset(p, assetFromFile('talk', f('talk.mp4'), 'video'));
    p = addAsset(p, assetFromFile('girl', f('girl.mp4'), 'video'));
    p = addToMain(p, 'talk', 0).project;
    const ov = addFree(p, 'girl', 1);
    p = updateClip(ov.project, ov.clipId, {
      removeBg: { enabled: true, status: 'ready', path: f('girl.webm'), range: [0, 2] },
      transform: { scale: 1, x: 0, y: 0, rotation: 0 },
    } as any);
    const main0 = mainTrack(p).clips[0] as MediaClip;
    const pr = probe(f('talk.mp4'));
    p = updateClip(p, main0.id, { denoise: { enabled: true, status: 'ready', path: f('clean.flac'), range: [0, pr.duration] } } as any);
    runExport(p, f('combo.mp4'), { width: 960, height: 540 });
    expect(Math.abs(probe(f('combo.mp4')).duration - pr.duration)).toBeLessThan(0.1);
    // в 2.0 с поверх testsrc2 — девушка без фона: в углу видно testsrc2 (не небо)
    const corner = pixelAt(f('combo.mp4'), 2, 40, 40);
    const sky = pixelAt(f('girl.mp4'), 1, 20, 20);
    expect(near(corner, sky, 25)).toBe(false);
    // звук чищеный: в паузе тихо
    expect(meanVolume(f('combo.mp4'), 0.2, 1)).toBeLessThan(meanVolume(f('talk.mp4'), 0.2, 1) - 12);
  });
});

describe.skipIf(!SPEECH)('импорт медиа', () => {
  it('анализ, прокси для HEVC, поворот, миниатюры, волна', async () => {
    ff(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=2', '-f', 'lavfi', '-i', 'sine=d=2', '-c:v', 'libx265', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', f('hevc.mp4')]);
    const h = await analyze(f('hevc.mp4'));
    expect(h.asset.kind).toBe('video');
    expect(h.plan).toBe('video');
    const proxy = await makeProxy(h.asset, 'video');
    expect(probe(proxy).vcodec).toBe('h264');

    ff(['-display_rotation', '90', '-i', f('talk.mp4'), '-c', 'copy', f('rot.mp4')]);
    const r = await analyze(f('rot.mp4'));
    expect(r.asset.rotation % 180).toBe(90);
    expect(r.asset.width).toBe(360);
    expect(r.asset.height).toBe(640);
    expect(r.plan).toBe('none');

    const img = await analyze(path.join(D, 'girl1.jpg'));
    expect(img.asset.kind).toBe('image');
    expect(img.asset.width).toBe(600);

    const wav = await analyze(f('speech.wav'));
    expect(wav.asset.kind).toBe('audio');
    expect(wav.plan).toBe('none');

    const t = await analyze(f('talk.mp4'));
    const thumbs = await makeThumbs(t.asset, 5);
    expect(thumbs.length).toBe(5);
    const peaks = await makePeaks(t.asset);
    expect(peaks.length).toBeGreaterThan(100);
    const loudIdx = Math.floor(((marks[0][0] + 0.5) / t.asset.duration) * peaks.length);
    const quietIdx = Math.floor((0.3 / t.asset.duration) * peaks.length);
    expect(peaks[loudIdx]).toBeGreaterThan(peaks[quietIdx]);
  });
});
