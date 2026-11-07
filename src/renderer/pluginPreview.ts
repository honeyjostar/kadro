// Живые превью шейдеров (каталог плагинов): два настоящих кадра — «дорога на закате» и «неон» — и отрисовка
// перехода или эффекта на маленький холст через общий GlRunner.
import type { GlDef } from '../shared/gl/glsl';
import { glRunner } from './engine/gl';
import { sampleCanvas } from './sampleFrames';

export const PREVIEW_W = 320;
export const PREVIEW_H = 180;

/** Переход — с дороги на закате на мотоциклиста в неоне, эффект — на мотоциклисте (настоящие кадры, см. sampleFrames). */
const sample = (): [HTMLCanvasElement, HTMLCanvasElement] => [sampleCanvas('road', PREVIEW_W, PREVIEW_H), sampleCanvas('neon', PREVIEW_W, PREVIEW_H)];

/**
 * Нарисовать кадр шейдера на холст: переход — «закат» → «день» при progress, эффект — на «закате» во
 * времени time. false — шейдер не собрался или нет WebGL.
 */
export function drawPreview(def: GlDef, out: HTMLCanvasElement, progress: number, time: number): boolean {
  const [a, b] = sample();
  const run = glRunner();
  const frame = def.kind === 'transition'
    ? run.transition(def, progress, a, b, PREVIEW_W, PREVIEW_H)
    : run.effect(def, b, PREVIEW_W, PREVIEW_H, 1, time, (time % 4) / 4);
  const g = out.getContext('2d');
  if (!g) return false;
  if (out.width !== PREVIEW_W) { out.width = PREVIEW_W; out.height = PREVIEW_H; }
  g.drawImage(frame ?? (def.kind === 'transition' ? a : b), 0, 0, PREVIEW_W, PREVIEW_H);
  return !!frame;
}
