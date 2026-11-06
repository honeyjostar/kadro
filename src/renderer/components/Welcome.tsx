// Приветствие при первом запуске: выбор языка интерфейса. Язык угадан по Windows; выбрать другой —
// Kadro перезапустится уже на нём и покажет это окно ещё раз, на новом языке.
import { useState } from 'react';
import { LANGS_UI, tx, uiLang, type Lang } from '../../shared/i18n';
import { api } from '../store';
import { LogoMark } from './Home';

/** Подписи окна на обоих языках сразу — понятны до выбора. */
const BOTH = { title: 'Добро пожаловать в Kadro · Welcome to Kadro', pick: 'Выбери язык · Choose your language' };

export function Welcome({ onDone }: { onDone: () => void }) {
  const [switching, setSwitching] = useState<Lang | null>(null);
  const cur = uiLang();
  const choose = (l: Lang) => {
    if (l === cur || switching) return;
    setSwitching(l);
    void api.setLang(l);
  };
  const finish = () => { void api.welcomeDone().then(onDone); };
  return (
    <div className="modal-back welcome-back">
      <div className="modal welcome-modal" role="dialog" aria-label={BOTH.title} data-testid="welcome">
        <div className="welcome-logo"><LogoMark /><span>Kadro</span></div>
        <h3>{BOTH.title}</h3>
        <p className="hint">{tx('Бесплатный видеоредактор для Windows: без подписок, водяных знаков и регистрации.')}</p>
        <div className="section-title">{BOTH.pick}</div>
        <div className="welcome-langs">
          {LANGS_UI.map((l) => (
            <button key={l.id} className={`welcome-lang ${l.id === cur ? 'active' : ''}`} onClick={() => choose(l.id)} disabled={!!switching} data-testid={`welcome-lang-${l.id}`}>
              <span className="welcome-lang-name">{l.label}</span>
              <span className="hint small">{l.id === 'ru' ? 'Интерфейс на русском' : 'Interface in English'}</span>
            </button>
          ))}
        </div>
        {switching && <p className="hint" data-testid="welcome-restart">{switching === 'en' ? 'Kadro restarts in English…' : 'Kadro перезапускается на русском…'}</p>}
        <p className="hint small">{tx('Язык можно поменять потом: «Настройки» → «Язык».')}</p>
        <div className="actions">
          <button className="btn primary" onClick={finish} disabled={!!switching} data-testid="welcome-go">{tx('Начать')}</button>
        </div>
      </div>
    </div>
  );
}
