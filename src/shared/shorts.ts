// Нарезка длинного видео (стрим, подкаст, влог) в шортсы: по распознанной речи ищем лучшие моменты —
// крючок в начале, цельные фразы, плотная речь, эмоции, громкость — и собираем из каждого вертикальный проект
// с субтитрами «как у блогеров» и заголовком-крючком. Чистые функции — тестируются без программы.
import { tx } from './i18n';
import { CAPTION_STYLE, newProject } from './defaults';
import { wordsToCues } from './captions';
import { BLOG_STYLES, applyBlogStyle, keywordScore, type BlogStyle } from './blogCaptions';
import { addAsset, addText, addToMain, setCaptions, updateClip } from './timeline';
import type { MediaAsset, Project, Word } from './types';

export interface Phrase { start: number; end: number; words: Word[]; text: string; /** конец предложения: знак или долгая пауза после */ ends: boolean }

export type ShortReason = 'hook' | 'question' | 'dense' | 'emotion' | 'loud' | 'numbers';
export interface ShortMoment { start: number; end: number; score: number; hook: string; title: string; reasons: ShortReason[]; words: Word[] }

export type ShortLen = 'short' | 'mid' | 'long';
export const SHORT_LENS: Record<ShortLen, { min: number; max: number; label: string }> = {
  short: { min: 15, max: 35, label: tx('15–35 с') },
  mid: { min: 30, max: 60, label: tx('30–60 с') },
  long: { min: 45, max: 90, label: tx('45–90 с') },
};

export const REASON_LABEL: Record<ShortReason, string> = {
  hook: tx('цепляет с первых слов'), question: tx('вопрос в начале'), dense: tx('плотная речь'),
  emotion: tx('эмоции'), loud: tx('громче обычного'), numbers: tx('цифры'),
};

const norm = (w: string) => w.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}?!]/gu, '');
const QUESTION = /^(как|почему|зачем|что|чего|сколько|кто|где|когда|какой|какая|какое|какие|разве|неужели|how|why|what|who|when|where|which|is|are|do|does|can)$/;
const HOOK = /^(никогда|всегда|секрет|главн|самы|самое|ошибк|правд|лайфхак|топ|лучш|худш|запомни|смотри|представь|представьте|внимание|стоп|важн|запрещ|шок|реальн|никто|все|каждый|never|always|secret|mistake|best|worst|truth|stop|nobody|everyone|imagine|listen)/;
const INTENSE = /^(очень|реально|вообще|офигеть|жесть|капец|невероятн|безумн|огромн|дико|ужасн|обалде|класс|круто|вау|ого|ахах|хаха|ха|блин|amazing|crazy|insane|huge|wow|omg|literally|absolutely|incredible)/;
const MID_START = /^(и|а|но|или|потому|поэтому|то|так|ну|and|but|or|so|because|then)$/;

/** Фразы: граница — пауза в речи или конец предложения. */
export function phrasesOf(words: Word[], gap = 0.55): Phrase[] {
  const out: Phrase[] = [];
  let buf: Word[] = [];
  const flush = (next?: Word) => {
    if (!buf.length) return;
    const last = buf[buf.length - 1];
    const ends = /[.!?…]$/.test(last.text) || !next || next.start - last.end >= 0.8;
    out.push({ start: buf[0].start, end: last.end, words: buf, text: buf.map((w) => w.text).join(' '), ends });
    buf = [];
  };
  words.forEach((w, i) => {
    if (buf.length && (w.start - buf[buf.length - 1].end >= gap || /[.!?…]$/.test(buf[buf.length - 1].text))) flush(w);
    buf.push(w);
    if (i === words.length - 1) flush();
  });
  return out;
}

/** Крючок — первая фраза (до 8 слов). */
function hookOf(ph: Phrase[]): string {
  const ws = ph[0].words.slice(0, 8).map((w) => w.text);
  return ws.join(' ').replace(/[,;:]$/, '');
}

/** Заголовок сверху: крючок без хвоста, заглавными, не длиннее ~40 знаков. */
export function titleOf(hook: string): string {
  let t = '';
  for (const w of hook.split(/\s+/)) {
    if ((t + ' ' + w).trim().length > 40) break;
    t = (t + ' ' + w).trim();
  }
  return (t || hook.slice(0, 40)).replace(/[.,;:…]+$/, '').toUpperCase();
}

interface ScoreCtx { loud?: (t0: number, t1: number) => number; target: number }

function scoreWindow(ph: Phrase[], c: ScoreCtx): { score: number; reasons: ShortReason[] } {
  const start = ph[0].start;
  const end = ph[ph.length - 1].end;
  const dur = Math.max(0.1, end - start);
  const words = ph.flatMap((p) => p.words);
  const reasons: ShortReason[] = [];
  // плотность речи: 2,8 слова в секунду — максимум
  const wps = words.length / dur;
  const density = Math.min(1, Math.max(0, (wps - 1.2) / 1.6));
  if (wps >= 2) reasons.push('dense');
  // паузы внутри — скучно
  let gaps = 0;
  for (let i = 1; i < words.length; i++) { const g = words[i].start - words[i - 1].end; if (g > 0.8) gaps += g; }
  const silence = gaps / dur;
  // крючок: первые 3 секунды
  const first = words.filter((w) => w.start - start < 3).map((w) => norm(w.text));
  let hook = 0;
  const firstText = ph[0].text;
  if (/\?/.test(firstText) || (first[0] && QUESTION.test(first[0].replace(/[?!]/g, '')))) { hook += 1; reasons.push('question'); }
  if (first.some((w) => HOOK.test(w))) { hook += 0.8; if (!reasons.includes('question')) reasons.push('hook'); }
  if (first.some((w) => /\d/.test(w))) hook += 0.5;
  if (first[0] && /^(ты|вы|you)$/.test(first[0])) hook += 0.3;
  if (first[0] && MID_START.test(first[0])) hook -= 0.7; // начало посреди мысли
  // эмоции и ключевые слова
  const excl = words.filter((w) => /!/.test(w.text)).length;
  const intense = words.filter((w) => INTENSE.test(norm(w.text))).length;
  const emotion = Math.min(1, ((excl + intense) / dur) * 6);
  if (emotion > 0.5) reasons.push('emotion');
  const nums = words.filter((w) => /\d/.test(w.text)).length;
  if (nums >= 2) reasons.push('numbers');
  const keys = Math.min(1, words.reduce((s, w) => s + keywordScore(w.text), 0) / words.length / 2.5);
  // цельность: кончается концом предложения
  const complete = (ph[ph.length - 1].ends ? 0.5 : -0.3);
  // громкость относительно всего видео
  let loud = 0;
  if (c.loud) { loud = Math.max(-0.4, Math.min(0.5, c.loud(start, end) - 1)); if (loud > 0.15) reasons.push('loud'); }
  // длина — ближе к середине выбранного диапазона
  const lenFit = -Math.abs(dur - c.target) / c.target * 0.4;
  const score = 1.3 * density - 1.2 * silence + hook + 0.7 * emotion + 0.5 * keys + 0.25 * Math.min(nums, 3) / 3 + complete + loud + lenFit;
  return { score, reasons };
}

/**
 * Лучшие моменты: окна из целых фраз длиной min…max секунд, не пересекаются. Порядок — от лучшего.
 * loud(t0, t1) — громкость куска относительно средней по видео (1 — как обычно), если известна.
 */
export function findMoments(words: Word[], o: { min: number; max: number; count: number; loud?: (t0: number, t1: number) => number }): ShortMoment[] {
  const ph = phrasesOf(words);
  const target = (o.min + o.max) / 2;
  const cands: ShortMoment[] = [];
  for (let i = 0; i < ph.length; i++) {
    // начинать с начала предложения, а не с середины
    if (i > 0 && !ph[i - 1].ends && ph[i].start - ph[i - 1].end < 0.6) continue;
    for (let j = i; j < ph.length; j++) {
      const dur = ph[j].end - ph[i].start;
      if (dur > o.max) break;
      if (dur < o.min) continue;
      const win = ph.slice(i, j + 1);
      const { score, reasons } = scoreWindow(win, { loud: o.loud, target });
      const hook = hookOf(win);
      cands.push({ start: win[0].start, end: win[win.length - 1].end, score, reasons, hook, title: titleOf(hook), words: win.flatMap((p) => p.words) });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const picked: ShortMoment[] = [];
  for (const m of cands) {
    if (picked.length >= o.count) break;
    if (picked.some((p) => m.start < p.end + 1 && p.start < m.end + 1)) continue;
    picked.push(m);
  }
  return picked;
}

/** Громкость по форме волны (peaks 0…1 на всю длину файла): средняя куска / средняя всего файла. */
export function loudnessFrom(peaks: number[] | undefined, duration: number): ((t0: number, t1: number) => number) | undefined {
  if (!peaks?.length || duration <= 0) return undefined;
  const mean = peaks.reduce((s, v) => s + v, 0) / peaks.length;
  if (mean <= 1e-4) return undefined;
  return (t0, t1) => {
    const a = Math.max(0, Math.floor((t0 / duration) * peaks.length));
    const b = Math.min(peaks.length, Math.max(a + 1, Math.ceil((t1 / duration) * peaks.length)));
    let s = 0;
    for (let i = a; i < b; i++) s += peaks[i];
    return s / (b - a) / mean;
  };
}

/** Небольшой запас по краям, чтобы первое и последнее слово не обрезались. */
const PAD = 0.25;

/**
 * Вертикальный проект из момента: кусок видео на весь кадр, субтитры «как у блогеров», заголовок-крючок сверху
 * первые 3 секунды. Имя проекта — «Шортс N — крючок».
 */
export function shortProject(asset: MediaAsset, m: ShortMoment, n: number, style: BlogStyle = BLOG_STYLES[0]): Project {
  const name = tx('Шортс {0} — {1}', n, m.hook.length > 40 ? `${m.hook.slice(0, 40).trim()}…` : m.hook);
  const t0 = Math.max(0, m.start - PAD);
  const t1 = Math.min(asset.duration || m.end + PAD, m.end + PAD);
  let p = newProject(name, '9:16');
  p = addAsset(p, asset);
  const r = addToMain(p, asset.id, 0, { in: t0, out: t1 });
  p = updateClip(r.project, r.clipId, { fit: 'cover' });
  // субтитры: слова момента, время — от начала куска
  const words = m.words.map((w) => ({ text: w.text, start: Math.max(0, w.start - t0), end: Math.max(0, w.end - t0) }));
  p = setCaptions(p, wordsToCues(words), CAPTION_STYLE, 0.6);
  p = applyBlogStyle(p, style, true);
  // заголовок-крючок
  const title = addText(p, 0, m.title, { font: 'Montserrat', bold: true, uppercase: true, size: 64, color: '#ffffff', bgColor: '#ff3d7f', bgOpacity: 1, strokeWidth: 0, shadow: false });
  p = updateClip(title.project, title.clipId, { duration: Math.min(3, t1 - t0), y: 0.2, anim: { in: { type: 'pop', dur: 0.25 }, out: { type: 'fade', dur: 0.2 } } });
  return p;
}
