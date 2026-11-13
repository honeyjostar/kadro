// Знакомство и режимы: формат по ответу, отправка только с согласия и при заданном счётчике, что прячет простой режим.
import { describe, expect, it } from 'vitest';
import { formatFor, surveyHits } from '../../src/shared/survey';
import { modeForLevel, showsInMode } from '../../src/shared/uiMode';

describe('знакомство', () => {
  it('формат: только шортсы — 9:16, только YouTube — 16:9, оба или ничего — не трогаем', () => {
    expect(formatFor(['shorts', 'games'])).toBe('9:16');
    expect(formatFor(['youtube'])).toBe('16:9');
    expect(formatFor(['youtube', 'shorts'])).toBeNull();
    expect(formatFor([])).toBeNull();
  });
  it('счётчик: без согласия или без адреса — ничего не уходит; с ними — по событию на ответ, без личного', () => {
    const a = { level: 'new' as const, edit: ['shorts' as const], source: 'tiktok' as const };
    expect(surveyHits({ ...a, consent: true }, '')).toEqual([]);
    expect(surveyHits({ ...a, consent: false }, 'kadro')).toEqual([]);
    const hits = surveyHits({ ...a, consent: true }, 'kadro');
    expect(hits).toHaveLength(3);
    expect(hits[0]).toBe('https://kadro.goatcounter.com/count?p=%2Fkadro%2Fhello%2Flevel%2Fnew&e=true');
  });
  it('уровень → режим; простой прячет ключевые кадры, маску, кривые, 3D', () => {
    expect(modeForLevel('new')).toBe('simple');
    expect(modeForLevel('some')).toBe('pro');
    expect(showsInMode('simple', 'inspector', 'mask')).toBe(false);
    expect(showsInMode('simple', 'inspector', 'color')).toBe(true);
    expect(showsInMode('simple', 'colorSub', 'curves')).toBe(false);
    expect(showsInMode('pro', 'rail', '3d')).toBe(true);
  });
});
