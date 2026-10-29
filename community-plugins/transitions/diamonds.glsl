// Name: Ромбы
// Author: Kadro
// License: MIT
// Description: Следующий кадр проступает сеткой растущих ромбов — волной из угла
// Tags: shape, grid
// @range(4, 30) Ромбов в ряд
uniform float count; // = 12.0

vec4 transition(vec2 uv) {
  vec2 n = vec2(count, count / ratio);
  vec2 g = uv * n;
  vec2 f = fract(g) - 0.5;
  vec2 cuv = (floor(g) + 0.5) / n;
  float delay = (cuv.x + 1.0 - cuv.y) * 0.5;
  float t = clamp(progress * 1.6 - delay * 0.6, 0.0, 1.0);
  float d = abs(f.x) + abs(f.y);
  float size = t * 1.1 - 0.05;
  return mix(getFromColor(uv), getToColor(uv), smoothstep(size + 0.03, size - 0.03, d));
}
