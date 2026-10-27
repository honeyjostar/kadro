// Плагины-шейдеры пользователя: %USERPROFILE%\.kadro\plugins\transitions\*.glsl и …\effects\*.glsl.
// Файлы читаются как текст и уходят в окно — там они разбираются и собираются (WebGL). Папка
// отслеживается: сохранил файл — Kadro подхватил его сразу.
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './bins';

export interface PluginFile { kind: 'transition' | 'effect'; file: string; src: string }

const MAX_BYTES = 256 * 1024;
const DIRS = { transition: 'transitions', effect: 'effects' } as const;

export const pluginsDir = (): string => path.join(dataDir(), 'plugins');

const README = `Плагины Kadro
=============

Здесь лежат ваши переходы и эффекты на GLSL (язык шейдеров видеокарты):

  transitions\\  — переходы: файл .glsl с функцией  vec4 transition(vec2 uv)
  effects\\      — эффекты:  файл .glsl с функцией  vec4 effect(vec2 uv)

Сохранили файл — он сразу появится в Kadro (раздел «Переходы» или «Эффекты» → «Плагины»).
Ошибка в шейдере показывается в «Настройках» → «Плагины», остальное продолжает работать.

Переходы — в формате gl-transitions (https://gl-transitions.com): любой оттуда можно просто
скопировать в файл. Примеры эффектов — в папке examples\\ (перенесите файл в effects\\, чтобы включить).

Подробная инструкция: https://github.com/honeyjostar/kadro/blob/master/docs/PLUGINS.md
`;

const EXAMPLE_EFFECT = `// Name: Пример — сепия с виньеткой
// Author: Kadro
// License: MIT
// Description: Тёплый старый снимок с затемнёнными углами
// Tags: color, retro
// @range(0, 1) Виньетка
uniform float vignette; // = 0.6

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 sepia = vec3(g * 1.07, g * 0.87, g * 0.68);
  float d = distance(uv, vec2(0.5));
  float v = 1.0 - vignette * smoothstep(0.35, 0.75, d);
  return vec4(mix(c.rgb, sepia * v, amount), c.a);
}
`;

const EXAMPLE_TRANSITION = `// Name: Пример — диагональная шторка
// Author: Kadro
// License: MIT
// Description: Мягкая шторка из левого верхнего угла
// Tags: wipe
// @range(0.01, 0.5) Мягкость края
uniform float softness; // = 0.1

vec4 transition(vec2 uv) {
  float d = (uv.x + (1.0 - uv.y)) * 0.5;
  float m = smoothstep(progress * (1.0 + softness) - softness, progress * (1.0 + softness), d);
  return mix(getToColor(uv), getFromColor(uv), m);
}
`;

/** Создать папки плагинов с памяткой и примерами (примеры не подключаются, пока их не перенесут). */
export function ensurePluginDirs(): string {
  const root = pluginsDir();
  for (const d of [...Object.values(DIRS), 'examples']) fs.mkdirSync(path.join(root, d), { recursive: true });
  const put = (f: string, text: string) => { const p = path.join(root, f); if (!fs.existsSync(p)) fs.writeFileSync(p, text); };
  put('README.txt', README);
  put(path.join('examples', 'sepia-vignette.glsl'), EXAMPLE_EFFECT);
  put(path.join('examples', 'diagonal-wipe.glsl'), EXAMPLE_TRANSITION);
  return root;
}

export function listPlugins(): PluginFile[] {
  const out: PluginFile[] = [];
  for (const [kind, dir] of Object.entries(DIRS) as [PluginFile['kind'], string][]) {
    const d = path.join(pluginsDir(), dir);
    let names: string[] = [];
    try { names = fs.readdirSync(d); } catch { continue; }
    for (const n of names.sort((a, b) => a.localeCompare(b))) {
      if (!/\.(glsl|frag)$/i.test(n)) continue;
      const file = path.join(d, n);
      try {
        const st = fs.statSync(file);
        if (!st.isFile() || st.size > MAX_BYTES) continue;
        out.push({ kind, file, src: fs.readFileSync(file, 'utf8') });
      } catch { /* файл занят редактором — подхватим при следующем сохранении */ }
    }
  }
  return out;
}

/** Следить за папками плагинов; onChange — не чаще раза в 300 мс. */
export function watchPlugins(onChange: (list: PluginFile[]) => void): () => void {
  const watchers: fs.FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; onChange(listPlugins()); }, 300);
  };
  for (const dir of Object.values(DIRS)) {
    try { watchers.push(fs.watch(path.join(pluginsDir(), dir), fire)); } catch { /* папки нет — создадим при открытии */ }
  }
  return () => { watchers.forEach((w) => w.close()); if (timer) clearTimeout(timer); };
}
