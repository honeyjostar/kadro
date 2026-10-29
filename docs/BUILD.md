# Сборка Kadro из исходников

## Что внутри

| Часть | Технологии |
|---|---|
| Окно и интерфейс | Electron 44, React 19, TypeScript, Vite, zustand |
| Превью | Canvas 2D + WebGL2 (хромакей, цветовые таблицы), видео и звук — элементы `<video>`/`<audio>` + Web Audio |
| Экспорт и обработка | FFmpeg (граф фильтров строится в `src/shared/exportGraph.ts`) |
| ИИ | sherpa-onnx (речь, озвучка, детектор речи), ONNX Runtime (удаление фона, слежение за человеком), RNNoise (шум) |
| Тесты | Vitest (модули и FFmpeg), Playwright (всё приложение целиком) |

```
src/
  main/        процесс Electron: файлы, FFmpeg, экспорт, ИИ-задачи, модели
  worker/      отдельные процессы для ИИ (речь и картинка — раздельно)
  preload/     мост между окном и main
  renderer/    интерфейс (components/), превью (engine/), действия (actions.ts), состояние (store.ts)
  shared/      общая логика: таймлайн, анимация, цвет, эффекты, переходы, шаблоны, граф экспорта
tests/
  unit/        чистая логика
  integration/ экспорт и обработка через настоящий FFmpeg, сверка пикселей и звука
  e2e/         запуск программы, клики по интерфейсу, сравнение кадра плеера с кадром экспорта
scripts/       сборка main, установщик для Windows, загрузка моделей
```

Главное правило проекта: **плеер и экспорт считают картинку по одним и тем же формулам** (`src/shared/*`), а e2e-тесты сравнивают кадр плеера с кадром готового файла.

## Запуск для разработки

Нужно: **Node.js 22**, **FFmpeg 6.1 или новее** в `PATH` (либо пути в переменных `KADRO_FFMPEG` и `KADRO_FFPROBE`).

```bash
git clone https://github.com/honeyjostar/kadro.git
cd kadro
npm ci
npm run dev          # сборка и запуск
```

На Windows FFmpeg удобно поставить так: `winget install Gyan.FFmpeg` (или скачать сборку BtbN и прописать `KADRO_FFMPEG`).

Полезные переменные окружения:

| Переменная | Зачем |
|---|---|
| `KADRO_FFMPEG`, `KADRO_FFPROBE` | свой FFmpeg |
| `KADRO_DATA` | папка данных вместо `~/.kadro` (черновик, кэш, модели) |
| `KADRO_MODELS` | папка моделей ИИ |
| `KADRO_MULTI=1` | разрешить несколько окон программы (для тестов) |
| `ONNXRUNTIME_NODE_INSTALL=skip` | при `npm ci` не качать CUDA-версию ONNX Runtime (она не нужна) |

## Тесты

```bash
npm run typecheck
npm run test:unit                 # логика, секунды
npm test                          # + интеграционные с FFmpeg (несколько минут)
npm run models                    # скачать модели ИИ для тестов речи и озвучки (~730 МБ)
npx playwright test               # всё приложение (на Linux — через xvfb-run)
```

- Тесты речи и озвучки пропускаются, пока не скачаны модели (`npm run models`).
- Тесты удаления фона, стабилизации, автокадрирования и ретуши нужна фотография человека в полный рост: `KADRO_TEST_PERSON=путь/к/фото.jpg`. Без неё эти тесты пропускаются (чужие фото в репозиторий не кладём).
- `KADRO_SWIFTSHADER=1 npx playwright test` — то же на программной видеокарте (проверяет WebGL-путь превью).
- На Linux: `xvfb-run -a npx playwright test`.

## Демо-ролики и превью шаблонов

Всё в `resources/demo` и `resources/templates` сделано кодом, без чужих файлов, и идёт в установщик:

```bash
node scripts/make-demo.mjs              # 7 сцен (scripts/demo-scenes.js) + демо-бит → resources/demo
npm run build
KADRO_MAKE_PREVIEWS=1 xvfb-run -a npx playwright test previews   # демо-ролик и превью каждого шаблона
```

Превью собираются в самом Kadro: шаблон на демо-видео → экспорт → сжатие (`tests/e2e/previews.spec.ts`).
Один шаблон: `KADRO_MAKE_PREVIEWS=trip,reel …`. После правки шаблона в `src/shared/templates.ts` его превью нужно пересобрать.

## Картинки для README

Гифка, снимки экрана и обложка тоже снимаются с самой программы:

```bash
npm run build
KADRO_README=/tmp/readme xvfb-run -a npx playwright test readme   # кадры гифки (tour/) и снимки *.png
cd /tmp/readme/tour && ffmpeg -f concat -safe 0 -i list.txt \
  -vf "fps=12,scale=960:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" demo.gif
node scripts/make-banner.mjs docs/screenshots/editor.png          # docs/brand/banner.png и social-preview.png
```

В `tour/frames.json` — время каждого кадра и отметки начала и конца сборки авто-ролика: этот отрезок в гифке
удобно ускорить (в `docs/demo.gif` — в 5 раз).

## Установщик для Windows

Собирается на Linux (или в WSL). Нужны `nsis` и `unzip`:

```bash
sudo apt-get install -y nsis unzip
npm ci && npm run build
EV=$(node -p "require('electron/package.json').version")
curl -fL -o electron-win.zip "https://github.com/electron/electron/releases/download/v${EV}/electron-v${EV}-win32-x64.zip"
curl -fL -o ffmpeg-win.zip "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip"
node scripts/pack-win.mjs --electron electron-win.zip --ffmpeg ffmpeg-win.zip
```

Результат — `release/Kadro-Setup-<версия>.exe` (около 195 МБ; после установки программа занимает около 700 МБ) и папка `release/win-unpacked` с готовой программой.
Скрипт сам подкладывает Windows-версии нативных модулей (sherpa-onnx, ONNX Runtime), FFmpeg, встроенные модели, значок и лицензии.
Оформление установщика — картинки `resources/installer/wizard.bmp` (боковая панель) и `header.bmp` (шапка); их рисует `node scripts/make-installer-art.mjs` (HTML со шрифтами Kadro → снимок в 2× → BMP).

### Выпуск новой версии

1. Поменяй `version` в `package.json`, опиши изменения в `docs/RELEASE_NOTES.md` и обнови номер версии и размеры в прямых ссылках на скачивание (начало `README.md` и раздел «Установка», начало `docs/RELEASE_NOTES.md`).
2. Закоммить и отправь в `master`: `git commit -am "Версия 0.4.0" && git push`.
3. GitHub Actions (`.github/workflows/release.yml`) увидит новую версию, прогонит тесты, соберёт установщик и zip на своих серверах и сам создаст релиз `v0.4.0` (15–20 минут). Обычные коммиты без смены версии релиз не трогают.

Можно и вручную: опубликовать релиз в интерфейсе GitHub или отправить тег `vX.Y.Z` — файлы приложатся к нему.

К релизу прикладывается `SHA256SUMS.txt`: по нему установленный Kadro проверяет скачанное обновление
(`src/main/updater.ts`) и запускает установщик с ключом `/UPDATE` — без приветствия и выбора папки, только
полоска установки, затем новый Kadro открывается сам.

### Модели перевода и каталог плагинов

- Модели перевода OPUS-MT лежат в релизе `translate-models` (не «последний» — автообновление его не видит).
  Их кладёт туда workflow `.github/workflows/models-mirror.yml` (ветка `mirror-models`): скачивает ONNX-версии
  с Hugging Face и пишет `manifest.json` с размерами и SHA-256. Чтобы добавить направление — допиши пару в список
  в workflow и отправь ветку `mirror-models`.
- Каталог плагинов — папка `community-plugins/`. После правки или добавления шейдера: `npm run plugins:index`
  (пересобирает `index.json`), тест `tests/unit/pluginCatalog.test.ts` проверяет, что список совпадает с файлами.

## Как устроено коротко

![Схема: проект, превью, экспорт и общие формулы](brand/architecture.png)

- **Проект** — JSON (`src/shared/types.ts`): дорожки, клипы, ссылки на файлы. Все правки — чистые функции в `src/shared/timeline.ts`, история отмены — снимки проекта.
- **Превью** (`src/renderer/engine/preview.ts`) каждый кадр рисует слои на canvas; цвет — SVG-фильтр, кривые/HSL/LUT — 3D-таблица (WebGL2 или процессор), эффекты — `effectsPreview.ts`.
- **Экспорт** (`src/shared/exportGraph.ts`) превращает проект в граф фильтров FFmpeg; текст рисуется теми же функциями, что в превью, и подаётся в FFmpeg кадрами PNG.
- **ИИ-задачи** выполняются в отдельных процессах (`src/worker`), чтобы окно не подвисало; тяжёлые результаты (без фона, стабилизация, ретушь, реверс) — отдельные файлы, которые и плеер, и экспорт берут одинаково.
