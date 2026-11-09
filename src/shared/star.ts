// Просьба поставить звезду Kadro на GitHub — прямо в программе, после экспорта (ролик готов — самое время).
// Первый раз — после первого удачного экспорта. Не нажали «Поставить звезду» — ещё один раз после 10-го экспорта,
// и больше не просим. Нажали — не просим никогда.
export type StarAnswer = 'later' | 'done' | 'never';
export interface StarState { exports?: number; star?: StarAnswer }

/** На каком экспорте спросить второй раз. */
export const STAR_AGAIN_AT = 10;

/** Экспорт удался: новый счётчик и показать ли просьбу. */
export function afterExport(s: StarState): { state: StarState; ask: boolean } {
  const exports = (s.exports ?? 0) + 1;
  if (!s.star) return { state: { exports, star: 'later' }, ask: true };
  if (s.star === 'later' && exports >= STAR_AGAIN_AT) return { state: { exports, star: 'never' }, ask: true };
  return { state: { exports, star: s.star }, ask: false };
}
