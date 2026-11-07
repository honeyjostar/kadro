// Ссылки наружу: только страницы Kadro на GitHub и канал Kadro в Telegram.
import { describe, expect, it } from 'vitest';
import { isKadroUrl, TELEGRAM_CHANNEL } from '../../src/shared/links';

describe('ссылки Kadro', () => {
  it('GitHub Kadro и канал в Telegram — можно', () => {
    expect(isKadroUrl('https://github.com/honeyjostar/kadro')).toBe(true);
    expect(isKadroUrl('https://github.com/honeyjostar/kadro/releases')).toBe(true);
    expect(isKadroUrl(TELEGRAM_CHANNEL)).toBe(true);
  });
  it('остальное — нельзя', () => {
    expect(isKadroUrl('https://github.com/honeyjostar/kadro-evil')).toBe(false);
    expect(isKadroUrl('https://t.me/kadroOffical.evil.com')).toBe(false);
    expect(isKadroUrl('https://t.me/someone')).toBe(false);
    expect(isKadroUrl('http://t.me/kadroOffical')).toBe(false);
    expect(isKadroUrl(42)).toBe(false);
  });
});
