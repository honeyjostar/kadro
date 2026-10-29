// Name: Символы
// Author: Kadro
// License: MIT
// Description: Кадр, собранный из букв и знаков, как в старом терминале
// Tags: retro, digital, text
// @range(4, 24) Размер знака
uniform float cell; // = 9.0
// @range(0, 1) Цвет (0 — зелёный терминал)
uniform float colored; // = 1.0

// знаки 5×5, закодированы битами: 1 — точка горит
float glyphCode(float i) {
  if (i < 0.5) return 0.0;          // пробел
  if (i < 1.5) return 4194304.0;    // .
  if (i < 2.5) return 131200.0;     // :
  if (i < 3.5) return 14336.0;      // -
  if (i < 4.5) return 145536.0;     // +
  if (i < 5.5) return 459200.0;     // =
  if (i < 6.5) return 703136.0;     // *
  if (i < 7.5) return 15254976.0;   // o
  if (i < 8.5) return 15255086.0;   // O
  if (i < 9.5) return 11512810.0;   // #
  return 15652782.0;                // @
}

float glyph(float code, vec2 f) {
  float c = floor(f.x * 6.0);
  float r = floor((1.0 - f.y) * 6.0);
  if (c > 4.0 || r > 4.0) return 0.0;
  return floor(mod(code / exp2(c + r * 5.0), 2.0));
}

vec4 effect(vec2 uv) {
  vec4 src = getColor(uv);
  vec2 grid = vec2(720.0 * ratio, 720.0) / cell;
  vec2 g = uv * grid;
  vec2 center = (floor(g) + 0.5) / grid;
  vec3 col = getColor(center).rgb;
  float lumi = dot(col, vec3(0.299, 0.587, 0.114));
  float on = glyph(glyphCode(floor(clamp(lumi, 0.0, 1.0) * 10.99)), fract(g));
  vec3 ink = colored > 0.5 ? col * 1.25 + 0.08 : vec3(0.25, 1.0, 0.45) * (0.35 + lumi);
  vec3 outc = mix(vec3(0.02, 0.025, 0.03), ink, on);
  return vec4(mix(src.rgb, outc, amount), src.a);
}
