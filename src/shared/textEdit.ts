// Монтаж через текст: расшифровка ролика словами (из субтитров) — удалил слово, и этот кусок вырезан из ролика.
// Субтитры и всё, что стоит после выреза, сдвигается вместе с видео; музыка и звуки не режутся, только сдвигаются.
import { clipEnd, edit, keepSourceRanges, mainTrack, MIN_CLIP, placeFree, round } from './timeline';
import type { MediaClip, Project, TextClip, TrackKind } from './types';

/** Слово расшифровки: время — на таймлайне. */
export interface TWord { text: string; start: number; end: number; clipId: string }

/** Все слова субтитров по порядку (время на таймлайне). */
export function transcriptWords(p: Project): TWord[] {
  const out: TWord[] = [];
  for (const t of p.tracks) {
    if (t.kind !== 'text') continue;
    for (const c of t.clips) {
      if (c.type !== 'text' || c.role !== 'caption') continue;
      if (c.words?.length) for (const w of c.words) out.push({ text: w.text, start: round(c.start + w.start), end: round(c.start + w.end), clipId: c.id });
      else if (c.text.trim()) out.push({ text: c.text.trim(), start: c.start, end: round(c.start + c.duration), clipId: c.id });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

const clean = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}-]+/gu, '');
/** Слова-паразиты и звуки-заминки (одним словом и парами). */
const FILLER_WORDS = new Set(['э', 'ээ', 'эээ', 'эм', 'ээм', 'мм', 'ммм', 'хм', 'а-а', 'ну', 'типа', 'короче', 'блин', 'uh', 'um', 'uhm', 'erm', 'hmm']); // i18n-data
const FILLER_PAIRS = [['как', 'бы'], ['в', 'общем'], ['это', 'самое'], ['так', 'сказать'], ['you', 'know']]; // i18n-data

/** Номера слов-паразитов (Kadro их подсвечивает, удаляет человек). */
export function fillerIndices(words: TWord[]): number[] {
  const out = new Set<number>();
  const w = words.map((x) => clean(x.text));
  w.forEach((x, i) => {
    if (FILLER_WORDS.has(x) || /^(э+|м+|э+м+)$/.test(x)) out.add(i);
    for (const [a, b] of FILLER_PAIRS) if (x === a && w[i + 1] === b) { out.add(i); out.add(i + 1); }
  });
  return [...out].sort((a, b) => a - b);
}

/** Что вырезать за удалённые слова: от середины паузы перед словом до середины паузы после — паузы не растут. */
export function cutRanges(words: TWord[], del: number[], pad = 0.05): [number, number][] {
  const idx = [...new Set(del)].filter((i) => i >= 0 && i < words.length).sort((a, b) => a - b);
  const groups: [number, number][] = [];
  for (const i of idx) {
    const g = groups[groups.length - 1];
    if (g && g[1] === i - 1) g[1] = i;
    else groups.push([i, i]);
  }
  const out: [number, number][] = [];
  for (const [i, j] of groups) {
    const prev = words[i - 1], next = words[j + 1];
    const a = prev ? Math.max(prev.end, (prev.end + words[i].start) / 2) : Math.max(0, words[i].start - pad);
    const b = next ? Math.min(next.start, (words[j].end + next.start) / 2) : words[j].end + pad;
    if (b - a > 0.01) out.push([round(a), round(b)]);
  }
  return mergeRanges(out);
}

export function mergeRanges(r: [number, number][]): [number, number][] {
  const s = [...r].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Где окажется момент t после вырезания кусков (внутри выреза — на месте склейки). */
export function mapTime(t: number, ranges: [number, number][]): number {
  let removed = 0;
  for (const [a, b] of ranges) {
    if (a >= t) break;
    removed += Math.min(b, t) - a;
  }
  return round(t - removed);
}

/** Вырезать куски таймлайна: основная дорожка — по исходнику, субтитры и текст — по словам, остальное сдвигается. */
export function cutTimeline(p: Project, raw: [number, number][]): Project {
  const ranges = mergeRanges(raw.filter(([a, b]) => b - a > 1e-3));
  if (!ranges.length) return p;
  // основная дорожка: для каждого клипа — какие куски исходника оставить (по старой раскладке)
  const plans: { id: string; keep: [number, number][] }[] = [];
  for (const c of mainTrack(p).clips) {
    if (c.type !== 'media') continue;
    const s = c.start, e = clipEnd(c);
    const cuts = ranges.filter(([a, b]) => b > s + 1e-6 && a < e - 1e-6);
    if (!cuts.length) continue;
    const toSrc = (t: number) => c.in + (Math.min(e, Math.max(s, t)) - s) * c.speed;
    const keep: [number, number][] = [];
    let from = c.in;
    for (const [a, b] of cuts) {
      const sa = toSrc(a), sb = toSrc(b);
      if (sa - from > 1e-3) keep.push([from, sa]);
      from = Math.max(from, sb);
    }
    if (c.out - from > 1e-3) keep.push([from, c.out]);
    plans.push({ id: c.id, keep });
  }
  let q = p;
  for (const pl of plans) {
    if (pl.keep.length) q = keepSourceRanges(q, pl.id, pl.keep);
    else q = edit(q, (d) => { const t = mainTrack(d); t.clips = t.clips.filter((c) => c.id !== pl.id); }); // клип вырезан целиком
  }
  // остальные дорожки
  return edit(q, (d) => {
    for (const t of d.tracks) {
      if (t.kind === 'main') continue;
      const keepClips: typeof t.clips = [];
      const moved: MediaClip[] = [];
      for (const c of t.clips) {
        if (c.type === 'text') {
          const st = mapTime(c.start, ranges), en = mapTime(c.start + c.duration, ranges);
          if (c.words?.length) {
            const words = c.words
              .map((w) => ({ ...w, a: c.start + w.start, b: c.start + w.end }))
              .filter((w) => !ranges.some(([x, y]) => w.a >= x - 1e-6 && w.b <= y + 1e-6));
            if (!words.length) continue;
            const ns = mapTime(Math.min(c.start, words[0].a), ranges);
            (c as TextClip).words = words.map(({ a, b, ...w }) => ({ ...w, start: round(Math.max(0, mapTime(a, ranges) - ns)), end: round(Math.max(0, mapTime(b, ranges) - ns)) }));
            c.start = ns;
            c.duration = round(Math.max(MIN_CLIP, Math.max(en, mapTime(words[words.length - 1].b, ranges)) - ns));
            if (c.role === 'caption') c.text = (c as TextClip).words!.map((w) => w.text).join(' ');
          } else {
            if (en - st < MIN_CLIP) continue;
            c.start = st;
            c.duration = round(en - st);
          }
          keepClips.push(c);
        } else {
          // видео поверх, звук, музыка: не режутся, встают туда же относительно картинки
          c.start = mapTime(c.start, ranges);
          const prev = keepClips[keepClips.length - 1];
          if (prev && c.start < clipEnd(prev) - 1e-6) moved.push(c);
          else keepClips.push(c);
        }
      }
      t.clips = keepClips;
      for (const c of moved) placeFree(d, t.kind as Exclude<TrackKind, 'main'>, c, t.id);
    }
    d.tracks = d.tracks.filter((t) => t.kind === 'main' || t.clips.length || t.kind !== 'text');
  });
}

/** Сколько секунд вырежется. */
export const cutLength = (r: [number, number][]): number => mergeRanges(r).reduce((s, [a, b]) => s + (b - a), 0);
