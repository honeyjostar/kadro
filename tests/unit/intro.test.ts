import { describe, expect, it } from 'vitest';
import { introAccent, introPlan, isWeakPc } from '../../src/shared/intro';

describe('заставка при запуске', () => {
  const fast = { cores: 12, memGb: 16 };
  const weak = { cores: 4, memGb: 8 };
  it('слабый компьютер — мало потоков или памяти', () => {
    expect(isWeakPc(fast)).toBe(false);
    expect(isWeakPc(weak)).toBe(true);
    expect(isWeakPc({ cores: 8, memGb: 4 })).toBe(true);
  });
  it('по умолчанию включена; выключил — нет; в автотестах — нет', () => {
    expect(introPlan({}, fast)).toEqual({ show: true, offer: false });
    expect(introPlan({ intro: false }, fast).show).toBe(false);
    expect(introPlan({}, fast, true).show).toBe(false);
  });
  it('предложить выключить — один раз и только на слабом компьютере', () => {
    expect(introPlan({}, weak)).toEqual({ show: true, offer: true });
    expect(introPlan({ introAsked: true }, weak).offer).toBe(false);
    expect(introPlan({ intro: false }, weak).offer).toBe(false);
  });
  it('цвет акцента как в оформлении', () => {
    expect(introAccent('pink', true)).toBe('#ff3d7f');
    expect(introAccent('blue', false)).toBe('#1b63e0');
    expect(introAccent('что-то', true)).toBe('#ff3d7f');
  });
});
