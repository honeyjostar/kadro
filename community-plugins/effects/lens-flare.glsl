// Name: Блик объектива
// Author: Kadro
// License: MIT
// Description: Солнечный блик с лучами и цветными «зайчиками» через весь кадр, слегка плывёт
// Tags: light, lens
// @range(0, 1) Солнце по горизонтали
uniform float sunX; // = 0.22
// @range(0, 1) Солнце по вертикали
uniform float sunY; // = 0.78
// @range(0, 1) Движение
uniform float drift; // = 0.4

float ghost(vec2 p, vec2 at, float r) { return smoothstep(r, r * 0.55, length(p - at)); }

vec4 effect(vec2 uv) {
  vec4 src = getColor(uv);
  vec2 asp = vec2(ratio, 1.0);
  vec2 p = (uv - 0.5) * asp;
  vec2 s = (vec2(sunX, sunY) - 0.5) * asp + drift * 0.08 * vec2(sin(time * 0.7), cos(time * 0.5));
  vec2 d = p - s;
  float dist = length(d);
  float ang = atan(d.y, d.x);
  vec3 warm = vec3(1.0, 0.86, 0.68);
  float glow = exp(-dist * 7.0) * 1.2 + exp(-dist * 2.2) * 0.25;
  float rays = pow(max(0.0, cos(ang * 6.0 + 0.4)), 24.0) * exp(-dist * 3.0) * 0.6;
  rays += pow(max(0.0, cos(ang * 11.0 - 1.1)), 40.0) * exp(-dist * 4.0) * 0.35;
  vec3 f = warm * (glow + rays);
  // «зайчики» — на линии от солнца через центр кадра
  f += vec3(0.35, 0.55, 1.0) * ghost(p, -s * 0.35, 0.05) * 0.25;
  f += vec3(0.4, 1.0, 0.6) * ghost(p, -s * 0.7, 0.09) * 0.16;
  f += vec3(1.0, 0.5, 0.8) * ghost(p, -s * 1.1, 0.14) * 0.12;
  f += vec3(1.0, 0.8, 0.4) * ghost(p, s * 0.45, 0.035) * 0.3;
  // мягкое кольцо вокруг центра
  float ring = smoothstep(0.03, 0.0, abs(length(p + s * 0.2) - 0.32)) * 0.08;
  f += vec3(0.6, 0.8, 1.0) * ring;
  vec3 col = src.rgb + f * amount;
  return vec4(clamp(col, 0.0, 1.0), src.a);
}
