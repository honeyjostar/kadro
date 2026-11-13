// Корректирующий слой на настоящем экспорте: ч/б на время слоя, с маской — только внутри круга, сила — наполовину.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { addAdjustLayer } from '../../src/shared/adjust';
import { DEFAULT_MASK, } from '../../src/shared/mask';
import { newProject } from '../../src/shared/defaults';
import { addAsset, addToMain, updateClip } from '../../src/shared/timeline';
import type { MediaClip, Project } from '../../src/shared/types';
import { assetFromFile, makeSolid, pixelAt, runExport, tmpDir } from '../helpers/media';

const D = tmpDir('adjust');
const f = (n: string) => path.join(D, n);
beforeAll(() => { if (!fs.existsSync(f('red.mp4'))) makeSolid(f('red.mp4'), 'red', 4, 640, 360, 30); });

function proj(patch: Partial<MediaClip>): Project {
  let p = newProject('t', '16:9');
  p = { ...p, settings: { ...p.settings, width: 640, height: 360 } };
  p = addToMain(addAsset(p, assetFromFile('r', f('red.mp4'), 'video')), 'r', 0).project;
  const r = addAdjustLayer(p, 'adj', 1, 2);
  const c = r.project.tracks.flatMap((t) => t.clips).find((x) => x.id === r.clipId) as MediaClip;
  return updateClip(r.project, r.clipId, { color: { ...c.color, saturation: 0 }, ...patch });
}
const gray = (px: number[]) => Math.max(...px) - Math.min(...px) < 20;

describe('корректирующий слой: экспорт', () => {
  it('ч/б только на время слоя', () => {
    runExport(proj({}), f('a.mp4'), { width: 640, height: 360, fps: 30 });
    expect(gray(pixelAt(f('a.mp4'), 0.5, 320, 180))).toBe(false);
    expect(gray(pixelAt(f('a.mp4'), 2, 320, 180))).toBe(true);
    expect(gray(pixelAt(f('a.mp4'), 3.5, 320, 180))).toBe(false);
  });
  it('маска — ч/б только в круге; сила 50% — наполовину', () => {
    runExport(proj({ mask: { ...DEFAULT_MASK, shape: 'circle', w: 0.3, h: 0.5, feather: 0 } }), f('m.mp4'), { width: 640, height: 360, fps: 30 });
    expect(gray(pixelAt(f('m.mp4'), 2, 320, 180))).toBe(true);
    expect(gray(pixelAt(f('m.mp4'), 2, 30, 30))).toBe(false);
    runExport(proj({ opacity: 0.5 }), f('h.mp4'), { width: 640, height: 360, fps: 30 });
    const [r, g] = pixelAt(f('h.mp4'), 2, 320, 180);
    expect(r - g).toBeGreaterThan(40);
    expect(r - g).toBeLessThan(200);
  });
});
