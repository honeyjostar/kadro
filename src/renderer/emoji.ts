// Объёмные эмодзи Kadro (Microsoft Fluent Emoji, MIT): картинки грузятся при запуске окна и рисуются в стикерах и
// эмодзи субтитров — и в плеере, и в экспорте (вместо плоских эмодзи шрифта Windows).
import { EMOJI_FILES } from '../shared/stickers';
import { setEmojiImage } from '../shared/textRender';

const urls = import.meta.glob('./assets/emoji/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const byCode = new Map(Object.entries(urls).map(([p, u]) => [p.slice(p.lastIndexOf('/') + 1, -5), u]));

/** Адрес картинки эмодзи (для плиток в панели) или null. */
export function emojiUrl(glyph: string): string | null {
  const code = EMOJI_FILES[glyph] ?? EMOJI_FILES[glyph.replace(/️/g, '')];
  return (code && byCode.get(code)) || null;
}

let ready: Promise<void> | null = null;
/** Загрузить все картинки (один раз). Экспорт ждёт этого, чтобы эмодзи в файле были объёмными. */
export function loadEmoji(): Promise<void> {
  ready ??= Promise.all(Object.entries(EMOJI_FILES).map(([glyph, code]) => {
    const u = byCode.get(code);
    if (!u) return Promise.resolve();
    const img = new Image();
    img.decoding = 'async';
    img.src = u;
    return img.decode().then(() => setEmojiImage(glyph, img)).catch(() => undefined);
  })).then(() => undefined);
  return ready;
}
