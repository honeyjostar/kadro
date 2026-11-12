// История действий: что изменилось между двумя состояниями проекта — короткой фразой для панели истории.
// Подписи не ставятся при каждой правке, а выводятся из разницы: так любое действие (и будущие) получит понятное имя.
import { tx } from './i18n';
import type { Clip, Project } from './types';

type Field = { keys: string[]; label: () => string };
// порядок важен: первое совпавшее — главное в подписи
const FIELDS: Field[] = [
  { keys: ['words'], label: () => tx('Субтитры') },
  { keys: ['text'], label: () => tx('Текст') },
  { keys: ['style', 'textAnim', 'highlight'], label: () => tx('Оформление текста') },
  { keys: ['blurs'], label: () => tx('Скрытие лиц и номеров') },
  { keys: ['photo3d'], label: () => tx('3D-фото') },
  { keys: ['enhance', 'stab', 'beauty', 'removeBg', 'denoise', 'voice', 'person'], label: () => tx('ИИ-обработка') },
  { keys: ['retime', 'speed'], label: () => tx('Скорость') },
  { keys: ['in', 'out', 'duration'], label: () => tx('Обрезка') },
  { keys: ['start'], label: () => tx('Перемещение') },
  { keys: ['transform', 'keyframes', 'fit', 'stretch', 'tilt', 'pin', 'autoZoom'], label: () => tx('Положение и анимация') },
  { keys: ['anim'], label: () => tx('Появление и исчезновение') },
  { keys: ['color', 'grade'], label: () => tx('Цвет') },
  { keys: ['effects'], label: () => tx('Эффекты') },
  { keys: ['transitionOut'], label: () => tx('Переход') },
  { keys: ['mask', 'chroma'], label: () => tx('Маска') },
  { keys: ['volume', 'muted', 'fadeIn', 'fadeOut'], label: () => tx('Звук') },
  { keys: ['opacity', 'blend'], label: () => tx('Прозрачность') },
];

function clipName(p: Project, c: Clip): string {
  if (c.type === 'text') return `«${c.text.length > 24 ? `${c.text.slice(0, 23)}…` : c.text}»`;
  const a = p.assets.find((x) => x.id === c.assetId);
  return a?.name ?? tx('клип');
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Что изменилось от a к b — одной фразой. */
export function describeChange(a: Project, b: Project): string {
  if (!same(a.settings, b.settings)) {
    if (a.settings.aspect !== b.settings.aspect) return tx('Формат кадра {0}', b.settings.aspect);
    if (!same(a.settings.logo, b.settings.logo)) return tx('Логотип');
    if (!same(a.settings.progress, b.settings.progress)) return tx('Полоска прогресса');
    return tx('Настройки проекта');
  }
  const ca = new Map(a.tracks.flatMap((t) => t.clips.map((c) => [c.id, c] as const)));
  const cb = new Map(b.tracks.flatMap((t) => t.clips.map((c) => [c.id, c] as const)));
  const added = [...cb.values()].filter((c) => !ca.has(c.id));
  const removed = [...ca.values()].filter((c) => !cb.has(c.id));
  const changed = [...cb.values()].filter((c) => ca.has(c.id) && ca.get(c.id) !== c && !same(ca.get(c.id), c));
  // разрезали: один новый кусок того же файла, а у старого укоротился конец
  if (added.length === 1 && !removed.length && changed.length === 1) {
    const n = added[0], o = changed[0];
    if (n.type === o.type && (n.type !== 'media' || (o.type === 'media' && n.assetId === o.assetId))) return tx('Разрезан: {0}', clipName(b, o));
  }
  if (added.length && !removed.length) {
    const cap = added.every((c) => c.type === 'text' && c.role === 'caption');
    if (cap) return tx('Субтитры: {0} фраз', added.length);
    return added.length === 1 ? tx('Добавлен: {0}', clipName(b, added[0])) : tx('Добавлено клипов: {0}', added.length);
  }
  if (removed.length && !added.length) return removed.length === 1 ? tx('Удалён: {0}', clipName(a, removed[0])) : tx('Удалено клипов: {0}', removed.length);
  if (added.length && removed.length) return tx('Заменено клипов: {0}', Math.max(added.length, removed.length));
  if (changed.length) {
    const keys = new Set<string>();
    for (const c of changed) {
      const o = ca.get(c.id)! as unknown as Record<string, unknown>, n = c as unknown as Record<string, unknown>;
      for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) if (!same(o[k], n[k])) keys.add(k);
    }
    const f = FIELDS.find((x) => x.keys.some((k) => keys.has(k)));
    const what = f ? f.label() : tx('Правка');
    return changed.length === 1 ? `${what}: ${clipName(b, changed[0])}` : tx('{0}: клипов {1}', what, changed.length);
  }
  if (!same(a.markers, b.markers)) return (b.markers?.length ?? 0) > (a.markers?.length ?? 0) ? tx('Маркер') : tx('Маркеры');
  if (a.tracks.length !== b.tracks.length) return b.tracks.length > a.tracks.length ? tx('Новая дорожка') : tx('Дорожка убрана');
  if (!same(a.tracks.map((t) => [t.id, t.hidden, t.muted, t.name]), b.tracks.map((t) => [t.id, t.hidden, t.muted, t.name]))) return tx('Дорожки');
  if (b.assets.length > a.assets.length) {
    const ids = new Set(a.assets.map((x) => x.id));
    const fresh = b.assets.filter((x) => !ids.has(x.id) && !x.derived);
    if (fresh.length === 1) return tx('Импорт: {0}', fresh[0].name);
    if (fresh.length > 1) return tx('Импорт файлов: {0}', fresh.length);
  }
  if (a.assets.length !== b.assets.length) return tx('Файлы проекта');
  if (a.name !== b.name) return tx('Название: {0}', b.name);
  return tx('Правка');
}

export interface HistoryItem { index: number; label: string; current: boolean; future: boolean }

/** Список шагов: начало, каждое действие, и то, что можно вернуть (после Ctrl+Z). index — номер состояния. */
export function historyItems(past: Project[], cur: Project, future: Project[]): HistoryItem[] {
  const all = [...past, cur, ...future];
  const at = past.length;
  return all.map((p, i) => ({
    index: i,
    label: i === 0 ? tx('Начало') : describeChange(all[i - 1], p),
    current: i === at,
    future: i > at,
  }));
}
