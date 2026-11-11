#!/usr/bin/env python3
"""Сайт Kadro: собирает site/index.html (русский), site/en/index.html, sitemap.xml и llms.txt из одного шаблона.

  python3 scripts/make-site.py                      # адрес — https://honeyjostar.github.io/kadro
  python3 scripts/make-site.py https://kadro.io     # свой домен (и site/CNAME)

Тексты — здесь, оформление — site/assets/style.css, поведение — site/assets/app.js.
Факты о CapCut и Premiere — только проверенные, с источниками под таблицей.
"""
import html
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'
BASE = (sys.argv[1] if len(sys.argv) > 1 else 'https://honeyjostar.github.io/kadro').rstrip('/')
REPO = 'https://github.com/honeyjostar/kadro'
LATEST = f'{REPO}/releases/latest'
TG = 'https://t.me/kadroOffical'
SRC_CAPCUT = 'https://dtf.ru/howto/5311103-capcut-v-rossii-kak-oplatit-capcut-pro'
SRC_PREMIERE = 'https://costbench.com/software/video-editing/adobe-premiere-pro/'

TEMPLATES = [  # только вертикальные превью
    ('trip', 'Путешествие', 'Travel'), ('neonnight', 'Неоновая ночь', 'Neon night'), ('party', 'Вечеринка', 'Party'),
    ('aesthetic', 'Эстетика', 'Aesthetic'), ('sport', 'Энергия', 'Energy'), ('vlog', 'Влог дня', 'Day vlog'),
    ('love', 'Любовь', 'Love'), ('pulse', 'Ритм', 'Rhythm'), ('countdown', 'Обратный отсчёт', 'Countdown'),
    ('winter', 'Зимняя сказка', 'Winter fairy tale'), ('collage', 'Коллаж', 'Collage'),
    ('beforeafter', 'До и после', 'Before & after'), ('birthday', 'С днём рождения', 'Happy birthday'),
]

T = {
    'ru': {
        'lang': 'ru', 'url': f'{BASE}/', 'root': '', 'other': 'en/', 'other_lang': 'en', 'other_name': 'English', 'locale': 'ru_RU', 'price_cur': 'RUB',
        'title': 'Kadro — бесплатный видеоредактор для Windows, аналог CapCut без водяного знака',
        'desc': 'Kadro — бесплатный видеоредактор для Windows с ИИ, который работает на твоём компьютере: субтитры как у блогеров, 180+ переходов, мем-кнопки, удаление фона, нарезка в шортсы, экспорт до 4K. Без подписки, водяного знака и регистрации. Открытый код.',
        'og_title': 'Kadro — монтаж уровня Pro. Бесплатно.',
        'og_desc': 'Видеоредактор для Windows с ИИ на твоём компьютере. Без подписки, водяного знака и регистрации.',
        'skip': 'К содержанию', 'nav': [('#features', 'Возможности'), ('#try', 'Попробовать'), ('#templates', 'Шаблоны'), ('#compare', 'Сравнение'), ('#faq', 'Вопросы')], 'nav_dl': 'Скачать',
        'h1': 'Монтаж уровня Pro.<br>Бесплатно.',
        'sub': 'Видеоредактор для Windows с ИИ, который работает прямо на твоём компьютере. Без подписки, без водяного знака, без регистрации.',
        'dl': 'Скачать для Windows', 'see': 'Посмотреть, что умеет',
        'note': ('Установщик {mb} МБ, Windows 10 и 11', 'Установщик около 340 МБ, Windows 10 и 11'),
        'film_alt': 'Запись экрана Kadro: авто-ролик собирается из шести видео и музыки',
        'film_cap': 'Настоящая запись экрана: шесть видео и музыка — и через полминуты готовый ролик.',
        'stats': [('180+', 'переходов'), ('50+', 'эффектов'), ('45+', 'фильтров'), ('25', 'языков субтитров'), ('0 ₽', 'навсегда')],
        'f_h2': 'Всё для коротких роликов.',
        'f_p': 'TikTok, Reels, Shorts и YouTube. Видео никуда не загружаются: монтаж, экспорт и ИИ работают на твоём компьютере.',
        'chapters': [
            ('captions', 'Субтитры как у блогеров.', 'Kadro сам распознаёт речь — русский, английский и ещё 23 языка — и ставит субтитры по словам. Ключевые слова цветом, эмодзи по смыслу.',
             ['Стили «Хормози», «MrBeast», «Неон», «Караоке»', 'Готовые .srt и .vtt тоже подходят', 'Перевод субтитров на другой язык'], 'Kadro: субтитры в стиле «Хормози» на вертикальном ролике'),
            ('effects', 'Мем-кнопки и 50+ эффектов.', 'Драматический зум, «Продолжение следует…», басс-буст, замедление с «бум» — в один щелчок, у каждой кнопки свой звук.',
             ['Свечение, RGB-сдвиг, тряска, пульс', 'Ключевые кадры, маски, хромакей', 'Стикеры и текст с анимацией'], 'Kadro: вкладка эффектов и мем-кнопки'),
            ('transitions', '180+ переходов. Оживают под курсором.', 'Наведи на переход — увидишь его на своём видео. Нажми — он встанет на стык.',
             ['Шторки, фигуры, 3D', 'Глитч, зум и вращение', 'Звуки на стыках: свуш, щелчок, «бум»'], 'Kadro: вкладка переходов с живыми миниатюрами'),
            ('ai', 'ИИ без облака и кредитов.', 'Всё считается на твоём компьютере — бесплатно и без лимитов.',
             ['Нарезка стрима или подкаста в шортсы', 'Дубляж с переводом: русский и английский', 'Удаление фона и «Клон себя»', 'Студийный голос одной кнопкой'], 'Kadro: вкладка ИИ-инструментов'),
        ],
        'try': {
            'h2': 'Покрути сам.', 'p': 'Это настоящие ролики, смонтированные в Kadro. Нажимай и смотри разницу.',
            'sound_on': 'Со звуком', 'sound_off': 'Без звука', 'ba': 'Сравнить: исходник и фильтр',
            'tabs': [
                ('caps', 'Субтитры', 'Шесть стилей — один ролик.', 'Стиль меняется одним щелчком, субтитры остаются на своих словах.',
                 [('hormozi', 'Хормози'), ('beast', 'MrBeast'), ('word', 'По слову'), ('boxword', 'Плашка'), ('neonblog', 'Неон'), ('karaoke', 'Караоке')]),
                ('tr', 'Переходы', 'Один стык — восемь переходов.', 'Восемь из 180+. Каждый ложится на стык одним щелчком, длительность — ползунком.',
                 [('zoomin', 'Приближение'), ('slideleft', 'Сдвиг'), ('circleopen', 'Круг из центра'), ('fadewhite', 'Через белый'), ('hlwind', 'Ветер'), ('gl-Cube', 'Куб'), ('gl-GlitchMemories', 'Глитч'), ('gl-CrossZoom', 'Зум-размытие')]),
                ('meme', 'Мем-кнопки', 'Мем — одной кнопкой.', 'Каждая кнопка — правка клипа и свой звук. Включи звук.',
                 [('drama', 'Драматический зум'), ('tbc', 'Продолжение следует…'), ('bass', 'Басс-буст'), ('slowmo', 'Замедление с «бум»')]),
                ('filt', 'Фильтры', 'Фильтр — и кадр другой.', 'Двигай ползунок: слева исходник, справа фильтр.',
                 [('vivid', 'Сочный'), ('tealorange', 'Бирюза и оранж'), ('cinema', 'Кинематограф'), ('moody', 'Мрачный'), ('golden', 'Золотой час'), ('film', 'Плёнка')]),
            ],
        },
        'b_h2': 'И это ещё не всё.',
        'tiles': {
            'auto': ('Авто-ролик', 'Выбери видео и музыку — Kadro сам возьмёт лучшие куски и смонтирует их в ритм.', 'Окно «Авто-ролик» в Kadro'),
            'free': ('0 ₽', 'Навсегда.', 'Без подписки, пробного периода и регистрации.'),
            '3d': ('3D-объекты', 'Готовые фигуры и свои модели: материалы, свет, вращение.', 'Окно 3D-объекта в Kadro: металлическое сердце'),
            'export': ('Экспорт до 4K', 'MP4, GIF, MP3 и стикеры для Telegram. Перед публикацией Kadro проверит, не закроют ли кнопки TikTok твои субтитры.', 'Окно экспорта Kadro'),
            'code': ('★ {n}', 'Открытый код', 'GPL-3.0. Каждую строчку можно проверить на GitHub.'),
            'light': ('Светлая и тёмная тема', 'Плюс свой цвет, значок и оформление.', 'Kadro в светлой теме: вкладка фильтров'),
        },
        't_h2': '19 шаблонов. Поставь свои видео.',
        't_p': 'Как шаблоны CapCut: выбери стиль — видео и фото встанут в окошки в ритм музыки. Или повтори монтаж любого понравившегося ролика.',
        'c_h2': 'Kadro, CapCut и Premiere Pro.', 'c_what': 'Что сравниваем',
        'rows': [
            ('Цена', 'Бесплатно, навсегда', 'Базовый монтаж бесплатно, Pro — по подписке', 'От $22.99 в месяц'),
            ('ИИ-функции', 'Бесплатно, на твоём компьютере', 'Тратят кредиты', 'Только с подпиской'),
            ('Оплата из России', 'Не нужна', 'Российские карты не принимаются', 'Adobe прекратила продажи в России в 2022 году'),
            ('Регистрация', 'Не нужна', 'Нужен аккаунт для Pro', 'Нужен аккаунт Adobe'),
            ('Исходный код', 'Открытый, GPL-3.0', 'Закрытый', 'Закрытый'),
        ],
        'sources': f'Данные о конкурентах на ноябрь 2026: <a href="{SRC_CAPCUT}">DTF о CapCut в России</a>, <a href="{SRC_PREMIERE}">цены Premiere Pro</a>.',
        'g_h2': 'Скачай Kadro. Это бесплатно.',
        'steps': [
            ('Скачай установщик.', 'Браузер может спросить, сохранить ли редкий файл, — выбери «Сохранить».'),
            ('Запусти его.', 'Если Windows покажет «Система Windows защитила ваш компьютер», нажми «Подробнее» → «Выполнить в любом случае». Так бывает с программами без платной подписи.'),
            ('Открой Kadro', 'с ярлыка на рабочем столе. Права администратора не нужны, дальше программа обновляется сама.'),
        ],
        'req': f'Нужны Windows 10 или 11 (64-бит), 8 ГБ памяти (для 4K и удаления фона лучше 16 ГБ) и около 1 ГБ на диске. Видеокарта не обязательна. Версия без установки — zip на <a href="{LATEST}">странице релиза</a>.',
        'q_h2': 'Частые вопросы.',
        'faq': [
            ('Kadro правда бесплатный?', 'Да. Без подписки, пробного периода, водяного знака и регистрации. Код открыт под лицензией GPL-3.0 — его может проверить кто угодно.'),
            ('Kadro — это аналог CapCut?', 'Kadro сделан по мотивам CapCut Pro: таймлайн, переходы, эффекты, субтитры как у блогеров, шаблоны, нарезка длинного видео в шортсы. Отличие в том, что всё бесплатно и работает на компьютере, без аккаунта и кредитов.'),
            ('Нужен ли Kadro интернет?', 'Нет. Монтаж, экспорт и ИИ работают на компьютере, видео никуда не загружаются. Интернет нужен один раз — скачать модель распознавания речи или голос для озвучки, когда впервые ими пользуешься.'),
            ('Как сделать субтитры автоматически бесплатно?', 'Открой вкладку «Субтитры» → «Автосубтитры». Kadro распознаёт речь прямо на компьютере (русский, английский и ещё 23 языка) и расставляет субтитры по словам. Стиль можно выбрать как у блогеров: «Хормози», «MrBeast», «По слову», «Неон», «Караоке».'),
            ('Можно ли экспортировать видео в 4K без водяного знака?', 'Да. Kadro сохраняет MP4 до 4K без водяного знака, а также GIF, звук MP3 и видеостикер для Telegram.'),
            ('Какие системные требования?', 'Windows 10 или 11 (64-бит), 8 ГБ оперативной памяти (для 4K и удаления фона лучше 16 ГБ), около 1 ГБ на диске. Видеокарта не обязательна, но NVIDIA, AMD и Intel ускоряют экспорт.'),
            ('Windows пишет «Система Windows защитила ваш компьютер». Это вирус?', 'Нет. Так Windows реагирует на программы без платной цифровой подписи. Нажми «Подробнее» → «Выполнить в любом случае». Код Kadro открыт на GitHub, а установщик собирается автоматически на серверах GitHub.'),
            ('Есть ли Kadro для Mac, Android или iPhone?', 'Пока только для Windows 10 и 11.'),
        ],
        'foot_l': f'Kadro делает <a href="https://github.com/honeyjostar">yaposspall</a>. Открытый код, лицензия GPL-3.0.',
        'foot_links': [(REPO, 'GitHub'), (TG, 'Telegram'), (f'{REPO}/blob/master/docs/GUIDE.md', 'Руководство')],
        'app_desc': 'Бесплатный видеоредактор для Windows с ИИ, который работает на компьютере пользователя: автосубтитры, переходы, эффекты, мем-кнопки, удаление фона, нарезка длинного видео в шортсы, экспорт до 4K без водяного знака. Открытый код (GPL-3.0).',
    },
    'en': {
        'lang': 'en', 'url': f'{BASE}/en/', 'root': '../', 'other': '../', 'other_lang': 'ru', 'other_name': 'Русский', 'locale': 'en_US', 'price_cur': 'USD',
        'title': 'Kadro — free video editor for Windows, a CapCut alternative with no watermark',
        'desc': 'Kadro is a free, open-source video editor for Windows with AI that runs on your own PC: creator-style captions, 180+ transitions, meme buttons, background removal, cutting long videos into Shorts, export up to 4K. No subscription, no watermark, no sign-up.',
        'og_title': 'Kadro — Pro-level editing. Free.',
        'og_desc': 'A video editor for Windows with AI on your own PC. No subscription, no watermark, no sign-up.',
        'skip': 'Skip to content', 'nav': [('#features', 'Features'), ('#try', 'Try it'), ('#templates', 'Templates'), ('#compare', 'Compare'), ('#faq', 'FAQ')], 'nav_dl': 'Download',
        'h1': 'Pro-level editing.<br>Free.',
        'sub': 'A video editor for Windows with AI that runs right on your computer. No subscription, no watermark, no sign-up.',
        'dl': 'Download for Windows', 'see': 'See what it can do',
        'note': ('Installer {mb} MB, Windows 10 and 11', 'Installer about 340 MB, Windows 10 and 11'),
        'film_alt': 'Kadro screen recording: Auto Video edits six clips and music into a video',
        'film_cap': 'A real screen recording: six clips and a track, and half a minute later the video is ready.',
        'stats': [('180+', 'transitions'), ('50+', 'effects'), ('45+', 'filters'), ('25', 'caption languages'), ('$0', 'forever')],
        'f_h2': 'Everything for short videos.',
        'f_p': 'TikTok, Reels, Shorts and YouTube. Your videos are never uploaded: editing, export and AI all run on your computer.',
        'chapters': [
            ('captions', 'Captions like creators use.', 'Kadro recognises speech by itself — English, Russian and 23 more languages — and places captions word by word. Keywords get highlighted, emojis match the meaning.',
             ['Hormozi, MrBeast, Neon and Karaoke styles', 'Ready .srt and .vtt files work too', 'Translate captions into another language'], 'Kadro: Hormozi-style captions on a vertical video'),
            ('effects', 'Meme buttons and 50+ effects.', 'Dramatic zoom, "To be continued…", bass boost, slow-mo with a boom — one click each, every button with its own sound.',
             ['Glow, RGB split, shake, pulse', 'Keyframes, masks, chroma key', 'Stickers and animated text'], 'Kadro: effects tab and meme buttons'),
            ('transitions', '180+ transitions. Live on hover.', 'Hover over a transition to see it on your own video. Click to put it on the cut.',
             ['Wipes, shapes, 3D', 'Glitch, zoom and spin', 'Sounds on cuts: whoosh, click, boom'], 'Kadro: transitions tab with live thumbnails'),
            ('ai', 'AI with no cloud and no credits.', 'Everything runs on your computer, free and unlimited.',
             ['Cut a stream or podcast into Shorts', 'Dubbing with translation between English and Russian', 'Background removal and Clone yourself', 'Studio voice in one click'], 'Kadro: AI tools tab'),
        ],
        'try': {
            'h2': 'Try it yourself.', 'p': 'These are real videos edited in Kadro. Click and see the difference.',
            'sound_on': 'Sound on', 'sound_off': 'Sound off', 'ba': 'Compare: original and filter',
            'tabs': [
                ('caps', 'Captions', 'Six styles, one video.', 'Change the style in one click; captions stay on their words.',
                 [('hormozi', 'Hormozi'), ('beast', 'MrBeast'), ('word', 'One word'), ('boxword', 'Label'), ('neonblog', 'Neon'), ('karaoke', 'Karaoke')]),
                ('tr', 'Transitions', 'One cut, eight transitions.', 'Eight of 180+. Each lands on the cut in one click; set the length with a slider.',
                 [('zoomin', 'Zoom in'), ('slideleft', 'Slide'), ('circleopen', 'Circle from the center'), ('fadewhite', 'Through white'), ('hlwind', 'Wind'), ('gl-Cube', 'Cube'), ('gl-GlitchMemories', 'Glitch'), ('gl-CrossZoom', 'Zoom blur')]),
                ('meme', 'Meme buttons', 'A meme in one click.', 'Each button is a clip edit plus its own sound. Turn the sound on.',
                 [('drama', 'Dramatic zoom'), ('tbc', 'To be continued…'), ('bass', 'Bass boost'), ('slowmo', 'Slow-mo with a boom')]),
                ('filt', 'Filters', 'One filter, a different frame.', 'Drag the slider: original on the left, filter on the right.',
                 [('vivid', 'Vivid'), ('tealorange', 'Teal & orange'), ('cinema', 'Cinematic'), ('moody', 'Moody'), ('golden', 'Golden hour'), ('film', 'Film')]),
            ],
        },
        'b_h2': 'And that is not all.',
        'tiles': {
            'auto': ('Auto Video', 'Pick videos and music — Kadro takes the best bits and cuts them to the beat.', 'The Auto Video dialog in Kadro'),
            'free': ('$0', 'Forever.', 'No subscription, no trial, no sign-up.'),
            '3d': ('3D objects', 'Ready shapes and your own models: materials, light, rotation.', 'Kadro 3D object dialog: a metal heart'),
            'export': ('Export up to 4K', 'MP4, GIF, MP3 and Telegram stickers. Before you post, Kadro checks that TikTok buttons will not cover your captions.', 'Kadro export dialog'),
            'code': ('★ {n}', 'Open source', 'GPL-3.0. Every line can be checked on GitHub.'),
            'light': ('Light and dark theme', 'Plus your own colour, icon and styling.', 'Kadro in the light theme: filters tab'),
        },
        't_h2': '19 templates. Drop in your clips.',
        't_p': 'Like CapCut templates: pick a style and your videos and photos land in the slots on the beat. Or repeat the edit of any video you like.',
        'c_h2': 'Kadro, CapCut and Premiere Pro.', 'c_what': 'What we compare',
        'rows': [
            ('Price', 'Free, forever', 'Basic editing free, Pro is a subscription', 'From $22.99 per month'),
            ('AI features', 'Free, on your computer', 'Spend credits', 'Subscription only'),
            ('Account', 'Not needed', 'Needed for Pro', 'Adobe account needed'),
            ('Source code', 'Open, GPL-3.0', 'Closed', 'Closed'),
        ],
        'sources': f'Competitor data as of November 2026: <a href="{SRC_PREMIERE}">Premiere Pro pricing</a>, <a href="{SRC_CAPCUT}">CapCut Pro plans and credits (in Russian)</a>.',
        'g_h2': 'Get Kadro. It is free.',
        'steps': [
            ('Download the installer.', 'Your browser may ask whether to keep a rarely downloaded file; choose Keep.'),
            ('Run it.', 'If Windows shows "Windows protected your PC", click More info, then Run anyway. This happens with programs that have no paid signature.'),
            ('Open Kadro', 'from the desktop shortcut. No admin rights needed, and it updates itself from then on.'),
        ],
        'req': f'You need Windows 10 or 11 (64-bit), 8 GB of RAM (16 GB is better for 4K and background removal) and about 1 GB of disk space. A graphics card is optional. A no-install zip is on the <a href="{LATEST}">release page</a>.',
        'q_h2': 'FAQ.',
        'faq': [
            ('Is Kadro really free?', 'Yes. No subscription, no trial, no watermark and no sign-up. The source code is open under the GPL-3.0 license, so anyone can check it.'),
            ('Is Kadro a CapCut alternative?', 'Kadro is modelled on CapCut Pro: timeline, transitions, effects, creator-style captions, templates, cutting long videos into Shorts. The difference is that everything is free and runs on your computer, with no account and no credits.'),
            ('Does Kadro need the internet?', 'No. Editing, export and AI run on your computer and your videos are never uploaded. You only need the internet once, to download a speech recognition model or a voice the first time you use them.'),
            ('How do I add captions automatically for free?', 'Open the Captions tab and choose Auto captions. Kadro recognises speech on your computer (English, Russian and 23 more languages) and places captions word by word. Pick a creator style: Hormozi, MrBeast, One word, Neon, Karaoke.'),
            ('Can I export 4K video without a watermark?', 'Yes. Kadro exports MP4 up to 4K with no watermark, plus GIF, MP3 audio and Telegram video stickers.'),
            ('What are the system requirements?', 'Windows 10 or 11 (64-bit), 8 GB of RAM (16 GB is better for 4K and background removal), about 1 GB of disk space. A graphics card is optional; NVIDIA, AMD and Intel GPUs speed up export.'),
            ('Windows says "Windows protected your PC". Is it a virus?', "No. Windows shows this for programs without a paid code signing certificate. Click More info, then Run anyway. Kadro's code is open on GitHub and the installer is built automatically on GitHub's servers."),
            ('Is there Kadro for Mac, Android or iPhone?', 'Not yet, only Windows 10 and 11.'),
        ],
        'foot_l': 'Kadro is made by <a href="https://github.com/honeyjostar">yaposspall</a>. Open source, GPL-3.0.',
        'foot_links': [(REPO, 'GitHub'), (TG, 'Telegram')],
        'app_desc': "Free video editor for Windows with AI that runs on the user's own computer: auto captions, transitions, effects, meme buttons, background removal, cutting long videos into Shorts, export up to 4K with no watermark. Open source (GPL-3.0).",
    },
}

DL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 3h2v10.17l3.59-3.58L18 11l-6 6-6-6 1.41-1.41L11 13.17z M5 19h14v2H5z"/></svg>'


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def page(t: dict) -> str:
    r = t['root']
    a = f'{r}assets'
    ld_app = {
        '@context': 'https://schema.org', '@type': 'SoftwareApplication', 'name': 'Kadro', 'description': t['app_desc'],
        'applicationCategory': 'MultimediaApplication', 'applicationSubCategory': 'Video editor', 'operatingSystem': 'Windows 10, Windows 11',
        'url': t['url'], 'downloadUrl': LATEST, 'image': f'{BASE}/assets/og.png', 'screenshot': f'{BASE}/assets/shots/captions.webp',
        'license': 'https://www.gnu.org/licenses/gpl-3.0.html', 'isAccessibleForFree': True, 'inLanguage': ['ru', 'en'],
        'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': t['price_cur']},
        'author': {'@type': 'Person', 'name': 'yaposspall', 'url': 'https://github.com/honeyjostar'},
        'sameAs': [REPO, TG, 'https://alternativeto.net/software/kadro-video-editor/about/'],
    }
    ld_faq = {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
        {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': ans}} for q, ans in t['faq']]}
    nav = '\n'.join(f'    <a class="l" href="{h}">{esc(n)}</a>' for h, n in t['nav'])
    stats = '\n'.join(f'  <div class="rise"><b>{esc(n)}</b><span>{esc(l)}</span></div>' for n, l in t['stats'])
    ch_text, ch_imgs = [], []
    for i, (img, h, p, items, alt) in enumerate(t['chapters']):
        lis = ''.join(f'<li>{esc(x)}</li>' for x in items)
        ch_text.append(f'''      <article class="chapter{' on' if i == 0 else ''}">
        <h3>{esc(h)}</h3>
        <p>{esc(p)}</p>
        <ul>{lis}</ul>
        <img class="inline" src="{a}/shots/{img}.webp" width="2400" height="1492" loading="lazy" alt="{esc(alt)}">
      </article>''')
        ch_imgs.append(f'        <img{" class=\"on\"" if i == 0 else ""} src="{a}/shots/{img}.webp" width="2400" height="1492" {"" if i == 0 else "loading=\"lazy\" "}alt="{esc(alt)}">')
    tl = t['tiles']
    tile_pic = lambda key, img, w, h: f'<div class="pic"><img src="{a}/shots/{img}.webp" width="{w}" height="{h}" loading="lazy" alt="{esc(tl[key][2])}"></div>'
    bento = f'''  <div class="bento">
    <div class="tile t-wide rise"><h3>{esc(tl['auto'][0])}</h3><p>{esc(tl['auto'][1])}</p>{tile_pic('auto', 'auto-dialog', 1600, 1273)}</div>
    <div class="tile t-small t-text t-pink rise"><div class="big">{esc(tl['free'][0])}</div><h3>{esc(tl['free'][1])}</h3><p>{esc(tl['free'][2])}</p></div>
    <div class="tile t-mid rise"><h3>{esc(tl['3d'][0])}</h3><p>{esc(tl['3d'][1])}</p>{tile_pic('3d', '3d-dialog', 1580, 1240)}</div>
    <div class="tile t-mid rise"><h3>{esc(tl['export'][0])}</h3><p>{esc(tl['export'][1])}</p>{tile_pic('export', 'export-dialog', 1030, 1520).replace('class="pic"', 'class="pic narrow"')}</div>
    <div class="tile t-small t-text rise"><div class="big" data-stars="{esc(tl['code'][0])}">{esc(tl['code'][0].replace('{n}', '13'))}</div><h3>{esc(tl['code'][1])}</h3><p>{esc(tl['code'][2])}</p></div>
    <div class="tile t-wide rise"><h3>{esc(tl['light'][0])}</h3><p>{esc(tl['light'][1])}</p>{tile_pic('light', 'light-crop', 1600, 962)}</div>
  </div>'''
    tr = t['try']
    tabs = ''.join(f'<button role="tab" id="tab-{k}" aria-controls="pane-{k}" aria-selected="{str(i == 0).lower()}" data-tab="{k}">{esc(name)}</button>' for i, (k, name, *_ ) in enumerate(tr['tabs']))
    panes = []
    for i, (k, name, h, p, opts) in enumerate(tr['tabs']):
        btns = ''.join(f'<button class="opt{" on" if j == 0 else ""}" data-kind="{k}" data-id="{oid}" aria-pressed="{str(j == 0).lower()}">{esc(lab)}</button>' for j, (oid, lab) in enumerate(opts))
        hid = '' if i == 0 else ' hidden'
        panes.append(f'<div class="pane" id="pane-{k}" role="tabpanel" aria-labelledby="tab-{k}"{hid}><h3>{esc(h)}</h3><p>{esc(p)}</p><div class="opts">{btns}</div></div>')
    first = tr['tabs'][0][4][0][0]
    try_html = f"""<section class="block" id="try">
  <div class="head rise"><h2>{esc(tr['h2'])}</h2><p>{esc(tr['p'])}</p></div>
  <div class="try rise" data-base="{a}/demo">
    <div class="tabs" role="tablist">{tabs}</div>
    <div class="try-body">
      <div class="device">
        <video muted loop playsinline preload="none" poster="{a}/demo/caps/{first}.jpg"><source src="{a}/demo/caps/{first}.webm" type="video/webm"><source src="{a}/demo/caps/{first}.mp4" type="video/mp4"></video>
        <div class="ba" hidden><img class="ba-base" src="{a}/demo/filt/none.webp" width="720" height="1280" alt=""><img class="ba-top" src="{a}/demo/filt/vivid.webp" width="720" height="1280" alt=""><span class="ba-line" aria-hidden="true"></span><input class="ba-range" type="range" min="0" max="100" value="50" aria-label="{esc(tr['ba'])}"></div>
        <button class="sound" hidden data-on="{esc(tr['sound_on'])}" data-off="{esc(tr['sound_off'])}">{esc(tr['sound_on'])}</button>
      </div>
      <div class="panes">{''.join(panes)}</div>
    </div>
  </div>
</section>"""
    li = 0 if t['lang'] == 'ru' else 1
    cards = ''.join(f'<figure><video muted loop playsinline preload="none" poster="{a}/tpl/{tid}.jpg" aria-hidden="true"><source src="{a}/tpl/{tid}.webm" type="video/webm"><source src="{a}/tpl/{tid}.mp4" type="video/mp4"></video><figcaption>{esc(names[li])}</figcaption></figure>'
                    for tid, *names in TEMPLATES)
    rows = '\n'.join(f'        <tr><th scope="row">{esc(k)}</th><td class="us">{esc(u)}</td><td>{esc(c)}</td><td>{esc(p)}</td></tr>' for k, u, c, p in t['rows'])
    steps = '\n'.join(f'    <li><b>{esc(b)}</b> {esc(s)}</li>' for b, s in t['steps'])
    faq = '\n'.join(f'    <details><summary>{esc(q)}</summary><p>{esc(ans)}</p></details>' for q, ans in t['faq'])
    foot = ' &nbsp; '.join(f'<a href="{u}">{esc(n)}</a>' for u, n in t['foot_links'])
    return f'''<!DOCTYPE html>
<html lang="{t['lang']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(t['title'])}</title>
<meta name="description" content="{esc(t['desc'])}">
<link rel="canonical" href="{t['url']}">
<link rel="alternate" hreflang="ru" href="{BASE}/">
<link rel="alternate" hreflang="en" href="{BASE}/en/">
<link rel="alternate" hreflang="x-default" href="{BASE}/">
<link rel="icon" href="{a}/logo.svg" type="image/svg+xml">
<meta name="theme-color" content="#000000">
<meta property="og:type" content="website">
<meta property="og:title" content="{esc(t['og_title'])}">
<meta property="og:description" content="{esc(t['og_desc'])}">
<meta property="og:url" content="{t['url']}">
<meta property="og:image" content="{BASE}/assets/og.png">
<meta property="og:locale" content="{t['locale']}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="{a}/fonts/onest-{'cyrillic' if t['lang'] == 'ru' else 'latin'}-800-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{a}/style.css">
<script type="application/ld+json">{json.dumps(ld_app, ensure_ascii=False)}</script>
<script type="application/ld+json">{json.dumps(ld_faq, ensure_ascii=False)}</script>
</head>
<body>
<a class="skip" href="#main">{esc(t['skip'])}</a>
<header class="nav">
  <div class="wrap">
    <a class="brand" href="./"><img src="{a}/logo.svg" alt="" width="24" height="24">Kadro</a>
{nav}
    <a class="l lang" href="{t['other']}" hreflang="{t['other_lang']}" lang="{t['other_lang']}">{esc(t['other_name'])}</a>
    <a class="pill" data-dl href="{LATEST}">{esc(t['nav_dl'])}</a>
  </div>
</header>

<main id="main">
<section class="hero">
  <div class="wrap">
    <div class="name">Kadro</div>
    <h1>{t['h1']}</h1>
    <p class="sub">{esc(t['sub'])}</p>
    <div class="cta">
      <a class="btn" data-dl href="{LATEST}">{DL_ICON}{esc(t['dl'])}</a>
      <a class="link" href="#features">{esc(t['see'])}</a>
    </div>
    <p class="note" data-size="{esc(t['note'][0])}">{esc(t['note'][1])}</p>
  </div>
  <figure class="film">
    <div class="frame"><video muted loop playsinline autoplay preload="auto" poster="{a}/media/film-poster.jpg" aria-label="{esc(t['film_alt'])}"><source src="{a}/media/film.webm" type="video/webm"><source src="{a}/media/film.mp4" type="video/mp4"></video></div>
    <figcaption>{esc(t['film_cap'])}</figcaption>
  </figure>
</section>

<div class="wrap">
<section class="stats" aria-label="Kadro">
{stats}
</section>

<section class="block" id="features">
  <div class="head rise"><h2>{esc(t['f_h2'])}</h2><p>{esc(t['f_p'])}</p></div>
  <div class="chapters">
    <div>
{chr(10).join(ch_text)}
    </div>
    <div class="stage" aria-hidden="true">
      <div class="pin">
{chr(10).join(ch_imgs)}
      </div>
    </div>
  </div>
</section>

{try_html}

<section class="block">
  <div class="head rise"><h2>{esc(t['b_h2'])}</h2></div>
{bento}
</section>
</div>

<section class="block" id="templates">
  <div class="wrap head rise"><h2>{esc(t['t_h2'])}</h2><p>{esc(t['t_p'])}</p></div>
  <div class="reel"><div class="track">{cards}{cards}</div></div>
</section>

<div class="wrap">
<section class="block" id="compare">
  <div class="head rise"><h2>{esc(t['c_h2'])}</h2></div>
  <div class="compare rise">
    <table>
      <thead><tr><th scope="col"><span class="sr">{esc(t['c_what'])}</span></th><th scope="col" class="us"><span>Kadro</span></th><th scope="col">CapCut</th><th scope="col">Premiere Pro</th></tr></thead>
      <tbody>
{rows}
      </tbody>
    </table>
  </div>
  <p class="sources">{t['sources']}</p>
</section>

<section class="get" id="download">
  <img class="icon rise" src="{a}/logo.svg" alt="" width="108" height="108">
  <h2 class="rise">{esc(t['g_h2'])}</h2>
  <div class="cta"><a class="btn" data-dl href="{LATEST}">{DL_ICON}{esc(t['dl'])}</a></div>
  <p class="note" style="margin-top:18px;font-size:14px;color:var(--muted)" data-size="{esc(t['note'][0])}">{esc(t['note'][1])}</p>
  <ol class="steps">
{steps}
  </ol>
  <p class="req">{t['req']}</p>
</section>

<section class="block" id="faq">
  <div class="head rise"><h2>{esc(t['q_h2'])}</h2></div>
  <div class="faq">
{faq}
  </div>
</section>
</div>
</main>

<footer>
  <div class="wrap">
    <span>{t['foot_l']}</span>
    <span>{foot} &nbsp; <a href="{t['other']}" hreflang="{t['other_lang']}" lang="{t['other_lang']}">{esc(t['other_name'])}</a></span>
  </div>
</footer>
<script src="{a}/app.js" defer></script>
</body>
</html>
'''


def main() -> None:
    (SITE / 'en').mkdir(parents=True, exist_ok=True)
    (SITE / 'index.html').write_text(page(T['ru']), encoding='utf-8')
    (SITE / 'en' / 'index.html').write_text(page(T['en']), encoding='utf-8')
    (SITE / 'sitemap.xml').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url><loc>{BASE}/</loc><xhtml:link rel="alternate" hreflang="ru" href="{BASE}/"/><xhtml:link rel="alternate" hreflang="en" href="{BASE}/en/"/></url>
  <url><loc>{BASE}/en/</loc><xhtml:link rel="alternate" hreflang="ru" href="{BASE}/"/><xhtml:link rel="alternate" hreflang="en" href="{BASE}/en/"/></url>
</urlset>
''', encoding='utf-8')
    llms = (SITE / 'llms.txt').read_text(encoding='utf-8')
    for old in ('https://honeyjostar.github.io/kadro', 'https://kadro.io'):
        llms = llms.replace(old, BASE)
    (SITE / 'llms.txt').write_text(llms, encoding='utf-8')
    cname = SITE / 'CNAME'
    host = BASE.split('://', 1)[1]
    if host.endswith('github.io/kadro'):
        cname.unlink(missing_ok=True)
    else:
        cname.write_text(host + '\n', encoding='utf-8')
    print('ok', BASE)


if __name__ == '__main__':
    main()
