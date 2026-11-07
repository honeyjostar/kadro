## Kadro 0.9.5

### ⬇ Скачать / Download

- **[Kadro-Setup-0.9.5.exe](https://github.com/honeyjostar/kadro/releases/download/v0.9.5/Kadro-Setup-0.9.5.exe)** — установщик, около 328 МБ. Рекомендуется. / Installer, recommended.
- [Kadro-0.9.5-portable.zip](https://github.com/honeyjostar/kadro/releases/download/v0.9.5/Kadro-0.9.5-portable.zip) — без установки, около 531 МБ. / Portable.

Kadro 0.6.0 и новее обновится сам: «Вышел Kadro 0.9.5» → «Обновить». Со старых версий — поставь установщик поверх, проекты и настройки сохранятся.

### Новое
- **Канал Kadro в Telegram — [t.me/kadroOffical](https://t.me/kadroOffical)**: новости, обновления, ответы на вопросы. Кнопка «Telegram» — на главном экране и в «Настройки» → «Помощь».

### В 0.9.3–0.9.4
- **Автосубтитры на видеокарте.** «Настройки» → «Распознавание речи»: «Авто», «Видеокарта», «Процессор». Видеокарта работает через DirectML — NVIDIA, AMD и Intel (и встроенная) в Windows 10 и 11; на ноутбуке берётся самая мощная. В «Авто» Kadro при первом распознавании сравнивает видеокарту и процессор на самой записи и дальше распознаёт на том, что быстрее у тебя. Честно: модели Kadro сжатые (int8), и на мощном процессоре видеокарта бывает не быстрее — тогда «Авто» оставляет процессор. В 0.9.4 исправлено: если перед субтитрами качалась модель, видеокарта по ошибке помечалась как неподходящая. Спасибо Fedosyk за идею!

### New
- **Kadro channel on Telegram — [t.me/kadroOffical](https://t.me/kadroOffical)**: news, updates, answers. The Telegram button is on the home screen and in Settings → Help.

### In 0.9.3–0.9.4
- **Auto captions on the graphics card** (DirectML: NVIDIA, AMD, Intel on Windows 10/11). Settings → Speech recognition: Auto compares the graphics card and the processor on your recording and keeps the faster one. Kadro's models are compressed (int8), so with a strong processor the graphics card may not be faster — then Auto keeps the processor.

В 0.9.2 — первый запуск с выбором языка, темы и формата; в 0.9.1 — готовые субтитры .srt и .vtt; в 0.9.0 — видеокарты NVIDIA, AMD и Intel кодируют видео, надёжное скачивание моделей ИИ, авто-ролик лучше, 3D мышкой; в 0.8.0 — «Повторить монтаж по ролику», свои шрифты. Полный список — в [README](https://github.com/honeyjostar/kadro#readme).
