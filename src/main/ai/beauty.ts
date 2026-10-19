// Ретушь: сглаживание кожи и осветление лица. Кожа находится по цвету (диапазон Cb/Cr),
// маска размывается, чтобы не было резких границ; остальной кадр не меняется.
// Результат — H.264 фрагмента без звука (как у стабилизации), превью и экспорт берут один и тот же файл.
import { runFfmpeg } from '../ffrun';

export interface BeautyOpts { smooth: number; bright: number; width: number; height: number }

const f = (n: number) => String(Math.round(n * 1e4) / 1e4);

/** Граф фильтров ретуши для входа [0:v] → [v]. */
export function beautyGraph(o: BeautyOpts): string {
  const short = Math.max(2, Math.min(o.width, o.height));
  const sm = Math.min(1, Math.max(0, o.smooth));
  const br = Math.min(1, Math.max(0, o.bright));
  const sigmaS = Math.max(0.5, short * (0.002 + 0.007 * sm));
  const sigmaR = 0.04 + 0.12 * sm;
  const soft = Math.max(1, short * 0.004);
  const ks = Math.min(1, sm * 1.25);
  const kb = br;
  return [
    `[0:v]format=yuv444p,split=2[o][m]`,
    // маска кожи: Cb 77..127 и Cr 133..173, мягкий край
    `[m]extractplanes=u+v[u][v]`,
    `[u]lut=c0='if(between(val\\,77\\,127)\\,255\\,0)'[mu]`,
    `[v]lut=c0='if(between(val\\,133\\,173)\\,255\\,0)'[mv]`,
    `[mu][mv]blend=all_mode=multiply,gblur=sigma=${f(soft)},split=2[ma][mb]`,
    `[ma]lut=c0='val*${f(ks)}',split=3[s1][s2][s3]`,
    `[s1][s2][s3]mergeplanes=0x001020:yuv444p[ms]`,
    `[mb]lut=c0='val*${f(kb)}',split=3[b1][b2][b3]`,
    `[b1][b2][b3]mergeplanes=0x001020:yuv444p[mbr]`,
    // 1) сглаживание: двусторонний фильтр (края лица и глаз сохраняются)
    `[o]split=2[o1][o2]`,
    `[o2]bilateral=sigmaS=${f(sigmaS)}:sigmaR=${f(sigmaR)}:planes=1[sm]`,
    `[o1][sm][ms]maskedmerge[a]`,
    // 2) осветление кожи: мягкая гамма и немного яркости
    `[a]split=2[a1][a2]`,
    `[a2]eq=gamma=${f(1 + 0.22 * br)}:brightness=${f(0.035 * br)}[br]`,
    `[a1][br][mbr]maskedmerge,format=yuv420p[v]`,
  ].join(';');
}

export async function beautify(src: string, ss: number, dur: number, o: BeautyOpts, out: string, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<void> {
  await runFfmpeg(['-hide_banner', '-y', '-ss', String(ss), '-t', String(dur), '-i', src, '-an',
    '-filter_complex', beautyGraph(o), '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-g', '15', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', out],
  { duration: dur, onProgress, signal });
}
