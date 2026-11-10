// Сборка главного процесса, preload и ИИ-процесса (esbuild).
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  external: ['electron', 'sherpa-onnx-node', 'onnxruntime-node', 'sherpa-onnx-*'],
  logLevel: 'warning',
  // дата сборки — в «Настройки → Обновления» показывается «Kadro от …» вместо номера версии
  define: { __KADRO_BUILD_DATE__: JSON.stringify(process.env.KADRO_BUILD_DATE || new Date().toISOString().slice(0, 10)) },
};

await Promise.all([
  build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js' }),
  build({ ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload/preload.js' }),
  build({ ...common, entryPoints: ['src/worker/aiWorker.ts'], outfile: 'dist/worker/aiWorker.js' }),
]);
console.log('main/preload/worker собраны');
