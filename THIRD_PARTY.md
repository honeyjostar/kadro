# Сторонние компоненты

Kadro распространяется под GNU GPL v3 или новее. В установщик входят или скачиваются при использовании:

| Компонент | Лицензия | Как используется |
|---|---|---|
| [Electron](https://www.electronjs.org/) (Chromium, Node.js) | MIT; лицензии Chromium — `LICENSES.chromium.html` в папке программы | окно программы |
| [FFmpeg](https://ffmpeg.org/), сборка [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) | GPL (с libx264, libvpx, libopus, vid.stab, rubberband и др.) | экспорт и обработка; отдельные программы `ffmpeg.exe`/`ffprobe.exe`, текст лицензии — `resources/bin/FFMPEG-LICENSE.txt`, исходники — на сайте FFmpeg и в репозитории сборки |
| [ONNX Runtime](https://onnxruntime.ai/) | MIT | запуск нейросетей |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | Apache-2.0 | распознавание речи, озвучка, детектор речи |
| Видео [Mixkit](https://mixkit.co) (номера 20064, 48525, 99872, 52427, 50989, 16610, 99864, 4155, 15919, 31096) | Mixkit Free License | только в составе смонтированного ролика на главном экране (`resources/demo/reel*.mp4`) и как три уменьшенных кадра-образца в миниатюрах переходов, эффектов, фильтров и каталога плагинов (`src/renderer/assets/sample-*.jpg`); на снимках интерфейса и в гифке на странице GitHub (`docs/screenshots`, `docs/demo.gif`, `docs/brand/banner.png`) — внутри окна Kadro; сами видео в Kadro не входят, демо-проект — на своих нарисованных роликах |
| sherpa-onnx, собранный с ONNX Runtime 1.22 и [DirectML](https://github.com/microsoft/DirectML) 1.15.4; библиотеки Microsoft Visual C++ (`msvcp140`, `vcruntime140` — распространяемые файлы Visual Studio) | Apache-2.0, MIT; DirectML и Visual C++ — по лицензиям Microsoft на распространяемые файлы | распознавание речи на видеокарте, `resources/sherpa-dml`; сборка — в релизе [native-deps](https://github.com/honeyjostar/kadro/releases/tag/native-deps) |
| [Robust Video Matting](https://github.com/PeterL1n/RobustVideoMatting) | GPL-3.0 | удаление фона, слежение за человеком |
| [Silero VAD](https://github.com/snakers4/silero-vad) | MIT | поиск речи и пауз |
| [RNNoise](https://github.com/xiph/rnnoise) / [arnndn-models](https://github.com/GregorR/rnnoise-models) | BSD-3-Clause | чистка голоса |
| NVIDIA Parakeet TDT 0.6B v3 (через sherpa-onnx) | CC-BY-4.0 | модель распознавания речи, скачивается по кнопке |
| GigaAM v2 (через sherpa-onnx) | MIT | модель распознавания русской речи, скачивается по кнопке |
| Модели перевода [OPUS-MT](https://github.com/Helsinki-NLP/Opus-MT) (Helsinki-NLP; Tiedemann, Thottingal, 2020) в формате ONNX ([Xenova](https://huggingface.co/Xenova)) | CC-BY-4.0 | перевод субтитров без интернета: русский ⇄ английский — в установщике, остальные языки скачиваются при первом переводе |
| Голоса [Piper](https://github.com/rhasspy/piper) (ru_RU irina, dmitri, denis, ruslan; en_US amy, ryan) | лицензии авторов голосов (см. `MODEL_CARD` в архиве голоса) | озвучка текста, скачиваются по кнопке |
| 122 шрифта с кириллицей через [Fontsource](https://fontsource.org/) (Google Fonts): полный список — `FONTS` в `src/shared/defaults.ts` | SIL Open Font License 1.1; Roboto Slab — Apache-2.0; Ubuntu и Ubuntu Mono — Ubuntu Font Licence 1.0 | интерфейс и текст в видео |
| [React](https://react.dev/), [zustand](https://github.com/pmndrs/zustand), [lucide](https://lucide.dev/) | MIT / ISC | интерфейс |
| [three.js](https://threejs.org/) (вместе с загрузчиками GLTF, OBJ, STL, FBX и RoomEnvironment) | MIT | 3D-объекты |
| [gl-transitions](https://github.com/gl-transitions/gl-transitions) — 123 перехода (npm `gl-transitions` 2.0.0) | MIT; InvertedPageCurl — BSD-3-Clause (Hewlett-Packard), StereoViewer — BSD-2-Clause (Theodore K Schundler); авторы и лицензии всех переходов — [docs/licenses/gl-transitions.md](docs/licenses/gl-transitions.md), тексты BSD — в коде этих переходов | переходы-шейдеры |

Модели, которые скачиваются по кнопке, не входят в установщик: распознавание речи и голоса программа берёт из релиза
[ai-models](https://github.com/honeyjostar/kadro/releases/tag/ai-models) этого репозитория (копия моделей проекта sherpa-onnx
без изменений, только перепакована в .tar; файлы сверяются по SHA-256), а если там их нет — с GitHub проекта sherpa-onnx;
модели перевода — из релиза [translate-models](https://github.com/honeyjostar/kadro/releases/tag/translate-models)
(копия с Hugging Face, файлы сверяются по SHA-256).

Демо-ролики, демо-бит, звуки на стыках (свуш, щелчок, «бум»), звуки мем-кнопок (`meme-*.m4a`: «дун-дун-дууун», своя басовая партия, басовый «дроп») и превью шаблонов (`resources/demo`, `resources/templates`) сделаны в самом проекте кодом — `scripts/make-demo.mjs`, `scripts/make-sfx.mjs`, `scripts/make-memes.mjs`, `scripts/demo-scenes.js`, `tests/e2e/previews.spec.ts` — и распространяются под лицензией Kadro.
