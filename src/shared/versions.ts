// Версии проекта: снимки сами сохраняются (раз в несколько минут работы и при сохранении) — можно открыть вчерашний вариант.
// Что хранить: последние VERSIONS_KEEP снимков, а старше суток — по одному на день, не дольше VERSIONS_DAYS дней.

export interface VersionInfo { file: string; time: number; name: string; clips: number; duration: number }

export const VERSIONS_KEEP = 40;
export const VERSIONS_DAYS = 30;
/** Как часто снимать версию, пока идут правки. */
export const SNAPSHOT_EVERY_MS = 5 * 60_000;

/** Какие снимки удалить (время в мс, любые по порядку). now — сейчас. */
export function versionsToDrop(times: number[], now: number, keep = VERSIONS_KEEP, days = VERSIONS_DAYS): number[] {
  const desc = [...times].sort((a, b) => b - a);
  const drop: number[] = [];
  const seenDay = new Set<string>();
  desc.forEach((t, i) => {
    if (now - t > days * 86_400_000) { drop.push(t); return; }
    const day = new Date(t).toDateString();
    if (i < keep && now - t < 86_400_000) { seenDay.add(day); return; }
    if (seenDay.has(day)) { drop.push(t); return; }
    seenDay.add(day);
  });
  return drop;
}

/** Имя файла снимка: время, чтобы список сортировался сам. */
export const versionFile = (t: number): string => `${new Date(t).toISOString().replace(/[:.]/g, '-')}.kadro`;
