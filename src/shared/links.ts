// Ссылки Kadro наружу. Программа открывает в браузере только их: страницы Kadro на GitHub, канал в Telegram и страницы
// загрузки видео на площадках (кнопка «Опубликовать»).
import { PUBLISH_URLS } from './publish';

export const GITHUB_PAGE = 'https://github.com/honeyjostar/kadro';
export const TELEGRAM_CHANNEL = 'https://t.me/kadroOffical';

/** Можно ли открыть эту ссылку из программы. */
export function isKadroUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  return /^https:\/\/github\.com\/honeyjostar\/kadro(\/|$)/.test(url) || url === TELEGRAM_CHANNEL || PUBLISH_URLS.has(url);
}
/** Прислать своё в Мастерскую: форма на GitHub (файл прикрепляется к заявке). */
export const WORKSHOP_SUBMIT = 'https://github.com/honeyjostar/kadro/issues/new?template=workshop.yml';
