// Name: Лучи света
// Author: Kadro
// License: MIT
// Description: Из центра бьют тёплые лучи, кадр тонет в свете и выходит уже следующим
// Tags: light, zoom

vec4 transition(vec2 uv) {
  float p = progress;
  float peak = sin(p * 3.14159);
  vec2 c = uv - 0.5;
  vec4 a = getFromColor(0.5 + c * (1.0 - 0.12 * p));
  vec4 b = getToColor(0.5 + c * (1.0 - 0.12 * (1.0 - p)));
  vec4 base = mix(a, b, smoothstep(0.38, 0.62, p));
  vec2 d = c * vec2(ratio, 1.0);
  float r = length(d);
  float ang = atan(d.y, d.x);
  float rays = 0.5 + 0.5 * sin(ang * 14.0 + p * 5.0) * sin(ang * 5.0 - p * 3.0);
  vec3 warm = vec3(1.0, 0.93, 0.8);
  float glow = peak * (0.5 + 0.5 * rays) * exp(-r * 1.4) * 1.7;
  vec3 col = base.rgb + warm * glow;
  col = mix(col, warm, peak * peak * peak * 0.7);
  return vec4(min(col, 1.0), 1.0);
}
