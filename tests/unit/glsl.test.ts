import { describe, expect, it } from 'vitest';
import list from '../../src/shared/gl/transitions.json';
import { GL_EFFECT_SOURCES } from '../../src/shared/gl/effects';
import {
  GL_RU, builtinTransitions, checkBody, effectFragment, glCategory, isGlType, paramsFromJson, parseGlsl, pluginDef, prettyName, transitionFragment,
  type GlTransitionJson,
} from '../../src/shared/gl/glsl';

describe('шейдеры: разбор и каталог', () => {
  it('заголовок плагина: название, автор, лицензия, теги, параметры с подсказками @range', () => {
    const m = parseGlsl(`// Name: Моя волна
// Author: Тим
// License: MIT
// Description: Кадр качается
// Tags: wave, Distort
// @range(1, 30) Частота
uniform float frequency; // = 12.0
uniform vec2 center; // = vec2(0.5, 0.25)
uniform bool flip; // = true
uniform int steps; // = 4.7
uniform float amount; // встроенная — не параметр
uniform sampler2D image;
uniform mat3 nope;
vec4 effect(vec2 uv) { return getColor(uv); }`);
    expect([m.name, m.author, m.license, m.description]).toEqual(['Моя волна', 'Тим', 'MIT', 'Кадр качается']);
    expect(m.tags).toEqual(['wave', 'distort']);
    expect(m.params).toEqual([
      { name: 'frequency', type: 'float', value: 12, min: 1, max: 30, label: 'Частота' },
      { name: 'center', type: 'vec2', value: [0.5, 0.25] },
      { name: 'flip', type: 'bool', value: true },
      { name: 'steps', type: 'int', value: 5 },
    ]);
    expect(m.errors).toEqual(['Параметр nope: тип mat3 не поддерживается']);
  });

  it('параметры без значения — нули; @range не переносится на чужую строку', () => {
    const m = parseGlsl('// @range(0, 1) Сила\nfloat x = 1.0;\nuniform float a;\nuniform vec3 c; // = 0.5');
    expect(m.params).toEqual([{ name: 'a', type: 'float', value: 0 }, { name: 'c', type: 'vec3', value: [0.5, 0.5, 0.5] }]);
  });

  it('123 перехода gl-transitions: у всех русское название, раздел и тело transition(uv)', () => {
    const defs = builtinTransitions(list as GlTransitionJson[]);
    expect(defs).toHaveLength(123);
    expect(new Set(defs.map((d) => d.id)).size).toBe(123);
    for (const d of defs) {
      expect(GL_RU[d.id.slice(3)], d.id).toBeTruthy();
      expect(checkBody('transition', d.glsl), d.id).toBeNull();
      expect(d.license, d.id).toMatch(/MIT|BSD/);
    }
    const cube = defs.find((d) => d.id === 'gl:Cube')!;
    expect(cube.name).toBe('Куб');
    expect(cube.cat).toBe('gl3d');
    expect(cube.params.find((p) => p.name === 'persp')).toMatchObject({ value: 0.7, min: 0, max: 1 });
    const cats = new Set(defs.map((d) => d.cat));
    expect([...cats].sort()).toEqual(['basic', 'gl3d', 'glglitch', 'glwarp', 'glzoom', 'move', 'shape', 'wipe']);
  });

  it('встроенные эффекты: разбираются, у каждого effect(uv)', () => {
    for (const [k, src] of Object.entries(GL_EFFECT_SOURCES)) {
      expect(checkBody('effect', src), k).toBeNull();
      const m = parseGlsl(src);
      expect(m.name, k).toBeTruthy();
      expect(m.errors, k).toEqual([]);
    }
  });

  it('плагин из файла: id по имени файла, без функции — понятная ошибка', () => {
    const ok = pluginDef('effect', 'C:\\Users\\T\\.kadro\\plugins\\effects\\my-glow.glsl', 'vec4 effect(vec2 uv) { return getColor(uv); }');
    expect(ok.def).toMatchObject({ id: 'plug:e/my-glow', kind: 'effect', name: 'my glow', cat: 'plugins' });
    const tr = pluginDef('transition', '/home/t/.kadro/plugins/transitions/SuperSwipe.glsl', '// Name: Супер\nvec4 transition (vec2 p) { return getToColor(p); }');
    expect(tr.def?.id).toBe('plug:t/SuperSwipe');
    expect(tr.def?.name).toBe('Супер');
    const bad = pluginDef('transition', 'x/broken.glsl', 'vec4 effect(vec2 uv) { return vec4(1.0); }');
    expect(bad.def).toBeNull();
    expect(bad.error).toBe('broken: Нет функции vec4 transition(vec2 uv)');
  });

  it('обёртка шейдера и мелочи', () => {
    expect(transitionFragment('X')).toContain('vec4 getFromColor(vec2 uv)');
    expect(transitionFragment('X')).toContain('gl_FragColor = transition(_uv)');
    expect(effectFragment('Y')).toContain('uniform float amount;');
    expect(prettyName('SplitSlideInOutVertical')).toBe('Split Slide In Out Vertical');
    expect(isGlType('gl:Cube')).toBe(true);
    expect(isGlType('plug:t/x')).toBe(true);
    expect(isGlType('fade')).toBe(false);
    expect(glCategory(['wipe', 'clock'])).toBe('wipe');
    expect(glCategory(['fade', 'blend'])).toBe('basic');
    expect(paramsFromJson({ dir: [1, 0] }, { dir: 'vec2', tex: 'sampler2D' }, '')).toEqual([{ name: 'dir', type: 'vec2', value: [1, 0], min: undefined, max: undefined, label: undefined }]);
  });
});
