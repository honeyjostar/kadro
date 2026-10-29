// Name: Карандаш
// Author: Kadro
// License: MIT
// Description: Рисунок простым карандашом на бумаге: контуры и штриховка в тенях
// Tags: art, sketch
// @range(0.5, 4) Толщина линий
uniform float thickness; // = 1.5
// @range(0, 1) Штриховка
uniform float hatching; // = 0.6

float lum(vec2 p) { return dot(getColor(clamp(p, 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114)); }

vec4 effect(vec2 uv) {
  vec4 src = getColor(uv);
  vec2 e = vec2(thickness / 720.0) * vec2(1.0 / ratio, 1.0);
  float tl = lum(uv + vec2(-e.x, e.y)); float t = lum(uv + vec2(0.0, e.y)); float tr = lum(uv + vec2(e.x, e.y));
  float l = lum(uv + vec2(-e.x, 0.0));                                       float r = lum(uv + vec2(e.x, 0.0));
  float bl = lum(uv + vec2(-e.x, -e.y)); float b = lum(uv + vec2(0.0, -e.y)); float br = lum(uv + vec2(e.x, -e.y));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float ink = smoothstep(0.06, 0.45, length(vec2(gx, gy)));
  float L = lum(uv);
  vec2 px = uv * vec2(ratio, 1.0) * 720.0;
  float h1 = smoothstep(0.55, 0.2, L) * smoothstep(0.35, 0.0, abs(fract((px.x + px.y) / 6.0) - 0.5));
  float h2 = smoothstep(0.3, 0.05, L) * smoothstep(0.35, 0.0, abs(fract((px.x - px.y) / 6.0) - 0.5));
  float val = clamp(ink + (h1 + h2) * 0.55 * hatching, 0.0, 1.0);
  vec3 paper = vec3(0.965, 0.955, 0.925);
  vec3 col = mix(paper, vec3(0.17, 0.17, 0.2), val);
  return vec4(mix(src.rgb, col, amount), src.a);
}
