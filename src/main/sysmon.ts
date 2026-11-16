// «Нагрузка ПК»: процессор, память, видеокарта (3D, декодер, кодировщик, видеопамять) и температуры — раз в секунду,
// пока открыт виджет. Плюс что Kadro делает сейчас (экспорт, разбор видео, субтитры…) и пики нагрузки по каждому
// такому делу — видно, что именно грузит компьютер.
// Видеокарта: NVIDIA — nvidia-smi (загрузка, память, температура); в Windows для любой видеокарты — счётчики
// «GPU Engine» (как в Диспетчере задач). Температура процессора — WMI, если Windows её отдаёт (часто только админу).
import { app } from 'electron';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SysSample } from '../shared/sysmon';

type Send = (s: SysSample) => void;
const log = (...a: unknown[]) => console.warn('[sysmon]', ...a);

// ---------- что Kadro делает сейчас ----------
const running = new Map<number, string>();
let seq = 0;
/** Начало тяжёлого дела (экспорт, ИИ): вернёт функцию «закончилось». */
export function beginActivity(label: string): () => void {
  const id = ++seq;
  running.set(id, label);
  return () => { running.delete(id); };
}

// ---------- процессор ----------
let prevCpu: { idle: number; total: number } | null = null;
function cpuPercent(): number {
  let idle = 0; let total = 0;
  for (const c of os.cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  const p = prevCpu;
  prevCpu = { idle, total };
  if (!p || total === p.total) return 0;
  return Math.round(Math.max(0, Math.min(100, (1 - (idle - p.idle) / (total - p.total)) * 100)));
}

// ---------- NVIDIA ----------
function nvidiaSmi(): string | null {
  const cands = process.platform === 'win32'
    ? [path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'nvidia-smi.exe'), 'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe']
    : ['/usr/bin/nvidia-smi', '/usr/local/bin/nvidia-smi'];
  return cands.find((f) => { try { return fs.existsSync(f); } catch { return false; } }) ?? null;
}
type Nv = { name: string; util: number; mem: number; memTotal: number; temp: number; enc: number; dec: number };
function readNvidia(bin: string): Promise<Nv | null> {
  return new Promise((resolve) => {
    execFile(bin, ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,utilization.encoder,utilization.decoder', '--format=csv,noheader,nounits'],
      { timeout: 3000, windowsHide: true }, (err, out) => {
        if (err) { resolve(null); return; }
        const f = String(out).split(/\r?\n/)[0]?.split(',').map((x) => x.trim());
        if (!f || f.length < 5) { resolve(null); return; }
        const n = (i: number) => (Number.isFinite(Number(f[i])) ? Number(f[i]) : 0);
        resolve({ name: f[0], util: n(1), mem: n(2), memTotal: n(3), temp: n(4), enc: n(5), dec: n(6) });
      });
  });
}

// ---------- Windows: счётчики видеокарты (любой производитель) и температура процессора ----------
// Один процесс PowerShell на всё время показа виджета: раз в секунду печатает строку JSON.
const PS_LOOP = `
$ErrorActionPreference = 'SilentlyContinue'
while ($true) {
  $s = (Get-Counter -Counter '\\GPU Engine(*)\\Utilization Percentage','\\GPU Adapter Memory(*)\\Dedicated Usage' -SampleInterval 1 -MaxSamples 1).CounterSamples
  $g3 = 0; $enc = 0; $dec = 0; $mem = 0
  foreach ($c in $s) {
    $p = $c.Path
    if ($p -like '*engtype_3d*') { $g3 += $c.CookedValue }
    elseif ($p -like '*engtype_videoencode*') { $enc += $c.CookedValue }
    elseif ($p -like '*engtype_videodecode*') { $dec += $c.CookedValue }
    elseif ($p -like '*dedicated usage*') { $mem += $c.CookedValue }
  }
  $t = $null
  try { $z = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop | Select-Object -First 1; if ($z) { $t = [math]::Round($z.CurrentTemperature / 10 - 273.15) } } catch {}
  [Console]::Out.WriteLine((@{ g3 = [math]::Round([math]::Min(100, $g3)); enc = [math]::Round([math]::Min(100, $enc)); dec = [math]::Round([math]::Min(100, $dec)); mem = [math]::Round($mem / 1MB); t = $t } | ConvertTo-Json -Compress))
}
`;
type Win = { g3: number; enc: number; dec: number; mem: number; t: number | null };

// ---------- показ ----------
let timer: NodeJS.Timeout | null = null;
let ps: ChildProcess | null = null;
let lastWin: Win | null = null;
let nvBin: string | null | undefined;
let gpuName: string | null = null;

export function startSysmon(send: Send, gpuNameHint?: string | null): void {
  stopSysmon();
  gpuName = gpuNameHint ?? null;
  nvBin ??= nvidiaSmi();
  cpuPercent();
  if (process.platform === 'win32') {
    try {
      ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_LOOP], { windowsHide: true });
      let buf = '';
      ps.stdout?.on('data', (d: Buffer) => {
        buf += d.toString();
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith('{')) continue;
          try { lastWin = JSON.parse(line) as Win; } catch { /* неполная строка */ }
        }
      });
      ps.on('error', (e) => log('sysmon powershell', e));
      ps.on('exit', () => { ps = null; });
    } catch (e) { log('sysmon powershell', e); }
  }
  const tick = async () => {
    const nv = nvBin ? await readNvidia(nvBin) : null;
    const metrics = app.getAppMetrics();
    const appCpu = metrics.reduce((s, m) => s + m.cpu.percentCPUUsage, 0) / Math.max(1, os.cpus().length);
    const appMem = metrics.reduce((s, m) => s + m.memory.workingSetSize, 0) / 1024; // МБ
    const total = os.totalmem() / 1048576;
    const sample: SysSample = {
      t: Date.now(),
      cpu: cpuPercent(),
      cpuTemp: lastWin?.t ?? null,
      cores: os.cpus().length,
      ram: Math.round(total - os.freemem() / 1048576),
      ramTotal: Math.round(total),
      appCpu: Math.round(appCpu),
      appRam: Math.round(appMem),
      gpu: nv ? nv.util : lastWin ? lastWin.g3 : null,
      gpuEnc: nv ? nv.enc : lastWin ? lastWin.enc : null,
      gpuDec: nv ? nv.dec : lastWin ? lastWin.dec : null,
      gpuMem: nv ? nv.mem : lastWin ? lastWin.mem : null,
      gpuMemTotal: nv ? nv.memTotal : null,
      gpuTemp: nv ? nv.temp : null,
      gpuName: nv?.name ?? gpuName,
      activity: [...new Set(running.values())],
    };
    send(sample);
  };
  void tick();
  timer = setInterval(() => void tick(), 1000);
}

export function stopSysmon(): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (ps) { try { ps.kill(); } catch { /* уже закрыт */ } }
  ps = null;
  lastWin = null;
}
