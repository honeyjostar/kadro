// Запись голоса с микрофона: MediaRecorder (Opus) + уровень сигнала для индикатора.

export interface MicInfo { id: string; label: string }

/** Последний выбор пользователя (микрофон, глушить ли проект) — общий для панели и кнопки на таймлайне. */
export const recPrefs = { mic: 'default', mute: true };

export async function listMics(): Promise<MicInfo[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Микрофон ${i + 1}` }));
  } catch {
    return [];
  }
}

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private ctx: AudioContext | null = null;
  private an: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private peak = 0;

  async start(deviceId?: string): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
        channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      },
    });
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime, audioBitsPerSecond: 160_000 } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    try {
      this.ctx = new AudioContext();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.an = this.ctx.createAnalyser();
      this.an.fftSize = 1024;
      this.buf = new Float32Array(this.an.fftSize);
      src.connect(this.an);
    } catch { /* без индикатора уровня */ }
    await new Promise<void>((resolve, reject) => {
      this.rec!.onstart = () => resolve();
      this.rec!.onerror = () => reject(new Error('Запись не началась'));
      this.rec!.start(250);
    });
  }

  /** Уровень сигнала 0..1 (с плавным спадом). */
  level(): number {
    if (!this.an || !this.buf) return 0;
    this.an.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(s / this.buf.length);
    const db = 20 * Math.log10(rms + 1e-9);
    const v = Math.min(1, Math.max(0, (db + 60) / 60));
    this.peak = Math.max(v, this.peak * 0.9);
    return this.peak;
  }

  async stop(): Promise<Blob> {
    const rec = this.rec;
    if (!rec) throw new Error('Запись не идёт');
    if (rec.state !== 'inactive') await new Promise<void>((resolve) => { rec.onstop = () => resolve(); rec.stop(); });
    const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' });
    this.release();
    return blob;
  }

  cancel(): void {
    try { if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); } catch { /* уже остановлена */ }
    this.release();
  }

  private release(): void {
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    void this.ctx?.close().catch(() => undefined);
    this.stream = null;
    this.rec = null;
    this.ctx = null;
    this.an = null;
    this.chunks = [];
  }
}
