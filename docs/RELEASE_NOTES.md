## Kadro 0.9.0

### ⬇ Скачать / Download

- **[Kadro-Setup-0.9.0.exe](https://github.com/honeyjostar/kadro/releases/download/v0.9.0/Kadro-Setup-0.9.0.exe)** — установщик, около 315 МБ. Рекомендуется. / Installer, recommended.
- [Kadro-0.9.0-portable.zip](https://github.com/honeyjostar/kadro/releases/download/v0.9.0/Kadro-0.9.0-portable.zip) — без установки, около 513 МБ. / Portable.

Kadro 0.6.0 и новее обновится сам: «Вышел Kadro 0.9.0» → «Обновить». Со старых версий — поставь установщик поверх, проекты и настройки сохранятся.

### Новое
- **Видеокарта кодирует видео — и NVIDIA, и AMD, и Intel.** Раньше Kadro искал только NVIDIA, и с драйвером старше 610 не видел даже её (так требовала новая сборка FFmpeg). Теперь FFmpeg 8.1 — NVENC работает с драйвером **570 и новее**; добавлены AMD (AMF), Intel (Quick Sync) и общий кодировщик через Windows. В «Настройки» → **«Компьютер»** — процессор, память, видеокарты с версией драйвера и что с каждым кодировщиком; если мешает драйвер — кнопка «Скачать драйвер» и «Проверить снова». В окне экспорта видно, какая видеокарта кодирует или почему нет.
- **Модели ИИ скачиваются надёжно.** Через системные настройки сети (прокси, VPN, сертификаты Windows — антивирусы с проверкой HTTPS больше не мешают), с докачкой после обрыва, копией моделей на GitHub Kadro и понятной причиной, если не вышло. Новый раздел «Настройки» → **«Модели ИИ»**: скачать, удалить, скачать файл в браузере и поставить **«Из файла…»**.
- **Авто-ролик монтирует заметно лучше.** Не берёт брак: стоп-кадры, расфокус, тряску, рывки камеры, темноту, начало и конец видео. Находит «раз» в такте и начала фраз — склейки ложатся на сильные доли, середина перехода — точно на долю. Вспышек и помех в разы меньше (на фразах и дропах, не чаще раза в 3 с), цвет мягче. Куски разных файлов идут вперемешку, без повторов; из однообразного видео — меньше кусков.
- **3D: крути как хочешь.** Мышкой прямо в превью (тянуть — поворот, Shift — крен, правая кнопка — сдвиг, колёсико — приближение), поворот по осям X, Y, Z, сдвиг и приближение, **анимация от угла к углу** с плавностью, ось вращения.

### New
- **GPU encoding on NVIDIA, AMD and Intel.** Kadro now ships FFmpeg 8.1 (NVENC works with driver **570+**; the previous build needed 610+), adds AMD AMF, Intel Quick Sync and Windows Media Foundation, and shows your CPU, RAM, GPUs and why a GPU doesn't encode in Settings → **Computer**, with a driver download button.
- **Reliable AI model downloads**: system proxy/VPN and Windows certificates, resume after a dropped connection, a Kadro mirror, clear error reasons, and Settings → **AI models** with “download in browser” and “From file…”.
- **Much better Auto Video**: no freeze frames, out-of-focus, shaky or whip-pan pieces; cuts on the downbeat and phrase starts, transitions centred on the beat; far fewer flashes; clips from different files interleaved.
- **3D objects**: rotate with the mouse, X/Y/Z axes, move and zoom, animate from one angle to another.

В 0.8.0 — «Повторить монтаж по ролику», ластик для хромакея, свои шрифты, «Собрать проект в папку»; в 0.7.x — английский интерфейс. Полный список — в [README](https://github.com/honeyjostar/kadro#readme).
