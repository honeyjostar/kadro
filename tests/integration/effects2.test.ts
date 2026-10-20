// Новые эффекты в экспорте: каждый собирается и рендерится, а там, где результат считается формулой, — совпадает с ней.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { EFFECTS, fxMatrixAt, letterboxBar, lookPixel, PARTICLE_EFFECTS } from '../../src/shared/effects';
import { DEFAULT_COLOR, newProject } from '../../src/shared/defaults';
import { FILTER_PRESETS, applyColorToPixel, effectiveColor } from '../../src/shared/color';
import { gradePixel } from '../../src/shared/grade';
import { CLIP_ANIMS, clipAnimAt } from '../../src/shared/clipAnim';
import { layerQuad, type Quad } from '../../src/shared/perspective';
import { placeOnCanvas } from '../../src/shared/geometry';
import { addAsset, addToMain, mainTrack, updateClip } from '../../src/shared/timeline';
import type { Effect, EffectType, MediaClip, Project } from '../../src/shared/types';
import { assetFromFile, ff, makeSolid, near, pixelAt, probe, runExport, tmpDir } from '../helpers/media';

const D = tmpDir('effects2');
const f = (n: string) => path.join(D, n);
const ORANGE = [230, 120, 40];

beforeAll(() => {
  if (!fs.existsSync(f('pattern.mp4'))) {
    ff(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', f('pattern.mp4')]);
  }
  if (!fs.existsSync(f('orange.mp4'))) makeSolid(f('orange.mp4'), '0xe67828', 3, 640, 360, 30);
});

function proj(file: string, effects: Effect[]): Project {
  let p = newProject('fx', '16:9');
  p = addAsset(p, assetFromFile('v', f(file), 'video'));
  p = addToMain(p, 'v', 0).project;
  const id = (mainTrack(p).clips[0] as MediaClip).id;
  return updateClip(p, id, { effects });
}
const opts = { width: 640, height: 360, fps: 30 };

describe('новые эффекты: собираются и рендерятся', () => {
  const types = EFFECTS.map((e) => e.type).filter((t) => !PARTICLE_EFFECTS.includes(t));
  for (const type of types) {
    it(type, () => {
      const out = f(`fx_${type}.mp4`);
      runExport(proj('pattern.mp4', [{ type, amount: 0.7 }]), out, opts);
      expect(Math.abs(probe(out).duration - 3)).toBeLessThan(0.1);
    });
  }
});

describe('новые эффекты: результат по формуле', () => {
  const orange = (effects: Effect[], name: string) => { const out = f(`o_${name}.mp4`); runExport(proj('orange.mp4', effects), out, opts); return out; };
  const toRgb = (c: [number, number, number]) => c.map((v) => Math.round(v * 255));

  for (const look of ['oldfilm', 'comic', 'duotone', 'noir', 'cyber', 'thermal', 'nightvision', 'solarize'] as EffectType[]) {
    it(`образ ${look}: цвет как у таблицы`, () => {
      const fx: Effect[] = [{ type: look, amount: 0.8 }];
      const out = orange(fx, look);
      const want = toRgb(lookPixel(fx, [ORANGE[0] / 255, ORANGE[1] / 255, ORANGE[2] / 255]));
      const got = pixelAt(out, 1.5, 320, 180);
      expect(near(got, want, 12), `${look}: ${got} ≠ ${want}`).toBe(true);
    });
  }

  it('стробоскоп: тёмные и светлые кадры там, где по формуле', () => {
    const fx: Effect[] = [{ type: 'strobe', amount: 1 }];
    const out = orange(fx, 'strobe');
    for (const t of [0.05, 0.18, 1.3, 1.43]) {
      const m = fxMatrixAt(fx, t + 1e-3);
      const k = m ? m[0][0] : 1;
      const want = ORANGE.map((v) => v * k);
      expect(near(pixelAt(out, t + 0.01, 320, 180), want, 14), `t=${t}`).toBe(true);
    }
  });

  it('кино-полосы: сверху и снизу чёрные полосы нужной высоты', () => {
    const out = orange([{ type: 'letterbox', amount: 0.5 }], 'letterbox');
    const bar = letterboxBar(360, 0.5);
    expect(near(pixelAt(out, 1, 320, bar - 3), [0, 0, 0], 10)).toBe(true);
    expect(near(pixelAt(out, 1, 320, bar + 4), ORANGE, 14)).toBe(true);
    expect(near(pixelAt(out, 1, 320, 360 - bar + 3), [0, 0, 0], 10)).toBe(true);
  });

  it('кино-полосы у основной дорожки — по краям кадра, даже когда квадратное видео заполняет кадр', () => {
    if (!fs.existsSync(f('orange_sq.mp4'))) makeSolid(f('orange_sq.mp4'), '0xe67828', 3, 360, 360, 30);
    let p = newProject('lb', '16:9');
    p = addAsset(p, assetFromFile('v', f('orange_sq.mp4'), 'video'));
    p = addToMain(p, 'v', 0).project;
    const id = (mainTrack(p).clips[0] as MediaClip).id;
    p = updateClip(p, id, { fit: 'cover', effects: [{ type: 'letterbox', amount: 0.5 }] });
    const out = f('o_letterbox_cover.mp4');
    runExport(p, out, opts);
    const bar = letterboxBar(360, 0.5);
    expect(near(pixelAt(out, 1, 320, 3), [0, 0, 0], 10)).toBe(true);
    expect(near(pixelAt(out, 1, 320, bar - 3), [0, 0, 0], 10)).toBe(true);
    expect(near(pixelAt(out, 1, 320, bar + 4), ORANGE, 14)).toBe(true);
    expect(near(pixelAt(out, 1, 320, 360 - bar + 3), [0, 0, 0], 10)).toBe(true);
  });

  it('сияние и засветка делают кадр светлее, но не меняют размер', () => {
    const base = pixelAt(orange([], 'none'), 1, 320, 180);
    for (const type of ['glow', 'lightleak'] as EffectType[]) {
      const out = orange([{ type, amount: 1 }], type);
      const px = pixelAt(out, 1, 320, 100);
      expect(px[0] + px[1] + px[2], type).toBeGreaterThanOrEqual(base[0] + base[1] + base[2] - 6);
      expect(probe(out).width).toBe(640);
    }
  });

  it('наезд: к концу клипа кадр крупнее, чем в начале', () => {
    const out = f('zoom.mp4');
    runExport(proj('pattern.mp4', [{ type: 'zoomin', amount: 1 }]), out, opts);
    const a = f('zoom_a.png'); const b = f('zoom_b.png');
    ff(['-ss', '0.05', '-i', out, '-frames:v', '1', a]);
    ff(['-ss', '2.9', '-i', out, '-frames:v', '1', b]);
    expect(fs.statSync(a).size).not.toBe(fs.statSync(b).size);
  });
});

describe('фильтры: экспорт совпадает с расчётом (основа + «характер»)', () => {
  const colors: [string, number[]][] = [['orange.mp4', ORANGE], ['navy.mp4', [30, 50, 90]]];
  beforeAll(() => { if (!fs.existsSync(f('navy.mp4'))) makeSolid(f('navy.mp4'), '0x1e325a', 3, 640, 360, 30); });
  for (const preset of FILTER_PRESETS.filter((x) => x.id !== 'none')) {
    it(`фильтр «${preset.label}» (${preset.id})`, () => {
      for (const [file, rgb] of colors) {
        let p = newProject('flt', '16:9');
        p = addAsset(p, assetFromFile('v', f(file), 'video'));
        p = addToMain(p, 'v', 0).project;
        const id = (mainTrack(p).clips[0] as MediaClip).id;
        const color = { ...DEFAULT_COLOR, preset: preset.id, presetAmount: 0.8 };
        p = updateClip(p, id, { color });
        const out = f(`flt_${preset.id}_${file}`);
        runExport(p, out, opts);
        const base = applyColorToPixel(rgb as [number, number, number], effectiveColor(color));
        const want = gradePixel({}, null, [base[0] / 255, base[1] / 255, base[2] / 255], color).map((v) => v * 255);
        const got = pixelAt(out, 1.5, 320, 180);
        expect(near(got, want, 9), `${preset.id} на ${file}: ${got} ≠ ${want.map(Math.round)}`).toBe(true);
      }
    });
  }
});

describe('анимации появления и исчезновения клипа: экспорт совпадает с расчётом', () => {
  const run = (anim: MediaClip['anim'], name: string) => {
    let p = newProject('anim', '16:9');
    p = addAsset(p, assetFromFile('v', f('orange.mp4'), 'video'));
    p = addToMain(p, 'v', 0).project;
    const id = (mainTrack(p).clips[0] as MediaClip).id;
    p = updateClip(p, id, { anim });
    const out = f(`anim_${name}.mp4`);
    runExport(p, out, opts);
    return out;
  };
  const half = ORANGE.map((v) => v * 0.5);
  it('проявление: на середине — половина яркости', () => {
    const out = run({ in: { type: 'fade', dur: 1 } }, 'fade');
    const op = clipAnimAt({ anim: { in: { type: 'fade', dur: 1 } } }, 0.5, 3).opacity;
    expect(op).toBeCloseTo(0.5, 6);
    expect(near(pixelAt(out, 0.5, 320, 180), half, 12)).toBe(true);
    expect(near(pixelAt(out, 1.5, 320, 180), ORANGE, 10)).toBe(true);
  });
  it('выезд слева: правый край ещё пустой', () => {
    const out = run({ in: { type: 'left', dur: 1 } }, 'left');
    const g = clipAnimAt({ anim: { in: { type: 'left', dur: 1 } } }, 0.5, 3);
    const edge = 640 * (1 + g.dx); // правый край клипа
    expect(near(pixelAt(out, 0.5, Math.round(edge + 20), 180), [0, 0, 0], 12)).toBe(true);
    expect(near(pixelAt(out, 0.5, Math.round(edge - 20), 180), ORANGE, 14)).toBe(true);
  });
  it('из далёкого: по краям рамка, внутри — полупрозрачный кадр', () => {
    const out = run({ in: { type: 'zoomin', dur: 1 } }, 'zoomin');
    const g = clipAnimAt({ anim: { in: { type: 'zoomin', dur: 1 } } }, 0.5, 3);
    const margin = (640 * (1 - g.scale)) / 2;
    expect(near(pixelAt(out, 0.5, Math.max(1, Math.round(margin - 8)), 180), [0, 0, 0], 12)).toBe(true);
    expect(near(pixelAt(out, 0.5, Math.round(margin + 12), 180), ORANGE.map((v) => v * g.opacity), 14)).toBe(true);
  });
  it('исчезновение «подброс»: в конце кадр уезжает вверх с отскоком', () => {
    const out = run({ out: { type: 'drop', dur: 1 } }, 'drop');
    const g = clipAnimAt({ anim: { out: { type: 'drop', dur: 1 } } }, 2.5, 3);
    const bottom = 360 * (1 + g.dy);
    expect(g.dy).toBeLessThan(-0.1);
    expect(near(pixelAt(out, 2.5, 320, Math.round(bottom + 15)), [0, 0, 0], 12)).toBe(true);
    expect(near(pixelAt(out, 2.5, 320, Math.round(bottom - 15)), ORANGE, 14)).toBe(true);
  });
  it('все анимации собираются в видео нужной длины', () => {
    for (const a of CLIP_ANIMS) {
      const out = run({ in: { type: a.type, dur: 0.6 }, out: { type: a.type, dur: 0.6 } }, `all_${a.type}`);
      expect(Math.abs(probe(out).duration - 3), a.type).toBeLessThan(0.1);
    }
  }, 120_000);
});

describe('перспектива: наклон и «Углы» в экспорте — по той же формуле, что в плеере', () => {
  const W = 640; const H = 360;
  const run = (patch: Partial<MediaClip>, name: string) => {
    let p = newProject('persp', '16:9');
    p = addAsset(p, assetFromFile('v', f('orange.mp4'), 'video'));
    p = addToMain(p, 'v', 0).project;
    const id = (mainTrack(p).clips[0] as MediaClip).id;
    p = updateClip(p, id, patch);
    const out = f(`persp_${name}.mp4`);
    runExport(p, out, opts);
    return out;
  };
  /** Точка внутри четырёхугольника у угла i и снаружи за углом. */
  const probe = (q: Quad, i: number, inside: boolean): [number, number] => {
    const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
    const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    const k = inside ? 0.85 : 1.15;
    return [Math.round(cx + (q[i][0] - cx) * k), Math.round(cy + (q[i][1] - cy) * k)];
  };
  const check = (out: string, q: Quad) => {
    for (let i = 0; i < 4; i++) {
      const [ix, iy] = probe(q, i, true);
      expect(near(pixelAt(out, 1, ix, iy), ORANGE, 16), `внутри у угла ${i}: ${ix},${iy}`).toBe(true);
      const [ox, oy] = probe(q, i, false);
      if (ox > 2 && oy > 2 && ox < W - 2 && oy < H - 2) expect(near(pixelAt(out, 1, ox, oy), [0, 0, 0], 16), `снаружи у угла ${i}: ${ox},${oy}`).toBe(true);
    }
  };
  for (const [name, tilt] of [['вперёд', { x: 45, y: 0 }], ['вбок', { x: 0, y: -50 }], ['оба', { x: 30, y: 35 }]] as const) {
    it(`наклон ${name}`, () => {
      const transform = { x: 0.05, y: -0.03, scale: 0.6, rotation: 12 };
      const out = run({ transform, tilt }, `tilt_${name}`);
      const pl = placeOnCanvas(W, H, 640, 360, 'contain', transform);
      check(out, layerQuad(pl.w / 2, pl.h / 2, pl.cx, pl.cy, 12, tilt, W, H));
    });
  }
  it('«Углы»: картинка натянута на произвольный четырёхугольник', () => {
    const pin: MediaClip['pin'] = [0.2, 0.15, 0.85, 0.3, 0.1, 0.9, 0.7, 0.75];
    const out = run({ pin }, 'pin');
    const q: Quad = [[pin[0] * W, pin[1] * H], [pin[2] * W, pin[3] * H], [pin[4] * W, pin[5] * H], [pin[6] * W, pin[7] * H]];
    check(out, q);
  });
});
