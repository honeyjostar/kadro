// Приветствие при первом запуске, три шага:
// 1) язык и тема — язык угадан по Windows; другой язык — перезапуск уже на нём, окно покажется снова;
// 2) основной формат роликов — подсвечен на главном экране и по умолчанию в авто-ролике и ролике по сценарию;
// 3) компьютер и ИИ — видеокарта кодирует или нет (кнопка драйвера), модели ИИ скачать заранее.
// «Начать» (или «Пропустить») — больше не показывается; модели качаются в фоне, прогресс — в правом нижнем углу.
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { LANGS_UI, tx, uiLang, type Lang } from '../../shared/i18n';
import type { ModelInfo, TtsVoiceId, VoiceInfo } from '../../shared/ipc';
import type { AspectKey } from '../../shared/types';
import { ASPECTS } from '../../shared/defaults';
import { ensureModel, ensureVoice } from '../actions';
import { api, getState, useStore } from '../store';
import { Seg } from './controls';
import { LogoMark } from './Home';
import { HardwareSection } from './Settings';

/** Подписи первого шага — на обоих языках сразу: понятны до выбора. */
const BOTH = { title: 'Добро пожаловать в Kadro · Welcome to Kadro', pick: 'Выбери язык · Choose your language' }; // i18n-data: на обоих языках сразу
const FORMATS: { aspect: AspectKey; title: string; where: string }[] = [
  { aspect: '9:16', title: tx('Вертикальное'), where: 'TikTok, Reels, Shorts' },
  { aspect: '16:9', title: tx('Горизонтальное'), where: tx('YouTube, ВК Видео') },
  { aspect: '1:1', title: tx('Квадрат'), where: tx('пост в ленту') },
  { aspect: '4:5', title: tx('Портрет'), where: 'Instagram, Telegram' },
];
const shape = (a: AspectKey) => { const { w, h } = ASPECTS[a]; const k = 40 / Math.max(w, h); return { width: w * k, height: h * k }; };

export function Welcome({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [switching, setSwitching] = useState<Lang | null>(null);
  const themePref = useStore((s) => s.themePref);
  const format = useStore((s) => s.defaultFormat);
  const [asr, setAsr] = useState<ModelInfo[]>([]);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [wantAsr, setWantAsr] = useState(true);
  const [wantVoice, setWantVoice] = useState(false);
  const cur = uiLang();
  useEffect(() => { void api.models().then(setAsr); void api.ttsVoices().then(setVoices); }, []);
  // распознавание: русский — лёгкая GigaAM, иначе многоязычная Parakeet; голос — по языку интерфейса
  const asrModel = asr.find((m) => m.id === (cur === 'ru' ? 'ru' : 'multi')) ?? asr[0];
  const voiceId: TtsVoiceId = cur === 'ru' ? 'irina' : 'amy';
  const voice = voices.find((v) => v.id === voiceId);

  const choose = (l: Lang) => {
    if (l === cur || switching) return;
    setSwitching(l);
    void api.setLang(l);
  };
  const finish = (withModels: boolean) => {
    void api.welcomeDone().then(onDone);
    if (!withModels) return;
    // по очереди и в фоне: окно уже закрыто, прогресс — в списке задач
    void (async () => {
      if (wantAsr && asrModel && !asrModel.ready) await ensureModel(asrModel.id);
      if (wantVoice && voice && !voice.ready) await ensureVoice(voice.id);
    })();
  };
  const steps = [tx('Язык и тема'), tx('Формат'), tx('Компьютер и ИИ')];
  return (
    <div className="modal-back welcome-back">
      <div className="modal welcome-modal" role="dialog" aria-label={BOTH.title} data-testid="welcome" data-step={step}>
        <div className="welcome-top">
          <div className="welcome-logo"><LogoMark /><span>Kadro</span></div>
          <div className="welcome-steps" aria-hidden>
            {steps.map((s, i) => <span key={s} className={i === step ? 'on' : i < step ? 'done' : ''} title={s} />)}
          </div>
        </div>

        {step === 0 && (
          <>
            <h3>{BOTH.title}</h3>
            <p className="hint">{tx('Бесплатный видеоредактор для Windows: без подписок, водяных знаков и регистрации.')}</p>
            <div className="section-title">{BOTH.pick}</div>
            <div className="welcome-langs">
              {LANGS_UI.map((l) => (
                <button key={l.id} className={`welcome-card ${l.id === cur ? 'active' : ''}`} onClick={() => choose(l.id)} disabled={!!switching} data-testid={`welcome-lang-${l.id}`}>
                  <span className="welcome-card-name">{l.label}</span>
                  <span className="hint small">{l.id === 'ru' ? 'Интерфейс на русском' : 'Interface in English'}</span>{/* i18n-data: каждый — на своём языке */}
                </button>
              ))}
            </div>
            {switching && <p className="hint" data-testid="welcome-restart">{switching === 'en' ? 'Kadro restarts in English…' : 'Kadro перезапускается на русском…'}</p>}{/* i18n-data: на выбранном языке */}
            <div className="section-title">{tx('Тема')}</div>
            <div data-testid="welcome-theme">
              <Seg value={themePref} onChange={(v) => getState().setThemePref(v)}
                options={[{ value: 'dark', label: tx('Тёмная') }, { value: 'light', label: tx('Светлая') }, { value: 'system', label: tx('Как в Windows') }]} />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h3>{tx('Что чаще монтируешь?')}</h3>
            <p className="hint">{tx('Этот формат будет подсвечен на главном экране и выбран сразу в авто-ролике и ролике по сценарию. Любой проект можно сделать в любом формате.')}</p>
            <div className="welcome-formats">
              {FORMATS.map((f) => (
                <button key={f.aspect} className={`welcome-card ${format === f.aspect ? 'active' : ''}`} onClick={() => getState().setDefaultFormat(f.aspect)} data-testid={`welcome-format-${f.aspect.replace(':', '-')}`}>
                  <span className="welcome-shape"><span style={shape(f.aspect)} /></span>
                  <div>
                    <span className="welcome-card-name">{f.title} <em>{f.aspect}</em></span>
                    <span className="hint small">{f.where}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3>{tx('Твой компьютер и ИИ')}</h3>
            <div className="welcome-hw"><HardwareSection /></div>
            <div className="section-title">{tx('Скачать модели ИИ сейчас')}</div>
            <p className="hint">{tx('Тогда субтитры и озвучка потом заработают сразу и без интернета. Можно и позже — скачаются при первом использовании.')}</p>
            <div className="welcome-models">
              {asrModel && (
                <label className={`welcome-check ${asrModel.ready ? 'ready' : ''}`} data-testid="welcome-asr">
                  <input type="checkbox" checked={asrModel.ready || wantAsr} disabled={asrModel.ready} onChange={(e) => setWantAsr(e.target.checked)} />
                  <span><b>{tx('Автосубтитры')}</b> — {asrModel.label}<em>{asrModel.ready ? <><Check size={12} />{tx('скачана')}</> : tx('{0} МБ', asrModel.sizeMb)}</em></span>
                </label>
              )}
              {voice && (
                <label className={`welcome-check ${voice.ready ? 'ready' : ''}`} data-testid="welcome-voice">
                  <input type="checkbox" checked={voice.ready || wantVoice} disabled={voice.ready} onChange={(e) => setWantVoice(e.target.checked)} />
                  <span><b>{tx('Голос для озвучки текста')}</b> — {voice.label}<em>{voice.ready ? <><Check size={12} />{tx('скачана')}</> : tx('{0} МБ', voice.sizeMb)}</em></span>
                </label>
              )}
            </div>
          </>
        )}

        <div className="actions welcome-actions">
          {step === 0
            ? <button className="btn ghost" onClick={() => finish(false)} disabled={!!switching} data-testid="welcome-skip">{tx('Пропустить')}</button>
            : <button className="btn ghost" onClick={() => setStep(step - 1)} data-testid="welcome-back">{tx('Назад')}</button>}
          <span className="hint small welcome-later">{tx('Всё это можно поменять потом в «Настройки».')}</span>
          {step < steps.length - 1
            ? <button className="btn primary" onClick={() => setStep(step + 1)} disabled={!!switching} data-testid="welcome-next">{tx('Далее')}</button>
            : <button className="btn primary" onClick={() => finish(true)} data-testid="welcome-go">{tx('Начать')}</button>}
        </div>
      </div>
    </div>
  );
}
