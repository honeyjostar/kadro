// Живые фоны Kadro (для TikTok, Reels и Shorts): шейдеры, которые рисуют картинку сами, без исходника.
// Клип-основа — чёрная картинка; фон кладётся на неё эффектом gl:bg_*. amount — насколько фон закрывает клип
// (1 — целиком, меньше — сквозь него видно то, что в клипе). Всё зависит только от времени — экспорт совпадает с плеером.
// Свои фоны в том же формате — в папку плагинов (docs/PLUGINS.md).

const MIX = `
vec4 put(vec2 uv, vec3 col) { return vec4(mix(getColor(uv).rgb, col, clamp(amount * 1.25, 0.0, 1.0)), 1.0); }
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }
vec3 hueShift(vec3 c, float h) {
  const vec3 k = vec3(0.57735);
  float a = h * 6.2831853;
  return c * cos(a) + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cos(a));
}
`;

const RAW: Record<string, string> = {
  bg_stars: `// Name: Фон: звёздное небо
// Author: Kadro
// License: MIT
// Description: Ночное небо: мерцающие звёзды, Млечный Путь и падающие звёзды
// Tags: background, stars, night, aesthetic
// @range(0, 1) Падающие звёзды
uniform float meteors; // = 0.6
// @range(0, 1) Оттенок неба
uniform float hue; // = 0.0
//#lib
float stars(vec2 p, float t, float dens) {
  vec2 id = floor(p), f = fract(p) - 0.5;
  float n = h21(id);
  if (n < 1.0 - dens) return 0.0;
  vec2 o = (vec2(h21(id + 1.3), h21(id + 7.1)) - 0.5) * 0.7;
  float d = length(f - o);
  float tw = 0.55 + 0.45 * sin(t * (1.0 + 3.0 * h21(id + 2.2)) + n * 40.0);
  float size = mix(0.02, 0.08, pow(h21(id + 3.7), 4.0));
  float s = smoothstep(size, 0.0, d) * tw;
  if (n > 0.985) s += (smoothstep(0.012, 0.0, abs(f.x - o.x)) + smoothstep(0.012, 0.0, abs(f.y - o.y))) * smoothstep(0.4, 0.0, d) * 0.6 * tw;
  return s;
}
float meteor(vec2 p, float t, float k) {
  float per = 3.5 + k * 1.7;
  float c = floor((t + k * 2.3) / per);
  float l = fract((t + k * 2.3) / per) * per;
  if (l > 0.9 || h21(vec2(c, k)) > meteors * 1.2) return 0.0;
  vec2 a = vec2(h21(vec2(c, k + 3.0)) * ratio * 1.2, 0.65 + 0.35 * h21(vec2(k, c + 5.0)));
  vec2 dir = normalize(vec2(-0.75 - 0.3 * h21(vec2(c, 9.0 + k)), -0.45));
  vec2 head = a + dir * l * 1.4;
  vec2 q = p - head;
  float along = dot(q, -dir);
  float across = abs(dot(q, vec2(-dir.y, dir.x)));
  float tail = 0.22;
  float m = smoothstep(0.004, 0.0, across) * smoothstep(tail, 0.0, along) * step(0.0, along);
  m += smoothstep(0.012, 0.0, length(q)) * 1.5;
  return m * smoothstep(0.9, 0.6, l) * smoothstep(0.0, 0.1, l);
}
vec4 effect(vec2 uv) {
  vec2 p = vec2(uv.x * ratio, uv.y);
  vec3 top = vec3(0.01, 0.015, 0.06), mid = vec3(0.05, 0.04, 0.16), low = vec3(0.16, 0.08, 0.26);
  vec3 col = mix(low, mid, smoothstep(0.0, 0.45, uv.y));
  col = mix(col, top, smoothstep(0.45, 1.0, uv.y));
  // Млечный Путь — светлая туманная полоса по диагонали
  float band = exp(-pow((uv.y - 0.25 - uv.x * 0.55) * 3.2, 2.0));
  float neb = fbm(p * 3.0 + vec2(time * 0.01, 0.0));
  col += band * (0.08 + 0.22 * neb) * vec3(0.55, 0.45, 0.9);
  col += band * smoothstep(0.55, 0.9, fbm(p * 7.0 - 3.0)) * 0.12 * vec3(0.9, 0.7, 1.0);
  float drift = time * 0.004;
  float s = stars(p * 18.0 + drift, time, 0.35) * 0.6 + stars(p * 42.0 + drift * 2.0, time * 1.3, 0.3) * 0.45 + stars(p * 90.0, time * 1.7, 0.28) * 0.3;
  s *= 0.7 + 0.6 * band;
  col += s * vec3(0.95, 0.95, 1.0);
  float m = meteor(p, time, 0.0) + meteor(p, time, 1.0) + meteor(p, time, 2.0);
  col += m * vec3(0.85, 0.9, 1.0);
  col = hueShift(col, hue);
  return put(uv, col);
}
`,

  bg_aurora: `// Name: Фон: северное сияние
// Author: Kadro
// License: MIT
// Description: Зелёные и фиолетовые волны сияния над горами и звёздами
// Tags: background, aurora, night, aesthetic
// @range(0.1, 3) Скорость
uniform float speed; // = 1.0
// @range(0, 1) Оттенок
uniform float hue; // = 0.0
//#lib
vec4 effect(vec2 uv) {
  vec2 p = vec2(uv.x * ratio, uv.y);
  float t = time * 0.25 * speed;
  vec3 col = mix(vec3(0.02, 0.05, 0.09), vec3(0.0, 0.01, 0.03), uv.y);
  // звёзды
  vec2 sp = p * 60.0;
  float n = h21(floor(sp));
  col += step(0.985, n) * smoothstep(0.35, 0.0, length(fract(sp) - 0.5)) * (0.6 + 0.4 * sin(time * 3.0 + n * 50.0)) * 0.8;
  // занавеси сияния
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float y = 0.58 + fi * 0.07 + 0.09 * sin(p.x * (1.3 + fi * 0.4) + t * (1.0 + fi * 0.3) + fi * 2.0) + 0.06 * (fbm(vec2(p.x * 2.0 + t * 0.6, fi * 3.1)) - 0.5);
    float d = uv.y - y;
    float curtain = exp(-max(d, 0.0) * (5.0 + fi * 2.0)) * smoothstep(-0.02, 0.01, d);
    float rays = 0.55 + 0.45 * fbm(vec2(p.x * 14.0 + t * 2.0, fi * 7.0));
    vec3 c = mix(vec3(0.1, 1.0, 0.55), vec3(0.55, 0.25, 1.0), smoothstep(0.0, 0.25, d) + fi * 0.18);
    col += c * curtain * rays * (0.55 - fi * 0.08);
  }
  // горы
  float h1 = 0.18 + 0.1 * fbm(vec2(p.x * 1.6, 1.0)) + 0.05 * sin(p.x * 3.0);
  float h2 = 0.1 + 0.07 * fbm(vec2(p.x * 3.0 + 5.0, 2.0));
  col = mix(col, vec3(0.015, 0.03, 0.05), smoothstep(h1 + 0.003, h1, uv.y));
  col = mix(col, vec3(0.0, 0.005, 0.012), smoothstep(h2 + 0.003, h2, uv.y));
  col = hueShift(col, hue);
  return put(uv, col);
}
`,

  bg_mesh: `// Name: Фон: переливы
// Author: Kadro
// License: MIT
// Description: Мягкий градиент, который медленно перетекает (эстетика, цитаты, «говорящая голова»)
// Tags: background, gradient, aesthetic
// @range(0, 1) Палитра
uniform float palette; // = 0.0
// @range(0.1, 3) Скорость
uniform float speed; // = 1.0
//#lib
vec4 effect(vec2 uv) {
  vec2 p = vec2(uv.x * ratio, uv.y);
  float t = time * 0.12 * speed;
  // 0 — закат (розовый, персик, голубой, сирень), 1 — океан (бирюза, синий, фиолетовый, мята)
  float pal = smoothstep(0.2, 0.8, palette);
  vec3 c0 = mix(vec3(1.0, 0.55, 0.62), vec3(0.3, 0.86, 0.78), pal), c1 = mix(vec3(0.98, 0.78, 0.55), vec3(0.38, 0.6, 1.0), pal);
  vec3 c2 = mix(vec3(0.55, 0.6, 1.0), vec3(0.55, 0.45, 0.98), pal), c3 = mix(vec3(0.72, 0.5, 0.95), vec3(0.62, 0.95, 0.88), pal);
  vec3 col = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 c = vec2(0.5 * ratio + 0.38 * ratio * sin(t * (0.9 + fi * 0.23) + fi * 1.7), 0.5 + 0.38 * cos(t * (0.7 + fi * 0.31) + fi * 2.9));
    float w = 1.0 / (0.02 + pow(length(p - c), 2.2));
    vec3 k = i == 0 ? c0 : i == 1 ? c1 : i == 2 ? c2 : c3;
    col += k * w; wsum += w;
  }
  col /= wsum;
  col += (h21(uv * resolution + fract(time)) - 0.5) * 0.025; // зерно — без полос на градиенте
  return put(uv, col);
}
`,

  bg_synth: `// Name: Фон: синтвейв
// Author: Kadro
// License: MIT
// Description: Ретро-закат 80-х: солнце в полоску и неоновая сетка, бегущая к горизонту
// Tags: background, retro, synthwave, neon
// @range(0.2, 3) Скорость
uniform float speed; // = 1.0
//#lib
vec4 effect(vec2 uv) {
  float hor = 0.42;
  vec2 p = vec2((uv.x - 0.5) * ratio, uv.y);
  vec3 col;
  if (uv.y > hor) {
    col = mix(vec3(0.95, 0.3, 0.55), vec3(0.08, 0.02, 0.2), smoothstep(hor, 1.0, uv.y));
    // солнце
    vec2 sc = vec2(0.0, hor + 0.17);
    float r = length(p - sc);
    float sun = smoothstep(0.205, 0.2, r);
    float stripes = step(0.5, fract((uv.y - hor) * 38.0)) + step(hor + 0.14, uv.y);
    sun *= clamp(stripes, 0.0, 1.0);
    vec3 sunC = mix(vec3(1.0, 0.25, 0.55), vec3(1.0, 0.85, 0.3), smoothstep(hor, hor + 0.37, uv.y));
    col = mix(col, sunC, sun);
    col += vec3(1.0, 0.4, 0.6) * smoothstep(0.45, 0.2, r) * 0.25;
  } else {
    float d = hor - uv.y;
    float z = 0.25 / max(d, 0.002);
    float gx = p.x * z;
    float gz = z + time * 1.6 * speed;
    float lw = 0.07;
    float lines = smoothstep(lw, 0.0, 0.5 - abs(fract(gx) - 0.5)) + smoothstep(lw, 0.0, 0.5 - abs(fract(gz) - 0.5));
    col = mix(vec3(0.05, 0.0, 0.1), vec3(0.2, 0.0, 0.25), d * 2.0);
    col += vec3(1.0, 0.2, 0.85) * clamp(lines, 0.0, 1.0) * smoothstep(0.0, 0.08, d) * 1.2;
    col += vec3(1.0, 0.3, 0.7) * exp(-d * 30.0) * 0.6;
  }
  return put(uv, col);
}
`,

  bg_matrix: `// Name: Фон: цифровой дождь
// Author: Kadro
// License: MIT
// Description: Зелёные символы стекают по экрану, как в фильмах про хакеров
// Tags: background, code, hacker, neon
// @range(0.2, 3) Скорость
uniform float speed; // = 1.0
// @range(0, 1) Оттенок
uniform float hue; // = 0.0
//#lib
vec4 effect(vec2 uv) {
  float cols = floor(resolution.x / max(8.0, resolution.y / 64.0));
  vec2 g = vec2(uv.x * cols, (1.0 - uv.y) * cols / ratio);
  vec2 id = floor(g);
  vec2 f = fract(g);
  float sp = (0.5 + h21(vec2(id.x, 1.0))) * 9.0 * speed;
  float off = h21(vec2(id.x, 7.0)) * 100.0;
  float len = 8.0 + h21(vec2(id.x, 3.0)) * 22.0;
  float head = mod(time * sp + off, cols / ratio + len);
  float dist = head - id.y;
  float trail = dist > 0.0 && dist < len ? pow(1.0 - dist / len, 2.0) : 0.0;
  // символ — случайная «буква» из точек 3×5, меняется время от времени
  float chg = floor(time * (2.0 + 6.0 * h21(id)) + h21(id + 9.0) * 10.0);
  vec2 cell = floor(f * vec2(3.0, 5.0));
  float bit = step(0.45, h21(id * 1.7 + cell + chg));
  float inside = step(0.12, f.x) * step(f.x, 0.88) * step(0.08, f.y) * step(f.y, 0.92);
  float glyph = bit * inside;
  vec3 col = vec3(0.0, 0.02, 0.0);
  col += vec3(0.1, 1.0, 0.35) * glyph * trail;
  col += vec3(0.8, 1.0, 0.85) * glyph * step(0.0, dist) * step(dist, 1.0);
  col = hueShift(col, hue);
  return put(uv, col);
}
`,

  bg_tunnel: `// Name: Фон: неоновый тоннель
// Author: Kadro
// License: MIT
// Description: Полёт сквозь светящиеся кольца — для битов, гейминга и фонка
// Tags: background, neon, tunnel, music
// @range(0.2, 3) Скорость
uniform float speed; // = 1.0
// @range(0, 1) Оттенок
uniform float hue; // = 0.0
//#lib
vec4 effect(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  p += 0.06 * vec2(sin(time * 0.7), cos(time * 0.5));
  float r = length(p);
  float a = atan(p.y, p.x);
  float z = 0.3 / max(r, 0.001) + time * 1.5 * speed;
  float rings = smoothstep(0.08, 0.0, 0.5 - abs(fract(z) - 0.5));
  float spokes = smoothstep(0.04, 0.0, 0.5 - abs(fract(a / 6.2831853 * 12.0 + z * 0.1) - 0.5)) * 0.35;
  vec3 c = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + floor(z) * 0.13 + 0.6));
  vec3 col = c * (rings + spokes) * smoothstep(0.0, 0.25, r) * 1.3;
  col += c * 0.12 / (0.2 + 6.0 * r);
  col *= smoothstep(1.2, 0.3, r) * 0.6 + 0.4;
  col = hueShift(col, hue);
  return put(uv, col);
}
`,

  bg_bokeh: `// Name: Фон: огоньки
// Author: Kadro
// License: MIT
// Description: Тёплые размытые огоньки плывут вверх — уютный фон для голоса и цитат
// Tags: background, bokeh, cozy, aesthetic
// @range(0, 1) Оттенок
uniform float hue; // = 0.0
// @range(0.2, 3) Скорость
uniform float speed; // = 1.0
//#lib
vec4 effect(vec2 uv) {
  vec2 p = vec2(uv.x * ratio, uv.y);
  vec3 col = mix(vec3(0.12, 0.05, 0.03), vec3(0.03, 0.02, 0.05), uv.y);
  for (int i = 0; i < 36; i++) {
    float fi = float(i);
    float s = 0.03 + 0.09 * h21(vec2(fi, 1.0));
    float sp = (0.015 + 0.05 * h21(vec2(fi, 2.0))) * speed;
    vec2 c = vec2(h21(vec2(fi, 3.0)) * ratio + 0.05 * sin(time * 0.3 + fi), fract(h21(vec2(fi, 4.0)) + time * sp) * 1.3 - 0.15);
    float d = length(p - c);
    float disk = smoothstep(s, s * 0.82, d) * (0.6 + 0.4 * smoothstep(s * 0.5, s, d));
    vec3 k = mix(vec3(1.0, 0.62, 0.25), vec3(1.0, 0.35, 0.35), h21(vec2(fi, 5.0)));
    col += k * disk * (0.12 + 0.18 * h21(vec2(fi, 6.0))) * (0.75 + 0.25 * sin(time * 1.7 + fi));
  }
  col = hueShift(col, hue);
  return put(uv, col);
}
`,

  bg_lava: `// Name: Фон: лава-лампа
// Author: Kadro
// License: MIT
// Description: Мягкие капли сливаются и расходятся — «залипательный» фон
// Tags: background, satisfying, lava, aesthetic
// @range(0, 1) Палитра
uniform float palette; // = 0.0
// @range(0.2, 3) Скорость
uniform float speed; // = 1.0
//#lib
vec4 effect(vec2 uv) {
  vec2 p = vec2(uv.x * ratio, uv.y);
  float t = time * 0.35 * speed;
  float f = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 c = vec2((0.25 + 0.5 * h21(vec2(fi, 1.0)) + 0.18 * sin(t * (0.5 + 0.4 * h21(vec2(fi, 2.0))) + fi)) * ratio,
      0.5 + 0.42 * sin(t * (0.35 + 0.3 * h21(vec2(fi, 3.0))) + fi * 1.9));
    float r = 0.045 + 0.04 * h21(vec2(fi, 4.0));
    f += r * r / max(dot(p - c, p - c), 1e-4);
  }
  vec3 bg = mix(vec3(0.25, 0.05, 0.35), vec3(0.05, 0.02, 0.15), uv.y);
  vec3 blob = mix(vec3(1.0, 0.35, 0.25), vec3(1.0, 0.75, 0.2), uv.y);
  float edge = smoothstep(0.95, 1.05, f);
  vec3 col = mix(bg, blob, edge);
  col += blob * smoothstep(0.4, 1.0, f) * (1.0 - edge) * 0.35; // свечение вокруг капель
  col = hueShift(col, palette);
  return put(uv, col);
}
`,

  bg_clouds: `// Name: Фон: пастельные облака
// Author: Kadro
// License: MIT
// Description: Розово-голубое небо, по которому медленно плывут облака
// Tags: background, clouds, pastel, aesthetic
// @range(0, 1) Оттенок
uniform float hue; // = 0.0
// @range(0.2, 3) Скорость
uniform float speed; // = 1.0
//#lib
vec4 effect(vec2 uv) {
  vec2 p = vec2(uv.x * ratio, uv.y);
  vec3 sky = mix(vec3(1.0, 0.72, 0.78), vec3(0.55, 0.7, 1.0), smoothstep(0.0, 1.0, uv.y));
  float t = time * 0.02 * speed;
  float c1 = fbm(p * 2.2 + vec2(t, 0.0));
  float c2 = fbm(p * 4.5 + vec2(t * 1.8, 3.0));
  float cl = smoothstep(0.4, 0.7, c1 * 0.8 + c2 * 0.35);
  vec3 cloud = mix(vec3(1.0, 0.86, 0.9), vec3(1.0), smoothstep(0.5, 0.9, c2));
  vec3 col = mix(sky, cloud, cl * 0.9);
  col = hueShift(col, hue);
  return put(uv, col);
}
`,

  bg_orbit: `// Name: Фон: залипалка
// Author: Kadro
// License: MIT
// Description: Светящиеся точки кружат по орбитам с разной скоростью и складываются в узоры
// Tags: background, satisfying, hypnotic, neon
// @range(0.2, 3) Скорость
uniform float speed; // = 1.0
// @range(0, 1) Оттенок
uniform float hue; // = 0.0
//#lib
vec4 effect(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  vec3 col = vec3(0.01, 0.01, 0.03);
  float t = time * speed;
  for (int ring = 0; ring < 9; ring++) {
    float fr = float(ring) + 1.0;
    float R = 0.04 * fr;
    float w = 0.35 + fr * 0.11;
    vec3 c = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + fr * 0.09));
    col += c * smoothstep(0.003, 0.0, abs(length(p) - R)) * 0.12; // орбита
    for (int k = 0; k < 6; k++) {
      float a = t * w * 0.4 + float(k) * 1.0471976;
      vec2 q = R * vec2(cos(a), sin(a));
      float d = length(p - q);
      col += c * (smoothstep(0.012, 0.0, d) + 0.004 / (d + 0.004) * 0.25);
    }
  }
  col = hueShift(col, hue);
  return put(uv, col);
}
`,

  bg_runner: `// Name: Фон: неоновая трасса
// Author: Kadro
// License: MIT
// Description: Бесконечный забег по трём полосам: препятствия, повороты, неон — «геймплей» для разделённого экрана
// Tags: background, gameplay, neon, runner
// @range(0.3, 3) Скорость
uniform float speed; // = 1.0
// @range(0, 1) Оттенок
uniform float hue; // = 0.0
//#lib
float lanePos(float z) { return floor(mod(z * 0.37 + h21(vec2(floor(z), 2.0)) * 3.0, 3.0)) - 1.0; }
vec4 effect(vec2 uv) {
  float hor = 0.62;
  vec2 p = vec2((uv.x - 0.5) * ratio, uv.y);
  float t = time * 6.0 * speed;
  vec3 col = mix(vec3(0.15, 0.0, 0.3), vec3(0.0, 0.0, 0.06), smoothstep(hor, 1.0, uv.y));
  // город на горизонте
  float bx = floor(p.x * 30.0);
  float bh = hor + 0.02 + 0.08 * h21(vec2(bx, 1.0));
  if (uv.y > hor && uv.y < bh) col = vec3(0.04, 0.0, 0.1) + vec3(0.9, 0.5, 1.0) * step(0.93, h21(floor(vec2(p.x * 120.0, uv.y * 140.0)))) * 0.6;
  if (uv.y < hor) {
    float d = hor - uv.y;
    float z = 0.35 / max(d, 0.002);
    float bend = 0.25 * sin(time * 0.4) * d * d * 4.0;     // дорога плавно поворачивает
    float x = (p.x - bend) * z;
    float road = step(abs(x), 1.65);
    col = mix(vec3(0.02, 0.0, 0.05), vec3(0.05, 0.02, 0.1), d);
    col += vec3(0.0, 0.9, 1.0) * smoothstep(0.06 * z, 0.0, abs(abs(x) - 1.65)) * smoothstep(0.0, 0.05, d) * 1.4;
    float dash = step(0.5, fract((z + t) * 0.5));
    col += vec3(1.0, 0.2, 0.8) * smoothstep(0.04 * z, 0.0, abs(abs(x) - 0.55)) * dash * road * smoothstep(0.0, 0.05, d);
    // препятствия: по блоку на ряд, в своей полосе
    float zz = z + t;
    float row = floor(zz / 6.0);
    float lane = floor(h21(vec2(row, 4.0)) * 3.0) - 1.0;
    float inRow = fract(zz / 6.0) * 6.0;
    float ob = step(abs(x - lane * 1.1), 0.42) * step(inRow, 0.9) * road;
    vec3 obc = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + row * 0.21));
    col = mix(col, obc * 1.2, ob * smoothstep(0.0, 0.05, d));
    col += obc * 0.25 * step(abs(x - lane * 1.1), 0.6) * smoothstep(1.6, 0.0, abs(inRow - 0.45)) * road * smoothstep(0.0, 0.05, d);
  }
  // игрок — светящийся шар внизу, уходит от препятствий
  float nextRow = floor((0.35 / 0.08 + t) / 6.0);
  float avoid = floor(h21(vec2(nextRow, 4.0)) * 3.0) - 1.0;
  float target = avoid == 0.0 ? (h21(vec2(nextRow, 8.0)) > 0.5 ? 1.0 : -1.0) : 0.0;
  float px = target * 0.13 * ratio * 0.5;
  vec2 pc = vec2(px, 0.1 + 0.015 * abs(sin(time * 8.0 * speed)));
  float pd = length(p - pc);
  col += vec3(0.4, 1.0, 0.6) * (smoothstep(0.035, 0.03, pd) + 0.01 / (pd + 0.01) * 0.3);
  col = hueShift(col, hue);
  return put(uv, col);
}
`,
};

/** Исходники фонов: общий кусок (put, шум, сдвиг оттенка) — вместо строки «//#lib». */
export const GL_BACKGROUND_SOURCES: Record<string, string> = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, v.replace('//#lib', MIX)]));
