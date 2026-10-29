// Обновления в окне: карточка «Вышел Kadro X» (обновить, что нового, позже), полоска скачивания,
// «Kadro обновлён» после установки, окно «Что нового» и раздел «Обновления» в настройках.
import { tx, uiLocale } from '../../shared/i18n';
import { txj } from '../txj';
import { ArrowUpCircle, ExternalLink, PartyPopper, RefreshCw, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RELEASES_PAGE, notesLines, type UpdateState } from '../../shared/update';
import { api, getState, useStore } from '../store';
import { Progress, Toggle } from './controls';

const mb = (n?: number) => (n ? tx('{0} МБ', Math.round(n / 1e6)) : '');
const releasePage = (v: string) => `${RELEASES_PAGE}/tag/v${v}`;

/** Подписка окна на состояние обновлений (вызывается один раз в App). */
export function useUpdateFeed(): void {
  useEffect(() => {
    void api.updateState().then((s) => getState().setUpdate(s)).catch(() => undefined);
    return api.onUpdate((s) => getState().setUpdate(s));
  }, []);
}

export function UpdateCard() {
  const u = useStore((s) => s.update);
  const [hidden, setHidden] = useState<string | null>(null);
  const [notes, setNotes] = useState(false);
  if (!u) return null;
  const key = `${u.phase}-${u.version ?? ''}-${u.updatedFrom ?? ''}`;
  const show = u.updatedFrom || ['available', 'downloading', 'ready', 'installing'].includes(u.phase) || (u.phase === 'error' && u.version && u.version !== u.current);
  if (!show || hidden === key) return null;

  if (u.updatedFrom && !['available', 'downloading', 'ready', 'installing'].includes(u.phase)) {
    const close = () => { setHidden(key); void api.updateSeen(); };
    return (
      <div className="update-card" role="status" data-testid="update-card">
        <div className="update-head"><PartyPopper size={16} /><b>{txj('Kadro обновлён до {0}', u.current)}</b>
          <button className="icon-btn" title={tx('Закрыть')} onClick={close}><X size={15} /></button></div>
        <p>{tx('Проекты и настройки на месте.')}</p>
        <div className="update-actions">
          <button className="btn small" onClick={() => { void api.openUrl(releasePage(u.current)); close(); }} data-testid="update-whatsnew"><Sparkles size={13} />{tx('Что нового')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="update-card" role="status" data-testid="update-card" data-phase={u.phase}>
      <div className="update-head"><ArrowUpCircle size={16} /><b>{u.phase === 'ready' ? tx('Kadro {0} скачан', u.version) : tx('Вышел Kadro {0}', u.version)}</b>
        {u.phase !== 'downloading' && u.phase !== 'installing' && <button className="icon-btn" title={tx('Позже')} onClick={() => setHidden(key)} data-testid="update-later"><X size={15} /></button>}</div>
      {u.phase === 'available' && <p>{u.portable
        ? tx('У тебя переносная версия — скачай новую со страницы релиза и распакуй поверх. Проекты и настройки сохранятся.')
        : tx('Обновление {0}. Проекты и настройки сохранятся.', mb(u.size))}</p>}
      {u.phase === 'downloading' && <>
        <p>{txj('Скачиваю… {0}%{1}', Math.round((u.progress ?? 0) * 100), u.size ? tx(' из {0}', mb(u.size)) : '')}</p>
        <Progress value={u.progress ?? 0} />
      </>}
      {u.phase === 'ready' && <p>{tx('Kadro закроется на минуту и откроется уже новым. Проект сохранится сам.')}</p>}
      {u.phase === 'installing' && <p>{tx('Запускаю установку…')}</p>}
      {u.phase === 'error' && <p className="update-err" data-testid="update-error">{txj('Не получилось: {0}', u.error)}</p>}
      <div className="update-actions">
        {u.phase === 'downloading'
          ? <button className="btn small" onClick={() => void api.cancelUpdate()} data-testid="update-cancel">{tx('Отмена')}</button>
          : <>
            {u.notes ? <button className="btn ghost small" onClick={() => setNotes(true)} data-testid="update-notes"><Sparkles size={13} />{tx('Что нового')}</button> : null}
            {u.phase === 'available' && <button className="btn primary small" onClick={() => void api.downloadUpdate()} data-testid="update-go">
              {u.portable ? <><ExternalLink size={13} />{tx('Скачать')}</> : <><ArrowUpCircle size={13} />{tx('Обновить')}</>}</button>}
            {u.phase === 'ready' && <button className="btn primary small" onClick={() => void api.installUpdate()} data-testid="update-install"><RefreshCw size={13} />{tx('Установить сейчас')}</button>}
            {u.phase === 'error' && <button className="btn primary small" onClick={() => void api.downloadUpdate()} data-testid="update-retry"><RefreshCw size={13} />{tx('Повторить')}</button>}
          </>}
      </div>
      {notes && <NotesDialog u={u} onClose={() => setNotes(false)} />}
    </div>
  );
}

function NotesDialog({ u, onClose }: { u: UpdateState; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const lines = notesLines(u.notes ?? '');
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal notes-modal" role="dialog" aria-label={tx('Что нового')} data-testid="update-notes-dialog">
        <div className="modal-head">
          <h3><Sparkles size={17} />{txj('Что нового в Kadro {0}', u.version)}</h3>
          <button className="icon-btn" onClick={onClose} title={tx('Закрыть')}><X size={17} /></button>
        </div>
        <div className="notes-body">
          {lines.map((l, i) => (l.kind === 'h' ? <h4 key={i}>{l.text}</h4> : l.kind === 'li' ? <p key={i} className="li">{l.text}</p> : <p key={i}>{l.text}</p>))}
        </div>
        <div className="actions">
          {u.page && <button className="btn ghost" onClick={() => void api.openUrl(u.page!)}><ExternalLink size={14} />{tx('Страница релиза')}</button>}
          <button className="btn" onClick={onClose}>{tx('Закрыть')}</button>
        </div>
      </div>
    </div>
  );
}

/** Раздел «Обновления» в настройках. */
export function UpdateSection() {
  const u = useStore((s) => s.update);
  if (!u) return null;
  const status = (() => {
    switch (u.phase) {
      case 'checking': return tx('Проверяю…');
      case 'latest': return tx('У тебя последняя версия.');
      case 'available': return tx('Вышла версия {0}.', u.version);
      case 'downloading': return tx('Скачиваю {0}… {1}%', u.version, Math.round((u.progress ?? 0) * 100));
      case 'ready': return tx('Версия {0} скачана — можно устанавливать.', u.version);
      case 'installing': return tx('Запускаю установку…');
      case 'error': return tx('Не получилось: {0}', u.error);
      default: return u.checkedAt ? tx('Последняя проверка: {0}.', new Date(u.checkedAt).toLocaleString(uiLocale(), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) : '';
    }
  })();
  return (
    <section className="settings-sec" data-testid="updates">
      <b><ArrowUpCircle size={14} />{tx('Обновления')}</b>
      <p className="hint">{txj('Сейчас — Kadro {0}{1}. ', u.current, u.portable ? tx(', переносная версия') : '')}<span data-testid="update-status">{status}</span></p>
      <Toggle label={tx('Проверять обновления при запуске')} hint={tx('Kadro раз в несколько часов спрашивает GitHub, нет ли новой версии. Сам ничего не ставит без твоего «Обновить».')}
        on={u.autoCheck} onChange={(v) => void api.setAutoUpdate(v)} testId="update-auto" />
      <div className="custom-row">
        <button className="btn small" disabled={u.phase === 'checking' || u.phase === 'downloading'} onClick={() => void api.checkUpdate()} data-testid="update-check"><RefreshCw size={13} />{tx('Проверить сейчас')}</button>
        {u.phase === 'available' && <button className="btn small primary" onClick={() => void api.downloadUpdate()} data-testid="update-go-settings">{u.portable ? tx('Скачать') : tx('Обновить до {0}', u.version)}</button>}
        {u.phase === 'ready' && <button className="btn small primary" onClick={() => void api.installUpdate()}>{txj('Установить {0}', u.version)}</button>}
        <button className="btn ghost small" onClick={() => void api.openUrl(RELEASES_PAGE)}><ExternalLink size={13} />{tx('Все версии')}</button>
      </div>
    </section>
  );
}
