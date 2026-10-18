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
};

await Promise.all([
  build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js' }),
  build({ ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload/preload.js' }),
  build({ ...common, entryPoints: ['src/worker/aiWorker.ts'], outfile: 'dist/worker/aiWorker.js' }),
]);
console.log('main/preload/worker собраны');
