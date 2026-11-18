// Монтаж с телефона через своего Telegram-бота: человек создаёт бота у @BotFather, вставляет токен в Kadro и пишет
// боту код из настроек — с этого чата бот принимает видео. Kadro на компьютере собирает ролик и присылает его в чат.
// Здесь — то, что не зависит от сети: код привязки, разбор сообщений, тексты ответов.
import { tx } from './i18n';
import type { ReachReport } from './reach';

/** Что видно в настройках. */
export interface TgState {
  on: boolean;
  hasToken: boolean;
  /** имя бота без @ (после проверки токена) */
  bot: string | null;
  /** к боту привязан хозяин */
  paired: boolean;
  ownerName: string | null;
  /** код привязки (пока хозяина нет) */
  code: string | null;
  status: 'off' | 'connecting' | 'ready' | 'error';
  error: string | null;
}

/** Что сделать с присланными видео. */
export type TgTaskKind = 'auto' | 'subs' | 'shorts' | 'reach';
export interface TgTask { id: string; kind: Exclude<TgTaskKind, 'reach'>; files: string[]; out: string }
/** file — один ролик; files — несколько (шортсы) */
export interface TgResult { file?: string; files?: string[]; error?: string; note?: string }

/** Telegram отдаёт ботам файлы до 20 МБ, принимает от них — до 50 МБ. */
export const TG_DOWNLOAD_MAX = 20 * 1024 * 1024;
export const TG_UPLOAD_MAX = 50 * 1024 * 1024;

export function makeCode(rand: () => number = Math.random): string {
  return String(Math.floor(100000 + rand() * 900000));
}

/** Сообщение — это код привязки (сам код, «/start 123456» или код с пробелами). */
export function isPairing(text: string | undefined, code: string | null): boolean {
  if (!text || !code) return false;
  return text.replace(/^\/start\b/i, '').replace(/[\s-]/g, '') === code;
}

interface TgFileRef { file_id: string; file_size?: number; file_name?: string; mime_type?: string; duration?: number }
/** Видео из сообщения: обычное видео, «файлом» (документ видео) или кружок. */
export function videoOf(msg: Record<string, unknown>): { id: string; size: number; name: string } | null {
  const v = (msg.video ?? msg.video_note ?? null) as TgFileRef | null;
  const d = msg.document as TgFileRef | undefined;
  const f = v ?? (d && (/^video\//.test(d.mime_type ?? '') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(d.file_name ?? '')) ? d : null);
  if (!f?.file_id) return null;
  const ext = (f.file_name?.match(/\.[a-z0-9]+$/i)?.[0] ?? (f.mime_type === 'video/quicktime' ? '.mov' : '.mp4')).toLowerCase();
  return { id: f.file_id, size: f.file_size ?? 0, name: `${(f.file_name ?? 'video').replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'video'}${ext}` };
}

/** Кнопки под присланными видео. */
export function taskKeyboard(n: number): { inline_keyboard: { text: string; callback_data: string }[][] } {
  return {
    inline_keyboard: [
      [{ text: n > 1 ? tx('🎬 Авто-ролик из {0} видео', n) : tx('🎬 Авто-ролик'), callback_data: 'auto' }],
      [{ text: tx('💬 Субтитры как у блогеров'), callback_data: 'subs' }],
      [{ text: tx('✂️ Нарезать в шортсы'), callback_data: 'shorts' }],
      [{ text: tx('🛡 Проверка охватов'), callback_data: 'reach' }],
    ],
  };
}

export const tgHelp = () => tx('Пришли одно или несколько видео — обычным сообщением, не файлом (так Telegram их сожмёт, и бот сможет скачать: до 20 МБ). Потом выбери, что сделать: авто-ролик, субтитры, шортсы или проверку охватов. Kadro сделает всё на твоём компьютере и пришлёт результат сюда. Компьютер должен быть включён, а Kadro — открыт (можно свернуть к часам).');

/** Короткий отчёт «Проверки охватов» для чата. */
export function reachText(r: ReachReport): string {
  if (!r.issues.length) return tx('✅ Ничего не мешает показам: водяных знаков, рамки, пустого начала и проблем со звуком нет.');
  const mark = { cut: '⛔', worse: '⚠️', tip: '💡' } as const;
  const lines = r.issues.slice(0, 8).map((i) => `${mark[i.level]} ${i.title}`);
  return [tx('Проверка охватов:'), ...lines, '', tx('Поправить одной кнопкой — в Kadro на компьютере: «Проверка охватов» → «Открыть в Kadro и поправить».')].join('\n');
}
