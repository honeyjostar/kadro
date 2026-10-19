// Новые эффекты в экспорте: каждый собирается и рендерится, а там, где результат считается формулой, — совпадает с ней.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { EFFECTS, fxMatrixAt, letterboxBar, lookPixel, PARTICLE_EFFECTS } from '../../src/shared/effects';
import { newProject } from '../../src/shared/defaults';
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
