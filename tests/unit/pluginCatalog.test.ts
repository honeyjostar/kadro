import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGlsl, pluginDef } from '../../src/shared/gl/glsl';
import { buildIndex, kindOfSource, safePluginFile, validEntry, type CatalogIndex } from '../../src/shared/pluginCatalog';

const root = path.join(__dirname, '..', '..', 'community-plugins');
const files = ['transitions', 'effects'].flatMap((d) => fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith('.glsl')).sort().map((f) => {
  const buf = fs.readFileSync(path.join(root, d, f));
  return { file: `${d}/${f}`, src: buf.toString('utf8'), sha256: createHash('sha256').update(buf).digest('hex'), size: buf.length };
}));

describe('каталог плагинов сообщества', () => {
  it('index.json совпадает с файлами (после правки шейдера — npm run plugins:index)', () => {
    const index = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8')) as CatalogIndex;
    expect(index).toEqual(buildIndex(files));
  });

  it('каждый плагин: название, описание, автор, лицензия, без ошибок разбора, проходит проверку записи', () => {
    const index = buildIndex(files);
    expect(index.plugins.length).toBeGreaterThanOrEqual(14);
    for (const e of index.plugins) {
      expect(validEntry(e), e.file).toBe(true);
      const src = files.find((f) => f.file === e.file)!.src;
      const m = parseGlsl(src);
      expect(m.errors, e.file).toEqual([]);
      expect([m.name, m.description, m.author, m.license].every(Boolean), e.file).toBe(true);
      expect(kindOfSource(src), e.file).toBe(e.kind);
      expect(pluginDef(e.kind, e.file, src).def?.id).toBe(`plug:${e.id}`);
      // параметры с ползунком — с понятной подписью
      for (const p of m.params) if (p.min !== undefined) expect(p.label, `${e.file}: ${p.name}`).toBeTruthy();
    }
  });

  it('запись из сети проверяется строго: путь, id, хеш, размер', () => {
    const ok = buildIndex(files).plugins[0];
    expect(validEntry(ok)).toBe(true);
    expect(validEntry({ ...ok, file: '../../evil.glsl' })).toBe(false);
    expect(validEntry({ ...ok, file: 'effects/x.glsl' })).toBe(false); // переход не в той папке
    expect(validEntry({ ...ok, id: 't/other' })).toBe(false);
    expect(validEntry({ ...ok, sha256: 'zz' })).toBe(false);
    expect(validEntry({ ...ok, size: 10 ** 7 })).toBe(false);
    expect(validEntry({ ...ok, tags: [1] })).toBe(false);
    expect(validEntry(null)).toBe(false);
  });

  it('имя файла и вид плагина при установке с диска', () => {
    expect(safePluginFile('C:\\Users\\Т\\Downloads\\My Cool Wipe (1).glsl')).toBe('My-Cool-Wipe-1.glsl');
    expect(safePluginFile('/x/Мой шейдер.frag')).toBe('Moi-sheider.glsl');
    expect(safePluginFile('/x/★★.glsl')).toBeNull();
    expect(safePluginFile('a.b.glsl')).toBe('a.b.glsl');
    expect(kindOfSource('vec4 transition(vec2 uv) { return getToColor(uv); }')).toBe('transition');
    expect(kindOfSource('vec4 effect (vec2 p) { return getColor(p); }')).toBe('effect');
    expect(kindOfSource('void main() {}')).toBeNull();
  });
});
