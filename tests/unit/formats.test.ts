// Экспорт в несколько форматов: размеры кадра, фон, имена файлов, кружок Telegram.
import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { EXTRA_FORMATS, extraPath, sameAsProject, TG_CIRCLE, variantProject } from '../../src/shared/formats';

const F = (id: string) => EXTRA_FORMATS.find((f) => f.id === id)!;

describe('ещё форматы при экспорте', () => {
  const p = newProject(undefined, '9:16');
  it('вертикальный проект → 16:9 и 1:1: размер кадра и размытый фон вместо чёрного', () => {
    const h = variantProject(p, F('h169'), 1080);
    expect([h.settings.width, h.settings.height, h.settings.aspect]).toEqual([1920, 1080, '16:9']);
    expect(h.settings.background).toBe('blur');
    const s = variantProject(p, F('sq11'), 720);
    expect([s.settings.width, s.settings.height]).toEqual([720, 720]);
    expect(p.settings.aspect).toBe('9:16'); // исходный проект не тронут
  });
  it('кружок Telegram — квадрат 640 и до 60 секунд', () => {
    const c = variantProject(p, F('tgcircle'), 1080);
    expect([c.settings.width, c.settings.height]).toEqual([TG_CIRCLE.short, TG_CIRCLE.short]);
    expect(F('tgcircle').maxSec).toBe(60);
  });
  it('формат проекта — это основной файл; кружок — всегда отдельно', () => {
    expect(sameAsProject(p, F('v916'))).toBe(true);
    expect(sameAsProject(p, F('h169'))).toBe(false);
    expect(sameAsProject(newProject(undefined, '1:1'), F('tgcircle'))).toBe(false);
  });
  it('белый фон проекта остаётся белым; файлы — рядом с основным', () => {
    const w = { ...p, settings: { ...p.settings, background: 'white' as const } };
    expect(variantProject(w, F('h169'), 1080).settings.background).toBe('white');
    expect(extraPath('C:\\Видео\\Мой ролик.mp4', F('h169'))).toBe('C:\\Видео\\Мой ролик · 16x9.mp4');
    expect(extraPath('/home/u/a.b/clip', F('sq11'))).toBe('/home/u/a.b/clip · 1x1.mp4');
  });
});
