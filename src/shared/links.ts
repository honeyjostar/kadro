// Ссылки Kadro наружу. Программа открывает в браузере только их: страницы Kadro на GitHub и канал в Telegram.
export const GITHUB_PAGE = 'https://github.com/honeyjostar/kadro';
export const TELEGRAM_CHANNEL = 'https://t.me/kadroOffical';

/** Можно ли открыть эту ссылку из программы. */
export function isKadroUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  return /^https:\/\/github\.com\/honeyjostar\/kadro(\/|$)/.test(url) || url === TELEGRAM_CHANNEL;
}
