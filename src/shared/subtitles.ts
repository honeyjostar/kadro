// Готовые субтитры: чтение .srt и .vtt (WebVTT) в строки субтитров Kadro и запись обратно в .srt.
import type { Cue } from './timeline';

/** Текст файла по байтам: метка порядка байтов (UTF-8/UTF-16), иначе UTF-8, а если он ломается — Windows-1251 (старые русские .srt). */
export function decodeSubtitleBytes(b: Uint8Array): string {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3));
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1251').decode(b); }
}

/** «00:01:02,345», «01:02.345», «1:02:03.4» → секунды; null — не время. */
export function parseTimecode(s: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/.exec(s.trim());
  if (!m) return null;
  const ms = m[4] ? Number(m[4].padEnd(3, '0')) : 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms / 1000;
}

const TIME_LINE = /^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)/;

/** Разметку из текста — долой: <i>, <b>, <font …>, голос <v Имя>, классы <c.yellow>, {\an8} и прочие {…} из ASS. */
function cleanText(lines: string[]): string {
  return lines
    .map((l) => l.replace(/\{\\[^}]*\}/g, '').replace(/<\/?[a-z][^>]*>/gi, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Слова субтитра разложены по его времени пропорционально длине — чтобы работала подсветка произносимого слова. */
export function evenWords(text: string, start: number, end: number): NonNullable<Cue['words']> {
  const ws = text.split(/\s+/).filter(Boolean);
  if (!ws.length) return [];
  const weight = ws.map((w) => Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, '').length) + 1);
  const total = weight.reduce((a, b) => a + b, 0);
  const span = Math.max(0.05, end - start);
  let t = start;
  return ws.map((w, i) => { const d = (span * weight[i]) / total; const r = { text: w, start: t, end: t + d }; t += d; return r; });
}

/** Разбор .srt или .vtt: время и текст, как в файле. Пустые и сломанные блоки пропускаются; порядок — по времени. */
export function parseSubtitles(text: string): Cue[] {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const cues: Cue[] = [];
  let i = 0;
  while (i < lines.length) {
    const tm = TIME_LINE.exec(lines[i]);
    if (!tm) { i++; continue; }
    const start = parseTimecode(tm[1]); const end = parseTimecode(tm[2]);
    i++;
    const body: string[] = [];
    // текст — до пустой строки (или до следующей строки времени, если пустую потеряли)
    while (i < lines.length && lines[i].trim() !== '' && !TIME_LINE.test(lines[i])) body.push(lines[i++]);
    // номер следующего блока .srt, прилипший к тексту без пустой строки
    if (i < lines.length && TIME_LINE.test(lines[i]) && body.length && /^\d+$/.test(body[body.length - 1].trim())) body.pop();
    const t = cleanText(body);
    if (start == null || end == null || !t || end <= start) continue;
    cues.push({ start, end, text: t, words: evenWords(t.replace(/\n/g, ' '), start, end) });
  }
  return cues.sort((a, b) => a.start - b.start);
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
/** Секунды → «00:01:02,345». */
export function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

/** Субтитры → текст .srt (нумерация с 1, перевод строки Windows — так его понимают все плееры и YouTube). */
export function cuesToSrt(cues: Pick<Cue, 'start' | 'end' | 'text'>[]): string {
  return cues
    .filter((c) => c.text.trim() && c.end > c.start)
    .sort((a, b) => a.start - b.start)
    .map((c, k) => `${k + 1}\r\n${srtTime(c.start)} --> ${srtTime(c.end)}\r\n${c.text.trim().replace(/\r?\n/g, '\r\n')}\r\n`)
    .join('\r\n');
}
