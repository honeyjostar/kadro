// Встроенные эффекты-шейдеры Kadro — они же примеры для своих плагинов (docs/PLUGINS.md).
// Договор: функция vec4 effect(vec2 uv); getColor(uv) — кадр клипа; time — секунды от начала клипа;
// progress — 0..1 по клипу; amount — сила 0..1 (ползунок во вкладке «Эффекты»); resolution — размер кадра в пикселях.

export const GL_EFFECT_SOURCES: Record<string, string> = {
  aberration: `// Name: Хроматическая аберрация
// Author: Kadro
// License: MIT
// Description: Красный и синий каналы расходятся от центра, как в дешёвом объективе
// Tags: color, lens
// @range(0, 1) Дрожание
uniform float jitter; // = 0.3

vec4 effect(vec2 uv) {
  vec2 d = uv - 0.5;
  float wob = 1.0 + jitter * 0.6 * sin(time * 23.0) * sin(time * 7.0);
  vec2 off = d * 0.045 * amount * wob;
  float r = getColor(uv + off).r;
  vec4 g = getColor(uv);
  float b = getColor(uv - off).b;
  return vec4(r, g.g, b, g.a);
}
`,
  wave: `// Name: Волна
// Author: Kadro
// License: MIT
// Description: Кадр колышется, как отражение в воде
// Tags: distort, wave
// @range(1, 30) Частота
uniform float frequency; // = 12.0
// @range(0.2, 6) Скорость
uniform float speed; // = 2.0

vec4 effect(vec2 uv) {
  float a = 0.012 * amount;
  vec2 p = uv;
  p.x += sin(uv.y * frequency + time * speed) * a;
  p.y += cos(uv.x * frequency * 0.7 + time * speed * 1.3) * a * 0.6;
  return getColor(clamp(p, 0.0, 1.0));
}
`,
  fisheye: `// Name: Рыбий глаз
// Author: Kadro
// License: MIT
// Description: Выпуклая линза в центре кадра — для скейт-видео и смешных крупных планов
// Tags: lens, distort

vec4 effect(vec2 uv) {
  vec2 d = uv - 0.5;
  d.x *= ratio;
  float r = length(d);
  float k = 1.0 + amount * 1.6 * r * r;
  vec2 p = d / k;
  p.x /= ratio;
  p += 0.5;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
  return getColor(p);
}
`,
  hexagons: `// Name: Соты
// Author: Kadro
// License: MIT
// Description: Кадр собран из шестиугольных ячеек
// Tags: pixelate, pattern

vec4 effect(vec2 uv) {
  float size = mix(0.004, 0.05, amount);
  vec2 p = vec2(uv.x * ratio, uv.y) / size;
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 center = (p - g) * size;
  center.x /= ratio;
  return getColor(clamp(center, 0.0, 1.0));
}
`,
  neon: `// Name: Неоновые контуры
// Author: Kadro
// License: MIT
// Description: Светящиеся контуры поверх тёмного кадра
// Tags: edges, glow, color
// @range(0, 1) Сколько оставить кадра
uniform float keep; // = 0.25

float luma(vec2 uv) { return dot(getColor(uv).rgb, vec3(0.299, 0.587, 0.114)); }

vec4 effect(vec2 uv) {
  vec2 px = 1.5 / resolution;
  float gx = luma(uv + vec2(px.x, 0.0)) - luma(uv - vec2(px.x, 0.0));
  float gy = luma(uv + vec2(0.0, px.y)) - luma(uv - vec2(0.0, px.y));
  float e = clamp(length(vec2(gx, gy)) * 4.0, 0.0, 1.0);
  vec4 c = getColor(uv);
  vec3 hue = 0.5 + 0.5 * cos(6.2831 * (uv.x + uv.y * 0.5 + time * 0.15) + vec3(0.0, 2.1, 4.2));
  vec3 neon = c.rgb * keep + hue * e * 1.6;
  return vec4(mix(c.rgb, neon, amount), c.a);
}
`,
  haze: `// Name: Марево
// Author: Kadro
// License: MIT
// Description: Дрожащий горячий воздух, как над асфальтом летом
// Tags: distort, noise

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

vec4 effect(vec2 uv) {
  vec2 q = vec2(uv.x * ratio * 8.0, uv.y * 14.0 - time * 3.0);
  vec2 off = vec2(noise(q) - 0.5, noise(q + 17.3) - 0.5) * 0.02 * amount;
  return getColor(clamp(uv + off, 0.0, 1.0));
}
`,
};
