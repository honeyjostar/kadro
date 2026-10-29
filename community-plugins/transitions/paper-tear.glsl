// Name: Разрыв бумаги
// Author: Kadro
// License: MIT
// Description: Кадр рвётся пополам, как лист бумаги, — половинки разъезжаются и открывают следующий
// Tags: shape, paper

float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(float x) { float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float tearAt(float y) { return 0.5 + (noise(y * 9.0) - 0.5) * 0.09 + (noise(y * 37.0) - 0.5) * 0.03; }

vec4 transition(vec2 uv) {
  float e = progress * progress * (3.0 - 2.0 * progress);
  float off = e * 0.62;
  vec4 paper = vec4(0.96, 0.95, 0.92, 1.0);
  vec2 lu = vec2(uv.x + off, clamp(uv.y + e * 0.04, 0.0, 1.0));
  vec2 ru = vec2(uv.x - off, clamp(uv.y - e * 0.04, 0.0, 1.0));
  float le = tearAt(lu.y);
  float re = tearAt(ru.y);
  float rim = 0.006 * (0.4 + noise(uv.y * 120.0));
  if (lu.x < le) return le - lu.x < rim * step(0.001, e) ? paper : getFromColor(lu);
  if (ru.x >= re) return ru.x - re < rim * step(0.001, e) ? paper : getFromColor(ru);
  // тень от половинок на следующем кадре
  float dl = uv.x - (le - off);
  float dr = (re + off) - uv.x;
  vec4 c = getToColor(uv);
  c.rgb *= mix(0.5, 1.0, smoothstep(0.0, 0.07, min(dl, dr)));
  return c;
}
