# Сторонние компоненты

Kadro распространяется под GNU GPL v3 или новее. В установщик входят или скачиваются при использовании:

| Компонент | Лицензия | Как используется |
|---|---|---|
| [Electron](https://www.electronjs.org/) (Chromium, Node.js) | MIT; лицензии Chromium — `LICENSES.chromium.html` в папке программы | окно программы |
| [FFmpeg](https://ffmpeg.org/), сборка [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) | GPL (с libx264, libvpx, libopus, vid.stab, rubberband и др.) | экспорт и обработка; отдельные программы `ffmpeg.exe`/`ffprobe.exe`, текст лицензии — `resources/bin/FFMPEG-LICENSE.txt`, исходники — на сайте FFmpeg и в репозитории сборки |
| [ONNX Runtime](https://onnxruntime.ai/) | MIT | запуск нейросетей |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | Apache-2.0 | распознавание речи, озвучка, детектор речи |
| [Robust Video Matting](https://github.com/PeterL1n/RobustVideoMatting) | GPL-3.0 | удаление фона, слежение за человеком |
| [Silero VAD](https://github.com/snakers4/silero-vad) | MIT | поиск речи и пауз |
| [RNNoise](https://github.com/xiph/rnnoise) / [arnndn-models](https://github.com/GregorR/rnnoise-models) | BSD-3-Clause | чистка голоса |
| NVIDIA Parakeet TDT 0.6B v3 (через sherpa-onnx) | CC-BY-4.0 | модель распознавания речи, скачивается по кнопке |
| GigaAM v2 (через sherpa-onnx) | MIT | модель распознавания русской речи, скачивается по кнопке |
| Голоса [Piper](https://github.com/rhasspy/piper) (ru_RU irina, dmitri, denis, ruslan; en_US amy, ryan) | лицензии авторов голосов (см. `MODEL_CARD` в архиве голоса) | озвучка текста, скачиваются по кнопке |
| 122 шрифта с кириллицей через [Fontsource](https://fontsource.org/) (Google Fonts): полный список — `FONTS` в `src/shared/defaults.ts` | SIL Open Font License 1.1; Roboto Slab — Apache-2.0; Ubuntu и Ubuntu Mono — Ubuntu Font Licence 1.0 | интерфейс и текст в видео |
| [React](https://react.dev/), [zustand](https://github.com/pmndrs/zustand), [lucide](https://lucide.dev/) | MIT / ISC | интерфейс |

Модели, которые скачиваются по кнопке, не входят в установщик: программа берёт их с GitHub проекта sherpa-onnx.

Демо-ролики, демо-бит и превью шаблонов (`resources/demo`, `resources/templates`) сделаны в самом проекте кодом — `scripts/make-demo.mjs`, `scripts/demo-scenes.js`, `tests/e2e/previews.spec.ts` — и распространяются под лицензией Kadro.
