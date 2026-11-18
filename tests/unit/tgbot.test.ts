// Telegram-бот: код привязки, какие сообщения считаются видео, кнопки и отчёт проверки охватов для чата.
import { describe, expect, it } from 'vitest';
import { isPairing, makeCode, reachText, taskKeyboard, videoOf } from '../../src/shared/tgbot';

describe('telegram-бот', () => {
  it('код привязки: 6 цифр; сам код, «/start код», с пробелами — да; чужой текст — нет', () => {
    expect(makeCode(() => 0)).toBe('100000');
    expect(makeCode(() => 0.999999)).toMatch(/^\d{6}$/);
    expect(isPairing('482913', '482913')).toBe(true);
    expect(isPairing('/start 482913', '482913')).toBe(true);
    expect(isPairing('482 913', '482913')).toBe(true);
    expect(isPairing('482914', '482913')).toBe(false);
    expect(isPairing('привет', '482913')).toBe(false);
    expect(isPairing('482913', null)).toBe(false);
  });
  it('видео: обычное, кружок и документ-видео; картинка и текст — нет; имя файла безопасное', () => {
    expect(videoOf({ video: { file_id: 'a', file_size: 1000, mime_type: 'video/mp4' } })).toEqual({ id: 'a', size: 1000, name: 'video.mp4' });
    expect(videoOf({ video_note: { file_id: 'b', file_size: 10 } })?.id).toBe('b');
    expect(videoOf({ document: { file_id: 'c', file_name: '../../evil name.MOV', mime_type: 'video/quicktime' } })?.name).toBe('evil_name.mov');
    expect(videoOf({ document: { file_id: 'd', file_name: 'doc.pdf', mime_type: 'application/pdf' } })).toBeNull();
    expect(videoOf({ photo: [{ file_id: 'e' }] })).toBeNull();
    expect(videoOf({ text: 'hi' })).toBeNull();
  });
  it('кнопки: число видео в авто-ролике, четыре действия', () => {
    const k = taskKeyboard(3);
    expect(k.inline_keyboard.map((r) => r[0].callback_data)).toEqual(['auto', 'subs', 'shorts', 'reach']);
    expect(k.inline_keyboard[0][0].text).toContain('3');
  });
  it('отчёт проверки охватов: значки по уровню, без замечаний — «ничего не мешает»', () => {
    const base = { duration: 10, width: 1080, height: 1920, fps: 30, mbps: 8, hasAudio: true, lufs: -14, peak: -1 };
    expect(reachText({ ...base, issues: [] })).toContain('Ничего не мешает');
    const t = reachText({ ...base, issues: [{ id: 'm', kind: 'mark', level: 'cut', title: 'Знак', why: '' }, { id: 'q', kind: 'quiet', level: 'worse', title: 'Тихо', why: '' }] });
    expect(t).toContain('⛔ Знак');
    expect(t).toContain('⚠️ Тихо');
  });
});
