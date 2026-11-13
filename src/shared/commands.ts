// Команды словами: «убери паузы, музыку тише, добавь субтитры» → понятные Kadro действия.
// Разбор — по ключевым словам (без интернета и нейросетей): каждая часть фразы — одно действие.
import { tx } from './i18n';
import type { LangCode } from './translate';
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
  | { kind: 'cover' }
  | { kind: 'autoZoom' }
  | { kind: 'noAutoZoom' }
  | { kind: 'hideFaces' }
  | { kind: 'volume'; target: 'music' | 'voice'; percent: number }
  | { kind: 'mute'; on: boolean }
  | { kind: 'stabilize' }
  | { kind: 'enhance' }
  | { kind: 'filter'; preset: string }
  | { kind: 'brightness'; factor: number }
  | { kind: 'translate'; to?: LangCode }
  | { kind: 'reframe' }
  | { kind: 'retouch' }
  | { kind: 'beats' }
  | { kind: 'freeze' }
  | { kind: 'split' }
  | { kind: 'delete' }
  | { kind: 'shorts' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'help' };

const n = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const num = (s: string | undefined, def: number) => {
  if (!s) return def;
  const words: Record<string, number> = { полтора: 1.5, два: 2, две: 2, три: 3, четыре: 4, пол: 0.5 }; // i18n-data
  return words[s] ?? (Number(s.replace(',', '.')) || def);
};

// языки перевода субтитров — по корню слова
const LANG_WORDS: [RegExp, LangCode][] = [
  [/(англ|english)/, 'en'], [/(русск|russian)/, 'ru'], [/(украин|ukrainian)/, 'uk'], [/(немец|german)/, 'de'], [/(испан|spanish)/, 'es'], // i18n-data
  [/(франц|french)/, 'fr'], [/(итальян|italian)/, 'it'], [/(польск|polish)/, 'pl'], [/(турец|turkish)/, 'tr'], [/(китай|chinese)/, 'zh'], // i18n-data
  [/(япон|japanese)/, 'ja'], [/(корей|korean)/, 'ko'], [/(араб|arabic)/, 'ar'], // i18n-data
];
// фильтры по смыслу слова → пресет из src/shared/color.ts
const FILTER_WORDS: [RegExp, string][] = [
  [/(ч ?[/-] ?б(?![а-я])|чб(?![а-я])|черно-? ?бел|black ?(and|&) ?white|b&w|monochrome)/, 'bw'], // i18n-data
  [/(сепи|sepia)/, 'sepia'], [/(тепл|warm)/, 'warm'], [/(холодн|cool|cold)/, 'cool'], // i18n-data
  [/(кино|cinema|film look)/, 'cinema'], [/(сочн|насыщ|vivid)/, 'vivid'], // i18n-data
];

/** Одна часть фразы → команда (или null). */
export function parseOne(part: string): Command | null {
  const s = n(part);
  if (!s) return null;
  const off = /(убер|убра|удал|выключ|отключ|без(?![а-я])|заглуш|сними|remove|mute|turn off|no )/.test(s);
  if (/^(помощь|помоги|подскажи|что (ты )?(умеешь|можешь)|команды|help|\?)$/.test(s)) return { kind: 'help' };
  if (/^(отмени|отмена|откати|откат|верни как было|undo)/.test(s)) return { kind: 'undo' };
  if (/^(повтори|верни отмен|redo)/.test(s)) return { kind: 'redo' };
  if (/(перевед|перевод|translate)/.test(s)) {
    const lang = LANG_WORDS.find(([re]) => re.test(s));
    return { kind: 'translate', ...(lang ? { to: lang[1] } : {}) };
  }
  const quieter = /(тише|потише|приглуш|убав|уменьш|quieter|lower)/.test(s);
  const louder = /(громче|погромче|прибав|усиль|louder|boost)/.test(s);
  if (/(паузы?|тишин|pause|silence)/.test(s) && /(убер|удал|выреж|вырез|убра|без|remove|cut)/.test(s)) return { kind: 'pauses' };
  if (/(паразит|э-?э|мычан|заминк|filler)/.test(s)) return { kind: 'fillers' };
  if (/(лиц[оаы]?(?![а-я])|лица|faces?)/.test(s) && /(скр|размо|размы|замаж|замаз|спряч|спрят|закр|blur|hide)/.test(s)) return { kind: 'hideFaces' };
  if (/(субтитр|caption|subtitle)/.test(s)) return /(убер|удал|без|спрят|спряч|выключ|remove|hide)/.test(s) ? { kind: 'noCaptions' } : { kind: 'captions' };
  // «музыку на 30%», «громкость голоса 150%»
  const pct = /(\d{1,3})\s*(?:%|процент)/.exec(s);
  if (pct && /(музык|голос|речь|звук|громкост|music|voice|volume)/.test(s)) {
    return { kind: 'volume', target: /(музык|music)/.test(s) ? 'music' : 'voice', percent: Math.min(200, Number(pct[1])) };
  }
  if (/(музык|music)/.test(s) && (quieter || louder)) return { kind: 'music', factor: quieter ? 0.6 : 1.5 };
  if (/(музык|music)/.test(s) && off) return { kind: 'music', factor: 0 };
  if (/(чист|улучш|шум|clean|noise)/.test(s) && /(голос|звук|речь|шум|voice|audio|noise)/.test(s)) return { kind: 'cleanVoice' };
  if (/(голос|речь|звук|voice)/.test(s) && (quieter || louder)) return { kind: 'voice', factor: quieter ? 0.7 : 1.4 };
  if (/(звук|sound|audio)/.test(s) && /(верни|включи|unmute|turn on)/.test(s)) return { kind: 'mute', on: false };
  if (/(звук|sound|audio)/.test(s) && off || /^(mute|заглуши)$/.test(s)) return { kind: 'mute', on: true };
  if (/(стабилиз|тряск|трясет|дрожан|дрожит|stabil|shak)/.test(s)) return { kind: 'stabilize' };
  if (/(качеств|четк|четч|резк|резч|апскейл|upscale|enhance|sharp)/.test(s) || /(улучш|improve)/.test(s) && /(видео|картинк|изображ|кадр|video|picture|image)/.test(s)) return { kind: 'enhance' };
  if (/(фильтр|filter)/.test(s) && off) return { kind: 'filter', preset: 'none' };
  const look = FILTER_WORDS.find(([re]) => re.test(s));
  if (look) return { kind: 'filter', preset: look[1] };
  if (/(светлее|посветлее|ярче|поярче|осветл|brighter|lighter)/.test(s)) return { kind: 'brightness', factor: 1.15 };
  if (/(темнее|потемнее|затемн|darker)/.test(s)) return { kind: 'brightness', factor: 0.87 };
  if (/(ретуш|сглад\S* кож|гладк\S* кож|retouch|smooth skin)/.test(s)) return { kind: 'retouch' };
  if (/(держи \S+ в кадре|в центре кадра|автокадр|кадрируй|reframe|in frame)/.test(s)) return { kind: 'reframe' };
  if (/(стоп-?кадр|заморо|freeze)/.test(s)) return { kind: 'freeze' };
  if (/(под бит|под ритм|в ритм|в такт|по битам|to the beat|on beat)/.test(s)) return { kind: 'beats' };
  if (/(шортс|shorts|лучшие моменты|best moments)/.test(s)) return { kind: 'shorts' };
  if (/(разреж|разрез|раздели|split)/.test(s)) return { kind: 'split' };
  if (/(клип|выделен|выбран|clip|selected|selection)/.test(s) && /(удал|убер|delete|remove)/.test(s)) return { kind: 'delete' };
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
  if (/(автозум|авто-зум|наезд|зум|zoom)/.test(s)) return /(убер|удал|без|выключ|remove)/.test(s) ? { kind: 'noAutoZoom' } : { kind: 'autoZoom' };
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

/** Что умеют команды словами — примеры для подсказок. Каждый пример обязан разбираться (tests/unit/commands.test.ts). */
export const COMMAND_HELP: { group: string; examples: string[] }[] = [
  { group: tx('Монтаж'), examples: [tx('убери паузы'), tx('убери слова-паразиты'), tx('ускорь в 2 раза'), tx('разрежь'), tx('стоп-кадр'), tx('подгони под бит'), tx('нарежь шортсы'), tx('отмени')] },
  { group: tx('Звук'), examples: [tx('музыку тише'), tx('музыку на 30%'), tx('убери музыку'), tx('голос громче'), tx('чистый голос'), tx('убери звук')] },
  { group: tx('Картинка'), examples: [tx('сделай вертикально'), tx('стабилизируй'), tx('улучши качество'), tx('чёрно-белое'), tx('сделай светлее'), tx('убери фон'), tx('скрой лица'), tx('ретушь'), tx('добавь автозум')] },
  { group: tx('Субтитры и выпуск'), examples: [tx('добавь субтитры'), tx('переведи субтитры на английский'), tx('спрячь субтитры'), tx('сделай обложку'), tx('экспорт')] },
];
/** Короткий набор — чипами под строкой команды. */
export const COMMAND_CHIPS: string[] = [tx('убери паузы'), tx('добавь субтитры'), tx('музыку тише'), tx('сделай вертикально'), tx('стабилизируй')];
