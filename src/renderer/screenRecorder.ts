// Запись экрана (или окна) со звуком компьютера и микрофоном, и отдельно — веб-камеры.
// Камера пишется своим файлом: в проекте она встаёт кружком поверх экрана, и её можно двигать отдельно.
import { tx } from '../shared/i18n';
import { api } from './store';

export interface ScreenRecOptions {
  /** id экрана или окна; null — только веб-камера */
  sourceId: string | null;
  systemAudio: boolean;
  /** id микрофона; null — без микрофона */
  micId: string | null;
  /** id веб-камеры; null — без камеры */
  camId: string | null;
}

export interface CamInfo { id: string; label: string }

export async function listCams(): Promise<CamInfo[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || tx('Камера {0}', i + 1) }));
  } catch {
    return [];
  }
}

/** Видеокамера для предпросмотра в окне записи. */
export function camStream(id: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ video: { deviceId: id && id !== 'default' ? { exact: id } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
}

function pickMime(video: boolean): string {
  const list = video
    ? ['video/webm;codecs=h264,opus', 'video/webm;codecs=avc1,opus', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/webm;codecs=h264', 'video/webm;codecs=vp9', 'video/webm'];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

interface Track { rec: MediaRecorder; id: string; chain: Promise<void>; kind: 'screen' | 'cam' }

export class ScreenRecorder {
  private streams: MediaStream[] = [];
  private tracks: Track[] = [];
  private ctx: AudioContext | null = null;
  private an: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private t0 = 0;
  systemAudioOk = false;

  async start(o: ScreenRecOptions): Promise<void> {
    const stop = () => this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    try {
      let video: MediaStream | null = null;
      if (o.sourceId) {
        this.systemAudioOk = await api.screenChoose(o.sourceId, o.systemAudio);
        video = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: o.systemAudio && this.systemAudioOk });
        this.streams.push(video);
      }
      const cam = o.camId !== null ? await camStream(o.camId) : null;
      if (cam) this.streams.push(cam);
      const mic = o.micId !== null ? await navigator.mediaDevices.getUserMedia({ audio: { deviceId: o.micId && o.micId !== 'default' ? { exact: o.micId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }) : null;
      if (mic) this.streams.push(mic);
      // звук компьютера и микрофон — в одну дорожку
      this.ctx = new AudioContext();
      const dest = this.ctx.createMediaStreamDestination();
      this.an = this.ctx.createAnalyser();
      this.an.fftSize = 1024;
      this.buf = new Float32Array(this.an.fftSize);
      for (const s of [video, mic]) {
        if (!s?.getAudioTracks().length) continue;
        const src = this.ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks()));
        src.connect(dest);
        src.connect(this.an);
      }
      const audio = dest.stream.getAudioTracks();
      const mainVideo = video?.getVideoTracks() ?? cam?.getVideoTracks() ?? [];
      if (!mainVideo.length) throw new Error(tx('Нечего записывать: выбери экран, окно или веб-камеру'));
      const main = new MediaStream([...mainVideo, ...(audio.length && (mic || video?.getAudioTracks().length) ? audio : [])]);
      await this.add('screen', main, true);
      // камера отдельным файлом — только если пишем ещё и экран
      if (cam && video) await this.add('cam', new MediaStream(cam.getVideoTracks()), false);
      this.t0 = performance.now();
      for (const t of this.tracks) t.rec.start(1000);
    } catch (e) {
      stop();
      await this.cancel();
      throw e;
    }
  }

  private async add(kind: 'screen' | 'cam', stream: MediaStream, withAudio: boolean): Promise<void> {
    const mime = pickMime(withAudio && stream.getAudioTracks().length > 0);
    const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: kind === 'screen' ? 12_000_000 : 6_000_000, audioBitsPerSecond: 192_000 });
    const id = await api.srecBegin(kind, rec.mimeType || mime);
    const t: Track = { rec, id, chain: Promise.resolve(), kind };
    // куски — на диск по порядку
    rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      const blob = e.data;
      t.chain = t.chain.then(async () => api.srecChunk(id, await blob.arrayBuffer()));
    };
    this.tracks.push(t);
  }

  /** Секунды с начала записи. */
  elapsed(): number { return this.t0 ? (performance.now() - this.t0) / 1000 : 0; }

  /** Уровень звука 0..1 (для индикатора). */
  level(): number {
    if (!this.an || !this.buf) return 0;
    this.an.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    return Math.min(1, Math.sqrt(s / this.buf.length) * 4);
  }

  /** Остановить и собрать файлы. */
  async stop(name: string): Promise<{ screen: string | null; cam: string | null; duration: number }> {
    const duration = this.elapsed();
    await Promise.all(this.tracks.map((t) => new Promise<void>((done) => {
      if (t.rec.state === 'inactive') { done(); return; }
      t.rec.onstop = () => done();
      t.rec.stop();
    })));
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    void this.ctx?.close();
    const out: { screen: string | null; cam: string | null; duration: number } = { screen: null, cam: null, duration };
    for (const t of this.tracks) {
      await t.chain;
      out[t.kind] = await api.srecFinish(t.id, t.kind === 'cam' ? `${name} — ${tx('камера')}` : name);
    }
    this.tracks = [];
    return out;
  }

  async cancel(): Promise<void> {
    for (const t of this.tracks) {
      if (t.rec.state !== 'inactive') t.rec.stop();
      await t.chain.catch(() => undefined);
      await api.srecCancel(t.id);
    }
    this.tracks = [];
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    void this.ctx?.close();
  }
}
