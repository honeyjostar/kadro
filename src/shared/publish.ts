// «Опубликовать»: пакет для каждой площадки — готовый файл, заголовок, текст с хэштегами (из названия и субтитров
// ролика, без интернета) и страница загрузки. Kadro не входит в чужие аккаунты: текст копируется, файл показывается
// в папке, страница загрузки открывается в браузере — остаётся перетащить файл и нажать «Опубликовать».
import { tx } from './i18n';
import type { Project, TextClip } from './types';

export type PublishId = 'tiktok' | 'reels' | 'shorts' | 'vkclips' | 'vkvideo' | 'rutube' | 'dzen';
export interface PublishTarget {
  id: PublishId;
  label: string;
  /** страница загрузки (открывается только она — см. links.ts) */
  url: string;
  /** длина заголовка, если у площадки он отдельный */
  titleMax?: number;
  /** длина подписи/описания */
  textMax: number;
  /** сколько хэштегов уместно */
  tags: number;
  /** свой тег площадки */
  own?: string;
  /** вертикальная лента: до стольких секунд */
  maxSec?: number;
  vertical: boolean;
  how: string;
}

export const PUBLISH_TARGETS: PublishTarget[] = [
  { id: 'tiktok', label: 'TikTok', url: 'https://www.tiktok.com/upload', textMax: 2200, tags: 5, maxSec: 600, vertical: true, how: tx('Перетащи файл на страницу загрузки и вставь подпись (Ctrl+V).') },
  { id: 'reels', label: 'Reels', url: 'https://www.instagram.com/', textMax: 2200, tags: 5, maxSec: 180, vertical: true, how: tx('«Создать» → перетащи файл → вставь подпись (Ctrl+V).') },
  { id: 'shorts', label: 'YouTube Shorts', url: 'https://www.youtube.com/upload', titleMax: 100, textMax: 5000, tags: 3, own: '#shorts', maxSec: 180, vertical: true, how: tx('Перетащи файл, вставь название, описание — следующей строкой.') },
  { id: 'vkclips', label: tx('ВК Клипы'), url: 'https://vk.com/clips', textMax: 2000, tags: 5, maxSec: 180, vertical: true, how: tx('«Опубликовать клип» → выбери файл → вставь описание (Ctrl+V).') },
  { id: 'vkvideo', label: tx('VK Видео'), url: 'https://vkvideo.ru/', titleMax: 128, textMax: 5000, tags: 5, vertical: false, how: tx('«Загрузить видео» → перетащи файл → вставь название и описание.') },
  { id: 'rutube', label: 'RUTUBE', url: 'https://studio.rutube.ru/', titleMax: 100, textMax: 5000, tags: 5, maxSec: 180, vertical: false, how: tx('«Загрузить видео» → перетащи файл → вставь название и описание.') },
  { id: 'dzen', label: tx('Дзен'), url: 'https://dzen.ru/profile/editor', titleMax: 140, textMax: 5000, tags: 4, maxSec: 120, vertical: true, how: tx('«Создать» → «Загрузить видео» → перетащи файл → вставь название.') },
];

/** Страницы загрузки — единственные чужие сайты, которые Kadro открывает (и только по кнопке человека). */
export const PUBLISH_URLS = new Set(PUBLISH_TARGETS.map((t) => t.url));

const STOP = new Set(('и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это просто очень вообще короче типа блин значит ладно давайте давай сегодня сейчас тоже ещё щас вот такая такие такое этих ' // i18n-data
  + 'the a an and or but if then so to of in on at by for with from up about into over after is are was were be been being have has had do does did not no yes this that these those it its i you he she we they me him her us them my your our their what which who whom just very really like get got go going gonna can will would should could').split(/\s+/));

// окончания — чтобы «Карелия», «Карелию», «Карелии» были одним тегом
const ENDINGS = ['ами', 'ями', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ой', 'ей', 'ом', 'ем', 'ам', 'ям', 'ах', 'ях', 'ов', 'ев', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ий', 'ый', 'ую', 'юю', 'а', 'я', 'у', 'ю', 'ы', 'и', 'е', 'о', 'ь', 's']; // i18n-data
const stemOf = (w: string) => { for (const e of ENDINGS) if (w.endsWith(e) && w.length - e.length >= 4) return w.slice(0, -e.length); return w; };

/** Слова из названия и субтитров → 3–6 хэштегов: частые и длинные, без «и», «это», «короче». */
export function hashtagsOf(p: Project, limit = 6): string[] {
  const texts: string[] = [];
  for (const t of p.tracks) for (const c of t.clips) if (c.type === 'text' && !t.hidden) texts.push((c as TextClip).text);
  const name = p.name ?? '';
  // по основе слова: вес (название весомее) и как слово чаще всего написано
  const groups = new Map<string, { n: number; forms: Map<string, number> }>();
  const add = (s: string, k: number) => {
    for (const raw of s.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/i)) { // i18n-data
      if (raw.length < 4 || STOP.has(raw) || /^\d+$/.test(raw)) continue;
      const st = stemOf(raw);
      const g = groups.get(st) ?? { n: 0, forms: new Map<string, number>() };
      g.n += k;
      g.forms.set(raw, (g.forms.get(raw) ?? 0) + 1);
      groups.set(st, g);
    }
  };
  add(name, 3);
  for (const t of texts) add(t, 1);
  return [...groups.values()]
    .map((g) => {
      const w = [...g.forms.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))[0][0];
      return { w, s: g.n * Math.log(w.length) };
    })
    .sort((a, b) => b.s - a.s || a.w.localeCompare(b.w))
    .slice(0, limit)
    .map((e) => `#${e.w}`);
}

const DEFAULT_NAMES = () => [tx('Новый проект'), tx('Авто-ролик'), tx('Фильм'), 'Kadro'];

/** Заголовок: название проекта (если его дали), иначе первая фраза субтитров. */
export function titleOf(p: Project): string {
  const n = (p.name ?? '').trim();
  if (n && !DEFAULT_NAMES().includes(n)) return n;
  const caps = p.tracks.flatMap((t) => t.clips).filter((c): c is TextClip => c.type === 'text' && c.role === 'caption').sort((a, b) => a.start - b.start);
  const first = caps.slice(0, 6).map((c) => c.text.trim()).join(' ').replace(/\s+/g, ' ');
  const sentence = first.split(/(?<=[.!?…])\s/)[0] ?? '';
  return sentence.length > 70 ? `${sentence.slice(0, 68).replace(/\s+\S*$/, '')}…` : sentence;
}

const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);

/** Что вставить на площадке: название (если есть отдельное поле) и подпись с хэштегами — в пределах её длины. */
export function postFor(t: PublishTarget, title: string, tags: string[]): { title: string; text: string } {
  const own = t.own && !tags.some((x) => x.toLowerCase() === t.own) ? [t.own] : [];
  const use = [...tags.slice(0, t.tags), ...own];
  const tagLine = use.join(' ');
  if (t.titleMax) {
    // у YouTube #shorts работает и в названии — кладём туда, если влезает
    const ttl = t.own && `${title} ${t.own}`.length <= t.titleMax ? `${title} ${t.own}` : cut(title, t.titleMax);
    return { title: ttl.trim(), text: cut(tagLine, t.textMax) };
  }
  const body = title ? `${title}\n\n${tagLine}` : tagLine;
  return { title: '', text: cut(body.trim(), t.textMax) };
}

/** Замечания к файлу для площадки: длина и ориентация. */
export function publishWarn(t: PublishTarget, dur: number, w: number, h: number): string | null {
  if (t.maxSec && dur > t.maxSec + 0.5) return tx('Длиннее {0} с — в ленту коротких роликов не попадёт', t.maxSec);
  if (t.vertical && w > h) return tx('Горизонтальное видео — в вертикальной ленте будет с полями');
  return null;
}
