// Анонимная статистика Kadro (только с согласия): сколько людей открывают Kadro за день и какими функциями
// пользуются. Счётчик — GoatCounter (без cookies, без имени, почты, файлов и адресов). Каждое событие уходит
// не чаще раза в день с компьютера — цифры значат «сколько людей», а не «сколько щелчков».
import { SURVEY_COUNTER } from './survey';

/** Что считаем: путь события. Только эти виды — остальное не уходит. */
const ALLOWED = /^(active|install|ver\/[\w.-]{1,20}|os\/(win|mac|linux)|export\/[\w-]{1,20}|auto\/(clip|full|len)|shorts\/(talk|game)|bg\/[\w-]{1,30}|theme\/[\w-]{1,30}|sticker|outro\/(on|off)|ref\/(code|reply)|workshop\/(open|install|publish)|sysmon)$/;
export const statAllowed = (ev: string): boolean => ALLOWED.test(ev);

/** День по местному времени: события считаются раз в сутки. */
export const statDay = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Пора ли отправить событие сегодня (last — когда отправляли каждое). */
export function statDue(last: Record<string, string> | undefined, ev: string, day = statDay()): boolean {
  return statAllowed(ev) && last?.[ev] !== day;
}

/** Адрес счётчика для события. «active» — посещение (уникальные люди за день), остальное — события. */
export function statUrl(ev: string, counter = SURVEY_COUNTER): string | null {
  if (!counter || !statAllowed(ev)) return null;
  const page = ev === 'active' ? '' : '&e=true';
  return `https://${counter}.goatcounter.com/count?p=${encodeURIComponent(`/kadro/app/${ev}`)}${page}&rnd=${Math.random().toString(36).slice(2, 9)}`;
}
