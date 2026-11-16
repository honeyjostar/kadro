// Канал Kadro в Telegram: там новые шаблоны, фоны и гайды. Зовём туда без навязчивости — после удачного экспорта
// (на втором, потом на каждом пятом), пока человек не подписался или не сказал «не показывать».
const K_COUNT = 'kadro.tg.exports';
const K_DONE = 'kadro.tg.done';

function get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function put(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* хранилища нет — не страшно */ } }

/** Экспорт прошёл: показать ли приглашение в канал. */
export function tgAfterExport(): boolean {
  if (get(K_DONE)) return false;
  const n = Number(get(K_COUNT) ?? 0) + 1;
  put(K_COUNT, String(n));
  return n === 2 || (n > 2 && (n - 2) % 5 === 0);
}
/** Открыл канал или попросил больше не звать. */
export function tgDone(): void { put(K_DONE, '1'); }
