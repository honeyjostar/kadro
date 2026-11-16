// Встроенные эффекты-шейдеры Kadro — они же примеры для своих плагинов (docs/PLUGINS.md).
// Договор: функция vec4 effect(vec2 uv); getColor(uv) — кадр клипа; time — секунды от начала клипа;
// progress — 0..1 по клипу; amount — сила 0..1 (ползунок во вкладке «Эффекты»); resolution — размер кадра в пикселях.

import { GL_BACKGROUND_SOURCES } from './backgrounds';

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
  coloraccent: `// Name: Цветовой акцент
// Author: Kadro
// License: MIT
// Description: Всё чёрно-белое, кроме одного цвета — красная машина или розовое худи на сером городе
// Tags: color, accent, bw
// @range(0, 360) Оттенок
uniform float hue; // = 0.0
// @range(5, 90) Ширина цвета
uniform float width; // = 28.0

vec3 hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  vec3 h = hsv(c.rgb);
  float dh = abs(h.x * 360.0 - hue);
  dh = min(dh, 360.0 - dh);
  // оставляем цвет рядом с выбранным оттенком и только у насыщенных мест (серое и белое — в ч/б)
  float keepIt = (1.0 - smoothstep(width * 0.6, width, dh)) * smoothstep(0.12, 0.3, h.y);
  float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 bw = vec3(g);
  vec3 outc = mix(bw, c.rgb * 1.08, keepIt);
  return vec4(mix(c.rgb, outc, amount), c.a);
}
`,
  crt: `// Name: Кинескоп
// Author: Kadro
// License: MIT
// Description: Старый ламповый телевизор: выпуклый экран, строки, полоса помех и мерцание
// Tags: retro, tv, scanlines
// @range(0, 1) Строки
uniform float lines; // = 0.6
// @range(0, 1) Выпуклость
uniform float curve; // = 0.5

vec4 effect(vec2 uv) {
  vec2 d = uv - 0.5;
  float k = curve * amount * 0.25;
  vec2 p = 0.5 + d * (1.0 + k * dot(d, d) * 4.0) / (1.0 + k);
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
  // три луча кинескопа чуть расходятся
  float sh = 0.0015 * amount;
  vec3 c = vec3(getColor(p + vec2(sh, 0.0)).r, getColor(p).g, getColor(p - vec2(sh, 0.0)).b);
  float row = p.y * resolution.y;
  float scan = 1.0 - lines * amount * 0.45 * (0.5 + 0.5 * cos(row * 3.14159));
  float mask = 1.0 - amount * 0.12 * (0.5 + 0.5 * cos(p.x * resolution.x * 2.094));
  float bar = 1.0 + amount * 0.08 * smoothstep(0.0, 0.08, 0.08 - abs(fract(p.y * 0.5 - time * 0.12) - 0.5));
  float flick = 1.0 - amount * 0.04 * sin(time * 60.0);
  float vig = smoothstep(0.85, 0.25, length(d * vec2(1.0, 1.15)));
  c *= scan * mask * bar * flick * mix(1.0, vig, amount);
  vec4 o = getColor(uv);
  return vec4(mix(o.rgb, c, amount), o.a);
}
`,
  rec: `// Name: Рамка REC
// Author: Kadro
// License: MIT
// Description: Как в видоискателе камеры: уголки по краям, мигающий REC, время записи и батарейка
// Tags: overlay, camera, vlog
// @range(0, 1) Прицел в центре
uniform float aim; // = 0.0

float glyph(float c) {
  if (c < 0.5) return 31599.0; if (c < 1.5) return 11415.0; if (c < 2.5) return 29671.0; if (c < 3.5) return 29647.0;
  if (c < 4.5) return 23497.0; if (c < 5.5) return 31183.0; if (c < 6.5) return 31215.0; if (c < 7.5) return 29266.0;
  if (c < 8.5) return 31727.0; if (c < 9.5) return 31695.0; if (c < 10.5) return 1040.0;
  if (c < 11.5) return 27565.0; if (c < 12.5) return 31143.0; return 31015.0;
}
// символ c в клетке: q — пиксели от левого верхнего угла символа, f — размер точки шрифта
float ch(float c, vec2 q, float f) {
  vec2 cell = floor(q / f);
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x > 2.0 || cell.y > 4.0) return 0.0;
  float i = cell.y * 3.0 + cell.x;
  return floor(mod(glyph(c) / exp2(14.0 - i), 2.0));
}
float box(vec2 q, vec2 a, vec2 b) { return step(a.x, q.x) * step(q.x, b.x) * step(a.y, q.y) * step(q.y, b.y); }

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  vec2 q = vec2(uv.x, 1.0 - uv.y) * resolution;        // пиксели от левого верхнего угла
  float s = min(resolution.x, resolution.y);
  float f = max(2.0, floor(s / 150.0));                  // точка шрифта
  float m = s * 0.05, L = s * 0.08, t = max(2.0, f * 0.7);
  vec2 R = resolution;
  float o = 0.0;
  // уголки
  vec2 c0 = vec2(m, m), c1 = vec2(R.x - m, m), c2 = vec2(m, R.y - m), c3 = vec2(R.x - m, R.y - m);
  o += box(q, c0, c0 + vec2(L, t)) + box(q, c0, c0 + vec2(t, L));
  o += box(q, c1 - vec2(L, 0.0), c1 + vec2(0.0, t)) + box(q, c1 - vec2(t, 0.0), c1 + vec2(0.0, L));
  o += box(q, c2 - vec2(0.0, t), c2 + vec2(L, 0.0)) + box(q, c2 - vec2(0.0, L), c2 + vec2(t, 0.0));
  o += box(q, c3 - vec2(L, t), c3) + box(q, c3 - vec2(t, L), c3);
  // REC и мигающая точка
  vec2 at = c0 + vec2(L * 0.35, L * 0.45);
  float red = 0.0;
  float dotR = f * 2.2;
  if (fract(time) < 0.6) red = step(length(q - (at + vec2(dotR, dotR))), dotR);
  vec2 tp = at + vec2(dotR * 2.0 + f * 2.0, dotR - f * 2.5);
  o += ch(11.0, q - tp, f) + ch(12.0, q - tp - vec2(f * 4.0, 0.0), f) + ch(13.0, q - tp - vec2(f * 8.0, 0.0), f);
  // время записи ЧЧ:ММ:СС — внизу слева
  float sec = floor(time);
  float hh = floor(sec / 3600.0), mm = floor(mod(sec, 3600.0) / 60.0), ss = mod(sec, 60.0);
  vec2 bp = c2 + vec2(L * 0.35, -L * 0.45 - f * 5.0);
  float dg[8];
  dg[0] = floor(hh / 10.0); dg[1] = mod(hh, 10.0); dg[2] = 10.0; dg[3] = floor(mm / 10.0);
  dg[4] = mod(mm, 10.0); dg[5] = 10.0; dg[6] = floor(ss / 10.0); dg[7] = mod(ss, 10.0);
  for (int i = 0; i < 8; i++) o += ch(dg[i], q - bp - vec2(f * 4.0 * float(i), 0.0), f);
  // батарейка — вверху справа
  vec2 bb = c1 + vec2(-L * 0.35 - f * 12.0, L * 0.45);
  float bw = f * 11.0, bh = f * 5.0, lw = max(1.0, f * 0.6);
  float shell = box(q, bb, bb + vec2(bw, bh)) * (1.0 - box(q, bb + lw, bb + vec2(bw, bh) - lw));
  float cap = box(q, bb + vec2(bw, bh * 0.3), bb + vec2(bw + f, bh * 0.7));
  float bars = 0.0;
  for (int i = 0; i < 3; i++) bars += box(q, bb + vec2(lw * 2.0 + float(i) * f * 3.3, lw * 2.0), bb + vec2(lw * 2.0 + float(i) * f * 3.3 + f * 2.6, bh - lw * 2.0));
  o += shell + cap + bars;
  // прицел
  vec2 cc = R * 0.5;
  float cl = s * 0.025;
  o += aim * (box(q, cc - vec2(cl, t * 0.5), cc + vec2(cl, t * 0.5)) + box(q, cc - vec2(t * 0.5, cl), cc + vec2(t * 0.5, cl)));
  o = clamp(o, 0.0, 1.0);
  float k = min(1.0, amount * 1.7); // рамка — надпись поверх кадра: уже на средней силе почти не прозрачная
  vec3 col = mix(base.rgb, vec3(1.0), o * 0.92 * k);
  col = mix(col, vec3(0.95, 0.12, 0.12), red * k);
  return vec4(col, base.a);
}
`,
  // живые фоны — в конце списка шейдеров (в «Шаблонах» у них свой раздел)
  ...GL_BACKGROUND_SOURCES,
};
