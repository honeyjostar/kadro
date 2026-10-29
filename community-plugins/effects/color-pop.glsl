// Name: Один цвет
// Author: Kadro
// License: MIT
// Description: Всё чёрно-белое, кроме одного цвета — например, красного платья или жёлтого такси
// Tags: color
// @range(0, 360) Оттенок (0 — красный, 120 — зелёный, 220 — синий)
uniform float hue; // = 0.0
// @range(5, 90) Допуск
uniform float spread; // = 28.0

vec3 toHsv(vec3 c) {
  vec4 k = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, k.wz), vec4(c.gb, k.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  vec3 h = toHsv(c.rgb);
  float dh = abs(h.x * 360.0 - hue);
  dh = min(dh, 360.0 - dh);
  float keep = (1.0 - smoothstep(spread * 0.6, spread, dh)) * smoothstep(0.1, 0.28, h.y);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 o = mix(vec3(l), c.rgb * (1.0 + 0.15 * keep), keep);
  return vec4(mix(c.rgb, o, amount), c.a);
}
