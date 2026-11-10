// Экскурсия по Kadro: затемнение и подсветка частей окна по очереди (разделы, плеер, таймлайн, настройки клипа,
// экспорт, настройки, клавиши) с подсказкой рядом. И «маячок» — пульсирующая рамка вокруг кнопки, на которую
// стоит нажать (его ставит обучение «Первый ролик за 3 шага»).
import { tx } from '../../shared/i18n';
import { X } from 'lucide-react';
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { getState, useStore } from '../store';

interface Stop { target: string; title: string; text: string }

export const TOUR_STOPS: Stop[] = [
  { target: '.rail', title: tx('Разделы'), text: tx('Медиа, звук, текст, субтитры, эффекты, переходы, фильтры, ИИ, шаблоны и 3D. Нажми раздел — рядом откроется его панель.') },
  { target: 'aside.panel', title: tx('Панель раздела'), text: tx('Файлы отсюда перетаскивай на таймлайн. Эффекты, фильтры и переходы — нажми плитку, и она встанет на выделенный клип. Наведи мышь — увидишь, как это выглядит.') },
  { target: '.stage', title: tx('Плеер'), text: tx('Так ролик и выйдет. Текст и картинки двигай прямо здесь. Пробел — пуск и пауза, формат кадра — под плеером.') },
  { target: '[data-testid=timeline]', title: tx('Таймлайн'), text: tx('Клипы по порядку. S — разрезать у розовой линии, Delete — удалить, мышью — двигать и обрезать края. Кнопки сверху подписаны.') },
  { target: '[data-testid=inspector]', title: tx('Настройки клипа'), text: tx('Выдели клип — тут его размер, анимация, цвет, скорость, звук и ИИ. Ничего не выделено — настройки всего проекта.') },
  { target: '[data-testid=export-open]', title: tx('Экспорт'), text: tx('Готово — сохраняй: видео MP4 до 4K, GIF, звук MP3 или стикер Telegram. Без водяного знака.') },
  { target: '[data-testid=topbar-settings]', title: tx('Настройки программы'), text: tx('Язык, тема, цвет, музыка под голосом, модели ИИ. Там же «Помощь»: экскурсия и обучение заново.') },
  { target: '[data-testid=topbar-keys]', title: tx('Клавиши'), text: tx('Все сочетания клавиш с поиском — F1. Готово: можно монтировать!') },
];

type Rect = { x: number; y: number; w: number; h: number };

/** Где сейчас элемент на экране (следим, пока он показан: окно меняет размер, панели сдвигаются). */
function useRect(selector: string | null): Rect | null {
  const [r, setR] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    if (!selector) { setR(null); return; }
    let raf = 0;
    let last = '';
    const tick = () => {
      const el = document.querySelector(selector);
      const b = el?.getBoundingClientRect();
      const next = b && b.width > 0 && b.height > 0 ? { x: b.left, y: b.top, w: b.width, h: b.height } : null;
      const key = next ? `${Math.round(next.x)},${Math.round(next.y)},${Math.round(next.w)},${Math.round(next.h)}` : '';
      if (key !== last) { last = key; setR(next); }
      raf = window.setTimeout(tick, 150);
    };
    tick();
    return () => window.clearTimeout(raf);
  }, [selector]);
  return r;
}

/** Подсказка рядом с элементом: справа, слева, снизу или сверху — где поместится. */
function calloutPos(r: Rect, w: number, h: number): { left: number; top: number } {
  const vw = window.innerWidth; const vh = window.innerHeight; const gap = 14;
  const clampY = (y: number) => Math.max(8, Math.min(vh - h - 8, y));
  const clampX = (x: number) => Math.max(8, Math.min(vw - w - 8, x));
  if (r.x + r.w + gap + w < vw && r.w < vw * 0.5) return { left: r.x + r.w + gap, top: clampY(r.y + r.h / 2 - h / 2) };
  if (r.x - gap - w > 0 && r.w < vw * 0.5) return { left: r.x - gap - w, top: clampY(r.y + r.h / 2 - h / 2) };
  if (r.y + r.h + gap + h < vh) return { left: clampX(r.x + r.w / 2 - w / 2), top: r.y + r.h + gap };
  return { left: clampX(r.x + r.w / 2 - w / 2), top: Math.max(8, r.y - gap - h) };
}

/** Пульсирующая рамка вокруг элемента (без затемнения) и короткая подпись рядом. */
export function Beacon({ target, label }: { target: string | null; label?: string }) {
  const r = useRect(target);
  if (!r) return null;
  const pos = label ? calloutPos(r, 230, 40) : null;
  return (
    <>
      <div className="beacon" style={{ left: r.x - 4, top: r.y - 4, width: r.w + 8, height: r.h + 8 }} data-testid="beacon" />
      {label && pos && <div className="beacon-label" style={{ left: pos.left, top: pos.top }}>{label}</div>}
    </>
  );
}

/** Экскурсия: затемнение всего, кроме части окна, и подсказка с «Далее». */
export function Tour() {
  const step = useStore((s) => s.tour);
  const stop = step !== null ? TOUR_STOPS[step] : null;
  const r = useRect(stop?.target ?? null);
  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); getState().setTour(null); }
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') { e.stopPropagation(); e.preventDefault(); back(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  if (step === null || !stop) return null;
  const last = step === TOUR_STOPS.length - 1;
  const next = () => getState().setTour(last ? null : step + 1);
  const back = () => getState().setTour(Math.max(0, step - 1));
  const W = 320; const H = 170;
  const pos = r ? calloutPos({ x: r.x - 6, y: r.y - 6, w: r.w + 12, h: r.h + 12 }, W, H) : { left: window.innerWidth / 2 - W / 2, top: window.innerHeight / 2 - H / 2 };
  const hole: ReactNode = r && <div className="tour-hole" style={{ left: r.x - 6, top: r.y - 6, width: r.w + 12, height: r.h + 12 }} />;
  return (
    <div className="tour" role="dialog" aria-label={tx('Экскурсия по Kadro')} data-testid="tour">
      {hole ?? <div className="tour-dim" />}
      <div className="tour-card" style={{ left: pos.left, top: pos.top, width: W }} data-testid="tour-card">
        <div className="tour-head">
          <span className="tour-count">{step + 1} / {TOUR_STOPS.length}</span>
          <b>{stop.title}</b>
          <button className="icon-btn" onClick={() => getState().setTour(null)} title={tx('Закончить экскурсию')} data-testid="tour-close"><X size={15} /></button>
        </div>
        <p>{stop.text}</p>
        <div className="tour-acts">
          {step > 0 && <button className="btn ghost small" onClick={back} data-testid="tour-back">{tx('Назад')}</button>}
          <button className="btn primary small" onClick={next} data-testid="tour-next">{last ? tx('Готово') : tx('Далее')}</button>
        </div>
      </div>
    </div>
  );
}

/** Начать экскурсию: из главного экрана — сразу в редактор. */
export function startTour(): void {
  const s = getState();
  s.setSettingsOpen(false);
  s.setHome(false);
  s.setTour(0);
}
