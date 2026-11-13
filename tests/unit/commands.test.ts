// Команды словами: разбор фраз в действия Kadro.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { COMMAND_CHIPS, COMMAND_HELP, parseCommands, parseOne } from '../../src/shared/commands';

describe('команды словами', () => {
  it('«убери паузы, музыку тише» — два действия по порядку', () => {
    expect(parseCommands('Убери паузы, музыку тише').cmds).toEqual([{ kind: 'pauses' }, { kind: 'music', factor: 0.6 }]);
  });
  it('союзы и точки делят фразу; непонятое возвращается', () => {
    const r = parseCommands('сделай вертикально и добавь субтитры. Покрась небо в синий');
    expect(r.cmds).toEqual([{ kind: 'aspect', aspect: '9:16' }, { kind: 'captions' }]);
    expect(r.unknown).toEqual(['Покрась небо в синий']);
  });
  it('разные формулировки', () => {
    expect(parseOne('вырежи тишину')).toEqual({ kind: 'pauses' });
    expect(parseOne('убери слова-паразиты')).toEqual({ kind: 'fillers' });
    expect(parseOne('убери эээ')).toEqual({ kind: 'fillers' });
    expect(parseOne('спрячь субтитры')).toEqual({ kind: 'noCaptions' });
    expect(parseOne('музыку погромче')).toEqual({ kind: 'music', factor: 1.5 });
    expect(parseOne('голос громче')).toEqual({ kind: 'voice', factor: 1.4 });
    expect(parseOne('убери шум из голоса')).toEqual({ kind: 'cleanVoice' });
    expect(parseOne('формат 16:9')).toEqual({ kind: 'aspect', aspect: '16:9' });
    expect(parseOne('квадрат')).toEqual({ kind: 'aspect', aspect: '1:1' });
    expect(parseOne('ускорь в 2 раза')).toEqual({ kind: 'speed', factor: 2 });
    expect(parseOne('ускорь в полтора раза')).toEqual({ kind: 'speed', factor: 1.5 });
    expect(parseOne('замедли в два раза')).toEqual({ kind: 'speed', factor: 0.5 });
    expect(parseOne('убери фон')).toEqual({ kind: 'removeBg' });
    expect(parseOne('убери фоновую музыку')).toEqual({ kind: 'music', factor: 0 });
    expect(parseOne('сделай обложку')).toEqual({ kind: 'cover' });
    expect(parseOne('экспорт')).toEqual({ kind: 'export' });
    expect(parseOne('remove pauses')).toEqual({ kind: 'pauses' });
    expect(parseOne('добавь автозум')).toEqual({ kind: 'autoZoom' });
    expect(parseOne('наезды на важных словах')).toEqual({ kind: 'autoZoom' });
    expect(parseOne('убери автозум')).toEqual({ kind: 'noAutoZoom' });
  });
  it('новые команды: звук, картинка, монтаж, перевод', () => {
    expect(parseOne('музыку на 30%')).toEqual({ kind: 'volume', target: 'music', percent: 30 });
    expect(parseOne('громкость голоса 150 процентов')).toEqual({ kind: 'volume', target: 'voice', percent: 150 });
    expect(parseOne('выключи музыку')).toEqual({ kind: 'music', factor: 0 });
    expect(parseOne('убери звук')).toEqual({ kind: 'mute', on: true });
    expect(parseOne('без звука')).toEqual({ kind: 'mute', on: true });
    expect(parseOne('верни звук')).toEqual({ kind: 'mute', on: false });
    expect(parseOne('убери шум')).toEqual({ kind: 'cleanVoice' });
    expect(parseOne('стабилизируй видео')).toEqual({ kind: 'stabilize' });
    expect(parseOne('убери тряску')).toEqual({ kind: 'stabilize' });
    expect(parseOne('улучши качество')).toEqual({ kind: 'enhance' });
    expect(parseOne('сделай чётче')).toEqual({ kind: 'enhance' });
    expect(parseOne('улучши голос')).toEqual({ kind: 'cleanVoice' });
    expect(parseOne('сделай чёрно-белым')).toEqual({ kind: 'filter', preset: 'bw' });
    expect(parseOne('чб')).toEqual({ kind: 'filter', preset: 'bw' });
    expect(parseOne('тёплый фильтр')).toEqual({ kind: 'filter', preset: 'warm' });
    expect(parseOne('как в кино')).toEqual({ kind: 'filter', preset: 'cinema' });
    expect(parseOne('убери фильтр')).toEqual({ kind: 'filter', preset: 'none' });
    expect(parseOne('сделай светлее')).toEqual({ kind: 'brightness', factor: 1.15 });
    expect(parseOne('потемнее')).toEqual({ kind: 'brightness', factor: 0.87 });
    expect(parseOne('переведи субтитры на английский')).toEqual({ kind: 'translate', to: 'en' });
    expect(parseOne('перевод на немецкий')).toEqual({ kind: 'translate', to: 'de' });
    expect(parseOne('переведи субтитры')).toEqual({ kind: 'translate' });
    expect(parseOne('ретушь')).toEqual({ kind: 'retouch' });
    expect(parseOne('держи меня в кадре')).toEqual({ kind: 'reframe' });
    expect(parseOne('стоп-кадр')).toEqual({ kind: 'freeze' });
    expect(parseOne('подгони под бит')).toEqual({ kind: 'beats' });
    expect(parseOne('нарежь шортсы')).toEqual({ kind: 'shorts' });
    expect(parseOne('разрежь')).toEqual({ kind: 'split' });
    expect(parseOne('удали клип')).toEqual({ kind: 'delete' });
    expect(parseOne('отмени')).toEqual({ kind: 'undo' });
    expect(parseOne('повтори')).toEqual({ kind: 'redo' });
    expect(parseOne('что ты умеешь')).toEqual({ kind: 'help' });
    expect(parseOne('mute the music')).toEqual({ kind: 'music', factor: 0 });
    expect(parseOne('make it black and white')).toEqual({ kind: 'filter', preset: 'bw' });
    expect(parseOne('translate captions to spanish')).toEqual({ kind: 'translate', to: 'es' });
    // прежнее не сломалось
    expect(parseOne('убери паузы')).toEqual({ kind: 'pauses' });
    expect(parseOne('убери фон')).toEqual({ kind: 'removeBg' });
    expect(parseOne('убери субтитры')).toEqual({ kind: 'noCaptions' });
    expect(parseOne('скрой лица')).toEqual({ kind: 'hideFaces' });
    expect(parseOne('покрась небо в синий')).toBeNull();
  });
  it('каждый пример из подсказок разбирается — и по-русски, и в английском переводе', () => {
    const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../../src/shared/i18n/en.json'), 'utf8')) as Record<string, string>;
    const all = [...COMMAND_HELP.flatMap((g) => g.examples), ...COMMAND_CHIPS];
    expect(all.length).toBeGreaterThan(20);
    for (const ex of all) {
      expect(parseOne(ex), ex).not.toBeNull();
      expect(en[ex], `нет перевода: ${ex}`).toBeTruthy();
      expect(parseOne(en[ex]), en[ex]).toEqual(parseOne(ex));
    }
  });
});
