// «Ролик по сценарию»: текст → сцены → (озвучка) → кадры из своих видео и фото на всю длину сцены →
// субтитры точно по тексту → музыка тише под голос. Здесь — чистые функции (тестируются без Electron);
// озвучка и разбор видео — в renderer/actions.ts.
import { tx } from './i18n';
import { goodSeconds, pickWindows, rng, type Highlights } from './autoEdit';
import { ASPECTS, CAPTION_STYLE, newProject } from './defaults';
import { addAsset, addFree, addToMain, setCaptions, setSettings, updateClip, type Cue } from './timeline';
import type { AspectKey, MediaAsset, Project, TextStyle } from './types';

/** Сцена: кусок текста; dur — сколько она длится (по озвучке или по скорости чтения). */
export interface ScriptScene { text: string; dur: number; voice?: MediaAsset | null }

const SENT = /[^.!?…]+[.!?…]+["»”)]*\s*|[^.!?…]+$/g;

/**
 * Текст → сцены. Пустая строка — граница сцены. Длинный абзац делится по предложениям так, чтобы сцена
 * была не длиннее ~maxChars знаков (примерно 10–12 секунд речи).
 */
export function splitScript(text: string, maxChars = 170): string[] {
  const paras = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of paras) {
    if (p.length <= maxChars) { out.push(p); continue; }
    const sents = (p.match(SENT) ?? [p]).map((s) => s.trim()).filter(Boolean);
    let cur = '';
    for (const s of sents) {
      if (cur && (cur + ' ' + s).length > maxChars) { out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Сколько читать вслух (если без озвучки): ~14 знаков в секунду, не меньше 2 с. */
export function readingTime(text: string): number {
  const chars = text.replace(/\s+/g, ' ').trim().length;
  return Math.max(2, Math.round((chars / 14 + 0.6) * 10) / 10);
}

/**
 * Субтитры сцены: куски до maxChars знаков по границам слов, время каждого куска и слова — пропорционально
 * длине (плюс немного на паузу после запятой и точки). Слова — для подсветки «караоке».
 */
export function captionCues(text: string, start: number, dur: number, maxChars = 32): Cue[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length || dur <= 0) return [];
  const weight = (w: string) => w.length + 2 + (/[,;:—–-]$/.test(w) ? 3 : 0) + (/[.!?…]["»”)]*$/.test(w) ? 6 : 0);
  const total = words.reduce((n, w) => n + weight(w), 0);
  const k = dur / total;
  let t = start;
  const timed = words.map((w) => { const s = t; t += weight(w) * k; return { text: w, start: s, end: t }; });
  const cues: Cue[] = [];
  let cur: typeof timed = [];
  const flush = () => {
    if (!cur.length) return;
    cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(' '), words: cur.map((w) => ({ ...w })) });
    cur = [];
  };
  for (const w of timed) {
    const len = cur.reduce((n, x) => n + x.text.length + 1, 0);
    if (cur.length && len + w.text.length > maxChars) flush();
    cur.push(w);
    if (/[.!?…]["»”)]*$/.test(w.text)) flush(); // предложение кончилось — новый субтитр
  }
  flush();
  return cues.map((c) => ({ ...c, start: Math.round(c.start * 1000) / 1000, end: Math.round(c.end * 1000) / 1000 }));
}

export interface ScriptInput {
  scenes: ScriptScene[];
  media: { asset: MediaAsset; hl?: Highlights | null }[];
  music?: MediaAsset | null;
  aspect: AspectKey;
  title: string;
  captions: boolean;
  shot: number;           // желаемая длина кадра, с (2–4)
  seed: number;
}
export interface ScriptSummary { scenes: number; shots: number; duration: number; repeated: boolean; voiced: boolean }

const isVisual = (a: MediaAsset) => a.kind === 'image' || (a.kind === 'video' && a.hasVideo && a.duration >= 0.5);
/** Край видео, который не берём (первые и последние доли секунды часто смазаны); у коротких — без краёв. */
const edgeOf = (a: MediaAsset) => (a.duration < 3 ? 0 : Math.min(0.2, a.duration * 0.05));
const usableLen = (a: MediaAsset) => a.duration - 2 * edgeOf(a);

/** Собрать ролик по сценарию на основе проекта base (обычно пустого). */
export function scriptEdit(base: Project, inp: ScriptInput): { project: Project; summary: ScriptSummary } {
  const rand = rng(inp.seed);
  const media = inp.media.filter((m) => isVisual(m.asset));
  if (!media.length) throw new Error(tx('Нужны видео или фото'));
  const scenes = inp.scenes.filter((s) => s.text.trim() && s.dur > 0);
  if (!scenes.length) throw new Error(tx('Сценарий пустой'));
  let p = base;
  const { w, h } = ASPECTS[inp.aspect];
  p = setSettings(p, { aspect: inp.aspect, width: w, height: h });
  for (const m of media) p = addAsset(p, m.asset);
  for (const s of scenes) if (s.voice) p = addAsset(p, s.voice);
  if (inp.music) p = addAsset(p, inp.music);

  // кадры: каждая сцена делится на кадры ~shot секунд; склейки — на границах сцен и внутри них
  const shots: { scene: number; len: number }[] = [];
  scenes.forEach((s, i) => {
    const n = Math.max(1, Math.round(s.dur / Math.max(1.2, inp.shot)));
    for (let k = 0; k < n; k++) shots.push({ scene: i, len: s.dur / n });
  });
  // кому какой кадр: по кругу в порядке файлов, но видео с большим количеством «хорошего» — чаще
  const weightOf = (m: (typeof media)[number]) => (m.asset.kind === 'image' ? 2 : Math.max(1, goodSeconds(m.hl, 0, m.asset.duration)));
  const weights = media.map(weightOf);
  const need = new Array(media.length).fill(0);
  const owner: number[] = [];
  let last = -1;
  for (let i = 0; i < shots.length; i++) {
    // у кого меньше всего кадров относительно веса; не тот же файл подряд
    let best = -1;
    // видео сильно короче кадра пришлось бы замедлять больше чем в 4 раза — такому кадру его не даём
    const fits = (j: number) => media[j].asset.kind === 'image' || usableLen(media[j].asset) >= shots[i].len * 0.3;
    const pool = media.map((_, j) => j).filter(fits);
    for (const j of pool.length ? pool : media.map((_, k) => k)) {
      if (media.length > 1 && j === last) continue;
      const score = need[j] / weights[j] + rand() * 0.01;
      if (best < 0 || score < need[best] / weights[best] + 0.005) best = j;
    }
    owner.push(best);
    need[best]++;
    last = best;
  }
  // окна в каждом видео: по порядку, лучшие места, без повторов, пока материала хватает
  const starts = new Array<number>(shots.length).fill(0);
  let repeated = false;
  media.forEach((m, j) => {
    const idx = owner.map((o, i) => (o === j ? i : -1)).filter((i) => i >= 0);
    if (!idx.length || m.asset.kind === 'image') return;
    const a0 = edgeOf(m.asset);
    const a1 = m.asset.duration - a0;
    const needs = idx.map((i) => Math.min(shots[i].len, a1 - a0));
    if (needs.reduce((x, y) => x + y, 0) > a1 - a0) repeated = true;
    // материала мало — кругами: каждый круг — свои лучшие окна
    const per = Math.max(1, Math.floor((a1 - a0) / Math.max(...needs)));
    for (let k = 0; k < idx.length; k += per) {
      const part = idx.slice(k, k + per);
      const w = pickWindows(m.hl, part.map((i) => Math.min(shots[i].len, a1 - a0)), a0, a1, () => rand() - 0.5);
      part.forEach((i, n) => { starts[i] = w[n]; });
    }
  });

  // основная дорожка
  let at = 0;
  const sceneStart: number[] = [];
  shots.forEach((s, i) => {
    if (sceneStart[s.scene] === undefined) sceneStart[s.scene] = at;
    const m = media[owner[i]];
    const isImg = m.asset.kind === 'image';
    const len = isImg ? s.len : Math.min(s.len, usableLen(m.asset));
    const in0 = isImg ? 0 : Math.min(Math.max(0, starts[i]), m.asset.duration - len);
    const r = addToMain(p, m.asset.id, at + 1e3, { in: in0, out: in0 + len });
    p = r.project;
    // видео короче кадра — замедляем ровно до длины кадра (склейки остаются под голосом); звук видео не нужен
    const speed = !isImg && len < s.len - 1e-3 ? len / s.len : 1;
    const zoom = isImg ? { scale: [{ t: 0, v: 1 }, { t: len, v: 1.08 }] } : undefined;
    p = updateClip(p, r.clipId, { volume: 0, fit: 'cover', ...(isImg ? { in: 0, out: len } : {}), ...(speed !== 1 ? { speed } : {}), ...(zoom ? { keyframes: zoom } : {}) });
    at += s.len;
  });
  const total = at;

  // голос: каждая сцена — свой файл озвучки в начале сцены
  let voiced = false;
  scenes.forEach((s, i) => {
    if (!s.voice) return;
    voiced = true;
    p = addFree(p, s.voice.id, sceneStart[i]).project;
  });
  // музыка: от начала до конца ролика, под голосом тише, в конце затухает
  if (inp.music) {
    const r = addFree(p, inp.music.id, 0);
    p = r.project;
    const len = Math.min(inp.music.duration, total);
    p = updateClip(p, r.clipId, { out: len, volume: voiced ? 0.22 : 0.7, fadeIn: 0.5, fadeOut: Math.min(2, len / 4) });
  }
  // субтитры точно по тексту
  if (inp.captions) {
    const cues = scenes.flatMap((s, i) => captionCues(s.text, sceneStart[i], s.dur));
    const style: TextStyle = { ...CAPTION_STYLE };
    p = setCaptions(p, cues, style, 0.7);
  }
  if (inp.title.trim()) p = { ...p, name: inp.title.trim() };
  return { project: p, summary: { scenes: scenes.length, shots: shots.length, duration: total, repeated, voiced } };
}

/** Пустой проект под ролик по сценарию. */
export const scriptBase = (aspect: AspectKey, title: string): Project => newProject(title.trim() || tx('Ролик по сценарию'), aspect);
