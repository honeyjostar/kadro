// Скачивает модели ИИ для разработки и тестов (то же, что программа качает по кнопке):
// распознавание речи (ru и multi) и голос озвучки «Ирина». Папка — KADRO_MODELS или ~/.kadro/models.
//   npm run models            — всё
//   npm run models -- ru irina — выборочно
import { ASR_MODELS, TTS_VOICES, downloadAsrModel, downloadTtsVoice, type AsrModelId, type TtsVoiceId } from '../src/main/ai/models';
import { modelsDir } from '../src/main/bins';

const want = process.argv.slice(2);
const all = want.length ? want : ['ru', 'multi', 'irina'];
const bar = (name: string) => {
  let last = '';
  return (p: number, stage: string) => {
    const s = `${name}: ${stage === 'download' ? 'скачиваю' : 'распаковываю'} ${Math.round(p * 100)}%`;
    if (s !== last) { process.stdout.write(`\r${s}   `); last = s; }
  };
};
console.log(`Папка моделей: ${modelsDir()}`);
for (const id of all) {
  if (id in ASR_MODELS) await downloadAsrModel(id as AsrModelId, bar(id));
  else if (id in TTS_VOICES) await downloadTtsVoice(id as TtsVoiceId, bar(id));
  else { console.error(`\nНеизвестная модель: ${id}. Есть: ${[...Object.keys(ASR_MODELS), ...Object.keys(TTS_VOICES)].join(', ')}`); process.exit(1); }
  process.stdout.write(`\r${id}: готово                    \n`);
}
