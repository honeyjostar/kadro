// Живые превью шейдеров (каталог плагинов): две нарисованные кодом сцены — «закат» и «день» — и отрисовка
// перехода или эффекта на маленький холст через общий GlRunner.
import type { GlDef } from '../shared/gl/glsl';
import { glRunner } from './engine/gl';

export const PREVIEW_W = 320;
export const PREVIEW_H = 180;

let scenes: [HTMLCanvasElement, HTMLCanvasElement] | null = null;

function sunset(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = PREVIEW_W; c.height = PREVIEW_H;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 120);
  sky.addColorStop(0, '#3b2a6b'); sky.addColorStop(0.55, '#d4507a'); sky.addColorStop(1, '#ffb25e');
  g.fillStyle = sky; g.fillRect(0, 0, PREVIEW_W, 120);
  const glow = g.createRadialGradient(214, 96, 4, 214, 96, 70);
  glow.addColorStop(0, 'rgba(255,236,170,0.95)'); glow.addColorStop(0.25, 'rgba(255,170,90,0.6)'); glow.addColorStop(1, 'rgba(255,120,80,0)');
  g.fillStyle = glow; g.fillRect(0, 0, PREVIEW_W, 140);
  g.fillStyle = '#fff1c4'; g.beginPath(); g.arc(214, 96, 17, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4a2350';
  g.beginPath(); g.moveTo(0, 120); g.lineTo(0, 86); g.lineTo(46, 62); g.lineTo(92, 92); g.lineTo(140, 70); g.lineTo(178, 104); g.lineTo(178, 120); g.fill();
  g.fillStyle = '#2b1638';
  g.beginPath(); g.moveTo(150, 120); g.lineTo(250, 78); g.lineTo(290, 98); g.lineTo(320, 84); g.lineTo(320, 120); g.fill();
  const sea = g.createLinearGradient(0, 120, 0, PREVIEW_H);
  sea.addColorStop(0, '#c2486e'); sea.addColorStop(1, '#2a1a4a');
  g.fillStyle = sea; g.fillRect(0, 120, PREVIEW_W, 60);
  g.fillStyle = 'rgba(255,220,150,0.75)';
  for (let i = 0; i < 9; i++) g.fillRect(214 - 26 + Math.sin(i * 2.1) * 8, 124 + i * 6, 52 - i * 4, 2);
  g.fillStyle = '#e8303a'; g.beginPath(); g.ellipse(64, 138, 18, 7, 0, 0, Math.PI * 2); g.fill(); // красная лодка
  g.fillStyle = '#f7f1e8'; g.beginPath(); g.moveTo(64, 132); g.lineTo(64, 104); g.lineTo(82, 130); g.fill();
  return c;
}

function daylight(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = PREVIEW_W; c.height = PREVIEW_H;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 110);
  sky.addColorStop(0, '#2f7fd6'); sky.addColorStop(1, '#a6dcff');
  g.fillStyle = sky; g.fillRect(0, 0, PREVIEW_W, 112);
  g.fillStyle = '#ffffff';
  for (const [x, y, s] of [[60, 34, 1], [210, 24, 1.3], [282, 54, 0.8]]) {
    g.beginPath(); g.arc(x, y, 12 * s, 0, Math.PI * 2); g.arc(x + 14 * s, y - 6 * s, 15 * s, 0, Math.PI * 2); g.arc(x + 30 * s, y, 11 * s, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#58b368'; g.beginPath(); g.moveTo(0, 112); g.quadraticCurveTo(90, 64, 190, 108); g.quadraticCurveTo(250, 84, 320, 100); g.lineTo(320, 180); g.lineTo(0, 180); g.fill();
  g.fillStyle = '#3d8f4f'; g.beginPath(); g.moveTo(0, 150); g.quadraticCurveTo(140, 116, 320, 146); g.lineTo(320, 180); g.lineTo(0, 180); g.fill();
  g.fillStyle = '#f4e9d8'; g.fillRect(222, 104, 46, 34);
  g.fillStyle = '#c8343c'; g.beginPath(); g.moveTo(216, 106); g.lineTo(245, 82); g.lineTo(274, 106); g.fill();
  g.fillStyle = '#ffd34d'; g.fillRect(232, 114, 10, 10); g.fillRect(250, 114, 10, 10);
  g.fillStyle = '#6b4a2e'; g.fillRect(70, 120, 6, 26);
  g.fillStyle = '#2f7a3e'; g.beginPath(); g.arc(73, 112, 18, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffcc33'; g.beginPath(); g.arc(28, 26, 13, 0, Math.PI * 2); g.fill();
  return c;
}

const sample = () => (scenes ??= [sunset(), daylight()]);

/**
 * Нарисовать кадр шейдера на холст: переход — «закат» → «день» при progress, эффект — на «закате» во
 * времени time. false — шейдер не собрался или нет WebGL.
 */
export function drawPreview(def: GlDef, out: HTMLCanvasElement, progress: number, time: number): boolean {
  const [a, b] = sample();
  const run = glRunner();
  const frame = def.kind === 'transition'
    ? run.transition(def, progress, a, b, PREVIEW_W, PREVIEW_H)
    : run.effect(def, a, PREVIEW_W, PREVIEW_H, 1, time, (time % 4) / 4);
  const g = out.getContext('2d');
  if (!g) return false;
  if (out.width !== PREVIEW_W) { out.width = PREVIEW_W; out.height = PREVIEW_H; }
  g.drawImage(frame ?? a, 0, 0, PREVIEW_W, PREVIEW_H);
  return !!frame;
}
