// Name: Резкий сдвиг
// Author: Kadro
// License: MIT
// Description: Камера резко уезжает вбок со смазом — следующий кадр прилетает следом
// Tags: move, blur
// @range(-1, 1) Направление (1 — вправо, −1 — влево)
uniform float direction; // = 1.0

vec4 transition(vec2 uv) {
  float p = progress;
  float e = p < 0.5 ? 4.0 * p * p * p : 1.0 - pow(-2.0 * p + 2.0, 3.0) / 2.0;
  float dir = direction >= 0.0 ? 1.0 : -1.0;
  float blur = sin(p * 3.14159) * 0.22;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 16; i++) {
    float t = (float(i) / 15.0 - 0.5) * blur;
    float s = uv.x + dir * (e + t);
    if (s >= 0.0 && s < 1.0) acc += getFromColor(vec2(s, uv.y));
    else acc += getToColor(vec2(clamp(s - dir, 0.0, 1.0), uv.y));
  }
  return acc / 16.0;
}
