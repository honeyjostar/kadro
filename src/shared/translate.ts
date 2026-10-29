// Перевод субтитров без интернета: какие языки есть, через что переводить (прямо или через английский),
// как склеить обрывки фраз из соседних субтитров в предложения и разложить перевод обратно по субтитрам.
// Чистые функции — проверяются без моделей.
import { tx } from './i18n';

export type LangCode = 'ru' | 'en' | 'uk' | 'de' | 'es' | 'fr' | 'it' | 'zh' | 'pl' | 'tr' | 'ja' | 'ko' | 'ar';
export const LANGS: { code: LangCode; label: string }[] = [
  { code: 'ru', label: tx('Русский') }, { code: 'en', label: tx('Английский') }, { code: 'uk', label: tx('Украинский') },
  { code: 'de', label: tx('Немецкий') }, { code: 'es', label: tx('Испанский') }, { code: 'fr', label: tx('Французский') },
  { code: 'it', label: tx('Итальянский') }, { code: 'pl', label: tx('Польский') }, { code: 'tr', label: tx('Турецкий') },
  { code: 'zh', label: tx('Китайский') }, { code: 'ja', label: tx('Японский') }, { code: 'ko', label: tx('Корейский') }, { code: 'ar', label: tx('Арабский') },
];
export const langLabel = (c: string): string => LANGS.find((l) => l.code === c)?.label ?? c;

/** Модели переводят в одну сторону: «ru-en» — с русского на английский. */
export type Pair = `${LangCode}-${LangCode}`;

/**
 * Путь перевода по доступным моделям: прямо, а если прямой модели нет — через английский (ru → en → de).
 * null — так перевести нельзя.
 */
export function routeFor(from: LangCode, to: LangCode, have: Set<string>): Pair[] | null {
  if (from === to) return [];
  const direct = `${from}-${to}` as Pair;
  if (have.has(direct)) return [direct];
  const a = `${from}-en` as Pair;
  const b = `en-${to}` as Pair;
  if (from !== 'en' && to !== 'en' && have.has(a) && have.has(b)) return [a, b];
  return null;
}

/** На какие языки можно перевести с from (по списку моделей). */
export function targetsFrom(from: LangCode, have: Set<string>): LangCode[] {
  return LANGS.map((l) => l.code).filter((to) => to !== from && routeFor(from, to, have));
}

/** Язык текста — по буквам (для подсказки «С какого языка»). */
export function guessLang(text: string): LangCode {
  const t = text.toLowerCase();
  const count = (re: RegExp) => (t.match(re) ?? []).length;
  const cyr = count(/[а-яёіїєґ]/g);
  const lat = count(/[a-zà-ÿßğışçñ]/g);
  const cjk = count(/[一-鿿]/g);
  const kana = count(/[぀-ヿ]/g);
  const hang = count(/[가-힯]/g);
  const arab = count(/[؀-ۿ]/g);
  const best = Math.max(cyr, lat, cjk, kana, hang, arab);
  if (!best) return 'en';
  if (kana && kana * 3 >= best) return 'ja';
  if (best === hang) return 'ko';
  if (best === arab) return 'ar';
  if (best === cjk) return 'zh';
  if (best === cyr) return count(/[іїєґ]/g) > 0 && count(/[ыэъё]/g) === 0 ? 'uk' : 'ru';
  if (count(/[äöüß]/g) * 40 > lat) return 'de';
  if (count(/[ñ¿¡]/g) * 60 > lat) return 'es';
  if (count(/[ąęłńśźż]/g) * 40 > lat) return 'pl';
  if (count(/[ğış]/g) * 40 > lat) return 'tr';
  if (count(/[àâçèéêëîïôùûœ]/g) * 30 > lat) return 'fr';
  return 'en';
}

const END = /[.!?…。！？]["»”')\]]*$/;

/**
 * Склеить соседние субтитры в фразы: следующий продолжает предыдущий, если тот не кончился точкой и
 * пауза между ними короткая. В группе не больше maxCues субтитров и maxChars знаков.
 */
export function groupCues(cues: { text: string; start: number; end: number }[], maxCues = 4, maxChars = 220): number[][] {
  const groups: number[][] = [];
  let cur: number[] = [];
  let len = 0;
  cues.forEach((c, i) => {
    const prev = cues[i - 1];
    const join = cur.length > 0 && cur.length < maxCues && len + c.text.length <= maxChars
      && !END.test(prev.text.trim()) && c.start - prev.end < 1.2;
    if (!join && cur.length) { groups.push(cur); cur = []; len = 0; }
    cur.push(i);
    len += c.text.length + 1;
  });
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * Разложить переведённую фразу по субтитрам группы пропорционально длине оригиналов: границы — по словам
 * (для китайского и японского — по знакам), лучше после запятой, если она рядом.
 */
export function splitTranslation(text: string, origLens: number[]): string[] {
  const n = origLens.length;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (n <= 1) return [clean];
  const spaced = !/[\u3040-\u30ff\u4e00-\u9fff]/.test(clean) || /\s/.test(clean);
  const units = spaced ? clean.split(' ') : [...clean];
  const joinU = (xs: string[]) => (spaced ? xs.join(' ') : xs.join(''));
  if (units.length < n) {
    // слов меньше, чем субтитров: по слову в начало, остальные пустые — пустые потом заполнятся соседями
    const out = units.map((u) => u).concat(new Array(n - units.length).fill(''));
    return out;
  }
  const total = origLens.reduce((a, b) => a + Math.max(1, b), 0);
  const ulen = units.map((u) => u.length + (spaced ? 1 : 0));
  const sum = ulen.reduce((a, b) => a + b, 0);
  const cuts: number[] = [];
  let acc = 0;
  for (let k = 0; k < n - 1; k++) {
    acc += Math.max(1, origLens[k]);
    const target = (acc / total) * sum;
    // ближайшая граница после слова j (cut = j+1), не раньше предыдущей и оставляя по слову каждому дальше
    const lo = (cuts[k - 1] ?? 0) + 1;
    const hi = units.length - (n - 1 - k);
    let best = lo;
    let bestCost = Infinity;
    let pos = ulen.slice(0, lo).reduce((a, b) => a + b, 0);
    for (let c = lo; c <= hi; c++) {
      const punct = /[,;:—–]$/.test(units[c - 1]) ? 0.12 * sum / n : 0;
      const cost = Math.abs(pos - target) - punct;
      if (cost < bestCost) { bestCost = cost; best = c; }
      pos += ulen[c] ?? 0;
    }
    cuts.push(best);
  }
  const out: string[] = [];
  let s = 0;
  for (const c of [...cuts, units.length]) { out.push(joinU(units.slice(s, c))); s = c; }
  return out;
}
