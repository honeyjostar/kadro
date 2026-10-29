// Name: Рывок камеры
// Author: Kadro
// License: MIT
// Description: Размытие от центра наружу, как будто камера резко едет вперёд
// Tags: blur, motion
// @range(0, 1) Центр по горизонтали
uniform float centerX; // = 0.5
// @range(0, 1) Центр по вертикали
uniform float centerY; // = 0.5
// @range(0, 1) Рывок в начале клипа
uniform float punch; // = 0.0

vec4 effect(vec2 uv) {
  vec2 c = vec2(centerX, centerY);
  vec2 d = uv - c;
  float hit = punch > 0.0 ? mix(1.0, 1.0 - smoothstep(0.0, 0.35, time), punch) : 1.0;
  float s = 0.16 * amount * hit;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 24; i++) {
    float t = float(i) / 23.0;
    acc += getColor(c + d * (1.0 - s * t));
  }
  return acc / 24.0;
}
