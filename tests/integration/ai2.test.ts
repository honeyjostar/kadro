// ИИ и обработка: эффекты голоса, стабилизация, автокадрирование, озвучка текста, ритм.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.KADRO_MODELS = process.env.KADRO_MODELS || path.join(os.homedir(), '.cache', 'kadro-models');
process.env.KADRO_DATA = path.join(os.tmpdir(), 'kadro-tests', 'data');

import { processVoice } from '../../src/main/ai/voice';
import { stabilize } from '../../src/main/ai/stab';
import { trackPerson } from '../../src/main/ai/matting';
import { synthesize } from '../../src/main/ai/tts';
import { readPcm16k, transcribe } from '../../src/main/ai/speech';
import { ttsVoiceReady } from '../../src/main/ai/models';
import { detectBeats } from '../../src/shared/beats';
import { reframeKeyframes } from '../../src/shared/reframe';
import { valueAt } from '../../src/shared/anim';
import { FFMPEG, ff, makeTone, meanVolume, probe, tmpDir, zeroCrossFreq } from '../helpers/media';

const D = tmpDir('ai2');
const f = (n: string) => path.join(D, n);

beforeAll(() => {
  if (!fs.existsSync(f('tone300.wav'))) ff(['-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=48000:duration=2', f('tone300.wav')]);
  const img = ['/tmp/kadro-tests/ai/girl1.jpg', '/tmp/asr/girl1.jpg'].find((p) => fs.existsSync(p));
  if (img && !fs.existsSync(f('shaky.mp4'))) {
    ff(['-loop', '1', '-i', img, '-vf', "scale=960:640,crop=880:580:x='40+25*sin(n*1.3)+15*sin(n*0.37)':y='30+20*sin(n*0.9)+10*sin(n*2.1)',format=yuv420p",
      '-t', '3', '-r', '30', '-c:v', 'libx264', '-preset', 'ultrafast', f('shaky.mp4')]);
  }
  if (img && !fs.existsSync(f('walk.mp4'))) {
    // человек (вырезан из фото) идёт по серому фону слева направо: x от 100 до 900 за 4 с
    ff(['-f', 'lavfi', '-i', 'color=c=0x6a7280:s=1280x720:r=30:d=4', '-loop', '1', '-i', img,
      '-filter_complex', "[1]crop=200:359:130:40,scale=320:574[p];[0][p]overlay=x='100+200*t':y=146:shortest=1,format=yuv420p",
      '-t', '4', '-c:v', 'libx264', '-preset', 'ultrafast', f('walk.mp4')]);
  }
});

describe('эффекты голоса', () => {
  it('бурундук и великан меняют высоту, длина та же', async () => {
    await processVoice(f('tone300.wav'), 0, 2, 'chipmunk', false, f('chip.flac'));
    await processVoice(f('tone300.wav'), 0, 2, 'deep', false, f('deep.flac'));
    expect(Math.abs(zeroCrossFreq(f('chip.flac'), 0.3, 1.2) - 480)).toBeLessThan(30);
    expect(Math.abs(zeroCrossFreq(f('deep.flac'), 0.3, 1.2) - 204)).toBeLessThan(20);
    expect(Math.abs(probe(f('chip.flac')).duration - 2)).toBeLessThan(0.1);
  });
  it('телефон срезает низ, эхо продлевает звук, робот и рация работают', async () => {
    ff(['-f', 'lavfi', '-i', 'sine=frequency=120:sample_rate=48000:duration=2', '-y', f('tone120.wav')]);
    await processVoice(f('tone120.wav'), 0, 2, 'phone', false, f('phone.flac'));
    expect(meanVolume(f('phone.flac'), 0.5, 1)).toBeLessThan(meanVolume(f('tone120.wav'), 0.5, 1) - 15);
    for (const fx of ['robot', 'radio', 'megaphone', 'hall', 'echo'] as const) {
      await processVoice(f('tone300.wav'), 0, 2, fx, false, f(`${fx}.flac`));
      expect(meanVolume(f(`${fx}.flac`), 0.3, 1)).toBeGreaterThan(-40);
    }
    // эхо: звук продолжается после конца тона (хвост)
    ff(['-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=48000:duration=1', '-af', 'apad=whole_dur=2', '-y', f('tone1s.wav')]);
    await processVoice(f('tone1s.wav'), 0, 2, 'hall', false, f('hall2.flac'));
    expect(meanVolume(f('hall2.flac'), 1.02, 0.12)).toBeGreaterThan(meanVolume(f('tone1s.wav'), 1.02, 0.12) + 20);
  });
});

describe('стабилизация', () => {
  const madCenter = (file: string) => {
    const r = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-vf', 'crop=iw*0.6:ih*0.6,scale=160:-2,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
    const buf = r.stdout as Buffer;
    const pr = probe(file);
    const w = 160; const h = Math.round((pr.height! * 0.6 * (160 / (pr.width! * 0.6))) / 2) * 2;
    const n = Math.floor(buf.length / (w * h));
    let tot = 0;
    for (let i = 1; i < n; i++) {
      let s = 0;
      for (let k = 0; k < w * h; k++) s += Math.abs(buf[i * w * h + k] - buf[(i - 1) * w * h + k]);
      tot += s / (w * h);
    }
    return tot / (n - 1);
  };
  it('тряска заметно меньше', async () => {
    if (!fs.existsSync(f('shaky.mp4'))) return;
    await stabilize(f('shaky.mp4'), 0, 3, 0.8, f('stab.mp4'));
    const before = madCenter(f('shaky.mp4'));
    const after = madCenter(f('stab.mp4'));
    expect(after).toBeLessThan(before * 0.6);
    expect(Math.abs(probe(f('stab.mp4')).duration - 3)).toBeLessThan(0.15);
  }, 120_000);
});

describe('автокадрирование', () => {
  it('кадр следует за идущим человеком', async () => {
    if (!fs.existsSync(f('walk.mp4'))) return;
    const pts = await trackPerson({ src: f('walk.mp4'), ss: 0, dur: 4, width: 1280, height: 720 });
    expect(pts.filter((p) => p.found).length).toBeGreaterThan(pts.length * 0.9);
    // центр спрайта: (100 + 200t + 160) / 1280
    const err = pts.map((p) => p.x - (100 + 200 * p.t + 160) / 1280);
    const mean = err.reduce((a, b) => a + b, 0) / err.length;
    for (const e of err) expect(Math.abs(e - mean)).toBeLessThan(0.04); // следит за движением
    // ключи для вертикального ролика: человек в центре, края кадра не вылезают
    const k = reframeKeyframes(pts, 1280, 720, 1080, 1920);
    expect(k.x.length).toBeGreaterThan(3);
    expect(k.y).toHaveLength(0);
    const w = 1280 * (1920 / 720);
    for (const t of [1, 2, 3]) {
      const x = valueAt(k.x, 0, t);
      const u = (100 + 200 * t + 160) / 1280 + mean;
      const screen = 540 + x * 1080 + (u - 0.5) * w; // где человек на экране
      expect(Math.abs(screen - 540)).toBeLessThan(140);
      expect(Math.abs(x)).toBeLessThanOrEqual((w - 1080) / 2 / 1080 + 1e-6);
    }
  }, 120_000);
});

describe('озвучка текста', () => {
  it('голос читает текст — распознавание слышит те же слова', async () => {
    if (!ttsVoiceReady('irina')) return;
    const dur = synthesize('Привет! Это проверка озвучки текста.', 'irina', 1, f('tts.wav'));
    expect(dur).toBeGreaterThan(1.2);
    expect(dur).toBeLessThan(5);
    const r = transcribe(await readPcm16k(f('tts.wav')), 'ru');
    const t = r.text.toLowerCase();
    for (const w of ['привет', 'провер', 'озвуч', 'текст']) expect(t, t).toContain(w);
    // эффект поверх очищенной речи — речь остаётся
    await processVoice(f('tts.wav'), 0, dur, 'robot', true, f('tts_robot.flac'));
    expect(meanVolume(f('tts_robot.flac'), 0, dur)).toBeGreaterThan(-35);
    const faster = synthesize('Привет! Это проверка озвучки текста.', 'irina', 1.5, f('tts2.wav'));
    expect(faster, `${faster} / ${dur}`).toBeLessThan(dur * 0.9);
  }, 120_000);
});

describe('ритм в настоящем файле', () => {
  it('mp3 с бочкой 128 уд/мин', () => {
    if (!fs.existsSync(f('beat128.mp3'))) {
      // бочка (низкий «бум») каждые 60/128 с поверх тихого тона
      ff(['-f', 'lavfi', '-i', 'sine=frequency=55:sample_rate=44100:duration=12', '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.02:duration=12:sample_rate=44100',
        '-filter_complex', "[0]volume='0.9*exp(-mod(t-0.25\\,60/128)*25)*gte(t\\,0.25)':eval=frame[k];[k][1]amix=inputs=2:normalize=0", '-c:a', 'libmp3lame', '-q:a', '3', f('beat128.mp3')]);
    }
    const r = spawnSync(FFMPEG, ['-v', 'error', '-i', f('beat128.mp3'), '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], { maxBuffer: 1 << 26 });
    const b = r.stdout as Buffer;
    const pcm = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + Math.floor(b.length / 4) * 4));
    const res = detectBeats(pcm, 22050);
    expect(Math.abs(res.bpm - 128)).toBeLessThan(3);
    const P = 60 / 128;
    const mid = res.beats.filter((x) => x > 2 && x < 10);
    for (const x of mid) {
      const ph = ((x - 0.25) / P) % 1;
      expect(Math.min(ph, 1 - ph) * P).toBeLessThan(0.04);
    }
  });
});
