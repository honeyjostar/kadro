// Каталог шейдеров: 123 перехода gl-transitions, встроенные эффекты Kadro и плагины пользователя
// (файлы .glsl в %USERPROFILE%\.kadro\plugins). Плеер и экспорт берут описание по id синхронно.
import { tx, txData } from '../shared/i18n';
import { useSyncExternalStore } from 'react';
import { GL_EFFECT_SOURCES } from '../shared/gl/effects';
import { builtinTransitions, parseGlsl, pluginDef, type GlDef, type GlTransitionJson } from '../shared/gl/glsl';
import type { PluginFile } from '../shared/ipc';
import { glRunner } from './engine/gl';

/** Подписи ползунков параметров — на языке интерфейса (если перевод есть). */
const localParams = (ps: GlDef['params']): GlDef['params'] => ps.map((p) => (p.label ? { ...p, label: tx(p.label) } : p));

let transitions: GlDef[] = [];
let plugins: GlDef[] = [];
export interface PluginIssue { file: string; message: string }
let pluginErrors: PluginIssue[] = [];
let version = 0;
const subs = new Set<() => void>();
const changed = () => { version++; subs.forEach((f) => f()); };

/** Встроенные эффекты-шейдеры (они же образцы для своих плагинов). */
const effects: GlDef[] = Object.entries(GL_EFFECT_SOURCES).map(([key, src]) => {
  const m = parseGlsl(src);
  return { id: `gl:${key}`, kind: 'effect', name: tx(m.name ?? key), author: m.author, license: m.license, description: txData(m.description), tags: m.tags, cat: 'shader', params: localParams(m.params), glsl: src };
});

let loading: Promise<void> | null = null;
/** Каталог переходов грузится отдельным куском (≈190 КБ) — при запуске, не задерживая окно. */
export function loadGlCatalog(): Promise<void> {
  loading ??= import('../shared/gl/transitions.json').then((m) => {
    transitions = builtinTransitions((m.default ?? m) as unknown as GlTransitionJson[]);
    changed();
  });
  return loading;
}

export function setGlPlugins(defs: GlDef[], errors: PluginIssue[]): void {
  plugins = defs;
  pluginErrors = errors;
  changed();
}

/**
 * Файлы из папки плагинов → описания. Каждый шейдер сразу пробуем собрать: ошибка видна в «Настройках»,
 * а сломанный плагин в списках не показывается (иначе он рисовал бы просто растворение).
 */
export function applyPluginFiles(files: PluginFile[]): void {
  const defs: GlDef[] = [];
  const errors: PluginIssue[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const r0 = pluginDef(f.kind, f.file, f.src);
    // названия плагинов из каталога есть в словаре — показываем на языке интерфейса
    const r = r0.def ? { ...r0, def: { ...r0.def, name: tx(r0.def.name), description: txData(r0.def.description), params: localParams(r0.def.params) } } : r0;
    if (r.error) errors.push({ file: f.file, message: r.error });
    if (!r.def || seen.has(r.def.id)) continue;
    seen.add(r.def.id);
    const run = glRunner();
    if (run.available && !run.compile(r.def)) {
      errors.push({ file: f.file, message: `${r.def.name}: ${run.errors.get(r.def.id) ?? tx('шейдер не собрался')}` });
      continue;
    }
    defs.push(r.def);
  }
  setGlPlugins(defs, errors);
}

export function glDef(id: string | undefined | null): GlDef | undefined {
  if (!id) return undefined;
  if (id.startsWith('plug:')) return plugins.find((d) => d.id === id);
  return transitions.find((d) => d.id === id) ?? effects.find((d) => d.id === id);
}
export const glTransitions = (): GlDef[] => [...transitions, ...plugins.filter((d) => d.kind === 'transition')];
export const glEffects = (): GlDef[] => [...effects, ...plugins.filter((d) => d.kind === 'effect')];
export const glPlugins = (): GlDef[] => plugins;
export const glCatalogLoaded = (): boolean => transitions.length > 0;
export const glPluginErrors = (): PluginIssue[] => pluginErrors;

/** Перерисовать компонент, когда каталог или плагины поменялись. */
export function useGlCatalog(): number {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version);
}
