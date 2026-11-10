// Обучение для новичков: «Первый ролик за 3 шага» — видео на таймлайн, надпись, сохранить ролик.
// Шаги отмечаются сами по проекту (ничего не надо нажимать «готово»). Здесь — чистая проверка шагов.
import { tx } from './i18n';
import type { Project } from './types';

export type CoachState = 'active' | 'done' | 'off';

export const COACH_STEPS: { id: 'video' | 'text' | 'export'; title: string; hint: string }[] = [
  { id: 'video', title: tx('Положи видео на таймлайн'), hint: tx('Перетащи видео или фото в окно — или возьми готовые кадры Kadro. Лишнее режь клавишей S, удаляй Delete.') },
  { id: 'text', title: tx('Добавь надпись'), hint: tx('Раздел «Текст» слева. Надпись встанет у розовой линии времени, двигай её прямо в окне просмотра.') },
  { id: 'export', title: tx('Сохрани ролик'), hint: tx('Кнопка «Экспорт» справа вверху: выбери, куда выкладываешь, — и готово, без водяного знака.') },
];

/** Какие шаги сделаны и какой сейчас (3 — все сделаны). exported — был ли удачный экспорт с начала обучения. */
export function coachProgress(p: Project, exported: boolean): { done: boolean[]; current: number } {
  const main = p.tracks.find((t) => t.kind === 'main');
  const video = !!main?.clips.some((c) => c.type === 'media');
  const text = p.tracks.some((t) => t.clips.some((c) => c.type === 'text' && c.role !== 'caption'));
  const done = [video, text, exported && video];
  const current = done.findIndex((d) => !d);
  return { done, current: current < 0 ? COACH_STEPS.length : current };
}
