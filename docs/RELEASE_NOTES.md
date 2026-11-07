## Kadro 0.9.7

### ⬇ Скачать / Download

- **[Kadro-Setup-0.9.7.exe](https://github.com/honeyjostar/kadro/releases/download/v0.9.7/Kadro-Setup-0.9.7.exe)** — установщик, около 337 МБ. Рекомендуется. / Installer, recommended.
- [Kadro-0.9.7-portable.zip](https://github.com/honeyjostar/kadro/releases/download/v0.9.7/Kadro-0.9.7-portable.zip) — без установки, около 540 МБ. / Portable.

Kadro 0.6.0 и новее обновится сам: «Вышел Kadro 0.9.7» → «Обновить». Со старых версий — поставь установщик поверх, проекты и настройки сохранятся.

### Новое
- **Миниатюры на настоящих кадрах.** Переходы, эффекты, фильтры и каталог плагинов показаны не на буквах «A» и «B», а на живых кадрах: переход — с дороги на закате на мотоциклиста в неоне, эффекты — на мотоциклисте, фильтры — на горной долине (небо, зелень, снег). Сразу видно, что делает каждый. Если клип выделен, фильтры, как и раньше, показывают его кадр.

### В 0.9.5–0.9.6
- **Главный экран: телефон поворачивается в широкий экран** — ролик на настоящих кадрах, смонтированный в Kadro, вертикальный и горизонтальный.
- **Канал Kadro в Telegram — [t.me/kadroOffical](https://t.me/kadroOffical)**: кнопка «Telegram» на главном экране и в «Настройки» → «Помощь».

### В 0.9.3–0.9.4
- **Автосубтитры на видеокарте.** «Настройки» → «Распознавание речи»: «Авто», «Видеокарта», «Процессор». Видеокарта работает через DirectML — NVIDIA, AMD и Intel (и встроенная) в Windows 10 и 11; на ноутбуке берётся самая мощная. В «Авто» Kadro при первом распознавании сравнивает видеокарту и процессор на самой записи и дальше распознаёт на том, что быстрее у тебя. Честно: модели Kadro сжатые (int8), и на мощном процессоре видеокарта бывает не быстрее — тогда «Авто» оставляет процессор. В 0.9.4 исправлено: если перед субтитрами качалась модель, видеокарта по ошибке помечалась как неподходящая. Спасибо Fedosyk за идею!

### New
- **Thumbnails on real footage.** Transitions, effects, filters and the plugin catalog are previewed on real frames instead of the letters A and B, so you see what each one does at a glance.

### In 0.9.5–0.9.6
- **Home screen: the phone turns into a wide screen** with a real-footage edit made in Kadro. **Telegram channel** — [t.me/kadroOffical](https://t.me/kadroOffical).

### In 0.9.3–0.9.4
- **Auto captions on the graphics card** (DirectML: NVIDIA, AMD, Intel on Windows 10/11). Settings → Speech recognition: Auto compares the graphics card and the processor on your recording and keeps the faster one. Kadro's models are compressed (int8), so with a strong processor the graphics card may not be faster — then Auto keeps the processor.

В 0.9.2 — первый запуск с выбором языка, темы и формата; в 0.9.1 — готовые субтитры .srt и .vtt; в 0.9.0 — видеокарты NVIDIA, AMD и Intel кодируют видео, надёжное скачивание моделей ИИ, авто-ролик лучше, 3D мышкой; в 0.8.0 — «Повторить монтаж по ролику», свои шрифты. Полный список — в [README](https://github.com/honeyjostar/kadro#readme).
