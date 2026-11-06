// Где распознавать речь: «Авто» сравнивает видеокарту и процессор один раз и выбирает видеокарту, только если она
// заметно быстрее; сбой видеокарты — дальше процессор; «Видеокарта» и «Процессор» — как выбрано.
import { describe, expect, it } from 'vitest';
import { asrBenchKey, decideAsrDevice, DML_FALLBACK, gpuKey, gpuSpeedup, gpuWins } from '../../src/shared/asrDevice';

const bench = (gpuSec: number, cpuSec: number) => ({ gpuSec, cpuSec, speechSec: 20, at: 1 });

describe('распознавание: видеокарта или процессор', () => {
  it('«Авто»: сначала сравнить, потом — что быстрее', () => {
    expect(decideAsrDevice('auto', { available: true, failed: false })).toBe('bench');
    expect(decideAsrDevice('auto', { available: true, failed: false, bench: bench(1, 4) })).toBe('gpu');
    // видеокарта чуть быстрее — не считается: процессор надёжнее
    expect(decideAsrDevice('auto', { available: true, failed: false, bench: bench(0.9, 1) })).toBe('cpu');
    expect(decideAsrDevice('auto', { available: true, failed: false, bench: bench(3, 1) })).toBe('cpu');
  });

  it('нет видеокарты или она не подошла — процессор', () => {
    expect(decideAsrDevice('auto', { available: false, failed: false })).toBe('cpu');
    expect(decideAsrDevice('gpu', { available: false, failed: false })).toBe('cpu');
    expect(decideAsrDevice('auto', { available: true, failed: true, bench: bench(1, 4) })).toBe('cpu');
  });

  it('выбрано вручную — так и есть', () => {
    expect(decideAsrDevice('gpu', { available: true, failed: true })).toBe('gpu');
    expect(decideAsrDevice('gpu', { available: true, failed: false, bench: bench(5, 1) })).toBe('gpu');
    expect(decideAsrDevice('cpu', { available: true, failed: false, bench: bench(1, 9) })).toBe('cpu');
  });

  it('во сколько раз быстрее', () => {
    expect(gpuSpeedup({ gpuSec: 1, cpuSec: 3.24 })).toBe(3.2);
    expect(gpuWins({ gpuSec: 0, cpuSec: 1 })).toBe(false);
  });

  it('замер — для этой модели и этой видеокарты с драйвером', () => {
    const g = [{ name: 'NVIDIA GeForce RTX 3060', driver: '566.36' }];
    expect(asrBenchKey('ru', g)).toBe('ru|NVIDIA GeForce RTX 3060@566.36');
    expect(asrBenchKey('ru', [{ name: 'NVIDIA GeForce RTX 3060', driver: '572.16' }])).not.toBe(asrBenchKey('ru', g));
    expect(gpuKey([])).toBe('');
  });

  it('сообщение sherpa-onnx «DirectML не включился»', () => {
    expect(DML_FALLBACK.test('session.cc:373 DirectML is for Windows only. Fallback to cpu!')).toBe(true);
    // так на компьютере без подходящей видеокарты (причина — с новой строки)
    expect(DML_FALLBACK.test('session.cc:GetSessionOptionsImpl:398 Failed to enable DirectML: dml_provider_factory.cc(491) C0262002 Specified display adapter handle is invalid.\n. Fallback to cpu')).toBe(true);
    expect(DML_FALLBACK.test('DirectML: high-performance GPU')).toBe(false);
    expect(DML_FALLBACK.test('DirectML high-performance GPU: No devices detected that match the filter criteria.')).toBe(false);
  });
});
