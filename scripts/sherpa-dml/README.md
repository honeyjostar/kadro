# sherpa-onnx с DirectML

Распознавание речи на видеокарте (NVIDIA, AMD, Intel в Windows 10/11). Готовых сборок sherpa-onnx с DirectML нет,
поэтому Kadro собирает свою — той же версии, что `sherpa-onnx-node` в `package.json`:

- workflow `.github/workflows/sherpa-dml.yml` (запуск вручную) — сборка с ONNX Runtime 1.22 (DirectML 1.15.4),
  проверка и выкладка в релиз `native-deps`;
- `patch_session.py` — два изменения в `sherpa-onnx/csrc/session.cc`:
  самая производительная видеокарта (`SessionOptionsAppendExecutionProvider_DML2`, на ноутбуке — дискретная;
  `SHERPA_ONNX_DML_DEVICE=<номер>` — конкретная) и загрузка своей `DirectML.dll` из папки `onnxruntime.dll`
  (иначе Windows подхватила бы старую из System32);
- `bench.js` — замер: одна запись на процессоре и через DirectML, время и текст.

`scripts/pack-win.mjs` кладёт сборку в `resources/sherpa-dml`; процесс речи подключает её, когда распознаёт
на видеокарте (`src/worker/sherpaBuild.ts`), выбор и сравнение — `src/shared/asrDevice.ts` и `src/main/main.ts`.
