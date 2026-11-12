// Окно «Запись экрана»: что записывать (экран, окно или только камера), звук компьютера, микрофон, веб-камера.
// Во время записи Kadro сворачивается; остановить — Ctrl+Alt+R из любой программы или кнопкой здесь.
import { Monitor, Square, Video, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { tx } from '../../shared/i18n';
import { placeRecording } from '../actions';
import { listMics, type MicInfo } from '../recorder';
import { camStream, listCams, ScreenRecorder, type CamInfo } from '../screenRecorder';
import { api, getState } from '../store';
import { fmtTime } from '../util';
import { Toggle } from './controls';

type Phase = 'setup' | 'count' | 'rec' | 'saving';
interface Source { id: string; name: string; screen: boolean; thumb: string }
const CAM_ONLY = 'cam-only';

export function ScreenRecDialog() {
  const close = () => getState().setScreenRecOpen(false);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [src, setSrc] = useState<string>('');
  const [mics, setMics] = useState<MicInfo[]>([]);
  const [cams, setCams] = useState<CamInfo[]>([]);
  const [mic, setMic] = useState<string | null>('default');
  const [cam, setCam] = useState<string | null>(null);
  const [sysAudio, setSysAudio] = useState(true);
  const [hide, setHide] = useState(true);
  const [phase, setPhase] = useState<Phase>('setup');
  const [count, setCount] = useState(3);
  const [time, setTime] = useState(0);
  const [level, setLevel] = useState(0);
  const rec = useRef<ScreenRecorder | null>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const win = navigator.userAgent.includes('Windows');

  useEffect(() => {
    void api.screenSources().then((s) => { setSources(s); setSrc((cur) => cur || s.find((x) => x.screen)?.id || s[0]?.id || CAM_ONLY); });
    void listMics().then(setMics);
    void listCams().then(setCams);
  }, []);
  // живой предпросмотр камеры
  useEffect(() => {
    if (!cam || phase !== 'setup') return;
    let s: MediaStream | null = null;
    let alive = true;
    void camStream(cam).then((st) => { if (!alive) { st.getTracks().forEach((t) => t.stop()); return; } s = st; if (preview.current) preview.current.srcObject = st; }).catch(() => undefined);
    return () => { alive = false; s?.getTracks().forEach((t) => t.stop()); };
  }, [cam, phase]);
  // остановка сочетанием клавиш из любой программы
  useEffect(() => api.onSrecStop(() => { void stop(); }), []);
  useEffect(() => () => { void api.srecHotkey(false); if (rec.current) void rec.current.cancel(); }, []);
  useEffect(() => {
    if (phase !== 'rec') return;
    const id = setInterval(() => { setTime(rec.current?.elapsed() ?? 0); setLevel(rec.current?.level() ?? 0); }, 200);
    return () => clearInterval(id);
  }, [phase]);

  const camOnly = src === CAM_ONLY;
  const canStart = !!src && (!camOnly || !!cam);

  const start = async () => {
    setPhase('count');
    for (let k = 3; k > 0; k--) { setCount(k); await new Promise((r) => setTimeout(r, 700)); }
    const r = new ScreenRecorder();
    try {
      await r.start({ sourceId: camOnly ? null : src, systemAudio: sysAudio && !camOnly, micId: mic, camId: cam });
    } catch (e) {
      setPhase('setup');
      getState().toast(e instanceof Error && e.name === 'NotAllowedError' ? tx('Нет доступа к экрану или камере — проверь разрешения Windows') : tx('Запись не началась: {0}', e instanceof Error ? e.message : String(e)), 'err');
      return;
    }
    rec.current = r;
    setPhase('rec');
    await api.srecHotkey(true);
    if (hide && !camOnly) await api.srecMinimize();
  };

  const stop = async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    await api.srecHotkey(false);
    await api.srecRestore();
    setPhase('saving');
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
    const name = camOnly ? tx('Запись камеры {0}', stamp) : tx('Запись экрана {0}', stamp);
    try {
      const files = await r.stop(name);
      await placeRecording(files);
      close();
    } catch (e) {
      getState().toast(tx('Не получилось сохранить запись: {0}', e instanceof Error ? e.message : String(e)), 'err');
      setPhase('setup');
    }
  };

  const cancel = async () => {
    const r = rec.current;
    rec.current = null;
    await api.srecHotkey(false);
    await api.srecRestore();
    await r?.cancel();
    setPhase('setup');
  };

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget && phase === 'setup') close(); }}>
      <div className="modal srec-modal" role="dialog" aria-label={tx('Запись экрана')} data-testid="srec-dialog">
        <div className="modal-head">
          <h3>{tx('Запись экрана')}</h3>
          {phase === 'setup' && <button className="icon-btn" onClick={close} title={tx('Закрыть')}><X size={17} /></button>}
        </div>

        {phase === 'setup' && (
          <>
            <div className="section-title" style={{ marginTop: 0 }}>{tx('Что записывать')}</div>
            <div className="srec-sources" data-testid="srec-sources">
              {!sources && <p className="hint">{tx('Ищу экраны и окна…')}</p>}
              {sources?.map((s) => (
                <button key={s.id} className={src === s.id ? 'active' : ''} onClick={() => setSrc(s.id)} title={s.name} data-testid="srec-source">
                  {s.thumb ? <img src={s.thumb} alt="" /> : <span className="srec-ph"><Monitor size={22} /></span>}
                  <span className="ellipsis">{s.screen ? tx('Весь экран: {0}', s.name) : s.name}</span>
                </button>
              ))}
              <button className={camOnly ? 'active' : ''} onClick={() => setSrc(CAM_ONLY)} data-testid="srec-cam-only">
                <span className="srec-ph"><Video size={22} /></span>
                <span>{tx('Только веб-камера')}</span>
              </button>
            </div>
            <div className="srec-opts">
              {!camOnly && win && <Toggle label={tx('Звук компьютера')} on={sysAudio} onChange={setSysAudio} hint={tx('Всё, что слышно из колонок: видео, игра, созвон')} />}
              <label className="field-row srec-select">
                <span>{tx('Микрофон')}</span>
                <select className="input" value={mic ?? ''} onChange={(e) => setMic(e.target.value || null)} data-testid="srec-mic">
                  <option value="">{tx('Без микрофона')}</option>
                  {mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
              <label className="field-row srec-select">
                <span>{tx('Веб-камера')}</span>
                <select className="input" value={cam ?? ''} onChange={(e) => setCam(e.target.value || null)} data-testid="srec-cam">
                  <option value="">{camOnly ? tx('Выбери камеру') : tx('Без камеры')}</option>
                  {cams.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              {cam && <video ref={preview} className="srec-cam-preview" autoPlay muted playsInline />}
              {cam && !camOnly && <p className="hint small">{tx('Камера запишется отдельным файлом и встанет кружком в углу — её можно двигать и менять размер.')}</p>}
              {!camOnly && <Toggle label={tx('Свернуть Kadro на время записи')} on={hide} onChange={setHide} />}
            </div>
            <p className="hint small">{tx('Остановить запись — Ctrl+Alt+R из любой программы или кнопка «Стоп» в Kadro. Файл сохранится в «Видео/Kadro» и встанет в конец ролика.')}</p>
            <div className="actions">
              <button className="btn" onClick={close}>{tx('Отмена')}</button>
              <button className="btn primary" disabled={!canStart} onClick={() => void start()} data-testid="srec-start"><span className="rec-dot" />{tx('Начать запись')}</button>
            </div>
          </>
        )}

        {phase === 'count' && <div className="srec-count" data-testid="srec-count">{count}</div>}

        {phase === 'rec' && (
          <>
            <div className="srec-live" data-testid="srec-live">
              <span className="rec-dot blink" />
              <b>{fmtTime(time)}</b>
              <span className="srec-level"><i style={{ width: `${Math.round(level * 100)}%` }} /></span>
            </div>
            <p className="hint small">{tx('Идёт запись. Остановить — Ctrl+Alt+R или «Стоп».')}</p>
            <div className="actions">
              <button className="btn" onClick={() => void cancel()} data-testid="srec-cancel">{tx('Отменить запись')}</button>
              <button className="btn primary" onClick={() => void stop()} data-testid="srec-stop"><Square size={13} fill="currentColor" />{tx('Стоп')}</button>
            </div>
          </>
        )}

        {phase === 'saving' && <p className="hint" data-testid="srec-saving">{tx('Сохраняю запись…')}</p>}
      </div>
    </div>
  );
}
