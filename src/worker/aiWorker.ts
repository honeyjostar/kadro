// Отдельный процесс для тяжёлого ИИ (распознавание речи, удаление фона, скачивание моделей),
// чтобы интерфейс не подвисал. Общается с главным процессом сообщениями.
// Речь (sherpa-onnx) и удаление фона (onnxruntime-node) идут в РАЗНЫХ процессах: у каждой библиотеки
// своя onnxruntime.dll, а Windows загружает в процесс только одну DLL с таким именем.
// Поэтому модули подключаются лениво — только тот, что нужен этому процессу.
import fs from 'node:fs';
import type { AsrModelId } from '../main/ai/models';

type Msg =
  | { id: string; kind: 'transcribe'; wav: string; model: AsrModelId }
  | { id: string; kind: 'silence'; path: string; in: number; out: number }
  | { id: string; kind: 'removeBg'; path: string; in: number; out: number; width: number; height: number; fps: number; outPath: string }
  | { id: string; kind: 'download'; model: AsrModelId }
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
      progress(0.02, 'Читаю звук');
      const pcm = await readPcm16k(m.wav, undefined, undefined, ac.signal);
      progress(0.05, 'Распознаю речь');
      const r = transcribe(pcm, m.model, (p) => progress(0.05 + p * 0.95, 'Распознаю речь'), undefined, () => ac.signal.aborted);
      result = { cues: r.cues, text: r.text };
    } else if (m.kind === 'silence') {
      const { findSpeechRanges } = await import('../main/ai/audioFx');
      progress(0.1, 'Ищу паузы');
      result = { ranges: await findSpeechRanges(m.path, m.in, m.out, ac.signal) };
    } else if (m.kind === 'removeBg') {
      const { removeBackground } = await import('../main/ai/matting');
      fs.rmSync(m.outPath, { force: true });
      await removeBackground({
        src: m.path, ss: m.in, dur: m.out - m.in, fps: m.fps, width: m.width, height: m.height, out: m.outPath,
        onProgress: (p) => progress(p, 'Убираю фон'), signal: ac.signal,
      });
      result = { path: m.outPath };
    } else if (m.kind === 'download') {
      const { downloadAsrModel } = await import('../main/ai/models');
      await downloadAsrModel(m.model, (p, stage) => progress(stage === 'download' ? p * 0.85 : 0.85 + p * 0.15, stage === 'download' ? 'Скачиваю модель' : 'Распаковываю'), ac.signal);
      result = {};
    }
    send({ id: m.id, type: 'done', result });
  } catch (err) {
    send({ id: m.id, type: 'error', message: ac.signal.aborted ? 'Отменено' : err instanceof Error ? err.message : String(err) });
  } finally {
    controllers.delete(m.id);
  }
});

send({ type: 'ready' });
