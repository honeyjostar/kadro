// Пересобрать community-plugins/index.json по файлам .glsl: npm run plugins:index
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildIndex } from '../src/shared/pluginCatalog';

const root = path.resolve('community-plugins');
const files: { file: string; src: string; sha256: string; size: number }[] = [];
for (const dir of ['transitions', 'effects']) {
  for (const n of fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.glsl')).sort()) {
    const buf = fs.readFileSync(path.join(root, dir, n));
    files.push({ file: `${dir}/${n}`, src: buf.toString('utf8'), sha256: createHash('sha256').update(buf).digest('hex'), size: buf.length });
  }
}
const index = buildIndex(files);
fs.writeFileSync(path.join(root, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`index.json: ${index.plugins.length} плагинов`);
