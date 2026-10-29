// Name: Масляная краска
// Author: Kadro
// License: MIT
// Description: Кадр как картина маслом: мелкие детали сглаживаются в мазки, края остаются чёткими
// Tags: art, paint
// @range(1, 8) Мазок
uniform float stroke; // = 4.0

vec4 effect(vec2 uv) {
  vec4 src = getColor(uv);
  // шаг сетки — доля высоты кадра, поэтому в превью и в экспорте одинаково
  vec2 st = vec2(stroke / 2880.0) * vec2(1.0 / ratio, 1.0);
  vec3 m0 = vec3(0.0); vec3 m1 = vec3(0.0); vec3 m2 = vec3(0.0); vec3 m3 = vec3(0.0);
  vec3 s0 = vec3(0.0); vec3 s1 = vec3(0.0); vec3 s2 = vec3(0.0); vec3 s3 = vec3(0.0);
  for (int j = 0; j <= 4; j++) {
    for (int i = 0; i <= 4; i++) {
      vec2 o = vec2(float(i), float(j)) * st;
      vec3 c;
      c = getColor(uv + vec2(-o.x, -o.y)).rgb; m0 += c; s0 += c * c;
      c = getColor(uv + vec2(o.x, -o.y)).rgb;  m1 += c; s1 += c * c;
      c = getColor(uv + vec2(o.x, o.y)).rgb;   m2 += c; s2 += c * c;
      c = getColor(uv + vec2(-o.x, o.y)).rgb;  m3 += c; s3 += c * c;
    }
  }
  m0 /= 25.0; m1 /= 25.0; m2 /= 25.0; m3 /= 25.0;
  vec3 v0 = abs(s0 / 25.0 - m0 * m0); vec3 v1 = abs(s1 / 25.0 - m1 * m1);
  vec3 v2 = abs(s2 / 25.0 - m2 * m2); vec3 v3 = abs(s3 / 25.0 - m3 * m3);
  float a0 = v0.r + v0.g + v0.b; float a1 = v1.r + v1.g + v1.b;
  float a2 = v2.r + v2.g + v2.b; float a3 = v3.r + v3.g + v3.b;
  vec3 best = m0; float bv = a0;
  if (a1 < bv) { best = m1; bv = a1; }
  if (a2 < bv) { best = m2; bv = a2; }
  if (a3 < bv) { best = m3; }
  return vec4(mix(src.rgb, best, amount), src.a);
}
