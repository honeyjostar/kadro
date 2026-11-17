// Лёгкие копии для 2K и 4K: кому и когда.
import { describe, expect, it } from 'vitest';
import { needsLightCopy, strongPc, weakPc } from '../../src/shared/lightCopy';

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
  it('1080p и меньше на обычном компьютере — никогда (плеер тянет сам)', () => {
    expect(needsLightCopy('auto', 1920, 1080, 30, gtx1060)).toBe(false);
    expect(needsLightCopy('on', 1080, 1920, 60, gtx1060, { codec: 'hevc' })).toBe(false);
    expect(needsLightCopy('auto', 1920, 1080, 30, laptop)).toBe(false); // H.264 30 к/с — и слабому по силам
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

describe('слабый компьютер', () => {
  const old = { threads: 4, ramGb: 8, gpus: [{ name: 'Intel HD Graphics 520', vendor: 'intel' as const }] };
  it('кто слабый: до 4 потоков, меньше 8 ГБ, встроенная графика до 8 потоков', () => {
    expect(weakPc(old)).toBe(true);
    expect(weakPc({ ...laptop, ramGb: 16 })).toBe(true);
    expect(weakPc({ ...gtx1060, ramGb: 16 })).toBe(false);
    expect(weakPc({ ...gtx1060, ramGb: 4 })).toBe(true);
    expect(weakPc(null)).toBe(false);
  });
  it('слабому — копия и для 1080p: HEVC с телефона, 60 к/с, большой битрейт; обычный 1080p H.264 — нет', () => {
    expect(needsLightCopy('auto', 1080, 1920, 30, old, { codec: 'hevc', mbps: 12 })).toBe(true);
    expect(needsLightCopy('auto', 1920, 1080, 60, old, { codec: 'h264', mbps: 15 })).toBe(true);
    expect(needsLightCopy('auto', 1920, 1080, 30, old, { codec: 'h264', mbps: 45 })).toBe(true);
    expect(needsLightCopy('auto', 1920, 1080, 30, old, { codec: 'h264', mbps: 12 })).toBe(false);
    expect(needsLightCopy('auto', 1080, 1920, 30, gtx1060, { codec: 'hevc', mbps: 12 })).toBe(false);
    expect(needsLightCopy('off', 1080, 1920, 60, old, { codec: 'hevc' })).toBe(false);
    expect(needsLightCopy('auto', 1280, 720, 60, old, { codec: 'hevc' })).toBe(false);
  });
});
