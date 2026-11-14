// Лёгкие копии для 2K и 4K: кому и когда.
import { describe, expect, it } from 'vitest';
import { needsLightCopy, strongPc } from '../../src/shared/lightCopy';

const gtx1060 = { threads: 8, gpus: [{ name: 'NVIDIA GeForce GTX 1060 6GB', vendor: 'nvidia' as const, vramGb: 6 }] };
const rtx5060 = { threads: 16, gpus: [{ name: 'NVIDIA GeForce RTX 5060', vendor: 'nvidia' as const, vramGb: 8 }] };
const laptop = { threads: 8, gpus: [{ name: 'Intel UHD Graphics', vendor: 'intel' as const }] };

describe('лёгкие копии', () => {
  it('сильный компьютер — только с видеокартой от 8 ГБ и 12 потоков', () => {
    expect(strongPc(rtx5060)).toBe(true);
    expect(strongPc(gtx1060)).toBe(false);
    expect(strongPc(laptop)).toBe(false);
    expect(strongPc(null)).toBe(false);
  });
  it('1080p и меньше — никогда (плеер тянет сам)', () => {
    expect(needsLightCopy('auto', 1920, 1080, 30, laptop)).toBe(false);
    expect(needsLightCopy('on', 1080, 1920, 60, laptop)).toBe(false);
  });
  it('2K и 4K на «Авто»: GTX 1060 и ноутбук — копия, RTX 5060 — нет', () => {
    expect(needsLightCopy('auto', 2560, 1440, 30, gtx1060)).toBe(true);
    expect(needsLightCopy('auto', 3840, 2160, 30, laptop)).toBe(true);
    expect(needsLightCopy('auto', 2560, 1440, 30, rtx5060)).toBe(false);
    expect(needsLightCopy('auto', 2560, 1440, 30, null)).toBe(true);
  });
  it('1080p 120 к/с — тоже тяжело', () => {
    expect(needsLightCopy('auto', 1920, 1080, 120, gtx1060)).toBe(true);
  });
  it('«Всегда» и «Нет»', () => {
    expect(needsLightCopy('on', 2560, 1440, 30, rtx5060)).toBe(true);
    expect(needsLightCopy('off', 3840, 2160, 30, laptop)).toBe(false);
  });
});
