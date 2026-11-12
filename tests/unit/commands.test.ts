// Команды словами: разбор фраз в действия Kadro.
import { describe, expect, it } from 'vitest';
import { parseCommands, parseOne } from '../../src/shared/commands';

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
    expect(parseOne('убери фоновую музыку')).toBeNull();
    expect(parseOne('сделай обложку')).toEqual({ kind: 'cover' });
    expect(parseOne('экспорт')).toEqual({ kind: 'export' });
    expect(parseOne('remove pauses')).toEqual({ kind: 'pauses' });
    expect(parseOne('добавь автозум')).toEqual({ kind: 'autoZoom' });
    expect(parseOne('наезды на важных словах')).toEqual({ kind: 'autoZoom' });
    expect(parseOne('убери автозум')).toEqual({ kind: 'noAutoZoom' });
  });
});
