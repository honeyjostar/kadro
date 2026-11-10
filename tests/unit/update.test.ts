import { describe, expect, it } from 'vitest';
import { compareVersions, notesLines, parseRelease, parseSums } from '../../src/shared/update';

describe('обновления', () => {
  it('сравнение версий — по числам, «-beta» раньше чистой', () => {
    expect(compareVersions('0.6.0', '0.5.9')).toBe(1);
    expect(compareVersions('v0.10.0', '0.9.12')).toBe(1);
    expect(compareVersions('0.6', '0.6.0')).toBe(0);
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0-rc1')).toBe(1);
    expect(compareVersions('0.5.0', '0.5.0')).toBe(0);
  });

  it('релиз с GitHub: версия, установщик, zip, суммы; чужие ссылки и черновики — мимо', () => {
    const r = parseRelease({
      tag_name: 'v0.6.0', body: '## Что нового\n- **Маркеры**', html_url: 'https://github.com/honeyjostar/kadro/releases/tag/v0.6.0',
      assets: [
        { name: 'Kadro-Setup-0.6.0.exe', browser_download_url: 'https://github.com/honeyjostar/kadro/releases/download/v0.6.0/Kadro-Setup-0.6.0.exe', size: 212_000_000 },
        { name: 'Kadro-0.6.0-portable.zip', browser_download_url: 'https://github.com/honeyjostar/kadro/releases/download/v0.6.0/Kadro-0.6.0-portable.zip', size: 292_000_000 },
        { name: 'SHA256SUMS.txt', browser_download_url: 'https://github.com/honeyjostar/kadro/releases/download/v0.6.0/SHA256SUMS.txt', size: 200 },
        { name: 'evil.exe', browser_download_url: 'https://evil.example/evil.exe', size: 1 },
      ],
    })!;
    expect(r.version).toBe('0.6.0');
    expect(r.setup?.size).toBe(212_000_000);
    expect(r.portable?.name).toBe('Kadro-0.6.0-portable.zip');
    expect(r.sums?.name).toBe('SHA256SUMS.txt');
    expect(parseRelease({ tag_name: 'v0.6.0', draft: true })).toBeNull();
    expect(parseRelease({ tag_name: 'nightly' })).toBeNull();
    expect(parseRelease({ tag_name: 'v1.0.0', assets: [{ name: 'Kadro-Setup-1.0.0.exe', browser_download_url: 'http://github.com/x', size: 1 }] })!.setup).toBeNull();
  });

  it('SHA256SUMS.txt и «Что нового» без разметки', () => {
    const h = 'a'.repeat(64);
    expect([...parseSums(`${h}  Kadro-Setup-0.6.0.exe\r\n${'B'.repeat(64)} *Kadro-0.6.0-portable.zip\nмусор`)]).toEqual([
      ['Kadro-Setup-0.6.0.exe', h], ['Kadro-0.6.0-portable.zip', 'b'.repeat(64)],
    ]);
    expect(notesLines('## Что нового\n\n- **Маркеры** на [таймлайне](https://x)\nПросто `текст`')).toEqual([
      { kind: 'h', text: 'Что нового' }, { kind: 'li', text: 'Маркеры на таймлайне' }, { kind: 'p', text: 'Просто текст' },
    ]);
  });
});

describe('обновление без номеров версий', () => {
  it('тема — из названия релиза без «Kadro» и номера; нет — из заголовка описания', async () => {
    const { releaseTheme } = await import('../../src/shared/update');
    expect(releaseTheme('Kadro 1.0 — субтитры как у блогеров и шортсы')).toBe('субтитры как у блогеров и шортсы');
    expect(releaseTheme('Обновление 22 ноября: запись экрана')).toBe('Обновление 22 ноября: запись экрана');
    expect(releaseTheme('Kadro 0.9.7', '## Что нового в 0.9.7: миниатюры на настоящих кадрах\n- …')).toBe('миниатюры на настоящих кадрах');
    expect(releaseTheme('Kadro 0.9.7', 'просто текст')).toBe('');
  });
  it('дата — «22 ноября», год — только если не текущий', async () => {
    const { releaseDate } = await import('../../src/shared/update');
    const now = new Date('2026-12-01T00:00:00Z');
    expect(releaseDate('2026-11-22T10:00:00Z', 'ru-RU', now)).toBe('22 ноября');
    expect(releaseDate('2025-11-22T10:00:00Z', 'ru-RU', now)).toBe('22 ноября 2025 г.');
    expect(releaseDate('2026-11-22', 'en-US', now)).toBe('November 22');
    expect(releaseDate(undefined, 'ru-RU')).toBe('');
  });
  it('название и дата релиза из ответа GitHub', async () => {
    const { parseRelease } = await import('../../src/shared/update');
    const r = parseRelease({ tag_name: 'v1.0.0', name: 'Kadro 1.0 — большой выпуск', published_at: '2026-11-22T10:00:00Z', assets: [] })!;
    expect(r).toMatchObject({ version: '1.0.0', title: 'Kadro 1.0 — большой выпуск', date: '2026-11-22T10:00:00Z' });
  });
});
