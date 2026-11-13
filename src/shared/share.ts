// Общие части между старым и новым проектом. Правка (edit в timeline.ts) копирует проект целиком, поэтому после неё
// у каждого клипа, дорожки и файла новый объект, даже если в нём ничего не поменялось: таймлайн перерисовывал всё,
// а история отмены хранила полные копии. shareEqual возвращает новый проект, в котором всё, что равно старому по
// значению, — те же объекты, что и раньше: перерисовывается только изменённое, а история делит неизменное.
// Ничего не меняет на месте: ни prev, ни next.

const hasId = (v: unknown): v is { id: string } => typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'string';

export function shareEqual<T>(prev: T, next: T): T {
  if (prev === next) return prev;
  if (typeof prev !== 'object' || typeof next !== 'object' || prev === null || next === null) return next;
  const pa = Array.isArray(prev), na = Array.isArray(next);
  if (pa !== na) return next;
  if (pa && na) {
    const a = prev as unknown[], b = next as unknown[];
    // клипы, дорожки, файлы — по id: вставка или удаление одного не «сдвигает» остальные
    let byId: Map<string, unknown> | null = null;
    if (b.length && a.length && hasId(b[0]) && hasId(a[0])) {
      byId = new Map();
      for (const x of a) if (hasId(x)) byId.set(x.id, x);
    }
    let same = a.length === b.length;
    let out: unknown[] | null = null;
    for (let i = 0; i < b.length; i++) {
      const from = byId && hasId(b[i]) ? byId.get((b[i] as { id: string }).id) : a[i];
      const v = from === undefined ? b[i] : shareEqual(from, b[i]);
      if (v !== a[i]) same = false;
      if (v !== b[i]) (out ??= b.slice())[i] = v;
    }
    return (same ? prev : out ?? next) as T;
  }
  const a = prev as Record<string, unknown>, b = next as Record<string, unknown>;
  const keys = Object.keys(b);
  let same = keys.length === Object.keys(a).length;
  let out: Record<string, unknown> | null = null;
  for (const k of keys) {
    const v = k in a ? shareEqual(a[k], b[k]) : b[k];
    if (v !== a[k] || !(k in a)) same = false;
    if (v !== b[k]) (out ??= { ...b })[k] = v;
  }
  return (same ? prev : out ?? next) as T;
}
