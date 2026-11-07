## Kadro 0.9.6

### ⬇ Скачать / Download

- **[Kadro-Setup-0.9.6.exe](https://github.com/honeyjostar/kadro/releases/download/v0.9.6/Kadro-Setup-0.9.6.exe)** — установщик, около 337 МБ. Рекомендуется. / Installer, recommended.
- [Kadro-0.9.6-portable.zip](https://github.com/honeyjostar/kadro/releases/download/v0.9.6/Kadro-0.9.6-portable.zip) — без установки, около 540 МБ. / Portable.

Kadro 0.6.0 и новее обновится сам: «Вышел Kadro 0.9.6» → «Обновить». Со старых версий — поставь установщик поверх, проекты и настройки сохранятся.

### Новое
- **Главный экран: телефон поворачивается в широкий экран.** Ролик в телефоне теперь на настоящих кадрах (ночной город, океан, дорога, мотоцикл, салют) и смонтирован в самом Kadro. Доиграл вертикальный — телефон поворачивается, становится экраном и показывает тот же монтаж в 16:9. Надписи в ролике — на языке интерфейса. Если в Windows включено «Уменьшить движение», телефон меняется на экран без поворота.
- Демо-проект — тот же монтаж на встроенных роликах: 8 окошек, переходы, эффекты и надписи. Цифры в нём свежие: 181 переход, 54 эффекта.
- **Канал Kadro в Telegram — [t.me/kadroOffical](https://t.me/kadroOffical)** (с 0.9.5): кнопка «Telegram» на главном экране и в «Настройки» → «Помощь».

### В 0.9.3–0.9.4
- **Автосубтитры на видеокарте.** «Настройки» → «Распознавание речи»: «Авто», «Видеокарта», «Процессор». Видеокарта работает через DirectML — NVIDIA, AMD и Intel (и встроенная) в Windows 10 и 11; на ноутбуке берётся самая мощная. В «Авто» Kadro при первом распознавании сравнивает видеокарту и процессор на самой записи и дальше распознаёт на том, что быстрее у тебя. Честно: модели Kadro сжатые (int8), и на мощном процессоре видеокарта бывает не быстрее — тогда «Авто» оставляет процессор. В 0.9.4 исправлено: если перед субтитрами качалась модель, видеокарта по ошибке помечалась как неподходящая. Спасибо Fedosyk за идею!

### New
- **Home screen: the phone turns into a wide screen.** The video in the phone now uses real footage and was edited in Kadro itself. When the vertical version ends, the phone rotates into a 16:9 screen with the same edit. Text in the video follows the interface language.
- **Kadro channel on Telegram — [t.me/kadroOffical](https://t.me/kadroOffical)** (since 0.9.5).

### In 0.9.3–0.9.4
- **Auto captions on the graphics card** (DirectML: NVIDIA, AMD, Intel on Windows 10/11). Settings → Speech recognition: Auto compares the graphics card and the processor on your recording and keeps the faster one. Kadro's models are compressed (int8), so with a strong processor the graphics card may not be faster — then Auto keeps the processor.

В 0.9.2 — первый запуск с выбором языка, темы и формата; в 0.9.1 — готовые субтитры .srt и .vtt; в 0.9.0 — видеокарты NVIDIA, AMD и Intel кодируют видео, надёжное скачивание моделей ИИ, авто-ролик лучше, 3D мышкой; в 0.8.0 — «Повторить монтаж по ролику», свои шрифты. Полный список — в [README](https://github.com/honeyjostar/kadro#readme).
