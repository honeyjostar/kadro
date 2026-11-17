import { describe, expect, it } from 'vitest';
import { cleanCode, enterCode, newRefCode, replyCode, rewardsOpen, validCode, type Rewards } from '../../src/shared/rewards';

const mk = (code: string): Rewards => ({ by: [], code, invited: [] });
let seed = 1;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

describe('приглашения без сервера', () => {
  it('код с проверочным знаком: опечатка не проходит', () => {
    const c = newRefCode(rand);
    expect(validCode(c)).toBe(true);
    const typo = c.slice(0, 2) + (c[2] === 'A' ? 'B' : 'A') + c.slice(3);
    expect(validCode(typo)).toBe(false);
    expect(cleanCode(` kadro-${c.toLowerCase()} `)).toBe(c);
  });
  it('друг вводит мой код → набор у него и ответный код; я ввожу ответный → набор у меня и друг в счёте', () => {
    const me = mk(newRefCode(rand));
    const friend = mk(newRefCode(rand));
    const a = enterCode(friend, me.code);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(rewardsOpen(a.rewards)).toBe(true);
    expect(a.reply).toBe(replyCode(friend.code, me.code));
    const b = enterCode(me, a.reply!);
    expect(b.ok && rewardsOpen(b.rewards) && b.rewards.invited).toEqual([friend.code]);
    // тот же друг второй раз не считается, чужой ответный код не подходит
    if (b.ok) expect(enterCode(b.rewards, a.reply!)).toEqual({ ok: false, error: 'again' });
    const other = mk(newRefCode(rand));
    expect(enterCode(other, a.reply!)).toEqual({ ok: false, error: 'notmine' });
  });
  it('свой код и второй чужой — нельзя', () => {
    const me = mk(newRefCode(rand));
    expect(enterCode(me, me.code)).toEqual({ ok: false, error: 'own' });
    const x = enterCode(me, newRefCode(rand));
    expect(x.ok).toBe(true);
    if (x.ok) expect(enterCode(x.rewards, newRefCode(rand))).toEqual({ ok: false, error: 'used' });
  });
});
