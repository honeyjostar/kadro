// Железо компьютера: видеокарты, процессор, память и аппаратные кодировщики видео.
// Здесь — только разбор ответов системы и FFmpeg (без запуска процессов), чтобы это можно было проверить тестами.
import { tx } from './i18n';

export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'other';
/** Кодировщики видеокарты: NVIDIA NVENC, AMD AMF, Intel Quick Sync, любой через Windows (Media Foundation). */
export type HwEncoder = 'nvenc' | 'amf' | 'qsv' | 'mf';
export type EncoderEngine = HwEncoder | 'x264' | 'vp9alpha';

export interface GpuInfo {
  name: string;
  vendor: GpuVendor;
  driver?: string;      // версия драйвера так, как её пишет производитель (у NVIDIA — 566.36)
  vramGb?: number;
}

export type EncoderFail = 'driver-old' | 'no-driver' | 'no-hw' | 'not-found' | 'other';
export interface EncoderCheck {
  id: HwEncoder;
  ok: boolean;
  code?: EncoderFail;
  need?: string;        // какая версия драйвера нужна (если FFmpeg её назвал)
  detail?: string;      // первая строка ошибки FFmpeg — для отчёта
}

export interface HwInfo {
  cpu: string;
  threads: number;
  ramGb: number;
  gpus: GpuInfo[];
  encoders: EncoderCheck[];
  best: HwEncoder | null;   // чем кодировать видеокартой, null — нечем
}

/** Порядок предпочтения: «родные» кодировщики видеокарт, потом общий через Windows. */
export const ENCODER_ORDER: HwEncoder[] = ['nvenc', 'amf', 'qsv', 'mf'];

const VIRTUAL = /basic display|basic render|remote display|virtual|parsec|idd|spacedesk|citrix|vmware|virtualbox|hyper-v|displaylink|mirage|splashtop|meta quest|oray|todesk|sunlogin/i;

export function vendorOf(x: string | number | undefined): GpuVendor {
  if (typeof x === 'number') return x === 0x10de ? 'nvidia' : x === 0x1002 || x === 0x1022 ? 'amd' : x === 0x8086 ? 'intel' : 'other';
  const s = String(x ?? '').toLowerCase();
  if (/nvidia|geforce|quadro|rtx|gtx/.test(s)) return 'nvidia';
  if (/\bamd\b|radeon|advanced micro|\bati\b/.test(s)) return 'amd';
  if (/intel|\barc\b|iris|uhd graphics|hd graphics/.test(s)) return 'intel';
  return 'other';
}

/** Версия драйвера NVIDIA из версии Windows: 32.0.15.6094 → 560.94 (последняя цифра третьей части + четвёртая часть). */
export function nvidiaDriverFromWindows(v: string | undefined): string | undefined {
  const m = /^\d+\.\d+\.(\d{1,2})\.(\d{4})$/.exec(String(v ?? '').trim());
  if (!m) return undefined;
  const all = m[1].slice(-1) + m[2];
  return `${Number(all.slice(0, 3))}.${all.slice(3)}`;
}

/** Ответ PowerShell `Get-CimInstance Win32_VideoController | ConvertTo-Json` (один объект или массив). */
export function parseCimGpus(json: string): GpuInfo[] {
  let data: unknown;
  try { data = JSON.parse(json); } catch { return []; }
  const list = (Array.isArray(data) ? data : data ? [data] : []) as Record<string, unknown>[];
  const out: GpuInfo[] = [];
  for (const g of list) {
    const name = String(g.Name ?? '').trim();
    if (!name || VIRTUAL.test(name)) continue;
    const vendor = vendorOf(`${name} ${g.AdapterCompatibility ?? ''}`);
    const winVer = String(g.DriverVersion ?? '').trim();
    const driver = vendor === 'nvidia' ? nvidiaDriverFromWindows(winVer) ?? (winVer || undefined) : winVer || undefined;
    const ram = Number(g.AdapterRAM);
    // AdapterRAM — 32-битное поле: больше 4 ГБ не показывает, поэтому верим ему только до 4 ГБ
    const vramGb = ram > 0 && ram < 4 * 2 ** 30 - 2 ** 20 ? Math.round((ram / 2 ** 30) * 10) / 10 : undefined;
    out.push({ name, vendor, driver, vramGb });
  }
  return out;
}

/** Ответ `nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader,nounits`. */
export function parseNvidiaSmi(csv: string): GpuInfo[] {
  return csv.split(/\r?\n/).map((l) => l.split(',').map((s) => s.trim())).filter((p) => p.length >= 2 && p[0])
    .map(([name, driver, mem]) => ({ name, vendor: 'nvidia' as const, driver: driver || undefined, vramGb: Number(mem) > 0 ? Math.round(Number(mem) / 102.4) / 10 : undefined }));
}

/** Сведения nvidia-smi точнее (версия драйвера, память) — переносим их на видеокарты из списка Windows. */
export function mergeNvidia(gpus: GpuInfo[], smi: GpuInfo[]): GpuInfo[] {
  if (!smi.length) return gpus;
  const rest = [...smi];
  const out = gpus.map((g) => {
    if (g.vendor !== 'nvidia') return g;
    const i = rest.findIndex((s) => s.name.toLowerCase() === g.name.toLowerCase());
    const s = i >= 0 ? rest.splice(i, 1)[0] : rest.shift();
    return s ? { ...g, driver: s.driver ?? g.driver, vramGb: s.vramGb ?? g.vramGb } : g;
  });
  return [...out, ...rest.filter((s) => !out.some((g) => g.name === s.name))];
}

/** Какие кодировщики имеет смысл пробовать на этих видеокартах. Видеокарты не нашлись — пробуем все. */
export function encodersFor(gpus: GpuInfo[], platform: string): HwEncoder[] {
  const v = new Set(gpus.map((g) => g.vendor));
  const all = !gpus.length;
  const list: HwEncoder[] = [];
  if (all || v.has('nvidia')) list.push('nvenc');
  if (platform === 'win32' || platform === 'linux') {
    if (all || v.has('amd')) list.push('amf');
    if (all || v.has('intel')) list.push('qsv');
  }
  if (platform === 'win32') list.push('mf');
  return list;
}

/** Разбор ошибки пробного кодирования: почему видеокарта не кодирует. */
export function explainEncoder(id: HwEncoder, stderr: string, exitCode: number | null): EncoderCheck {
  if (exitCode === 0) return { id, ok: true };
  const text = stderr.replace(/\r/g, '');
  const first = text.split('\n').map((s) => s.trim()).find((s) => s && !/^\s*$/.test(s))?.slice(0, 240);
  const res = (code: EncoderFail, need?: string): EncoderCheck => ({ id, ok: false, code, need, detail: first });
  if (/Unknown encoder|Encoder not found/i.test(text)) return res('not-found');
  if (id === 'nvenc') {
    const need = /minimum required Nvidia driver for nvenc is ([\d.]+)/i.exec(text)?.[1];
    if (need || /required nvenc API version|driver is too old/i.test(text)) return res('driver-old', need);
    if (/Cannot load (nvcuda|nvEncodeAPI|libcuda|libnvidia-encode)/i.test(text)) return res('no-driver');
    if (/No capable devices|unsupported device|OpenEncodeSessionEx failed|No NVENC capable|incompatible client/i.test(text)) return res('no-hw');
  }
  if (id === 'amf' && /amfrt|AMF failed to init|DLL .* failed to open|AMF.*not supported|Failed to create.*AMF/i.test(text)) return res('no-driver');
  if (id === 'qsv' && /MFX|Device creation failed|Error initializing|No device available|qsv.*not support/i.test(text)) return res('no-hw');
  if (id === 'mf' && /MFT|no hardware|could not find|hardware encoder/i.test(text)) return res('no-hw');
  return res('other');
}

export function pickBest(checks: EncoderCheck[]): HwEncoder | null {
  return ENCODER_ORDER.find((id) => checks.some((c) => c.id === id && c.ok)) ?? null;
}

/** Порядок попыток при экспорте. auto — то, что прошло проверку, потом процессор. gpu — видеокарта даже без проверки. */
export function encoderPlan(mode: 'auto' | 'gpu' | 'nvenc' | 'x264', checks: EncoderCheck[] | null, platform: string): EncoderEngine[] {
  if (mode === 'x264') return ['x264'];
  const ok = ENCODER_ORDER.filter((id) => checks?.some((c) => c.id === id && c.ok));
  if (mode === 'auto') return [...ok, 'x264'];
  if (mode === 'nvenc') return ['nvenc', ...ok.filter((x) => x !== 'nvenc'), 'x264'];
  const guess = ok.length ? ok : ENCODER_ORDER.filter((id) => id !== 'mf' || platform === 'win32').filter((id) => !checks?.some((c) => c.id === id && c.code === 'not-found'));
  return [...guess, 'x264'];
}

export function encoderLabel(e: EncoderEngine | string | undefined): string {
  switch (e) {
    case 'nvenc': return tx('видеокарта NVIDIA');
    case 'amf': return tx('видеокарта AMD');
    case 'qsv': return tx('видеокарта Intel');
    case 'mf': return tx('видеокарта (через Windows)');
    case 'vp9alpha': return tx('процессор, с прозрачностью');
    default: return tx('процессор');
  }
}

export function encoderName(id: HwEncoder): string {
  return { nvenc: 'NVIDIA NVENC', amf: 'AMD AMF', qsv: 'Intel Quick Sync', mf: tx('Windows Media Foundation') }[id];
}

/** Почему кодировщик не работает — по-человечески и что сделать. */
export function reasonText(c: EncoderCheck, gpus: GpuInfo[]): string {
  if (c.ok) return tx('работает');
  const nv = gpus.find((g) => g.vendor === 'nvidia');
  switch (c.code) {
    case 'driver-old':
      return c.need
        ? tx('драйвер {0} слишком старый — нужен {1} или новее. Обнови драйвер видеокарты.', nv?.driver ?? tx('видеокарты'), c.need)
        : tx('драйвер видеокарты слишком старый — обнови его.');
    case 'no-driver': return tx('не найден драйвер видеокарты — поставь драйвер с сайта производителя.');
    case 'no-hw': return c.id === 'nvenc'
      ? tx('у этой видеокарты нет кодировщика видео (так бывает у GeForce MX и старых моделей) или она занята.')
      : tx('видеокарта не дала кодировать видео.');
    case 'not-found': return tx('в этой сборке FFmpeg нет такого кодировщика.');
    default: return tx('не заработал (подробности — в отчёте об ошибке).');
  }
}
