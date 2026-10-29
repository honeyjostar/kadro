// Перевод текста без интернета: модели OPUS-MT (Marian, Хельсинкский университет) в ONNX, onnxruntime-node.
// Токенизатор SentencePiece (Unigram) — свой, по tokenizer.json; декодирование — жадное, по шагам, с
// защитой от зацикливания. Модели качаются один раз из релиза translate-models репозитория Kadro.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Pair } from '../../shared/translate';
import { mtDir } from './mtModels';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ort = require('onnxruntime-node');

// ---------- токенизатор SentencePiece (Unigram) ----------
interface Tok { pieces: Map<string, { id: number; score: number }>; byId: string[]; unk: number; maxLen: number; minScore: number; special: Set<number> }

function loadTokenizer(file: string): Tok {
  const j = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    model: { type: string; vocab: [string, number][]; unk_id?: number };
    added_tokens?: { id: number; content: string; special?: boolean }[];
  };
  if (j.model?.type !== 'Unigram' || !Array.isArray(j.model.vocab)) throw new Error('Непонятный словарь модели перевода');
  const pieces = new Map<string, { id: number; score: number }>();
  const byId: string[] = [];
  let maxLen = 1;
  let minScore = 0;
  j.model.vocab.forEach(([p, score], id) => {
    byId[id] = p;
    if (!pieces.has(p)) pieces.set(p, { id, score });
    if (score < minScore) minScore = score;
    if ([...p].length > maxLen) maxLen = [...p].length;
  });
  const special = new Set<number>((j.added_tokens ?? []).filter((t) => t.special).map((t) => t.id));
  // unk_id в tokenizer.json у моделей Marian бывает неверным — берём по самому кусочку
  const unk = pieces.get('<unk>')?.id ?? j.model.unk_id ?? 1;
  return { pieces, byId, unk, maxLen: Math.min(maxLen, 32), minScore, special };
}

/** Нормализация как у SentencePiece (nmt_nfkc): NFKC, без управляющих символов, одиночные пробелы. */
export function normalizeForMt(s: string): string {
  return s.normalize('NFKC').replace(/[\u0000-\u001f\u007f​-‏﻿]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Текст → номера кусочков: каждое слово с «▁» впереди — Витерби по оценкам Unigram (как tokenizers). */
function encode(tok: Tok, text: string): number[] {
  return normalizeForMt(text).split(' ').filter(Boolean).flatMap((w) => encodeWord(tok, `▁${w}`));
}

function encodeWord(tok: Tok, word: string): number[] {
  const s = [...word];
  const n = s.length;
  const best = new Float64Array(n + 1).fill(-Infinity);
  const from = new Int32Array(n + 1).fill(-1);
  const pid = new Int32Array(n + 1).fill(-1);
  best[0] = 0;
  const unkScore = tok.minScore - 10;
  for (let i = 0; i < n; i++) {
    if (best[i] === -Infinity) continue;
    let any = false;
    let sub = '';
    for (let l = 1; l <= tok.maxLen && i + l <= n; l++) {
      sub += s[i + l - 1];
      const p = tok.pieces.get(sub);
      if (!p) continue;
      any = true;
      const sc = best[i] + p.score;
      if (sc > best[i + l]) { best[i + l] = sc; from[i + l] = i; pid[i + l] = p.id; }
    }
    if (!any || best[i + 1] === -Infinity) {
      const sc = best[i] + unkScore;
      if (sc > best[i + 1]) { best[i + 1] = sc; from[i + 1] = i; pid[i + 1] = tok.unk; }
    }
  }
  const ids: number[] = [];
  for (let i = n; i > 0; i = from[i]) ids.push(pid[i]);
  ids.reverse();
  // несколько <unk> подряд — один
  return ids.filter((id, k) => !(id === tok.unk && ids[k - 1] === tok.unk));
}

function decode(tok: Tok, ids: number[], skip: Set<number>): string {
  return ids.filter((id) => !skip.has(id) && id !== tok.unk).map((id) => tok.byId[id] ?? '').join('').replace(/▁/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Предложения: после . ! ? … (и закрывающих кавычек) и пробела с заглавной буквы или цифры. */
export function splitSentences(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = /[.!?…。！？]+["»”')\]]*\s+(?=[\p{Lu}\p{N}«"„(\[¿¡\u4e00-\u9fff\u3040-\u30ff])/gu;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push(text.slice(last, m.index + m[0].length).trim());
    last = m.index + m[0].length;
  }
  out.push(text.slice(last).trim());
  return out.filter(Boolean);
}

// ---------- модель ----------
interface Cfg { decoder_start_token_id: number; eos_token_id: number; pad_token_id: number; vocab_size?: number }

class Marian {
  private constructor(private enc: any, private dec: any, private decPast: any | null, private tok: Tok, private cfg: Cfg) {}

  static async load(pair: string): Promise<Marian> {
    const dir = mtDir(pair);
    const opts = { executionProviders: ['cpu'], intraOpNumThreads: Math.max(1, Math.min(8, os.cpus().length - 1)), graphOptimizationLevel: 'all' };
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')) as Cfg;
    const tok = loadTokenizer(path.join(dir, 'tokenizer.json'));
    const enc = await ort.InferenceSession.create(path.join(dir, 'encoder.onnx'), opts);
    const dec = await ort.InferenceSession.create(path.join(dir, 'decoder.onnx'), opts);
    // с кэшем ключей и значений каждый шаг считает только новое слово — в разы быстрее
    const pastFile = path.join(dir, 'decoder_with_past.onnx');
    const decPast = fs.existsSync(pastFile) ? await ort.InferenceSession.create(pastFile, opts) : null;
    return new Marian(enc, dec, decPast, tok, { ...cfg, decoder_start_token_id: cfg.decoder_start_token_id ?? cfg.pad_token_id });
  }

  /** Текст из нескольких предложений переводим по предложениям: модель не теряет короткие («Привет!»). */
  async translate(text: string): Promise<string> {
    const parts = splitSentences(normalizeForMt(text));
    const out: string[] = [];
    for (const p of parts) out.push(await this.translateOne(p));
    return out.filter(Boolean).join(' ');
  }

  /** Самое вероятное следующее слово по логитам позиции pos (кроме <pad>). */
  private pick(logits: any, pos: number): number {
    const data = logits.data as Float32Array;
    const V = logits.dims[2] as number;
    const base = pos * V;
    const pad = this.cfg.pad_token_id;
    let best = -1;
    let bv = -Infinity;
    for (let v = 0; v < V; v++) {
      if (v === pad) continue;
      const x = data[base + v];
      if (x > bv) { bv = x; best = v; }
    }
    return best;
  }

  private async translateOne(clean: string): Promise<string> {
    if (!clean) return '';
    const src = [...encode(this.tok, clean).slice(0, 400), this.cfg.eos_token_id];
    const n = src.length;
    const ids = new ort.Tensor('int64', BigInt64Array.from(src.map(BigInt)), [1, n]);
    const mask = new ort.Tensor('int64', new BigInt64Array(n).fill(1n), [1, n]);
    const encOut = await this.enc.run({ input_ids: ids, attention_mask: mask });
    const hidden = encOut.last_hidden_state;
    const out: number[] = [this.cfg.decoder_start_token_id];
    const maxLen = Math.min(512, Math.round(n * 2.2) + 12);
    const looped = () => {
      // зациклилось: последние 3 кусочка уже повторились трижды подряд
      const k = out.length;
      if (k <= 12) return false;
      const a = out.slice(k - 3).join(',');
      if (a === out.slice(k - 6, k - 3).join(',') && a === out.slice(k - 9, k - 6).join(',')) { out.splice(k - 6); return true; }
      return false;
    };
    const tok1 = (id: number) => new ort.Tensor('int64', BigInt64Array.from([BigInt(id)]), [1, 1]);
    if (this.decPast) {
      // первый шаг — полный декодер (он же отдаёт кэш энкодера), дальше — по одному слову с кэшем
      let r = await this.dec.run({ input_ids: tok1(out[0]), encoder_hidden_states: hidden, encoder_attention_mask: mask });
      const past: Record<string, unknown> = {};
      const keep = (res: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(res)) if (k.startsWith('present.')) past[`past_key_values.${k.slice(8)}`] = v;
      };
      keep(r);
      const needsHidden = (this.decPast.inputNames as string[]).includes('encoder_hidden_states');
      for (let step = 0; step < maxLen; step++) {
        const next = this.pick(r.logits, r.logits.dims[1] - 1);
        if (next === this.cfg.eos_token_id) break;
        out.push(next);
        if (looped()) break;
        const feeds: Record<string, unknown> = { input_ids: tok1(next), encoder_attention_mask: mask };
        if (needsHidden) feeds.encoder_hidden_states = hidden;
        for (const name of this.decPast.inputNames as string[]) if (name.startsWith('past_key_values.')) feeds[name] = past[name];
        r = await this.decPast.run(feeds);
        keep(r);
      }
    } else {
      for (let step = 0; step < maxLen; step++) {
        const t = out.length;
        const dIds = new ort.Tensor('int64', BigInt64Array.from(out.map(BigInt)), [1, t]);
        const r = await this.dec.run({ input_ids: dIds, encoder_hidden_states: hidden, encoder_attention_mask: mask });
        const next = this.pick(r.logits, t - 1);
        if (next === this.cfg.eos_token_id) break;
        out.push(next);
        if (looped()) break;
      }
    }
    return decode(this.tok, out.slice(1), new Set([this.cfg.pad_token_id, this.cfg.eos_token_id, ...this.tok.special]));
  }
}

const loaded = new Map<string, Promise<Marian>>();
const model = (pair: string) => { if (!loaded.has(pair)) loaded.set(pair, Marian.load(pair)); return loaded.get(pair)!; };

/** Перевести строки по пути из моделей (ru-en, затем en-de — через английский). */
export async function translateTexts(texts: string[], route: Pair[], onProgress: (p: number) => void, isCancelled: () => boolean): Promise<string[]> {
  let cur = texts;
  const steps = route.length * texts.length || 1;
  let done = 0;
  for (const pair of route) {
    const m = await model(pair);
    const next: string[] = [];
    for (const t of cur) {
      if (isCancelled()) throw Object.assign(new Error('Отменено'), { name: 'AbortError' });
      next.push(await m.translate(t));
      done++;
      onProgress(done / steps);
    }
    cur = next;
  }
  return cur;
}
