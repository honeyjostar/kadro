// Страницы сайта под поисковые запросы (site/<адрес>/index.html): каждая отвечает на один вопрос, который люди
// вводят в Google и Яндекс («аналог CapCut для ПК», «фоны для TikTok», «субтитры как у Хормози»…), и ведёт к скачиванию.
// Плюс robots.txt и sitemap.xml со всеми страницами.
//   node scripts/make-site-pages.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const BASE = 'https://kadro-editor.github.io';
const DL = 'https://github.com/honeyjostar/kadro/releases/latest';
const TG = 'https://t.me/kadroOffical';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Страницы: slug — адрес, title и description — для поиска, h1 и lead — первый экран, sections — текст, faq — вопросы. */
const PAGES = [
  {
    slug: 'capcut-alternative',
    title: 'Аналог CapCut для ПК — бесплатно и без водяного знака | Kadro Editor',
    description: 'Kadro Editor — бесплатный видеоредактор для Windows, похожий на CapCut Pro: субтитры как у блогеров, 180+ переходов, шаблоны, авто-монтаж, нарезка в шортсы, экспорт до 4K. Без подписки, кредитов и регистрации.',
    h1: 'Аналог CapCut для ПК. Бесплатно.',
    lead: 'Kadro Editor — видеоредактор для Windows по мотивам CapCut Pro. Всё, за что CapCut просит подписку, здесь бесплатно и работает на твоём компьютере.',
    video: { src: 'assets/media/film', poster: 'assets/media/film-poster.jpg', wide: true },
    sections: [
      ['Что есть из CapCut Pro', '<ul><li>Автосубтитры по словам в стилях «Хормози», «MrBeast», «Караоке», «Неон» — 25 языков, распознавание прямо на компьютере.</li><li>180+ переходов, 50+ эффектов, 45+ фильтров, ключевые кадры, маски, хромакей.</li><li>19 шаблонов и «Повторить по ролику» — как шаблоны CapCut, только со своими видео.</li><li>Авто-ролик: от короткого клипа под музыку до фильма из 60 файлов.</li><li>Нарезка длинного видео, стрима или подкаста в шортсы.</li><li>Удаление фона, «Клон себя», студийный голос, озвучка текста.</li><li>Экспорт MP4 (H.264 и H.265) до 4K, ProRes, WebM, GIF, MP3 и стикеры для Telegram — без водяного знака.</li></ul>'],
      ['Чем отличается', '<p>CapCut тратит кредиты на ИИ и требует аккаунт, а Pro не оплатить российской картой. В Kadro нет ни аккаунта, ни оплаты: ИИ считается на твоём компьютере, видео никуда не загружаются. Код открыт на GitHub — его может проверить кто угодно.</p>'],
      ['Если CapCut тормозит на слабом ПК', '<p>Kadro сам выбирает качество превью под твой компьютер и делает лёгкие копии 2K и 4K-видео, чтобы таймлайн не дёргался. Экспорт идёт через видеокарту NVIDIA, AMD или Intel, если она есть.</p>'],
    ],
    faq: [
      ['Kadro правда бесплатный?', 'Да. Без подписки, пробного периода, водяного знака и регистрации. Код открыт под лицензией GPL-3.0.'],
      ['Можно перенести проект из CapCut?', 'Проекты CapCut закрытого формата, их не открывает ни один другой редактор. Исходные видео и музыку можно просто перетащить в Kadro.'],
      ['Есть Kadro для Mac?', 'Пока только Windows 10 и 11. Версия для Mac — в планах.'],
    ],
  },
  {
    slug: 'tiktok-backgrounds',
    title: 'Живые фоны для TikTok бесплатно: звёздное небо, синтвейв, неон | Kadro Editor',
    description: '15 живых фонов для TikTok, Reels и Shorts: звёздное небо с падающими звёздами, северное сияние, переливы, синтвейв, неоновый тоннель, «геймплей» для разделённого экрана. Бесплатно, в любом разрешении, без чужих прав.',
    h1: 'Живые фоны для TikTok.',
    lead: 'Звёздное небо, северное сияние, синтвейв, неоновая трасса, снегопад — 15 анимированных фонов под голос, цитаты, биты и разделённый экран. Их рисует сам Kadro, поэтому ими можно пользоваться где угодно.',
    bgs: true,
    sections: [
      ['Какие фоны есть', '<p><b>Спокойные</b> — звёздное небо с падающими звёздами, розовая ночь, северное сияние над горами, переливы «закат» и «океан», живой градиент в твоих цветах, снегопад, пастельные облака, тёплые огоньки. Подходят для цитат, озвучки, историй и «говорящей головы».</p><p><b>Неон и биты</b> — синтвейв-закат с неоновой сеткой, неоновый тоннель, цифровой дождь. Под фонк, рэп и эдиты.</p><p><b>Для разделённого экрана</b> — лава-лампа, «залипалка» и бесконечная неоновая трасса. Это свой «геймплей» внизу экрана, пока сверху идёт видео с голосом — без чужих записей игр и риска получить жалобу.</p>'],
      ['Как поставить фон', '<ol><li>Скачай и открой Kadro.</li><li>Вкладка «Шаблоны» → «Фоны». Наведи на карточку — фон оживёт.</li><li>Нажми — фон ляжет на таймлайн на 15 секунд. Длину меняй за край клипа.</li><li>Сверху положи видео, текст или озвучку. Скорость, оттенок и палитру фона меняй во вкладке «Эффекты».</li></ol>'],
      ['Почему не скачать фон с YouTube', '<p>Видео с чужих каналов — это чужие права: TikTok и YouTube могут заглушить или снять ролик. Фоны Kadro рисуются шейдерами прямо в программе, поэтому они твои, без водяных знаков и в любом разрешении — хоть 4K. И экспорт совпадает с тем, что видно в плеере.</p>'],
    ],
    faq: [
      ['Фоны бесплатные?', 'Да, как и весь Kadro. Ими можно пользоваться в любых роликах, в том числе с монетизацией.'],
      ['Можно сделать свой фон?', 'Да: фоны — это шейдеры GLSL. Свой файл кладётся в папку плагинов, и он появится среди эффектов. Инструкция — в руководстве Kadro, раздел «Шейдеры и плагины».'],
      ['Какое разрешение у фонов?', 'Любое: фон рисуется под размер ролика — 1080×1920 для TikTok, 4K для YouTube.'],
    ],
  },
  {
    slug: 'auto-edit',
    title: 'Автомонтаж видео из десятков файлов бесплатно — ИИ смонтирует ролик | Kadro Editor',
    description: 'Авто-ролик Kadro: загрузи видео с поездки, свадьбы или влога — хоть 60 файлов на 30 ГБ. ИИ возьмёт лучшие куски каждого файла по порядку съёмки, склеит в ритм музыки и сохранит звук. Бесплатно, на твоём ПК.',
    h1: 'Монтаж из всего, что снял.',
    lead: 'Выбери файлы и музыку — Kadro посмотрит каждое видео, оставит хорошие места и смонтирует ролик. От клипа на 15 секунд до фильма на полчаса.',
    sections: [
      ['Два режима', '<p><b>Клип</b> — короткий ролик под музыку из самых ярких моментов: 15 секунд, полминуты, минута. Склейки точно в долю, вспышки на сильных долях, переходы по стилю.</p><p><b>Весь материал</b> — для поездок, влогов, свадеб и стримов. Каждый файл идёт по порядку съёмки, из него берутся хорошие места без тряски, темноты и пустоты — примерно треть хорошего. Склейки ложатся на доли музыки, музыка повторяется до конца, живой звук видео остаётся. Из 60 файлов выходит ролик примерно на 10 минут. Режим включается сам, когда файлов от восьми.</p>'],
      ['Как ИИ выбирает куски', '<p>Kadro смотрит каждое видео: резкость, свет, контраст, движение, тряску и рывки камеры, склейки внутри файла. Хорошие места — резкие, светлые, с живым движением. Похожие друг на друга куски подряд не идут, чтобы ролик не повторялся.</p>'],
      ['Большие файлы', '<p>4K с телефона и экшн-камеры разбираются видеокартой, по два-три видео сразу. Разбор запоминается: если открыть тот же материал снова, Kadro не будет смотреть его заново. Не понравился вариант — «Ещё вариант» соберёт другой из тех же файлов.</p>'],
    ],
    faq: [
      ['Сколько файлов можно загрузить?', 'Сколько угодно. Проверено на 60 файлах; длина ролика в режиме «Весь материал» — до 30 минут.'],
      ['Можно поправить то, что смонтировал ИИ?', 'Да. Результат — обычный проект на таймлайне: любой кадр можно сдвинуть, обрезать, заменить или удалить.'],
      ['Нужен интернет?', 'Нет. Разбор видео и монтаж идут на компьютере, файлы никуда не загружаются.'],
    ],
  },
  {
    slug: 'subtitles',
    title: 'Субтитры как у Хормози и MrBeast бесплатно на ПК | Kadro Editor',
    description: 'Автосубтитры по словам на компьютере: стили «Хормози», «MrBeast», «Караоке», «Неон», «Плашка». 25 языков, ключевые слова цветом, эмодзи по смыслу, экспорт .srt. Бесплатно, без интернета и водяного знака.',
    h1: 'Субтитры как у блогеров.',
    lead: 'Kadro сам распознаёт речь — русский, английский и ещё 23 языка — и ставит субтитры по словам. Стиль меняется одним щелчком.',
    video: { src: 'assets/demo/caps/hormozi', poster: 'assets/demo/caps/hormozi.jpg' },
    sections: [
      ['Стили', '<ul><li><b>Хормози</b> — крупные слова, ключевое слово цветом.</li><li><b>MrBeast</b> — толстая обводка и «прыжок» на каждом слове.</li><li><b>По слову</b> — одно слово на экране, как в шортсах.</li><li><b>Плашка</b>, <b>Неон</b>, <b>Караоке</b> — подсветка слова, которое звучит.</li></ul>'],
      ['Как сделать', '<ol><li>Перетащи видео в Kadro.</li><li>Вкладка «Субтитры» → «Автосубтитры». Модель распознавания скачается один раз.</li><li>Выбери стиль. Ошибку в слове исправь прямо в тексте субтитра.</li><li>Сохрани ролик или выгрузи субтитры в .srt и .vtt.</li></ol>'],
      ['Ещё', '<p>Перевод субтитров на другой язык, эмодзи по смыслу, проверка, не закроют ли кнопки TikTok твои субтитры, — всё на компьютере, без кредитов.</p>'],
    ],
    faq: [
      ['Какие языки?', 'Русский, английский и ещё 23 языка — всего 25.'],
      ['Насколько точно?', 'На чистом голосе — почти без ошибок. Для шумных записей есть «Студийный голос», он убирает шум перед распознаванием.'],
      ['Можно загрузить свои субтитры?', 'Да, .srt и .vtt открываются и стилизуются так же.'],
    ],
  },
  {
    slug: 'game-clips',
    title: 'Нарезка клипов из игр в шортсы: GTA 6, CS2, Fortnite | Kadro Editor',
    description: 'Kadro находит в записи игры самые громкие и динамичные моменты и делает из них вертикальные шортсы — с размытым фоном или на весь экран, «ударом» в ритм и субтитрами. Бесплатно, для любых игр.',
    h1: 'Клипы из игр. Сами.',
    lead: 'Загрузи запись стрима или катки — Kadro найдёт перестрелки, взрывы и крики и нарежет их в вертикальные шортсы для TikTok, Reels и YouTube Shorts.',
    sections: [
      ['Как Kadro находит моменты', '<p>Kadro слушает громкость и смотрит, как много движения в кадре. Окно клипа ставится так, чтобы самое яркое место было ближе к концу: зритель видит подводку и сам момент. Клипы не пересекаются и идут с запасом между ними.</p>'],
      ['Как сделать', '<ol><li>На главном экране «Нарезать» (или вкладка «ИИ» → «Найти моменты»), режим «Игра».</li><li>Выбери длину клипов и сколько их нужно.</li><li>Раскладка: «Размытый фон» — весь кадр игры по центру, или «На весь экран» — игра обрезана по бокам.</li><li>По желанию — «Удар в ритм» во вкладке «Эффекты» и субтитры к голосу.</li></ol>'],
      ['Для каких игр', '<p>Для любых: GTA 6 и GTA V, CS2, Valorant, Fortnite, Minecraft, Dota 2, Warzone. Записи с OBS, NVIDIA ShadowPlay, AMD ReLive и Xbox Game Bar открываются как есть, в том числе 2K и 4K.</p><p class="small">Kadro не связан с Rockstar Games, Valve, Epic Games и другими издателями. Названия игр — их товарные знаки.</p>'],
    ],
    faq: [
      ['Сколько клипов можно сделать из одной записи?', 'Сколько найдётся ярких моментов: из часового стрима обычно 10–20.'],
      ['Будет водяной знак?', 'Нет. Ни на клипах, ни на других роликах.'],
      ['Тянет ли Kadro 4K-запись на слабом ПК?', 'Да: Kadro делает лёгкую копию для превью, а экспорт берёт оригинал.'],
    ],
  },
];

const DLSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 3h2v10.17l3.59-3.58L18 11l-6 6-6-6 1.41-1.41L11 13.17z M5 19h14v2H5z"/></svg>';
const BGS = [['stars', 'Звёздное небо'], ['synth', 'Синтвейв'], ['runner', 'Неоновая трасса'], ['aurora', 'Северное сияние'], ['mesh', 'Переливы'], ['tunnel', 'Неоновый тоннель']];

function page(p) {
  const url = `${BASE}/${p.slug}/`;
  const app = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Kadro Editor', alternateName: ['Kadro', 'Кадро'],
    applicationCategory: 'MultimediaApplication', operatingSystem: 'Windows 10, Windows 11', url: `${BASE}/`, downloadUrl: DL,
    isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB' }, description: p.description,
  };
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Kadro', item: `${BASE}/` }, { '@type': 'ListItem', position: 2, name: plain(p.h1), item: url }] };
  const media = p.video
    ? `<figure class="doc-media${p.video.wide ? ' wide' : ''}"><video muted loop playsinline autoplay preload="metadata" poster="../${p.video.poster}"><source src="../${p.video.src}.webm" type="video/webm"><source src="../${p.video.src}.mp4" type="video/mp4"></video></figure>`
    : p.bgs ? `<div class="bgrow doc-bgs">${BGS.map(([id, n]) => `<figure><video muted loop playsinline autoplay preload="metadata" poster="../assets/media/bg/${id}.jpg" aria-hidden="true"><source src="../assets/media/bg/${id}.webm" type="video/webm"><source src="../assets/media/bg/${id}.mp4" type="video/mp4"></video><figcaption>${n}</figcaption></figure>`).join('')}</div>` : '';
  const others = PAGES.filter((x) => x.slug !== p.slug).map((x) => `<li><a href="../${x.slug}/">${esc(plain(x.h1))}</a></li>`).join('');
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="../assets/logo.svg" type="image/svg+xml">
<meta name="theme-color" content="#f5f5f7">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Kadro Editor">
<meta property="og:title" content="${esc(plain(p.h1))}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}/assets/og.png">
<meta property="og:locale" content="ru_RU">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="../assets/style.css">
<script type="application/ld+json">${JSON.stringify(app)}</script>
<script type="application/ld+json">${JSON.stringify(faq)}</script>
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
</head>
<body class="doc-page">
<a class="skip" href="#main">К содержанию</a>
<header class="nav light-nav">
  <div class="wrap">
    <a class="brand" href="../"><img src="../assets/logo.svg" alt="" width="24" height="24">Kadro</a>
    <a class="l" href="../#features">Возможности</a>
    <a class="l" href="../#backgrounds">Фоны</a>
    <a class="l" href="../#faq">Вопросы</a>
    <a class="pill" data-dl href="${DL}">Скачать</a>
  </div>
</header>
<main id="main">
<article class="doc">
  <nav class="crumbs" aria-label="Навигация"><a href="../">Kadro</a> / <span>${esc(plain(p.h1))}</span></nav>
  <h1>${esc(p.h1)}</h1>
  <p class="lead">${esc(p.lead)}</p>
  <div class="doc-cta"><a class="btn" data-dl href="${DL}">${DLSVG}Скачать для Windows</a><span class="note" data-size="Бесплатно · установщик {mb} МБ · Windows 10 и 11">Бесплатно, Windows 10 и 11</span></div>
  ${media}
  ${p.sections.map(([h, body]) => `<section><h2>${esc(h)}</h2>${body}</section>`).join('\n  ')}
  <section class="doc-faq"><h2>Вопросы</h2>${p.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>
  <section class="doc-end">
    <h2>Скачай Kadro. Это бесплатно.</h2>
    <div class="doc-cta"><a class="btn" data-dl href="${DL}">${DLSVG}Скачать для Windows</a><a class="link" href="${TG}">Канал с гайдами в Telegram</a></div>
  </section>
  <aside class="doc-more"><h2>Ещё о Kadro</h2><ul>${others}</ul></aside>
</article>
</main>
<footer>
  <div class="wrap">
    <span>Kadro Editor делает <a href="https://github.com/honeyjostar">yaposspall</a>. Открытый код, GPL-3.0.</span>
    <span><a href="https://github.com/honeyjostar/kadro">GitHub</a> &nbsp; <a href="${TG}">Telegram</a> &nbsp; <a href="https://github.com/honeyjostar/kadro/blob/master/docs/GUIDE.md">Руководство</a></span>
  </div>
</footer>
<script src="../assets/app.js" defer></script>
</body>
</html>
`;
}

for (const p of PAGES) {
  const dir = path.join(SITE, p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(p));
}

// sitemap: главная (ru/en) и страницы
const today = new Date().toISOString().slice(0, 10);
const alt = `<xhtml:link rel="alternate" hreflang="ru" href="${BASE}/"/><xhtml:link rel="alternate" hreflang="en" href="${BASE}/en/"/>`;
fs.writeFileSync(path.join(SITE, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url><loc>${BASE}/</loc><lastmod>${today}</lastmod>${alt}</url>
  <url><loc>${BASE}/en/</loc><lastmod>${today}</lastmod>${alt}</url>
${PAGES.map((p) => `  <url><loc>${BASE}/${p.slug}/</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(path.join(SITE, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);
console.log(`Страниц: ${PAGES.length} + sitemap.xml, robots.txt`);
