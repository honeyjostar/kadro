## Kadro 0.9.4

### ⬇ Скачать / Download

- **[Kadro-Setup-0.9.4.exe](https://github.com/honeyjostar/kadro/releases/download/v0.9.4/Kadro-Setup-0.9.4.exe)** — установщик, около 328 МБ. Рекомендуется. / Installer, recommended.
- [Kadro-0.9.4-portable.zip](https://github.com/honeyjostar/kadro/releases/download/v0.9.4/Kadro-0.9.4-portable.zip) — без установки, около 531 МБ. / Portable.

Kadro 0.6.0 и новее обновится сам: «Вышел Kadro 0.9.4» → «Обновить». Со старых версий — поставь установщик поверх, проекты и настройки сохранятся.

### Исправлено
- **Распознавание на видеокарте** (появилось в 0.9.3): если перед субтитрами качалась модель или шла озвучка, Kadro по ошибке считал видеокарту неподходящей и больше её не пробовал. Теперь сравнение проходит честно; у кого так вышло — 0.9.4 сравнит заново сам.
- На видеокарте распознавание получает и все потоки процессора — то, что DirectML не умеет, считается быстрее.

### Что было в 0.9.3
- **Автосубтитры на видеокарте.** «Настройки» → «Распознавание речи»: «Авто», «Видеокарта», «Процессор». Видеокарта работает через DirectML — NVIDIA, AMD и Intel (и встроенная) в Windows 10 и 11; на ноутбуке берётся самая мощная. В «Авто» Kadro при первом распознавании сравнивает видеокарту и процессор на самой записи и дальше распознаёт на том, что быстрее у тебя. Честно: модели Kadro сжатые (int8), и на мощном процессоре видеокарта бывает не быстрее — тогда «Авто» оставляет процессор. Спасибо Fedosyk за идею!

### Fixed
- **Speech recognition on the graphics card** (new in 0.9.3): if a model download or voice-over ran before captions, Kadro wrongly marked the graphics card as unsuitable. The comparison is now fair; 0.9.4 re-checks automatically.
- On the graphics card, recognition also gets all processor threads for the parts DirectML can't run.

### In 0.9.3
- **Auto captions on the graphics card** (DirectML: NVIDIA, AMD, Intel on Windows 10/11). Settings → Speech recognition: Auto compares the graphics card and the processor on your recording and keeps the faster one. Kadro's models are compressed (int8), so with a strong processor the graphics card may not be faster — then Auto keeps the processor.


В 0.9.2 — первый запуск с выбором языка, темы и формата; в 0.9.1 — готовые субтитры .srt и .vtt; в 0.9.0 — видеокарты NVIDIA, AMD и Intel кодируют видео, надёжное скачивание моделей ИИ, авто-ролик лучше, 3D мышкой; в 0.8.0 — «Повторить монтаж по ролику», свои шрифты. Полный список — в [README](https://github.com/honeyjostar/kadro#readme).
