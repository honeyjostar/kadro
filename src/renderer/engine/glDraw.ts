// Переходы и эффекты-шейдеры в плеере, миниатюрах и экспорте: тот же вызов, что и для обычных.
import { isGlType } from '../../shared/gl/glsl';
import { drawTransition } from '../../shared/transitions';
import type { Effect, MediaClip, TransitionType } from '../../shared/types';
import { glDef } from '../glRegistry';
import { glRunner } from './gl';

/** Переход любого вида. Шейдер не собрался или пропал (плагин удалён) — простое растворение. */
export function drawAnyTransition(ctx: CanvasRenderingContext2D, type: TransitionType, p: number, a: HTMLCanvasElement, b: HTMLCanvasElement,
  W: number, H: number, scratch: HTMLCanvasElement, params?: Record<string, number | boolean | number[]>): void {
  if (!isGlType(type)) { drawTransition(ctx, type, p, a, b, W, H, scratch); return; }
  const def = glDef(type);
  const out = def ? glRunner().transition(def, p, a, b, W, H, params) : null;
  if (out) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(out, 0, 0, W, H);
    ctx.restore();
    return;
  }
  drawTransition(ctx, 'fade', p, a, b, W, H, scratch);
}

export const glEffectsOf = (list: Effect[] | undefined): Effect[] => (list ?? []).filter((e) => isGlType(e.type) && e.amount > 0.001);

/** Эффекты-шейдеры клипа — по порядку добавления, поверх картинки слоя. */
export function applyGlEffects(layer: HTMLCanvasElement, c: MediaClip, local: number, dur: number): void {
  const list = glEffectsOf(c.effects);
  if (!list.length) return;
  const lc = layer.getContext('2d')!;
  for (const e of list) {
    const def = glDef(e.type);
    if (!def) continue;
    const out = glRunner().effect(def, layer, layer.width, layer.height, e.amount, local, dur > 0 ? local / dur : 0, e.params);
    if (!out) continue;
    lc.save();
    lc.globalCompositeOperation = 'copy';
    lc.drawImage(out, 0, 0, layer.width, layer.height);
    lc.restore();
  }
}
