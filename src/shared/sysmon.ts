// «Нагрузка ПК»: замер раз в секунду (main → окно) и пики по делам Kadro (экспорт, разбор видео, субтитры…).

export interface SysSample {
  t: number;
  cpu: number;               // % всех ядер
  cpuTemp: number | null;    // °C (если Windows отдаёт)
  cores: number;
  ram: number;               // МБ занято в системе
  ramTotal: number;          // МБ всего
  appCpu: number;            // % — сам Kadro (окно и служебные процессы, без ffmpeg)
  appRam: number;            // МБ — сам Kadro
  gpu: number | null;        // % 3D
  gpuEnc: number | null;     // % кодировщика видео (NVENC, AMF, Quick Sync)
  gpuDec: number | null;     // % декодера видео
  gpuMem: number | null;     // МБ видеопамяти
  gpuMemTotal: number | null;
  gpuTemp: number | null;    // °C
  gpuName: string | null;
  activity: string[];        // что Kadro делает сейчас
}

export interface ActivityPeak { label: string; cpu: number; ram: number; gpu: number | null; gpuEnc: number | null; gpuTemp: number | null; cpuTemp: number | null; secs: number }

/** Пики по делам: каждое дело из activity копит максимум нагрузки и время. idle — «Kadro ничего не делает». */
export function addPeaks(peaks: ActivityPeak[], s: SysSample, idle: string): ActivityPeak[] {
  const labels = s.activity.length ? s.activity : [idle];
  const out = peaks.map((p) => ({ ...p }));
  const mx = (a: number | null, b: number | null) => (b === null ? a : a === null ? b : Math.max(a, b));
  for (const label of labels) {
    let p = out.find((x) => x.label === label);
    if (!p) { p = { label, cpu: 0, ram: 0, gpu: null, gpuEnc: null, gpuTemp: null, cpuTemp: null, secs: 0 }; out.push(p); }
    p.cpu = Math.max(p.cpu, s.cpu);
    p.ram = Math.max(p.ram, s.ram);
    p.gpu = mx(p.gpu, s.gpu);
    p.gpuEnc = mx(p.gpuEnc, s.gpuEnc);
    p.gpuTemp = mx(p.gpuTemp, s.gpuTemp);
    p.cpuTemp = mx(p.cpuTemp, s.cpuTemp);
    p.secs += 1;
  }
  return out;
}

/** Совет по замеру: что упирается (процессор, память, видеокарта, перегрев). */
export function bottleneck(s: SysSample): 'cpu' | 'ram' | 'gpu' | 'hot' | null {
  if ((s.gpuTemp ?? 0) >= 85 || (s.cpuTemp ?? 0) >= 90) return 'hot';
  if (s.ramTotal && s.ram / s.ramTotal > 0.92) return 'ram';
  if (s.cpu >= 95) return 'cpu';
  if ((s.gpu ?? 0) >= 97) return 'gpu';
  return null;
}
