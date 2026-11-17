// «Набор создателя» — награда за то, что человек рассказывает о Kadro: стикеры с маскотом Kadro, эксклюзивные фоны
// и надписи. Открывается любым из двух способов: экспорт с концовкой «Сделано в Kadro» или приглашение друга.
// Приглашение работает без сервера: у каждого свой код; друг вводит его — получает набор и ответный код;
// присылает ответный код тебе — набор открывается и у тебя, а Kadro считает, скольких ты пригласил.
// Коды — не защита (их можно подобрать по исходникам), а простой ритуал «поделись с другом».

export type RewardSource = 'outro' | 'ref';
export interface Rewards {
  by: RewardSource[];      // чем открыт набор (пусто — закрыт)
  code: string;            // мой код приглашения, 6 знаков
  usedCode?: string;       // чей код я ввёл (один раз)
  invited: string[];       // коды друзей, приславших ответный код
}
export const rewardsOpen = (r: Rewards | null | undefined): boolean => !!r?.by.length;

const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без 0/O и 1/I — не перепутать
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const check = (body: string) => ABC[fnv(`kadro-ref|${body}`) % ABC.length];

/** Новый код приглашения: 5 случайных знаков + проверочный. */
export function newRefCode(rand: () => number = Math.random): string {
  let body = '';
  for (let i = 0; i < 5; i++) body += ABC[Math.floor(rand() * ABC.length) % ABC.length];
  return body + check(body);
}
/** Привести введённое к виду кода: без пробелов, дефисов и «KADRO-», заглавными. */
export const cleanCode = (s: string): string => s.toUpperCase().replace(/^\s*KADRO[-\s]*/, '').replace(/[^A-Z0-9]/g, '');
export function validCode(c: string): boolean {
  return c.length === 6 && [...c].every((x) => ABC.includes(x)) && check(c.slice(0, 5)) === c[5];
}
/** Ответный код: мой код + 4 знака подписи «я ввёл код этого человека». */
export function replyCode(myCode: string, inviterCode: string): string {
  const h = fnv(`kadro-reply|${inviterCode}|${myCode}`);
  let sig = '';
  for (let i = 0, x = h; i < 4; i++, x = Math.floor(x / ABC.length)) sig += ABC[x % ABC.length];
  return myCode + sig;
}

export type RefResult = { ok: true; rewards: Rewards; reply?: string; friend?: string } | { ok: false; error: 'format' | 'own' | 'used' | 'notmine' | 'again' };

/**
 * Ввод кода: 6 знаков — код друга (откроет набор и даст ответный код ему); 10 знаков — ответный код друга,
 * который ввёл мой (откроет набор мне и добавит друга в счёт).
 */
export function enterCode(r: Rewards, input: string): RefResult {
  const c = cleanCode(input);
  if (c.length === 6) {
    if (!validCode(c)) return { ok: false, error: 'format' };
    if (c === r.code) return { ok: false, error: 'own' };
    if (r.usedCode && r.usedCode !== c) return { ok: false, error: 'used' };
    const by = r.by.includes('ref') ? r.by : [...r.by, 'ref' as const];
    return { ok: true, rewards: { ...r, by, usedCode: c }, reply: replyCode(r.code, c) };
  }
  if (c.length === 10) {
    const friend = c.slice(0, 6);
    if (!validCode(friend) || friend === r.code) return { ok: false, error: 'format' };
    if (replyCode(friend, r.code) !== c) return { ok: false, error: 'notmine' };
    if (r.invited.includes(friend)) return { ok: false, error: 'again' };
    const by = r.by.includes('ref') ? r.by : [...r.by, 'ref' as const];
    return { ok: true, rewards: { ...r, by, invited: [...r.invited, friend] }, friend };
  }
  return { ok: false, error: 'format' };
}
/** Код для показа: KADRO-XXXXXX. */
export const showCode = (c: string): string => `KADRO-${c}`;
