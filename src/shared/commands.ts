// Команды словами: «убери паузы, музыку тише, добавь субтитры» → понятные Kadro действия.
// Разбор — по ключевым словам (без интернета и нейросетей): каждая часть фразы — одно действие.
import type { AspectKey } from './types';

export type Command =
  | { kind: 'pauses' }
  | { kind: 'fillers' }
  | { kind: 'captions' }
  | { kind: 'noCaptions' }
  | { kind: 'music'; factor: number }
  | { kind: 'voice'; factor: number }
  | { kind: 'cleanVoice' }
  | { kind: 'aspect'; aspect: AspectKey }
  | { kind: 'speed'; factor: number }
  | { kind: 'removeBg' }
  | { kind: 'export' }
  | { kind: 'cover' };

const n = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const num = (s: string | undefined, def: number) => {
  if (!s) return def;
  const words: Record<string, number> = { полтора: 1.5, два: 2, две: 2, три: 3, четыре: 4, пол: 0.5 }; // i18n-data
  return words[s] ?? (Number(s.replace(',', '.')) || def);
};

/** Одна часть фразы → команда (или null). */
export function parseOne(part: string): Command | null {
  const s = n(part);
  if (!s) return null;
  const quieter = /(тише|потише|приглуш|убав|уменьш|quieter|lower)/.test(s);
  const louder = /(громче|погромче|прибав|усиль|louder|boost)/.test(s);
  if (/(паузы?|тишин|pause|silence)/.test(s) && /(убер|удал|выреж|вырез|убра|без|remove|cut)/.test(s)) return { kind: 'pauses' };
  if (/(паразит|э-?э|мычан|заминк|filler)/.test(s)) return { kind: 'fillers' };
  if (/(субтитр|caption|subtitle)/.test(s)) return /(убер|удал|без|спрят|спряч|выключ|remove|hide)/.test(s) ? { kind: 'noCaptions' } : { kind: 'captions' };
  if (/(музык|music)/.test(s) && (quieter || louder)) return { kind: 'music', factor: quieter ? 0.6 : 1.5 };
  if (/(чист|улучш|шум|clean|noise)/.test(s) && /(голос|звук|речь|шум|voice|audio|noise)/.test(s)) return { kind: 'cleanVoice' };
  if (/(голос|речь|звук|voice)/.test(s) && (quieter || louder)) return { kind: 'voice', factor: quieter ? 0.7 : 1.4 };
  if (/(9 ?[:x×/] ?16|вертикал|vertical)/.test(s)) return { kind: 'aspect', aspect: '9:16' };
  if (/(16 ?[:x×/] ?9|горизонтал|horizontal)/.test(s)) return { kind: 'aspect', aspect: '16:9' };
  if (/(1 ?[:x×/] ?1|квадрат|square)/.test(s)) return { kind: 'aspect', aspect: '1:1' };
  const fast = /(ускор|быстрее|speed ?up|faster)/.test(s), slow = /(замедл|медленнее|slow)/.test(s);
  if (fast || slow) {
    const m = /(\d+(?:[.,]\d+)?|полтора|два|две|три|четыре)\s*(?:раз|x|х|×)?/.exec(s); // i18n-data
    const k = Math.min(4, Math.max(1.1, num(m?.[1], fast ? 1.5 : 2)));
    return { kind: 'speed', factor: fast ? k : Math.max(0.25, 1 / k) };
  }
  if (/(фона?(?![а-я])|background)/.test(s) && /(убер|удал|выреж|без|remove)/.test(s) && !/(музык|music)/.test(s)) return { kind: 'removeBg' };
  if (/(обложк|превью|thumbnail)/.test(s)) return { kind: 'cover' };
  if (/(экспорт|сохрани видео|выгрузи|export|render)/.test(s)) return { kind: 'export' };
  return null;
}

/** Вся фраза → команды по порядку и куски, которые не поняли. */
export function parseCommands(text: string): { cmds: Command[]; unknown: string[] } {
  const parts = text.split(/[,.;!\n]+|\s+(?:и|а потом|потом|затем|then|and)\s+/i).map((x) => x.trim()).filter(Boolean); // i18n-data
  const cmds: Command[] = [];
  const unknown: string[] = [];
  for (const p of parts) {
    const c = parseOne(p);
    if (c) cmds.push(c);
    else unknown.push(p);
  }
  return { cmds, unknown };
}
