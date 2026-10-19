import { describe, expect, it } from 'vitest';
import { GRADE_N, applyTable, curveFn, gradeActive, gradePixel, gradeTable, parseCube } from '../../src/shared/grade';

export function cubeText(size: number, f: (r: number, g: number, b: number) => [number, number, number], title = 'Тест'): string {
  const lines = [`TITLE "${title}"`, `LUT_3D_SIZE ${size}`];
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const o = f(r / (size - 1), g / (size - 1), b / (size - 1));
    lines.push(o.map((v) => v.toFixed(6)).join(' '));
  }
  return lines.join('\n');
}

describe('файлы .cube', () => {
  it('читает 3D-таблицу, название и границы', () => {
    const l = parseCube(`# комментарий\n${cubeText(2, (r, g, b) => [b, g, r], 'Swap')}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n`);
    expect(l.kind).toBe('3d');
    expect(l.size).toBe(2);
    expect(l.title).toBe('Swap');
    expect(l.data.length).toBe(24);
  });
  it('понятные ошибки на плохих файлах', () => {
    expect(() => parseCube('hello')).toThrow(/не файл LUT/);
    expect(() => parseCube('LUT_3D_SIZE 4\n0 0 0\n')).toThrow(/не хватает/);
    expect(() => parseCube('LUT_3D_SIZE 1\n0 0 0\n')).toThrow(/размер/);
  });
  it('1D-таблица применяется по каналам', () => {
    const l = parseCube('LUT_1D_SIZE 2\n0 0 0\n1 0.5 0\n');
    const o = gradePixel({ lut: { path: 'x', name: 'x', amount: 1 } }, l, [1, 1, 1]);
    expect(o.map((v) => +v.toFixed(3))).toEqual([1, 0.5, 0]);
  });
});

describe('кривые', () => {
  it('прямая — нет кривой; точки проходятся точно; монотонность', () => {
    expect(curveFn([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
    const pts = [{ x: 0, y: 0 }, { x: 0.25, y: 0.15 }, { x: 0.75, y: 0.9 }, { x: 1, y: 1 }];
    const f = curveFn(pts)!;
    for (const p of pts) expect(f(p.x)).toBeCloseTo(p.y, 9);
    let prev = -1;
    for (let i = 0; i <= 100; i++) { const v = f(i / 100); expect(v).toBeGreaterThanOrEqual(prev - 1e-12); prev = v; }
    // плато без «перехлёста»
    const g = curveFn([{ x: 0, y: 0 }, { x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }, { x: 1, y: 1 }])!;
    for (let x = 0.4; x <= 0.6; x += 0.01) expect(g(x)).toBeCloseTo(0.5, 9);
  });
});

describe('сводная таблица', () => {
  it('пустая коррекция неактивна, таблица — тождество с обрезкой вниз (как FFmpeg)', () => {
    expect(gradeActive(undefined)).toBe(false);
    expect(gradeActive({ curves: { all: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } })).toBe(false);
    expect(gradeActive({ lut: { path: 'a', name: 'a', amount: 1 } }, false)).toBe(false); // LUT ещё не загрузился
    const t = gradeTable({}, null);
    for (const v of [0, 1, 17, 100, 200, 254, 255]) {
      const o = applyTable(t, GRADE_N, v, 255 - v, (v * 3) % 256);
      expect(o[0] - v).toBeLessThanOrEqual(0);
      expect(o[0] - v).toBeGreaterThanOrEqual(-1);
    }
  });
  it('HSL: красный обесцвечивается, синий не трогается, серый — тоже', () => {
    const g = { hsl: { red: { h: 0, s: -1, l: 0 } } };
    const red = gradePixel(g, null, [0.9, 0.1, 0.1]);
    expect(Math.abs(red[0] - red[1])).toBeLessThan(0.02);
    expect(gradePixel(g, null, [0.1, 0.2, 0.9]).map((v) => +v.toFixed(4))).toEqual([0.1, 0.2, 0.9]);
    expect(gradePixel(g, null, [0.5, 0.5, 0.5]).map((v) => +v.toFixed(4))).toEqual([0.5, 0.5, 0.5]);
    // сдвиг оттенка жёлтого к зелёному
    const y = gradePixel({ hsl: { yellow: { h: 1, s: 0, l: 0 } } }, null, [0.9, 0.9, 0.1]);
    expect(y[1]).toBeGreaterThan(y[0] + 0.2);
  });
  it('LUT с силой: смесь с исходным', () => {
    const l = parseCube(cubeText(5, (r, g, b) => [b, g, r]));
    const half = gradePixel({ lut: { path: 'x', name: 'x', amount: 0.5 } }, l, [1, 0, 0]);
    expect(half.map((v) => +v.toFixed(3))).toEqual([0.5, 0, 0.5]);
  });
});
