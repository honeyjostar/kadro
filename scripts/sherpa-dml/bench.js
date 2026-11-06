// Проверка сборки sherpa-onnx с DirectML: распознавание одной записи на процессоре и через DirectML, время и текст.
// node bench.js <папка модели> <wav> <cpu|directml> <giga|parakeet> [секунд звука]
const sherpa = require('sherpa-onnx-node');
const path = require('path');
const { execSync } = require('child_process');
const [model, wav, provider = 'cpu', kind = 'giga', maxSec = '0'] = process.argv.slice(2);
const w = sherpa.readWave(wav);
let samples = w.samples;
if (Number(maxSec) > 0) samples = samples.slice(0, Number(maxSec) * w.sampleRate);
const dur = samples.length / w.sampleRate;
const files = kind === 'giga'
  ? { encoder: 'encoder.int8.onnx', decoder: 'decoder.onnx', joiner: 'joiner.onnx', dim: 64 }
  : { encoder: 'encoder.int8.onnx', decoder: 'decoder.int8.onnx', joiner: 'joiner.int8.onnx', dim: 128 };
const t0 = Date.now();
const rec = new sherpa.OfflineRecognizer({
  featConfig: { sampleRate: 16000, featureDim: files.dim },
  modelConfig: { transducer: { encoder: path.join(model, files.encoder), decoder: path.join(model, files.decoder), joiner: path.join(model, files.joiner) }, tokens: path.join(model, 'tokens.txt'), numThreads: 4, provider, modelType: 'nemo_transducer', debug: 0 },
});
const t1 = Date.now();
// как в Kadro: фразы разной длины (здесь — куски по 7–18 с), первая — вхолостую
const cuts = [];
for (let i = 0, k = 0; i < samples.length; k++) { const len = (7 + (k * 5) % 12) * w.sampleRate; cuts.push(samples.slice(i, i + len)); i += len; }
const dec = (s) => { const st = rec.createStream(); st.acceptWaveform({ samples: s, sampleRate: w.sampleRate }); rec.decode(st); return rec.getResult(st).text; };
const tw = Date.now(); dec(cuts[0]); const warm = Date.now() - tw;
const t2 = Date.now();
let text = '';
for (const c of cuts) text += dec(c) + ' ';
const t3 = Date.now();
let mods = '';
try {
  mods = execSync(`powershell -NoProfile -Command "(Get-Process -Id ${process.pid}).Modules | Where-Object { $_.ModuleName -match 'DirectML|onnxruntime|d3d12|dxgi|sherpa' } | Select-Object -ExpandProperty FileName"`).toString().trim().split(/\r?\n/).join(' ; ');
} catch (e) { mods = String(e.message).slice(0, 200); }
console.log(JSON.stringify({ kind, provider, loadMs: t1 - t0, warmMs: warm, decodeMs: t3 - t2, audioSec: dur, rtf: +((t3 - t2) / 1000 / dur).toFixed(4), text: text.trim().slice(0, 160), mods }));
