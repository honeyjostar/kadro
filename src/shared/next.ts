// Виджет «Скоро в Kadro»: что готовится в следующем обновлении. Текст — в docs/next.json в репозитории,
// его можно менять без выпуска новой версии. Kadro берёт его, как проверку обновлений, и помнит последний.
export const NEXT_URL = 'https://raw.githubusercontent.com/honeyjostar/kadro/master/docs/next.json';

export interface NextText { title: string; when?: string; items: string[] }
/** id — меняется с каждым новым анонсом (скрытый анонс снова покажется, когда выйдет следующий). */
export interface NextInfo { id: string; ru: NextText; en?: NextText }

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

function text(v: unknown): NextText | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const title = str(o.title, 80);
  const items = Array.isArray(o.items) ? o.items.map((x) => str(x, 140)).filter((x): x is string => !!x).slice(0, 6) : [];
  if (!title || !items.length) return undefined;
  return { title, when: str(o.when, 40), items };
}

/** Разобрать docs/next.json: что-то не так — null (виджет не показывается). */
export function parseNext(raw: unknown): NextInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.id, 60);
  const ru = text(o.ru);
  if (!id || !ru || o.show === false) return null;
  const en = text(o.en);
  return en ? { id, ru, en } : { id, ru };
}

/** Текст на языке интерфейса (английского нет — русский). */
export const nextText = (n: NextInfo, lang: string): NextText => (lang === 'en' && n.en ? n.en : n.ru);
