// Name: Кинескоп
// Author: Kadro
// License: MIT
// Description: Старый телевизор: выпуклое стекло, строки развёртки, цветная маска и тёмные углы
// Tags: retro, tv, distort
// @range(0, 1) Выпуклость
uniform float curve; // = 0.5
// @range(120, 600) Строк на экране
uniform float lines; // = 300.0

vec4 effect(vec2 uv) {
  vec2 d = uv - 0.5;
  float k = curve * 0.45 * amount;
  vec2 p = 0.5 + d * (1.0 + k * dot(d, d) * 2.0);
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
  float off = 0.0018 * amount;
  vec3 col = vec3(getColor(p + vec2(off, 0.0)).r, getColor(p).g, getColor(p - vec2(off, 0.0)).b);
  // строки развёртки
  float scan = 0.5 + 0.5 * sin(p.y * lines * 6.28318);
  col *= mix(1.0, 0.72 + 0.28 * scan, amount);
  // цветная маска (триады) — по ширине примерно втрое больше столбцов, чем строк
  float m = mod(floor(p.x * lines * ratio * 3.0), 3.0);
  vec3 mask = m < 1.0 ? vec3(1.0, 0.75, 0.75) : m < 2.0 ? vec3(0.75, 1.0, 0.75) : vec3(0.75, 0.75, 1.0);
  col *= mix(vec3(1.0), mask, 0.6 * amount);
  // тёмные углы и лёгкое мерцание
  float v = 16.0 * p.x * p.y * (1.0 - p.x) * (1.0 - p.y);
  col *= mix(1.0, pow(v, 0.3), amount);
  col *= 1.0 + amount * (0.28 + 0.025 * sin(time * 50.0));
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
