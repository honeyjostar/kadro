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
