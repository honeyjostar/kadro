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

const textOf = (ws: Word[]) => ws.map((w) => w.text).join(' ');

function fits(ws: Word[], o: CueOptions): boolean {
  return ws.length <= o.maxWords && textOf(ws).length <= o.maxChars && ws[ws.length - 1].end - ws[0].start <= o.maxDuration;
}

/** Длинную фразу делим на минимальное число ровных кусков (по длине текста), предпочитая место после запятой. */
function splitBalanced(ws: Word[], o: CueOptions): Word[][] {
  if (ws.length <= 1 || fits(ws, o)) return [ws];
  const n = ws.length;
  const cost = (i: number, j: number): number => { // слова i..j-1
    const g = ws.slice(i, j);
    if (!fits(g, o) && g.length > 1) return Infinity;
    const len = textOf(g).length;
    return len * len - (/[,;:—–-]$/.test(g[g.length - 1].text) && j < n ? 120 : 0);
  };
  for (let k = 2; k <= n; k++) {
    const dp: number[][] = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Infinity));
    const from: number[][] = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(-1));
    dp[0][0] = 0;
    for (let g = 1; g <= k; g++) {
      for (let j = g; j <= n; j++) {
        for (let i = g - 1; i < j; i++) {
          if (!Number.isFinite(dp[g - 1][i])) continue;
          const c = dp[g - 1][i] + cost(i, j);
          if (c < dp[g][j]) { dp[g][j] = c; from[g][j] = i; }
        }
      }
    }
    if (Number.isFinite(dp[k][n])) {
      const parts: Word[][] = [];
      let j = n;
      for (let g = k; g >= 1; g--) { const i = from[g][j]; parts.unshift(ws.slice(i, j)); j = i; }
      return parts;
    }
  }
  return ws.map((w) => [w]);
}

export function wordsToCues(words: Word[], o: CueOptions = CUE_DEFAULTS): Cue[] {
  // 1) фразы: граница — пауза в речи или конец предложения
  const phrases: Word[][] = [];
  let buf: Word[] = [];
  for (const w of words) {
    if (buf.length) {
      const last = buf[buf.length - 1];
      if (w.start - last.end > o.pauseSplit || /[.!?…]$/.test(last.text)) { phrases.push(buf); buf = []; }
    }
    buf.push(w);
  }
  if (buf.length) phrases.push(buf);
  // 2) длинные фразы — на ровные куски
  const cues: Cue[] = phrases.flatMap((ph) => splitBalanced(ph, o)).map((g) => ({ start: g[0].start, end: g[g.length - 1].end, text: textOf(g) }));
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
