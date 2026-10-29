// Окно «Сообщить об ошибке»: пользователь пишет, что случилось, Kadro добавляет версию, систему и конец
// журнала — всё видно до отправки. «Открыть на GitHub» открывает готовый Issue в браузере: отправляет сам
// пользователь, Kadro ничего не шлёт в сеть. Работает и с экрана сбоя (без остального интерфейса).
import { tx } from '../../shared/i18n';
import { Bug, ClipboardCopy, ExternalLink, FolderOpen, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { bugBody, issueUrl, type BugInfo } from '../../shared/bugReport';
import { api } from '../store';
import { Toggle } from './controls';

export function BugDialog(props: { initial?: string; onClose: () => void }) {
  const [what, setWhat] = useState(props.initial ?? '');
  const [steps, setSteps] = useState('');
  const [withLog, setWithLog] = useState(true);
  const [info, setInfo] = useState<BugInfo | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    api.bugInfo().then(setInfo).catch(() => setInfo({ version: '?', os: navigator.userAgent, electron: '?', gpu: '?', log: '' }));
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const body = useMemo(() => (info ? bugBody(what, steps, info, withLog) : ''), [info, what, steps, withLog]);
  const url = useMemo(() => (info ? issueUrl(what, steps, info, withLog) : ''), [info, what, steps, withLog]);
  const ready = !!info && what.trim().length >= 3;

  const open = async () => {
    if (!ready) return;
    const ok = await api.openUrl(url);
    setNote(ok ? tx('Открылась страница GitHub: проверь текст и нажми «Submit new issue». Нужен вход в GitHub.') : tx('Не удалось открыть браузер — скопируй отчёт и вставь его на github.com/honeyjostar/kadro/issues.'));
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(body); setNote(tx('Отчёт скопирован — его можно вставить в Issue, письмо или сообщение.')); } catch { setNote(tx('Не удалось скопировать.')); }
  };
  const logs = async () => { const p = await api.openLogs(); setNote(tx('Журнал: {0}', p)); };

  return (
    <div className="modal-back bug-back" onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="modal bug-modal" role="dialog" aria-label={tx('Сообщить об ошибке')} data-testid="bug-dialog" data-url={url}>
        <div className="modal-head">
          <h3><Bug size={17} />{tx('Сообщить об ошибке')}</h3>
          <button className="icon-btn" onClick={props.onClose} title={tx('Закрыть')}><X size={17} /></button>
        </div>
        <p className="hint">{tx('Получится готовый отчёт на GitHub — его прочитает разработчик. Отправляешь ты сам, в браузере; Kadro ничего не шлёт.')}</p>

        <label className="bug-field">
          <span>{tx('Что случилось')}</span>
          <textarea className="input" rows={3} autoFocus value={what} onChange={(e) => setWhat(e.target.value)}
            placeholder={tx('Например: при экспорте в 4K программа закрывается на 80%')} data-testid="bug-what" />
        </label>
        <label className="bug-field">
          <span>{tx('Что делал перед этим ')}<em>{tx('— необязательно')}</em></span>
          <textarea className="input" rows={2} value={steps} onChange={(e) => setSteps(e.target.value)}
            placeholder={tx('Открыл проект, добавил переход «Куб», нажал «Экспорт»')} data-testid="bug-steps" />
        </label>
        <Toggle label={tx('Приложить журнал работы')} hint={tx('Последние строки kadro.log. Путь к твоей папке заменён на %USERPROFILE%.')} on={withLog} onChange={setWithLog} testId="bug-log" />

        <details className="bug-preview" data-testid="bug-preview">
          <summary>{tx('Что уйдёт в отчёт')}</summary>
          <pre>{body || tx('Собираю сведения…')}</pre>
        </details>

        {note && <p className="hint" data-testid="bug-note">{note}</p>}
        <div className="bug-actions">
          <button className="btn ghost small" onClick={() => void logs()} data-testid="bug-logs"><FolderOpen size={13} />{tx('Папка с журналом')}</button>
          <span className="spacer" />
          <button className="btn small" onClick={() => void copy()} disabled={!info} data-testid="bug-copy"><ClipboardCopy size={13} />{tx('Скопировать')}</button>
          <button className="btn primary small" onClick={() => void open()} disabled={!ready} title={ready ? '' : tx('Опиши, что случилось')} data-testid="bug-open">
            <ExternalLink size={13} />{tx('Открыть на GitHub')}</button>
        </div>
      </div>
    </div>
  );
}
