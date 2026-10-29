// Обновления в окне: карточка «Вышел Kadro X» (обновить, что нового, позже), полоска скачивания,
// «Kadro обновлён» после установки, окно «Что нового» и раздел «Обновления» в настройках.
import { ArrowUpCircle, ExternalLink, PartyPopper, RefreshCw, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RELEASES_PAGE, notesLines, type UpdateState } from '../../shared/update';
import { api, getState, useStore } from '../store';
import { Progress, Toggle } from './controls';

const mb = (n?: number) => (n ? `${Math.round(n / 1e6)} МБ` : '');
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
        <div className="update-head"><PartyPopper size={16} /><b>Kadro обновлён до {u.current}</b>
          <button className="icon-btn" title="Закрыть" onClick={close}><X size={15} /></button></div>
        <p>Проекты и настройки на месте.</p>
        <div className="update-actions">
          <button className="btn small" onClick={() => { void api.openUrl(releasePage(u.current)); close(); }} data-testid="update-whatsnew"><Sparkles size={13} />Что нового</button>
        </div>
      </div>
    );
  }

  return (
    <div className="update-card" role="status" data-testid="update-card" data-phase={u.phase}>
      <div className="update-head"><ArrowUpCircle size={16} /><b>{u.phase === 'ready' ? `Kadro ${u.version} скачан` : `Вышел Kadro ${u.version}`}</b>
        {u.phase !== 'downloading' && u.phase !== 'installing' && <button className="icon-btn" title="Позже" onClick={() => setHidden(key)} data-testid="update-later"><X size={15} /></button>}</div>
      {u.phase === 'available' && <p>{u.portable
        ? 'У тебя переносная версия — скачай новую со страницы релиза и распакуй поверх. Проекты и настройки сохранятся.'
        : `Обновление ${mb(u.size)}. Проекты и настройки сохранятся.`}</p>}
      {u.phase === 'downloading' && <>
        <p>Скачиваю… {Math.round((u.progress ?? 0) * 100)}%{u.size ? ` из ${mb(u.size)}` : ''}</p>
        <Progress value={u.progress ?? 0} />
      </>}
      {u.phase === 'ready' && <p>Kadro закроется на минуту и откроется уже новым. Проект сохранится сам.</p>}
      {u.phase === 'installing' && <p>Запускаю установку…</p>}
      {u.phase === 'error' && <p className="update-err" data-testid="update-error">Не получилось: {u.error}</p>}
      <div className="update-actions">
        {u.phase === 'downloading'
          ? <button className="btn small" onClick={() => void api.cancelUpdate()} data-testid="update-cancel">Отмена</button>
          : <>
            {u.notes ? <button className="btn ghost small" onClick={() => setNotes(true)} data-testid="update-notes"><Sparkles size={13} />Что нового</button> : null}
            {u.phase === 'available' && <button className="btn primary small" onClick={() => void api.downloadUpdate()} data-testid="update-go">
              {u.portable ? <><ExternalLink size={13} />Скачать</> : <><ArrowUpCircle size={13} />Обновить</>}</button>}
            {u.phase === 'ready' && <button className="btn primary small" onClick={() => void api.installUpdate()} data-testid="update-install"><RefreshCw size={13} />Установить сейчас</button>}
            {u.phase === 'error' && <button className="btn primary small" onClick={() => void api.downloadUpdate()} data-testid="update-retry"><RefreshCw size={13} />Повторить</button>}
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
      <div className="modal notes-modal" role="dialog" aria-label="Что нового" data-testid="update-notes-dialog">
        <div className="modal-head">
          <h3><Sparkles size={17} />Что нового в Kadro {u.version}</h3>
          <button className="icon-btn" onClick={onClose} title="Закрыть"><X size={17} /></button>
        </div>
        <div className="notes-body">
          {lines.map((l, i) => (l.kind === 'h' ? <h4 key={i}>{l.text}</h4> : l.kind === 'li' ? <p key={i} className="li">{l.text}</p> : <p key={i}>{l.text}</p>))}
        </div>
        <div className="actions">
          {u.page && <button className="btn ghost" onClick={() => void api.openUrl(u.page!)}><ExternalLink size={14} />Страница релиза</button>}
          <button className="btn" onClick={onClose}>Закрыть</button>
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
      case 'checking': return 'Проверяю…';
      case 'latest': return 'У тебя последняя версия.';
      case 'available': return `Вышла версия ${u.version}.`;
      case 'downloading': return `Скачиваю ${u.version}… ${Math.round((u.progress ?? 0) * 100)}%`;
      case 'ready': return `Версия ${u.version} скачана — можно устанавливать.`;
      case 'installing': return 'Запускаю установку…';
      case 'error': return `Не получилось: ${u.error}`;
      default: return u.checkedAt ? `Последняя проверка: ${new Date(u.checkedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.` : '';
    }
  })();
  return (
    <section className="settings-sec" data-testid="updates">
      <b><ArrowUpCircle size={14} />Обновления</b>
      <p className="hint">Сейчас — Kadro {u.current}{u.portable ? ', переносная версия' : ''}. <span data-testid="update-status">{status}</span></p>
      <Toggle label="Проверять обновления при запуске" hint="Kadro раз в несколько часов спрашивает GitHub, нет ли новой версии. Сам ничего не ставит без твоего «Обновить»."
        on={u.autoCheck} onChange={(v) => void api.setAutoUpdate(v)} testId="update-auto" />
      <div className="custom-row">
        <button className="btn small" disabled={u.phase === 'checking' || u.phase === 'downloading'} onClick={() => void api.checkUpdate()} data-testid="update-check"><RefreshCw size={13} />Проверить сейчас</button>
        {u.phase === 'available' && <button className="btn small primary" onClick={() => void api.downloadUpdate()} data-testid="update-go-settings">{u.portable ? 'Скачать' : `Обновить до ${u.version}`}</button>}
        {u.phase === 'ready' && <button className="btn small primary" onClick={() => void api.installUpdate()}>Установить {u.version}</button>}
        <button className="btn ghost small" onClick={() => void api.openUrl(RELEASES_PAGE)}><ExternalLink size={13} />Все версии</button>
      </div>
    </section>
  );
}
