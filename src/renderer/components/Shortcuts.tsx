// Окно «Горячие клавиши» (F1, Ctrl+/ или кнопка с клавиатурой вверху): все клавиши и сочетания Kadro по
// разделам, с поиском. Список — один на всё приложение: если добавляешь клавишу, добавь её и сюда.
import { Keyboard, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { tx } from '../../shared/i18n';
import { getState } from '../store';

interface Key { keys: string[]; what: string }
interface Section { title: string; items: Key[] }

export function shortcutSections(): Section[] {
  return [
    { title: tx('Воспроизведение'), items: [
      { keys: [tx('Пробел')], what: tx('пуск и пауза') },
      { keys: ['←', '→'], what: tx('на кадр назад / вперёд') },
      { keys: ['Shift+←', 'Shift+→'], what: tx('на секунду назад / вперёд') },
      { keys: ['Home', 'End'], what: tx('в начало / в конец ролика') },
    ] },
    { title: tx('Правка'), items: [
      { keys: ['S', 'Ctrl+B'], what: tx('разрезать у курсора') },
      { keys: ['Delete', 'Backspace'], what: tx('удалить выделенное') },
      { keys: ['Ctrl+D'], what: tx('копия выделенного клипа') },
      { keys: ['Ctrl+Z'], what: tx('отменить') },
      { keys: ['Ctrl+Y', 'Ctrl+Shift+Z'], what: tx('вернуть отменённое') },
      { keys: ['Ctrl+Shift+C'], what: tx('скопировать параметры клипа') },
      { keys: ['Ctrl+Shift+V'], what: tx('вставить параметры в выделенные клипы') },
      { keys: ['Ctrl+G'], what: tx('сгруппировать выделенные клипы') },
      { keys: ['Ctrl+Shift+G'], what: tx('разгруппировать') },
    ] },
    { title: tx('Выделение и таймлайн'), items: [
      { keys: [tx('Ctrl+щелчок')], what: tx('добавить клип к выделению или убрать') },
      { keys: [tx('Shift+щелчок')], what: tx('все клипы от выделенного до этого') },
      { keys: [tx('рамка мышью')], what: tx('выделить клипы, которых коснулась') },
      { keys: ['Ctrl+A'], what: tx('выделить всё') },
      { keys: ['Esc'], what: tx('снять выделение') },
      { keys: [tx('Ctrl+колесо'), '+', '−'], what: tx('масштаб таймлайна') },
    ] },
    { title: tx('Маркеры'), items: [
      { keys: ['M'], what: tx('поставить маркер у курсора') },
      { keys: ['Shift+M'], what: tx('к следующему маркеру') },
      { keys: ['Ctrl+Shift+M'], what: tx('к предыдущему маркеру') },
      { keys: [tx('двойной щелчок')], what: tx('переименовать маркер') },
    ] },
    { title: tx('Проект и окна'), items: [
      { keys: ['Ctrl+S'], what: tx('сохранить проект') },
      { keys: ['Ctrl+Shift+S'], what: tx('сохранить как…') },
      { keys: ['Ctrl+E'], what: tx('экспорт') },
      { keys: ['F1', 'Ctrl+/'], what: tx('это окно') },
      { keys: ['Esc'], what: tx('закрыть окно') },
      { keys: ['Enter'], what: tx('подтвердить в окне (вставка параметров и др.)') },
    ] },
    { title: tx('«Взять кусок» из файла'), items: [
      { keys: ['I'], what: tx('начало куска') },
      { keys: ['O'], what: tx('конец куска') },
      { keys: [tx('Пробел')], what: tx('смотреть') },
      { keys: ['←', '→'], what: tx('по кадру (с Shift — по секунде)') },
      { keys: ['Enter'], what: tx('кусок на таймлайн к курсору') },
    ] },
    { title: tx('Плеер'), items: [
      { keys: [tx('потянуть')], what: tx('сдвинуть выделенный клип в кадре') },
      { keys: [tx('уголок')], what: tx('изменить размер') },
      { keys: [tx('верхняя точка')], what: tx('повернуть') },
      { keys: [tx('двойной щелчок по тексту')], what: tx('редактировать текст') },
    ] },
  ];
}

export function ShortcutsDialog() {
  const [q, setQ] = useState('');
  const close = () => getState().setKeysOpen(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const sections = useMemo(() => {
    const s = q.trim().toLowerCase();
    return shortcutSections()
      .map((sec) => ({ ...sec, items: sec.items.filter((it) => !s || it.what.toLowerCase().includes(s) || it.keys.some((k) => k.toLowerCase().includes(s)) || sec.title.toLowerCase().includes(s)) }))
      .filter((sec) => sec.items.length);
  }, [q]);
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal keys-modal" role="dialog" aria-label={tx('Горячие клавиши')} data-testid="keys-dialog">
        <div className="modal-head">
          <h3><Keyboard size={17} />{tx('Горячие клавиши')}</h3>
          <button className="icon-btn" onClick={close} title={tx('Закрыть')}><X size={17} /></button>
        </div>
        <label className="keys-search"><Search size={14} />
          <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('Найти: разрезать, маркер, Ctrl+…')} data-testid="keys-search" />
        </label>
        <p className="hint small">{tx('Клавиши работают и в русской раскладке.')}</p>
        <div className="keys-grid">
          {sections.map((sec) => (
            <section key={sec.title} className="keys-sec">
              <h4>{sec.title}</h4>
              {sec.items.map((it) => (
                <div key={it.what + it.keys.join()} className="keys-row" data-testid="keys-row">
                  <span className="keys-keys">{it.keys.map((k, i) => <span key={k}>{i > 0 && <i>/</i>}{(k === '+' ? ['+'] : k.split('+')).map((p, j) => <span key={j}>{j > 0 && '+'}<kbd>{p}</kbd></span>)}</span>)}</span>
                  <span className="keys-what">{it.what}</span>
                </div>
              ))}
            </section>
          ))}
          {!sections.length && <p className="hint">{tx('Ничего не нашлось.')}</p>}
        </div>
      </div>
    </div>
  );
}
