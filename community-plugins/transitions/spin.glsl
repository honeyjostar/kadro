// Name: Кручение
// Author: Kadro
// License: MIT
// Description: Кадр закручивается со смазом и раскручивается уже следующим
// Tags: move, rotate, blur
// @range(1, 3) Обороты
uniform float turns; // = 1.0

vec2 mirrorUv(vec2 q) { return 1.0 - abs(mod(q, 2.0) - 1.0); }

vec4 transition(vec2 uv) {
  float p = progress;
  float e = p < 0.5 ? 2.0 * p * p : 1.0 - pow(-2.0 * p + 2.0, 2.0) / 2.0;
  float ang = e * 6.28318 * floor(turns + 0.5);
  float speed = sin(p * 3.14159);
  float mixTo = smoothstep(0.42, 0.58, p);
  vec2 asp = vec2(ratio, 1.0);
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 14; i++) {
    float a = ang + (float(i) / 13.0 - 0.5) * speed * 0.5;
    vec2 d = (uv - 0.5) * asp;
    float s = sin(-a);
    float c = cos(-a);
    d = vec2(c * d.x - s * d.y, s * d.x + c * d.y) * (1.0 + speed * 0.4);
    vec2 q = mirrorUv(d / asp + 0.5);
    acc += mix(getFromColor(q), getToColor(q), mixTo);
  }
  return acc / 14.0;
}
