// Субтитры «как у блогеров»: по одному–три слова крупно, произносимое слово цветом, ключевые слова — своим цветом,
// эмодзи по смыслу над субтитром, «выскакивание». Чистые функции: разбивка, ключевые слова, эмодзи, готовые стили.
import { tx } from './i18n';
import { CUE_DEFAULTS, wordsToCues, type CueOptions } from './captions';
import { CAPTION_STYLE } from './defaults';
import { animAllCaptions, setCaptions, type Cue } from './timeline';
import type { Project, TextAnim, TextClip, TextStyle, Word } from './types';
import WORDS from './blogWords.json';

/** Сколько слов в одном субтитре: 1, 2, 3 или строкой (как обычно). */
export type CapGroup = '1' | '2' | '3' | 'line';
export const CAP_GROUPS: { value: CapGroup; label: string }[] = [
  { value: '1', label: tx('По слову') }, { value: '2', label: tx('По 2') }, { value: '3', label: tx('По 3') }, { value: 'line', label: tx('Строкой') },
];
const GROUP_OPTS: Record<CapGroup, CueOptions> = {
  1: { maxChars: 18, maxWords: 1, maxDuration: 1.4, pauseSplit: 0.3 },
  2: { maxChars: 20, maxWords: 2, maxDuration: 1.6, pauseSplit: 0.35 },
  3: { maxChars: 24, maxWords: 3, maxDuration: 2, pauseSplit: 0.4 },
  line: CUE_DEFAULTS,
};

export interface BlogStyle {
  id: string;
  label: string;
  group: CapGroup;
  style: Partial<TextStyle>;
  anim?: TextAnim;
  keywords: boolean;
  emoji: boolean;
}

/** Готовые стили. Шрифты — из встроенных, с кириллицей. */
export const BLOG_STYLES: BlogStyle[] = [
  { id: 'hormozi', label: tx('Хормози'), group: '3', keywords: true, emoji: true, anim: { type: 'pop', dur: 0.14 },
    style: { font: 'Montserrat', bold: true, uppercase: true, size: 76, color: '#ffffff', strokeColor: '#000000', strokeWidth: 9, shadow: true, bgOpacity: 0, highlight: { mode: 'color', color: '#ffd400' }, keyColor: '#3ddc63' } },
  { id: 'beast', label: tx('MrBeast'), group: '2', keywords: true, emoji: true, anim: { type: 'bounce', dur: 0.24 },
    style: { font: 'Dela Gothic One', bold: false, uppercase: true, size: 88, color: '#ffffff', strokeColor: '#000000', strokeWidth: 11, shadow: true, bgOpacity: 0, highlight: { mode: 'pop', color: '#ffe14d' }, keyColor: '#ff4040' } },
  { id: 'word', label: tx('По слову'), group: '1', keywords: true, emoji: false, anim: { type: 'pop', dur: 0.12 },
    style: { font: 'Montserrat', bold: true, uppercase: false, size: 100, color: '#ffffff', strokeColor: '#000000', strokeWidth: 8, shadow: true, bgOpacity: 0, highlight: { mode: 'none', color: '#ffd400' }, keyColor: '#ffd400' } },
  { id: 'boxword', label: tx('Плашка'), group: '3', keywords: false, emoji: true, anim: { type: 'pop', dur: 0.14 },
    style: { font: 'Rubik', bold: true, uppercase: true, size: 70, color: '#ffffff', strokeColor: '#000000', strokeWidth: 6, shadow: false, bgOpacity: 0, highlight: { mode: 'box', color: '#7c3aed' } } },
  { id: 'neonblog', label: tx('Неон'), group: '3', keywords: true, emoji: false, anim: { type: 'zoom', dur: 0.16 },
    style: { font: 'Unbounded', bold: true, uppercase: true, size: 64, color: '#ffffff', strokeColor: '#c21cff', strokeWidth: 6, shadow: true, bgOpacity: 0, highlight: { mode: 'color', color: '#3df5ff' }, keyColor: '#ff4fd8' } },
  { id: 'karaoke', label: tx('Караоке'), group: 'line', keywords: false, emoji: false, anim: { type: 'fade', dur: 0.12 },
    style: { font: 'Montserrat', bold: true, uppercase: false, size: 60, color: '#ffffff', strokeColor: '#000000', strokeWidth: 7, shadow: false, bgOpacity: 0, highlight: { mode: 'karaoke', color: '#ffd400' } } },
];

// ---------- ключевые слова ----------
const norm = (w: string) => w.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '');

// служебные и самые частые слова — не ключевые (словарь — blogWords.json)
const STOP = new Set<string>(WORDS.stop);

/** Насколько слово «ключевое»: числа, имена, длинные содержательные слова, слова со смыслом-эмодзи. */
export function keywordScore(raw: string, first = false): number {
  const w = norm(raw);
  if (!w || STOP.has(w)) return 0;
  let s = 0;
  if (/\d/.test(w)) s += 4; // числа — главное в фразе («100 000 за месяц»)
  if (emojiFor(raw)) s += 2;
  if (w.length >= 7) s += 1 + w.length / 12;
  else if (w.length >= 5) s += 0.6;
  if (!first && /^[A-ZА-ЯЁ]/.test(raw.replace(/^[^\p{L}\p{N}]+/u, '')) && w.length > 2) s += 1.2; // имя посреди фразы
  if (/[!]$/.test(raw)) s += 0.5;
  return s;
}

// ---------- эмодзи по смыслу ----------
// начало слова → эмодзи (словарь — blogWords.json)
const EMOJI = WORDS.emoji as [string, string][];
// короткие начала, которые часто бывают частью других слов: только целым словом или с окончанием до 3 букв
const STRICT = new Set<string>(WORDS.strict);

/** Эмодзи к слову по смыслу (или ничего). */
export function emojiFor(raw: string): string | undefined {
  const w = norm(raw);
  if (w.length < 3) return undefined;
  for (const [stem, e] of EMOJI) {
    if (!w.startsWith(stem)) continue;
    if (STRICT.has(stem) && w.length - stem.length > 3) continue;
    return e;
  }
  return undefined;
}

/**
 * Отметить ключевые слова и эмодзи. Ключевое слово — не больше одного на субтитр (самое весомое), у субтитра из одного
 * слова — только если оно весомое. Эмодзи — у первого подходящего слова и не чаще раза в 2,5 с.
 */
export function markCues(cues: Cue[], o: { keywords: boolean; emoji: boolean }): Cue[] {
  let lastEmoji = -Infinity;
  let sentenceStart = true;
  return cues.map((c) => {
    const words: Word[] = (c.words ?? []).map((w) => ({ text: w.text, start: w.start, end: w.end }));
    if (o.keywords && words.length) {
      const scores = words.map((w, i) => keywordScore(w.text, sentenceStart && i === 0));
      const best = scores.indexOf(Math.max(...scores));
      if (scores[best] >= (words.length === 1 ? 2.2 : 1.5)) words[best].key = true;
    }
    if (o.emoji && c.start - lastEmoji >= 2.5) {
      const i = words.findIndex((w) => emojiFor(w.text));
      if (i >= 0) { words[i].emoji = emojiFor(words[i].text); lastEmoji = c.start; }
    }
    sentenceStart = /[.!?…]$/.test(c.text.trim());
    return { ...c, words };
  });
}

// ---------- применение к проекту ----------
const isCaption = (c: { type: string; role?: string }): c is TextClip => c.type === 'text' && c.role === 'caption';

/** Все слова субтитров проекта по порядку, время — от начала таймлайна. */
export function captionWords(p: Project): Word[] {
  const out: Word[] = [];
  for (const t of p.tracks) for (const c of t.clips) {
    if (!isCaption(c)) continue;
    if (c.words?.length) for (const w of c.words) out.push({ text: w.text, start: c.start + w.start, end: c.start + w.end });
    else {
      // слов нет (старые проекты) — раскладываем по длине
      const ws = c.text.split(/\s+/).filter(Boolean);
      const total = ws.reduce((n, w) => n + w.length + 1, 0) || 1;
      let pos = c.start;
      for (const w of ws) { const d = ((w.length + 1) / total) * c.duration; out.push({ text: w, start: pos, end: pos + d }); pos += d; }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Какой сейчас стиль подачи у субтитров: слов в субтитре, отмечены ли ключевые слова и эмодзи. */
export function captionLook(p: Project): { group: CapGroup; keywords: boolean; emoji: boolean } | null {
  const caps = p.tracks.flatMap((t) => t.clips).filter(isCaption);
  if (!caps.length) return null;
  const maxWords = Math.max(...caps.map((c) => c.words?.length ?? c.text.split(/\s+/).filter(Boolean).length));
  const group: CapGroup = maxWords <= 1 ? '1' : maxWords === 2 ? '2' : maxWords === 3 ? '3' : 'line';
  return { group, keywords: caps.some((c) => c.words?.some((w) => w.key)), emoji: caps.some((c) => c.words?.some((w) => w.emoji)) };
}

/**
 * Пересобрать субтитры: другое число слов в субтитре, ключевые слова, эмодзи. Стиль, анимация и высота
 * берутся у нынешних субтитров (или из style/anim/y, если заданы — так применяется готовый стиль).
 */
export function restyleCaptions(p: Project, o: { group?: CapGroup; keywords?: boolean; emoji?: boolean; style?: Partial<TextStyle>; anim?: TextAnim | null; y?: number }): Project {
  const caps = p.tracks.flatMap((t) => t.clips).filter(isCaption);
  if (!caps.length) return p;
  const look = captionLook(p)!;
  const first = caps[0];
  const words = captionWords(p);
  const cues = markCues(wordsToCues(words, GROUP_OPTS[o.group ?? look.group]), { keywords: o.keywords ?? look.keywords, emoji: o.emoji ?? look.emoji });
  const style: TextStyle = { ...CAPTION_STYLE, ...first.style, ...o.style };
  let next = setCaptions(p, cues, style, o.y ?? first.y);
  const anim = o.anim === undefined ? first.anim?.in : o.anim ?? undefined;
  next = animAllCaptions(next, anim);
  return next;
}

/** Применить готовый стиль «как у блогеров». vertical — высота на экране для вертикального ролика. */
export function applyBlogStyle(p: Project, s: BlogStyle, vertical: boolean): Project {
  return restyleCaptions(p, {
    group: s.group, keywords: s.keywords, emoji: s.emoji, anim: s.anim ?? null,
    // keyColor и highlight — заменяются целиком: у «Плашки» ключевых слов нет
    style: { keyColor: undefined, ...s.style },
    y: s.group === 'line' ? (vertical ? 0.64 : 0.86) : (vertical ? 0.6 : 0.8),
  });
}
