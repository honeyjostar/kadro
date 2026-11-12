// Отдельный процесс для тяжёлого ИИ (распознавание речи, удаление фона, скачивание моделей),
// чтобы интерфейс не подвисал. Общается с главным процессом сообщениями.
// Речь (sherpa-onnx) и удаление фона (onnxruntime-node) идут в РАЗНЫХ процессах: у каждой библиотеки
// своя onnxruntime.dll, а Windows загружает в процесс только одну DLL с таким именем.
// Поэтому модули подключаются лениво — только тот, что нужен этому процессу.
import { tx } from '../shared/i18n';
import fs from 'node:fs';
import type { AsrModelId, TtsVoiceId } from '../main/ai/models';
import { GPU_MIN_GAIN } from '../shared/asrDevice';
import { useDmlSherpa } from './sherpaBuild';

// процесс речи со сборкой sherpa-onnx с DirectML — распознавание может идти на видеокарте
let engine: 'dml' | 'cpu' = 'cpu';
if (process.env.KADRO_ASR_ENGINE === 'dml') {
  const dir = process.env.KADRO_SHERPA_DML;
  const err = dir ? useDmlSherpa(dir) : null;
  if (err) console.error('sherpa-onnx DirectML:', err);
  // в автотестах сборки с DirectML нет — обычная сборка тоже понимает 'directml' и уходит на процессор
  engine = !err ? 'dml' : 'cpu';
}

type Msg =
  | { id: string; kind: 'transcribe'; wav: string; model: AsrModelId; device?: 'gpu' | 'cpu' | 'bench' }
  | { id: string; kind: 'silence'; path: string; in: number; out: number }
  | { id: string; kind: 'removeBg'; path: string; in: number; out: number; width: number; height: number; fps: number; outPath: string }
  | { id: string; kind: 'download'; model: AsrModelId }
  | { id: string; kind: 'ttsDownload'; voice: TtsVoiceId }
  | { id: string; kind: 'install'; what: 'asr' | 'tts'; model: string; file: string }
  | { id: string; kind: 'tts'; text: string; voice: TtsVoiceId; speed: number; outPath: string }
  | { id: string; kind: 'beats'; path: string }
  | { id: string; kind: 'reframe'; path: string; in: number; out: number; width: number; height: number }
  | { id: string; kind: 'faces'; path: string; in: number; out: number; width: number; height: number; image?: boolean }
  | { id: string; kind: 'trackBox'; path: string; in: number; out: number; at: number; box: { x: number; y: number; w: number; h: number }; width: number; height: number }
  | { id: string; kind: 'mtDownload'; pairs: string[] }
  | { id: string; kind: 'translate'; texts: string[]; route: import('../shared/translate').Pair[] }
  | { cancel: string };

interface Port { on(ev: 'message', cb: (e: { data: Msg }) => void): void; postMessage(m: unknown): void }
const port = (process as unknown as { parentPort: Port }).parentPort;

const controllers = new Map<string, AbortController>();

function send(m: unknown): void { port.postMessage(m); }

port.on('message', async (e) => {
  const m = e.data;
  if ('cancel' in m) {
    controllers.get(m.cancel)?.abort();
    return;
  }
  const ac = new AbortController();
  controllers.set(m.id, ac);
  const progress = (p: number, stage?: string) => send({ id: m.id, type: 'progress', p, stage });
  try {
    let result: unknown;
    if (m.kind === 'transcribe') {
      const { readPcm16k, transcribe } = await import('../main/ai/speech');
      progress(0.02, tx('Читаю звук'));
      const pcm = await readPcm16k(m.wav, undefined, undefined, ac.signal);
      progress(0.05, tx('Распознаю речь'));
      const dev = m.device ?? 'cpu';
      if (dev !== 'cpu' && process.env.KADRO_TEST_ASR_CRASH) process.exit(3); // автотест: видеокарта уронила процесс
      if (dev !== 'cpu' && process.env.KADRO_TEST_ASR_HANG) for (;;) { /* автотест: видеокарта зависла */ }
      if (dev === 'bench') progress(0.05, tx('Сравниваю видеокарту и процессор'));
      const r = transcribe(pcm, m.model, (p) => progress(0.05 + p * 0.95, tx('Распознаю речь')), undefined, () => ac.signal.aborted, {
        provider: dev === 'gpu' ? 'directml' : 'cpu',
        bench: dev === 'bench',
        minGain: GPU_MIN_GAIN,
        onBench: (b) => send({ id: m.id, type: 'asrBench', bench: b }),
        onGpuError: (message) => send({ id: m.id, type: 'asrGpuError', message }),
      });
      result = { cues: r.cues, text: r.text, device: r.provider === 'directml' ? 'gpu' : 'cpu', speechSec: r.speechSec, decodeSec: r.decodeSec };
    } else if (m.kind === 'silence') {
      const { findSpeechRanges } = await import('../main/ai/audioFx');
      progress(0.1, tx('Ищу паузы'));
      result = { ranges: await findSpeechRanges(m.path, m.in, m.out, ac.signal) };
    } else if (m.kind === 'removeBg') {
      const { removeBackground } = await import('../main/ai/matting');
      fs.rmSync(m.outPath, { force: true });
      await removeBackground({
        src: m.path, ss: m.in, dur: m.out - m.in, fps: m.fps, width: m.width, height: m.height, out: m.outPath,
        onProgress: (p) => progress(p, tx('Убираю фон')), signal: ac.signal,
      });
      result = { path: m.outPath };
    } else if (m.kind === 'download') {
      const { downloadAsrModel } = await import('../main/ai/models');
      await downloadAsrModel(m.model, (p, stage) => progress(stage === 'download' ? p * 0.85 : 0.85 + p * 0.15, stage === 'download' ? tx('Скачиваю модель') : tx('Распаковываю')), ac.signal);
      result = {};
    }
    else if (m.kind === 'install') {
      const mod = await import('../main/ai/models');
      const onP = (p: number) => progress(p, tx('Распаковываю модель'));
      if (m.what === 'asr') await mod.installAsrFromFile(m.model as AsrModelId, m.file, onP);
      else await mod.installTtsFromFile(m.model as TtsVoiceId, m.file, onP);
      result = {};
    } else if (m.kind === 'ttsDownload') {
      const { downloadTtsVoice } = await import('../main/ai/models');
      await downloadTtsVoice(m.voice, (p, stage) => progress(stage === 'download' ? p * 0.85 : 0.85 + p * 0.15, stage === 'download' ? tx('Скачиваю голос') : tx('Распаковываю')), ac.signal);
      result = {};
    } else if (m.kind === 'tts') {
      const { synthesize } = await import('../main/ai/tts');
      progress(0.1, tx('Озвучиваю'));
      result = { duration: synthesize(m.text, m.voice, m.speed, m.outPath) };
    } else if (m.kind === 'beats') {
      const { ffmpegToBuffer } = await import('../main/ffrun');
      const { detectBeats, musicShape } = await import('../shared/beats');
      progress(0.1, tx('Слушаю ритм'));
      const sr = 22050;
      const buf = await ffmpegToBuffer(['-v', 'error', '-i', m.path, '-vn', '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], ac.signal);
      const pcm = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + Math.floor(buf.length / 4) * 4));
      progress(0.5, tx('Ищу доли такта'));
      const found = detectBeats(pcm, sr);
      progress(0.8, tx('Слушаю, где музыка громче'));
      result = { ...found, shape: found.beats.length ? musicShape(pcm, sr, found.beats) : undefined };
    } else if (m.kind === 'reframe') {
      const { trackPerson } = await import('../main/ai/matting');
      result = { points: await trackPerson({ src: m.path, ss: m.in, dur: m.out - m.in, width: m.width, height: m.height, onProgress: (p) => progress(p, tx('Слежу за человеком')), signal: ac.signal }) };
    }
    else if (m.kind === 'faces') {
      const { detectFaces } = await import('../main/ai/faces');
      result = { frames: await detectFaces({ src: m.path, ss: m.in, dur: m.out - m.in, width: m.width, height: m.height, image: m.image, onProgress: (p) => progress(p, tx('Ищу лица')), signal: ac.signal }) };
    } else if (m.kind === 'trackBox') {
      const { trackBox } = await import('../main/ai/track');
      result = { boxes: await trackBox({ src: m.path, in: m.in, out: m.out, at: m.at, box: m.box, width: m.width, height: m.height, onProgress: (p) => progress(p, tx('Слежу за предметом')), signal: ac.signal }) };
    }
    else if (m.kind === 'mtDownload') {
      const { downloadMt } = await import('../main/ai/mtModels');
      await downloadMt(m.pairs, (p) => progress(p, tx('Скачиваю модель перевода')), ac.signal);
      result = {};
    } else if (m.kind === 'translate') {
      const { translateTexts } = await import('../main/ai/translate');
      progress(0.02, tx('Перевожу'));
      result = { texts: await translateTexts(m.texts, m.route, (p) => progress(0.02 + p * 0.98, tx('Перевожу')), () => ac.signal.aborted) };
    }
    send({ id: m.id, type: 'done', result });
  } catch (err) {
    send({ id: m.id, type: 'error', message: ac.signal.aborted ? tx('Отменено') : err instanceof Error ? err.message : String(err) });
  } finally {
    controllers.delete(m.id);
  }
});

send({ type: 'ready', engine });
