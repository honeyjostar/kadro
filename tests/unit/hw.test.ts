import { describe, expect, it } from 'vitest';
import { encoderPlan, encodersFor, explainEncoder, mergeNvidia, nvidiaDriverFromWindows, parseCimGpus, parseNvidiaSmi, pickBest, vendorOf } from '../../src/shared/hw';

describe('видеокарты', () => {
  it('версия драйвера NVIDIA из версии Windows', () => {
    expect(nvidiaDriverFromWindows('32.0.15.6094')).toBe('560.94');
    expect(nvidiaDriverFromWindows('31.0.15.5222')).toBe('552.22');
    expect(nvidiaDriverFromWindows('32.0.16.1062')).toBe('610.62');
    expect(nvidiaDriverFromWindows('27.20.100.9466')).toBeUndefined();
  });

  it('список Windows: виртуальные экраны отбрасываются, производитель — по имени', () => {
    const json = JSON.stringify([
      { Name: 'NVIDIA GeForce RTX 3060', AdapterCompatibility: 'NVIDIA', DriverVersion: '32.0.15.6094', AdapterRAM: 4293918720 },
      { Name: 'Intel(R) UHD Graphics 770', AdapterCompatibility: 'Intel Corporation', DriverVersion: '31.0.101.4502', AdapterRAM: 1073741824 },
      { Name: 'Microsoft Basic Display Adapter', AdapterCompatibility: '(Standard display types)', DriverVersion: '10.0.19041.1' },
      { Name: 'Parsec Virtual Display Adapter', AdapterCompatibility: 'Parsec Cloud, Inc.', DriverVersion: '0.45.0.0' },
    ]);
    const g = parseCimGpus(json);
    expect(g.map((x) => x.vendor)).toEqual(['nvidia', 'intel']);
    expect(g[0].driver).toBe('560.94');
    expect(g[0].vramGb).toBeUndefined(); // 32-битное поле упёрлось в 4 ГБ — не верим
    expect(g[1].vramGb).toBe(1);
    // один объект вместо массива
    expect(parseCimGpus(JSON.stringify({ Name: 'AMD Radeon RX 6600', AdapterCompatibility: 'Advanced Micro Devices, Inc.', DriverVersion: '31.0.24027.1012' }))[0].vendor).toBe('amd');
    expect(parseCimGpus('мусор')).toEqual([]);
  });

  it('nvidia-smi уточняет драйвер и память', () => {
    const smi = parseNvidiaSmi('NVIDIA GeForce RTX 3060, 566.36, 12288\r\n');
    expect(smi[0]).toMatchObject({ name: 'NVIDIA GeForce RTX 3060', driver: '566.36', vramGb: 12 });
    const merged = mergeNvidia([{ name: 'NVIDIA GeForce RTX 3060', vendor: 'nvidia', driver: '560.94' }, { name: 'Intel UHD', vendor: 'intel' }], smi);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ driver: '566.36', vramGb: 12 });
  });

  it('производитель по коду', () => {
    expect(vendorOf(0x10de)).toBe('nvidia');
    expect(vendorOf(0x1002)).toBe('amd');
    expect(vendorOf(0x8086)).toBe('intel');
    expect(vendorOf('Intel(R) Arc(TM) A750 Graphics')).toBe('intel');
  });
});

describe('кодировщики', () => {
  it('что пробовать', () => {
    expect(encodersFor([{ name: 'RTX', vendor: 'nvidia' }], 'win32')).toEqual(['nvenc', 'mf']);
    expect(encodersFor([{ name: 'RX', vendor: 'amd' }, { name: 'UHD', vendor: 'intel' }], 'win32')).toEqual(['amf', 'qsv', 'mf']);
    expect(encodersFor([], 'win32')).toEqual(['nvenc', 'amf', 'qsv', 'mf']);
    expect(encodersFor([], 'darwin')).toEqual(['nvenc']);
  });

  it('старый драйвер NVIDIA: нужная версия из ответа FFmpeg', () => {
    const err = '[h264_nvenc @ 0x1] Driver does not support the required nvenc API version. Required: 13.0 Found: 12.2\n[h264_nvenc @ 0x1] The minimum required Nvidia driver for nvenc is 570.0 or newer\n';
    expect(explainEncoder('nvenc', err, 1)).toMatchObject({ ok: false, code: 'driver-old', need: '570.0' });
  });

  it('нет кодировщика у видеокарты, нет драйвера, всё хорошо', () => {
    expect(explainEncoder('nvenc', 'OpenEncodeSessionEx failed: unsupported device (2): (no details)', 1).code).toBe('no-hw');
    expect(explainEncoder('nvenc', 'Cannot load nvcuda.dll', 1).code).toBe('no-driver');
    expect(explainEncoder('amf', 'DLL amfrt64.dll failed to open', 1).code).toBe('no-driver');
    expect(explainEncoder('qsv', 'Error creating a MFX session: -9.', 1).code).toBe('no-hw');
    expect(explainEncoder('qsv', "Unknown encoder 'h264_qsv'", 1).code).toBe('not-found');
    expect(explainEncoder('mf', '', 0)).toEqual({ id: 'mf', ok: true });
  });

  it('лучший и порядок попыток при экспорте', () => {
    const checks = [{ id: 'nvenc' as const, ok: false, code: 'driver-old' as const }, { id: 'mf' as const, ok: true }];
    expect(pickBest(checks)).toBe('mf');
    expect(encoderPlan('auto', checks, 'win32')).toEqual(['mf', 'x264']);
    expect(encoderPlan('x264', checks, 'win32')).toEqual(['x264']);
    expect(encoderPlan('gpu', checks, 'win32')).toEqual(['mf', 'x264']);
    // проверки ещё не было — «видеокарта» пробует всё по порядку
    expect(encoderPlan('gpu', null, 'win32')).toEqual(['nvenc', 'amf', 'qsv', 'mf', 'x264']);
    expect(encoderPlan('auto', null, 'linux')).toEqual(['x264']);
  });
});
