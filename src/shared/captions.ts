// Из токенов распознавания (с таймкодами) — слова, из слов — строки субтитров.
import type { Cue } from './timeline';

export interface Word { text: string; start: number; end: number }

/**
 * tokens/timestamps — как отдаёт sherpa-onnx (символы GigaAM или BPE-кусочки Parakeet,
 * начало слова — токен, начинающийся с пробела). offset — сдвиг сегмента, segEnd — конец сегмента.
 */
export function tokensToWords(tokens: string[], timestamps: number[], offset: number, segEnd: number): Word[] {
  const words: Word[] = [];
  let cur: Word | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i].replace(/▁/g, ' ');
    const ts = (timestamps[i] ?? 0) + offset;
    const startsWord = tok.startsWith(' ') || cur === null;
    const clean = tok.trim();
    if (startsWord && clean) {
      if (cur) words.push(cur);
      cur = { text: clean, start: ts, end: ts };
    } else if (clean && cur) {
      cur.text += clean;
      // знаки препинания у Parakeet приходят отдельным токеном уже на тишине — конец слова не двигают
      if (/[\p{L}\p{N}]/u.test(clean)) cur.end = ts;
    } else if (!clean && cur) {
      // пробел-токен: слово закончилось
      words.push(cur);
      cur = null;
    }
  }
  if (cur) words.push(cur);
  // конец слова — начало следующего (но не дальше чем +0.6 с от последней буквы), конец последнего — конец сегмента
  for (let i = 0; i < words.length; i++) {
    const next = words[i + 1];
    const hard = next ? next.start : segEnd;
    words[i].end = Math.min(hard, Math.max(words[i].end + 0.12, words[i].start + 0.12), words[i].end + 0.35);
    if (words[i].end <= words[i].start) words[i].end = words[i].start + 0.05;
  }
  return words;
}

export interface CueOptions {
  maxChars: number;   // символов в строке субтитра
  maxWords: number;
  maxDuration: number;
  pauseSplit: number; // пауза между словами, после которой — новый субтитр
}

export const CUE_DEFAULTS: CueOptions = { maxChars: 32, maxWords: 6, maxDuration: 3.2, pauseSplit: 0.45 };

export function wordsToCues(words: Word[], o: CueOptions = CUE_DEFAULTS): Cue[] {
  const cues: Cue[] = [];
  let buf: Word[] = [];
  const flush = () => {
    if (!buf.length) return;
    cues.push({ start: buf[0].start, end: buf[buf.length - 1].end, text: buf.map((w) => w.text).join(' ') });
    buf = [];
  };
  for (const w of words) {
    if (buf.length) {
      const last = buf[buf.length - 1];
      const text = buf.map((x) => x.text).join(' ') + ' ' + w.text;
      const tooLong = text.length > o.maxChars || buf.length >= o.maxWords || w.end - buf[0].start > o.maxDuration;
      const pause = w.start - last.end > o.pauseSplit;
      const sentenceEnd = /[.!?…]$/.test(last.text);
      if (tooLong || pause || sentenceEnd) flush();
    }
    buf.push(w);
  }
  flush();
  // небольшой «хвост», чтобы субтитр не исчезал раньше голоса, но без наложения на следующий
  for (const c of cues) c.start = Math.max(0, c.start - 0.05);
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1];
    const tail = cues[i].end + 0.25;
    cues[i].end = next ? Math.max(cues[i].start + 0.05, Math.min(tail, next.start)) : tail;
  }
  return cues.filter((c) => c.text.trim().length > 0);
}

/** Если модель выдаёт только строчные буквы — делаем заглавной первую букву каждой фразы. */
export function capitalizeSegments(words: Word[], segmentStarts: Set<number>): Word[] {
  const hasUpper = words.some((w) => /[A-ZА-ЯЁ]/.test(w.text));
  if (hasUpper) return words;
  return words.map((w, i) => (segmentStarts.has(i) ? { ...w, text: w.text.charAt(0).toUpperCase() + w.text.slice(1) } : w));
}

/** Речь → отрезки, которые оставить (для «убрать паузы»). Время — в секундах исходника. */
export function speechToKeepRanges(
  speech: [number, number][], clipIn: number, clipOut: number, pad = 0.15, mergeGap = 0.35, padEnd = pad,
): [number, number][] {
  const padded = speech
    .map(([a, b]) => [Math.max(clipIn, a - pad), Math.min(clipOut, b + padEnd)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const r of padded) {
    const last = out[out.length - 1];
    if (last && r[0] - last[1] <= mergeGap) last[1] = Math.max(last[1], r[1]);
    else out.push([...r] as [number, number]);
  }
  return out;
}
