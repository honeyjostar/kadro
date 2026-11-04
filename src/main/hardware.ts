// Что за компьютер: процессор, память, видеокарты и какие из них умеют кодировать видео.
// Видеокарты — из Windows (PowerShell + nvidia-smi), иначе — из Chromium; кодировщики — пробным кодированием 0,5 с.
import { app } from 'electron';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { encodersFor, explainEncoder, mergeNvidia, parseCimGpus, parseNvidiaSmi, pickBest, vendorOf, type EncoderCheck, type GpuInfo, type HwEncoder, type HwInfo } from '../shared/hw';
import { ffmpegPath } from './bins';

let cache: Promise<HwInfo> | null = null;

function run(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 1 << 20, encoding: 'utf8' }, (err, out) => resolve(err ? '' : String(out)));
    } catch { resolve(''); }
  });
}

async function windowsGpus(): Promise<GpuInfo[]> {
  const ps = 'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterCompatibility,DriverVersion,AdapterRAM | ConvertTo-Json -Compress';
  let gpus = parseCimGpus(await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], 12000));
  if (!gpus.length || gpus.some((g) => g.vendor === 'nvidia')) {
    // nvidia-smi ставится вместе с драйвером и знает точную версию драйвера и объём памяти
    const smi = parseNvidiaSmi(await run('nvidia-smi', ['--query-gpu=name,driver_version,memory.total', '--format=csv,noheader,nounits'], 8000));
    gpus = mergeNvidia(gpus, smi);
  }
  return gpus;
}

/** Без Windows (и если PowerShell не ответил) — что видит Chromium: производитель по коду, имя — из строки рендерера. */
async function chromiumGpus(): Promise<GpuInfo[]> {
  try {
    const info = await app.getGPUInfo('complete') as { gpuDevice?: { vendorId: number; deviceId: number; active?: boolean; driverVersion?: string; deviceString?: string }[]; auxAttributes?: { glRenderer?: string } };
    const renderer = info.auxAttributes?.glRenderer ?? '';
    // ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)
    const fromAngle = /ANGLE \([^,]+,\s*([^(,]+?)\s*(\(0x[0-9a-f]+\))?\s*(Direct3D|OpenGL|Vulkan|Metal|,)/i.exec(renderer)?.[1];
    return (info.gpuDevice ?? []).filter((d) => d.vendorId && d.vendorId !== 0x1414 /* Microsoft */)
      .map((d) => {
        const vendor = vendorOf(d.vendorId);
        const name = d.deviceString || (d.active && fromAngle) || `${{ nvidia: 'NVIDIA', amd: 'AMD', intel: 'Intel', other: '' }[vendor]} 0x${d.deviceId.toString(16)}`.trim();
        return { name, vendor, driver: d.driverVersion || undefined };
      });
  } catch { return []; }
}

/** Пробное кодирование: 0,5 с чёрного кадра 640×360. Ошибку FFmpeg разбираем, чтобы объяснить причину. */
export function probeEncoder(id: HwEncoder): Promise<EncoderCheck> {
  const enc = { nvenc: 'h264_nvenc', amf: 'h264_amf', qsv: 'h264_qsv', mf: 'h264_mf' }[id];
  const extra = id === 'qsv' ? ['-pix_fmt', 'nv12'] : id === 'mf' ? ['-hw_encoding', '1', '-pix_fmt', 'nv12'] : ['-pix_fmt', 'yuv420p'];
  return new Promise((resolve) => {
    let err = '';
    try {
      const p = spawn(ffmpegPath(), ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30:d=0.5', ...extra, '-c:v', enc, '-f', 'null', '-'],
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      p.stderr?.on('data', (d) => { if (err.length < 8000) err += String(d); });
      const t = setTimeout(() => { p.kill(); resolve({ id, ok: false, code: 'other', detail: 'timeout' }); }, 20000);
      p.on('error', (e) => { clearTimeout(t); resolve({ id, ok: false, code: 'other', detail: e.message }); });
      p.on('exit', (code) => { clearTimeout(t); resolve(explainEncoder(id, err, code)); });
    } catch (e) {
      resolve({ id, ok: false, code: 'other', detail: String(e) });
    }
  });
}

async function collect(): Promise<HwInfo> {
  const cpus = os.cpus();
  const base = { cpu: (cpus[0]?.model ?? '').replace(/\s+/g, ' ').trim(), threads: cpus.length, ramGb: Math.round(os.totalmem() / 2 ** 30) };
  // автотесты: готовое «железо» вместо настоящего
  const fake = process.env.KADRO_TEST_HW;
  if (fake) {
    const f = JSON.parse(fake.trim().startsWith('{') ? fake : fs.readFileSync(fake, 'utf8')) as Partial<HwInfo>;
    const encoders = f.encoders ?? [];
    return { ...base, ...f, gpus: f.gpus ?? [], encoders, best: pickBest(encoders) };
  }
  let gpus = process.platform === 'win32' ? await windowsGpus() : [];
  if (!gpus.length) gpus = await chromiumGpus();
  const encoders = await Promise.all(encodersFor(gpus, process.platform).map(probeEncoder));
  return { ...base, gpus, encoders, best: pickBest(encoders) };
}

/** Сведения о железе (проверка один раз за запуск; force — проверить заново, например после обновления драйвера). */
export function hardwareInfo(force = false): Promise<HwInfo> {
  if (force || !cache) cache = collect().catch((e) => ({ cpu: os.cpus()[0]?.model ?? '', threads: os.cpus().length, ramGb: Math.round(os.totalmem() / 2 ** 30), gpus: [], encoders: [{ id: 'nvenc' as const, ok: false, code: 'other' as const, detail: String(e) }], best: null }));
  return cache;
}

/** Есть ли сейчас готовый ответ (чтобы экспорт не ждал проверку, если её ещё не запускали). */
export function hardwareCached(): Promise<HwInfo> | null { return cache; }

/** Страницы драйверов — только официальные сайты производителей. */
export const DRIVER_PAGES: Record<'nvidia' | 'amd' | 'intel', string> = {
  nvidia: 'https://www.nvidia.com/drivers/',
  amd: 'https://www.amd.com/en/support/download/drivers.html',
  intel: 'https://www.intel.com/content/www/us/en/support/detect.html',
};
