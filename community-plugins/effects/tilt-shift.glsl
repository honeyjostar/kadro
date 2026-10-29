// Name: Игрушечный город
// Author: Kadro
// License: MIT
// Description: Тилт-шифт: резкая полоса посередине, размытые верх и низ, сочные цвета — город как макет
// Tags: lens, blur, color
// @range(0, 1) Где резко (по высоте)
uniform float focus; // = 0.45
// @range(0.03, 0.4) Ширина резкой полосы
uniform float band; // = 0.12

vec4 effect(vec2 uv) {
  vec4 src = getColor(uv);
  float d = max(0.0, abs(uv.y - focus) - band);
  float blur = clamp(d * 3.5, 0.0, 1.0) * amount;
  vec2 r = vec2(blur * 0.014) * vec2(1.0 / ratio, 1.0);
  vec3 acc = vec3(0.0);
  float w = 0.0;
  for (int j = -3; j <= 3; j++) {
    for (int i = -3; i <= 3; i++) {
      vec2 o = vec2(float(i), float(j)) / 3.0;
      float k = 1.5 - length(o);
      if (k <= 0.0) continue;
      acc += getColor(clamp(uv + o * r, 0.0, 1.0)).rgb * k;
      w += k;
    }
  }
  vec3 c = acc / w;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.0 + 0.45 * amount);
  c = (c - 0.5) * (1.0 + 0.12 * amount) + 0.5;
  return vec4(clamp(c, 0.0, 1.0), src.a);
}
