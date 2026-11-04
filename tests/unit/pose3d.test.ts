// 3D: положение по трём осям, сдвиг и приближение, переход от начального положения к конечному, ось вращения.
import { describe, expect, it } from 'vitest';
import { easeK, HALF_VIEW, pose, poseAt, startPose } from '../../src/renderer/three/scene3d';
import type { Model3D } from '../../src/shared/types';

const base = (over: Partial<Model3D> = {}): Model3D => ({
  source: 'shape:cube', name: 'Кубик', motion: 'still', speed: 1, tiltX: 10, turnY: 20, material: 'gloss', color: '#fff', light: 'studio', duration: 4, ...over,
});
const deg = (r: number) => (r * 180) / Math.PI;

describe('положение 3D', () => {
  it('старый проект (только наклон и поворот) — как раньше', () => {
    expect(startPose(base())).toEqual({ tiltX: 10, turnY: 20, rollZ: 0, posX: 0, posY: 0, zoom: 1 });
    const p = pose(base(), 1);
    expect(deg(p.rx)).toBeCloseTo(10);
    expect(deg(p.ry)).toBeCloseTo(20);
    expect(p).toMatchObject({ x: 0, y: 0, s: 1 });
  });

  it('крен, сдвиг и приближение', () => {
    const p = pose(base({ rollZ: -30, posX: 0.5, posY: -0.25, zoom: 2 }), 0);
    expect(deg(p.rz)).toBeCloseTo(-30);
    expect(p.x).toBeCloseTo(0.5 * HALF_VIEW);
    expect(p.y).toBeCloseTo(-0.25 * HALF_VIEW);
    expect(p.s).toBeCloseTo(2);
  });

  it('от угла к углу: начало, середина, конец; плавность', () => {
    const m = base({ end: { tiltX: 10, turnY: 200, rollZ: 90, posX: 1, posY: 0, zoom: 1.5 }, ease: 'linear' });
    expect(poseAt(m, 0).turnY).toBeCloseTo(20);
    expect(poseAt(m, 2).turnY).toBeCloseTo(110);
    expect(poseAt(m, 4)).toMatchObject({ turnY: 200, rollZ: 90, posX: 1, zoom: 1.5 });
    expect(poseAt(m, 9).turnY).toBeCloseTo(200); // после конца — стоит в конечном
    expect(easeK('smooth', 0.5)).toBeCloseTo(0.5);
    expect(easeK('in', 0.5)).toBeLessThan(0.2);
    expect(easeK('out', 0.5)).toBeGreaterThan(0.8);
  });

  it('вращение вокруг выбранной оси', () => {
    const spin = (spinAxis: Model3D['spinAxis']) => pose(base({ motion: 'spin', spinAxis, tiltX: 0, turnY: 0 }), 1);
    expect(deg(spin('y').ry)).toBeCloseTo(90);
    expect(deg(spin('x').rx)).toBeCloseTo(90);
    expect(deg(spin('z').rz)).toBeCloseTo(90);
    expect(deg(spin(undefined).ry)).toBeCloseTo(90);
  });
});
