## Kadro 0.9.3

### ⬇ Скачать / Download

- **[Kadro-Setup-0.9.3.exe](https://github.com/honeyjostar/kadro/releases/download/v0.9.3/Kadro-Setup-0.9.3.exe)** — установщик, около 315 МБ. Рекомендуется. / Installer, recommended.
- [Kadro-0.9.3-portable.zip](https://github.com/honeyjostar/kadro/releases/download/v0.9.3/Kadro-0.9.3-portable.zip) — без установки, около 513 МБ. / Portable.

Kadro 0.6.0 и новее обновится сам: «Вышел Kadro 0.9.3» → «Обновить». Со старых версий — поставь установщик поверх, проекты и настройки сохранятся.

### Новое
- **Автосубтитры на видеокарте.** «Настройки» → «Распознавание речи»: «Авто», «Видеокарта», «Процессор». Видеокарта работает через DirectML — NVIDIA, AMD и Intel (и встроенная) в Windows 10 и 11; на ноутбуке берётся самая мощная. В «Авто» Kadro при первом распознавании сравнивает видеокарту и процессор на самой записи и дальше распознаёт на том, что быстрее у тебя, — сравнение и время видны там же. Видеокарта не включилась или сбоит — субтитры всё равно получатся, на процессоре. Спасибо Fedosyk за идею!

### New
- **Auto captions on the graphics card.** Settings → Speech recognition: Auto, Graphics card, Processor. The graphics card runs through DirectML — NVIDIA, AMD and Intel (including integrated) on Windows 10 and 11; laptops use the most powerful one. Auto compares the graphics card and the processor on your recording the first time and keeps using whichever is faster on your computer. If the graphics card fails, captions are still made on the processor.

В 0.9.2 — первый запуск с выбором языка, темы и формата; в 0.9.1 — готовые субтитры .srt и .vtt; в 0.9.0 — видеокарты NVIDIA, AMD и Intel кодируют видео, надёжное скачивание моделей ИИ, авто-ролик лучше, 3D мышкой; в 0.8.0 — «Повторить монтаж по ролику», свои шрифты. Полный список — в [README](https://github.com/honeyjostar/kadro#readme).
