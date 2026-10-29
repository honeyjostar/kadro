// Name: Полутон
// Author: Kadro
// License: MIT
// Description: Кадр из точек трёх красок, как в журнале или старом комиксе
// Tags: print, comic, retro
// @range(4, 30) Размер точки
uniform float cell; // = 9.0
// @range(0, 1) Цвет (0 — чёрно-белый)
uniform float colored; // = 1.0

// одна сетка точек, повёрнутая на ang; mask — какую краску считаем (голубая, пурпурная, жёлтая)
float screen(vec2 px, float size, float ang, vec3 mask, float gray) {
  float s = sin(ang);
  float c = cos(ang);
  vec2 p = mat2(c, s, -s, c) * px / size;
  vec2 center = floor(p) + 0.5;
  vec2 cpx = mat2(c, -s, s, c) * center * size;
  vec3 col = getColor(clamp(cpx / resolution, 0.0, 1.0)).rgb;
  float v = gray > 0.5 ? 1.0 - dot(col, vec3(0.299, 0.587, 0.114)) : dot(1.0 - col, mask);
  float r = sqrt(clamp(v, 0.0, 1.0)) * 0.74;
  float aa = 1.5 / size;
  return 1.0 - smoothstep(r - aa, r + aa, length(p - center));
}

vec4 effect(vec2 uv) {
  vec4 src = getColor(uv);
  float size = cell * resolution.y / 720.0;   // одинаково в превью и в экспорте
  vec2 px = uv * resolution;
  vec3 paper = vec3(0.97, 0.955, 0.92);
  vec3 col;
  if (colored > 0.5) {
    float cy = screen(px, size, 0.2618, vec3(1.0, 0.0, 0.0), 0.0);
    float mg = screen(px, size, 1.309, vec3(0.0, 1.0, 0.0), 0.0);
    float ye = screen(px, size, 0.0, vec3(0.0, 0.0, 1.0), 0.0);
    col = paper * (1.0 - vec3(cy, mg, ye) * 0.92);
  } else {
    float k = screen(px, size, 0.7854, vec3(0.0), 1.0);
    col = mix(paper, vec3(0.08), k);
  }
  return vec4(mix(src.rgb, col, amount), src.a);
}
