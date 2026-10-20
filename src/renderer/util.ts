const p2 = (n: number) => String(n).padStart(2, '0');

/** 01:23 или, с кадрами, 00:01:23:15 (часы:минуты:секунды:кадры). */
export function fmtTime(t: number, fps = 30, withFrames = false): string {
  const s = Math.max(0, t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (!withFrames) return h ? `${h}:${p2(m)}:${p2(sec)}` : `${p2(m)}:${p2(sec)}`;
  const fr = Math.min(fps - 1, Math.floor((s - Math.floor(s)) * fps + 1e-6));
  return `${p2(h)}:${p2(m)}:${p2(sec)}:${p2(fr)}`;
}

/** Пик 0..1 → высота столбика волны в «децибельной» шкале (тихая речь тоже видна). */
export function peakLevel(m: number): number {
  if (m <= 0.0005) return 0;
  const db = 20 * Math.log10(m);
  return Math.max(0, Math.min(1, (db + 54) / 54));
}

export function fmtDur(t: number): string {
  if (t < 60) return `${t.toFixed(t < 10 ? 1 : 0)} с`;
  return fmtTime(t);
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function uidShort(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Русское число: 1 кадр, 2 кадра, 5 кадров. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10; const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
}
