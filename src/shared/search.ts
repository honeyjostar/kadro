// Поиск по всему (Ctrl+K): эффекты, переходы, фильтры, разделы и команды Kadro.
// Не важны регистр, «ё» и раскладка: «ukbn» найдёт «глит(ч)», «ghjdthrf» — «проверка».

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё'; // i18n-data: раскладка клавиатуры
const TO_RU = new Map([...EN].map((c, i) => [c, RU[i]]));
const TO_EN = new Map([...RU].map((c, i) => [c, EN[i]]));

/** Строка, набранная не в той раскладке: латиница → кириллица и наоборот (по клавишам). */
export function swapLayout(s: string): string {
  return [...s.toLowerCase()].map((c) => TO_RU.get(c) ?? TO_EN.get(c) ?? c).join('');
}

/** Для сравнения: маленькие буквы, «ё» → «е», без знаков, одиночные пробелы. */
export function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export interface SearchItem {
  id: string;
  label: string;
  group: string;
  /** Другие слова, по которым тоже находить (подсказка, английское имя и т. п.). */
  keywords?: string[];
  /** Прибавка к рейтингу: избранное, недавнее. */
  boost?: number;
}

/** Насколько слово запроса подходит к тексту: начало слова лучше, чем середина. */
function wordScore(q: string, label: string, extra: string): number {
  if (!q) return 0;
  const words = label.split(' ');
  if (words.some((w) => w.startsWith(q))) return label.startsWith(q) ? 4 : 3;
  if (label.includes(q)) return 2;
  if (extra.includes(q)) return 1;
  return 0;
}

/** Рейтинг элемента для запроса; 0 — не подходит. Каждое слово запроса должно найтись. */
export function scoreItem(query: string, item: SearchItem): number {
  const q = norm(query);
  if (!q) return 0;
  const label = norm(item.label);
  const extra = norm([item.group, ...(item.keywords ?? [])].join(' '));
  const score = (words: string[], k: number): number => {
    let sum = 0;
    for (const w of words) {
      const s = wordScore(w, label, extra);
      if (!s) return 0;
      sum += s;
    }
    return sum * k;
  };
  const words = q.split(' ');
  let best = score(words, 1);
  // не та раскладка — тоже находим, но чуть ниже, чем точное совпадение
  if (!best) best = score(norm(swapLayout(query)).split(' '), 0.9);
  if (!best) return 0;
  if (label === q) best += 5;
  return best + (item.boost ?? 0);
}

/** Подходящие элементы — лучшие сверху; при равенстве — короче название, потом исходный порядок. */
export function searchItems<T extends SearchItem>(query: string, items: T[], limit = 50): T[] {
  return items
    .map((it, i) => ({ it, i, s: scoreItem(query, it) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.it.label.length - b.it.label.length || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.it);
}
