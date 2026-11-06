// Какая сборка sherpa-onnx в процессе речи: обычная (только процессор) или с DirectML (ещё и видеокарта).
// У сборок разные onnxruntime.dll, а Windows держит в процессе только одну с таким именем, поэтому сборка
// выбирается при запуске процесса — до первого require('sherpa-onnx-node'): его аддон подменяется в кеше модулей.
import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';

/** Подключить сборку с DirectML из dir. Ошибка (нет файлов, не загрузились DLL) — текст; тогда остаётся обычная. */
export function useDmlSherpa(dir: string): string | null {
  const file = path.join(dir, 'sherpa-onnx.node');
  if (!fs.existsSync(file)) return `not found: ${file}`; // только в журнал
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const native = require(file);
    const addonFile = require.resolve('sherpa-onnx-node/addon.js');
    const m = new Module(addonFile);
    m.filename = addonFile;
    m.loaded = true;
    m.exports = native;
    require.cache[addonFile] = m;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
