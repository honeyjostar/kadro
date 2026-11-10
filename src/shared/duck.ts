// «Музыка тише под голос» во всех проектах: где говорят, музыка сама становится тише и плавно возвращается.
// Голос — звук видео (основная дорожка и наложения), запись с микрофона, озвучка и дубляж; музыка — длинные
// звуковые файлы на дорожках звука. Где говорят — по форме волны голоса (те же пики, что рисует таймлайн).
// Плеер и экспорт считают одно и то же: громкость музыки = огибающая duckGain.
import { tx } from './i18n';
import { clipDuration, clipEnd } from './timeline';
import type { MediaAsset, MediaClip, Project, Track } from './types';

export interface DuckSettings { on: boolean; level: number }
/** По умолчанию — включено, музыка под голосом примерно в 3 раза тише (−9 дБ). */
export const DUCK_DEFAULT: DuckSettings = { on: true, level: 0.35 };
export const DUCK_LEVELS: { value: number; label: string }[] = [
  { value: 0.5, label: tx('−{0} дБ', 6) }, { value: 0.35, label: tx('−{0} дБ', 9) }, { value: 0.22, label: tx('−{0} дБ', 13) }, { value: 0.12, label: tx('−{0} дБ', 18) },
];

/** Пики громче этого — речь (около −24 дБ). */
const SPEECH = 0.06;
const MERGE_GAP = 0.45;   // паузы короче — одна фраза
const MIN_SPEECH = 0.18;  // короче — щелчок, а не речь
const PAD = 0.1;
export const DUCK_RAMP = 0.25;

let current: DuckSettings = { ...DUCK_DEFAULT };
/** Настройка из «Настройки» → «Звук» (главный процесс и окно — каждый у себя). */
export function setDuck(s: Partial<DuckSettings> | undefined | null): void {
  current = { on: s?.on !== false, level: DUCK_LEVELS.some((l) => l.value === s?.level) ? s!.level! : DUCK_DEFAULT.level };
}
export const duckNow = (): DuckSettings => current;

/** Музыка: длинный звуковой файл на дорожке звука (не голос, не короткий звук вроде «бум»). */
export function isMusic(track: Track, c: MediaClip, a: MediaAsset | undefined): boolean {
  return track.kind === 'audio' && !!a && a.kind === 'audio' && !a.voice && !c.id.startsWith('sfx~') && Math.max(a.duration, clipDuration(c)) >= 8;
}

/** Источник голоса: звук видео или голосовой файл (запись, озвучка, дубляж). */
function isVoice(track: Track, c: MediaClip, a: MediaAsset | undefined): boolean {
  if (!a || !a.hasAudio || c.muted || c.volume <= 0.02 || track.muted || c.id.startsWith('sfx~')) return false;
  if (a.voice) return true;
  return (track.kind === 'main' || track.kind === 'video') && a.kind === 'video';
}

/**
 * Где говорят (время таймлайна): по пикам голосовых клипов. peaksOf — пики файла (нет — клип не считается).
 * Соседние фразы с короткой паузой сливаются, щелчки отбрасываются, края чуть шире.
 */
export function speechIntervals(p: Project, peaksOf: (a: MediaAsset) => number[] | undefined = (a) => a.peaks): [number, number][] {
  const raw: [number, number][] = [];
  for (const track of p.tracks) {
    for (const c of track.clips) {
      if (c.type !== 'media') continue;
      const a = p.assets.find((x) => x.id === c.assetId);
      if (!isVoice(track, c, a)) continue;
      const peaks = peaksOf(a!);
      if (!peaks?.length || !(a!.duration > 0)) continue;
      const step = a!.duration / peaks.length;
      const i0 = Math.max(0, Math.floor(c.in / step));
      const i1 = Math.min(peaks.length, Math.ceil(c.out / step));
      let runStart = -1;
      for (let i = i0; i <= i1; i++) {
        const loud = i < i1 && peaks[i] * c.volume >= SPEECH;
        if (loud && runStart < 0) runStart = i;
        if (!loud && runStart >= 0) {
          const s0 = Math.max(c.in, runStart * step); const s1 = Math.min(c.out, i * step);
          raw.push([c.start + (s0 - c.in) / c.speed, c.start + (s1 - c.in) / c.speed]);
          runStart = -1;
        }
      }
    }
  }
  raw.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] <= MERGE_GAP) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged.filter(([a, b]) => b - a >= MIN_SPEECH).map(([a, b]) => [Math.max(0, a - PAD), b + PAD]);
}

/** Множитель громкости музыки в момент t: 1 — без голоса, level — под голосом, между ними — плавно (0,25 с). */
export function duckGain(iv: [number, number][], t: number, level: number, ramp = DUCK_RAMP): number {
  // как в duckExpr: сумма «трапеций» (подъём, полка, спад), не больше 1
  let k = 0;
  for (const [a, b] of iv) {
    if (t < a - ramp) break;
    if (t > b + ramp) continue;
    k += Math.max(0, Math.min(1, (t - (a - ramp)) / ramp, ((b + ramp) - t) / ramp));
    if (k >= 1) break;
  }
  return 1 - (1 - level) * Math.min(1, k);
}

/**
 * Та же огибающая для FFmpeg (фильтр volume, время — от начала клипа). null — голоса над клипом нет.
 * Запятые экранированы для графа фильтров.
 */
export function duckExpr(iv: [number, number][], c: MediaClip, level: number, ramp = DUCK_RAMP): string | null {
  const s = c.start; const e = clipEnd(c);
  const near = iv.filter(([a, b]) => b + ramp > s && a - ramp < e);
  if (!near.length) return null;
  const f = (v: number) => (Math.round(v * 1000) / 1000).toString();
  const terms = near.map(([a, b]) => `clip(min((t-${f(a - ramp - s)})/${f(ramp)}\\,(${f(b + ramp - s)}-t)/${f(ramp)})\\,0\\,1)`);
  return `volume='1-${f(1 - level)}*min(1\\,${terms.join('+')})':eval=frame`;
}

/** Нужна ли огибающая клипу (музыка и есть голос рядом). */
export const duckTargets = (p: Project): MediaClip[] => p.tracks.flatMap((t) => t.clips.filter((c): c is MediaClip => c.type === 'media' && isMusic(t, c, p.assets.find((a) => a.id === c.assetId))));
