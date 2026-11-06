// Готовые субтитры: .srt и .vtt читаются как есть (время, многострочный текст, без разметки), кодировка
// определяется сама (UTF-8, UTF-16, старые русские файлы в Windows-1251), запись в .srt и обратно — без потерь.
import { describe, expect, it } from 'vitest';
import { cuesToSrt, decodeSubtitleBytes, evenWords, parseSubtitles, parseTimecode, srtTime } from '../../src/shared/subtitles';
import { setCaptions } from '../../src/shared/timeline';
import { CAPTION_STYLE, newProject } from '../../src/shared/defaults';
import type { TextClip } from '../../src/shared/types';

const SRT = `1
00:00:01,000 --> 00:00:03,500
Привет! Это <i>Kadro</i>.

2
00:00:04,000 --> 00:00:06,250
{\\an8}Первая строка
вторая строка

3
00:00:07,000 --> 00:00:07,000
пустой по времени — пропускается
`;

const VTT = `WEBVTT
Kind: captions

NOTE это комментарий
и его продолжение

intro
00:01.000 --> 00:02.500 align:center position:50%
<v Тим>Монтаж под бит</v>

00:00:03.000 --> 00:00:04.200
<c.yellow>в один клик</c> &amp; бесплатно
`;

describe('готовые субтитры', () => {
  it('время в любом виде', () => {
    expect(parseTimecode('00:01:02,345')).toBeCloseTo(62.345);
    expect(parseTimecode('01:02.5')).toBeCloseTo(62.5);
    expect(parseTimecode('1:00:00.000')).toBe(3600);
    expect(parseTimecode('abc')).toBeNull();
    expect(srtTime(62.3456)).toBe('00:01:02,346');
    expect(srtTime(3725)).toBe('01:02:05,000');
  });

  it('.srt: время, строки и разметка', () => {
    const c = parseSubtitles(SRT);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ start: 1, end: 3.5, text: 'Привет! Это Kadro.' });
    expect(c[1].text).toBe('Первая строка\nвторая строка');
    // слова разложены по времени субтитра — подсветка слова работает и на готовых субтитрах
    expect(c[0].words!.map((w) => w.text)).toEqual(['Привет!', 'Это', 'Kadro.']);
    expect(c[0].words![0].start).toBe(1);
    expect(c[0].words![2].end).toBeCloseTo(3.5);
  });

  it('.vtt: заголовок, заметки, номера, настройки и голоса', () => {
    const c = parseSubtitles(VTT);
    expect(c.map((x) => x.text)).toEqual(['Монтаж под бит', 'в один клик & бесплатно']);
    expect(c[0]).toMatchObject({ start: 1, end: 2.5 });
    expect(c[1].end).toBeCloseTo(4.2);
  });

  it('Windows-перевод строки, метка BOM, потерянная пустая строка', () => {
    const crlf = '﻿1\r\n00:00:00,500 --> 00:00:01,000\r\nраз\r\n2\r\n00:00:01,000 --> 00:00:02,000\r\nдва\r\n';
    expect(parseSubtitles(crlf).map((x) => x.text)).toEqual(['раз', 'два']);
  });

  it('кодировка определяется сама', () => {
    const utf8 = new TextEncoder().encode('1\n00:00:01,000 --> 00:00:02,000\nПривет\n');
    expect(decodeSubtitleBytes(utf8)).toContain('Привет');
    expect(decodeSubtitleBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).toContain('Привет');
    // «Привет» в Windows-1251
    const cp = new Uint8Array([...new TextEncoder().encode('1\n00:00:01,000 --> 00:00:02,000\n'), 0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x0a]);
    expect(decodeSubtitleBytes(cp)).toContain('Привет');
    const u16 = new Uint8Array(2 + 'Привет'.length * 2); u16[0] = 0xff; u16[1] = 0xfe;
    [...'Привет'].forEach((ch, i) => { const code = ch.charCodeAt(0); u16[2 + i * 2] = code & 255; u16[3 + i * 2] = code >> 8; });
    expect(decodeSubtitleBytes(u16)).toBe('Привет');
  });

  it('запись в .srt и чтение обратно — то же самое', () => {
    const cues = parseSubtitles(SRT);
    const srt = cuesToSrt(cues);
    expect(srt.startsWith('1\r\n00:00:01,000 --> 00:00:03,500\r\n')).toBe(true);
    const back = parseSubtitles(srt);
    expect(back.map((x) => [x.start, x.end, x.text])).toEqual(cues.map((x) => [x.start, x.end, x.text]));
  });

  it('встают дорожкой субтитров вместо прежних', () => {
    let p = setCaptions(newProject('x'), [{ start: 0, end: 1, text: 'старый' }], CAPTION_STYLE);
    p = setCaptions(p, parseSubtitles(SRT), CAPTION_STYLE);
    const caps = p.tracks.flatMap((t) => t.clips).filter((c): c is TextClip => c.type === 'text' && c.role === 'caption');
    expect(caps.map((c) => c.text)).toEqual(['Привет! Это Kadro.', 'Первая строка\nвторая строка']);
    expect(caps[1].start).toBe(4);
    expect(caps[1].words?.[0].start).toBe(0);
  });

  it('слова — пропорционально длине', () => {
    const w = evenWords('а длинноеслово', 0, 2);
    expect(w[0].end - w[0].start).toBeLessThan(w[1].end - w[1].start);
    expect(w[1].end).toBeCloseTo(2);
  });
});
