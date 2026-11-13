// Голоса для озвучки текста. Два движка (оба — через sherpa-onnx, без интернета после скачивания):
//  • Piper — лёгкие голоса, один архив на голос;
//  • Kokoro — студийное качество для английского: один архив (~130 МБ) сразу на все голоса, считает медленнее.
// Все голоса — с открытыми лицензиями, разрешающими любые ролики (CC0, CC BY, общественное достояние, Apache-2.0);
// голосов, копирующих реальных людей или персонажей, здесь нет и не будет. Лицензии — THIRD_PARTY.md.
import { tx } from './i18n';
import { langInline, type LangCode } from './translate';

export type TtsVoiceId = string;
export interface VoiceDef {
  id: TtsVoiceId;
  name: string;
  lang: LangCode;
  gender: 'f' | 'm';
  engine: 'piper' | 'kokoro';
  /** Папка и имя архива в релизе tts-models sherpa-onnx. */
  pack: string;
  /** Piper: имя файла модели без .onnx. */
  model?: string;
  /** Номер голоса внутри модели. */
  sid: number;
  sizeMb: number;
  /** Kokoro: британское произношение — свой словарь. */
  gb?: boolean;
  hq?: boolean;
}

const piper = (id: string, name: string, lang: LangCode, gender: 'f' | 'm', model: string, sizeMb: number, sid = 0): VoiceDef =>
  ({ id, name, lang, gender, engine: 'piper', pack: `vits-piper-${model}`, model, sid, sizeMb });
export const KOKORO_PACK = 'kokoro-int8-multi-lang-v1_0';
const kokoro = (id: string, name: string, gender: 'f' | 'm', sid: number, gb = false): VoiceDef =>
  ({ id, name, lang: 'en', gender, engine: 'kokoro', pack: KOKORO_PACK, sid, sizeMb: 132, gb, hq: true });

export const VOICES: VoiceDef[] = [
  piper('irina', tx('Ирина'), 'ru', 'f', 'ru_RU-irina-medium', 64),
  piper('dmitri', tx('Дмитрий'), 'ru', 'm', 'ru_RU-dmitri-medium', 64),
  piper('denis', tx('Денис'), 'ru', 'm', 'ru_RU-denis-medium', 64),
  piper('ruslan', tx('Руслан'), 'ru', 'm', 'ru_RU-ruslan-medium', 64),
  // английский: студийные (Kokoro) и лёгкие (Piper)
  kokoro('heart', 'Heart', 'f', 3),
  kokoro('bella', 'Bella', 'f', 2),
  kokoro('michael', 'Michael', 'm', 16),
  kokoro('adam', 'Adam', 'm', 11),
  kokoro('emma', 'Emma', 'f', 21, true),
  kokoro('daniel', 'Daniel', 'm', 24, true),
  piper('amy', 'Amy', 'en', 'f', 'en_US-amy-low', 64),
  piper('ryan', 'Ryan', 'en', 'm', 'en_US-ryan-medium', 64),
  piper('kristin', 'Kristin', 'en', 'f', 'en_US-kristin-medium', 67),
  piper('joe', 'Joe', 'en', 'm', 'en_US-joe-medium', 67),
  // другие языки
  piper('thorsten', 'Thorsten', 'de', 'm', 'de_DE-thorsten-high', 116),
  piper('davefx', 'Dave', 'es', 'm', 'es_ES-davefx-medium', 67),
  piper('siwis', 'Siwis', 'fr', 'f', 'fr_FR-siwis-medium', 67),
  piper('gosia', 'Gosia', 'pl', 'f', 'pl_PL-gosia-medium', 67),
  piper('darkman', 'Darkman', 'pl', 'm', 'pl_PL-darkman-medium', 67),
  piper('fahrettin', 'Fahrettin', 'tr', 'm', 'tr_TR-fahrettin-medium', 67),
];
export const voiceById = (id: string): VoiceDef | undefined => VOICES.find((v) => v.id === id);

/** «Ирина — русский, женский», «Heart — английский, женский, студийный». */
export function voiceLabel(v: VoiceDef): string {
  const lang = langInline(v.lang) + (v.gb ? tx(' (британский)') : '');
  return `${v.name} — ${lang}, ${v.gender === 'f' ? tx('женский') : tx('мужской')}${v.hq ? tx(', студийный') : ''}`;
}

/** Языки, на которых есть голоса, — в порядке списка. */
export const voiceLangs = (): LangCode[] => [...new Set(VOICES.map((v) => v.lang))];
/** Голос по умолчанию для языка. */
export const defaultVoice = (lang: LangCode): TtsVoiceId => (VOICES.find((v) => v.lang === lang && !v.hq) ?? VOICES.find((v) => v.lang === lang) ?? VOICES[0]).id;
