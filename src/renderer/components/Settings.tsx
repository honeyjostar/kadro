// Окно «Настройки»: тема, цвет акцента, значок программы (окно и ярлыки Windows), размер интерфейса,
// своё оформление (custom.css и theme.json в папке данных — подхватываются на лету), качество превью и кэш.
import { LANGS_UI, pluralForm, tx, uiLang, uiLocale } from '../../shared/i18n';
import { txj } from '../txj';
import { AudioLines, BookOpen, Brain, Bug, CheckCircle2, Cpu, Download, Globe, FileUp, FolderOpen, HardDrive, ImagePlus, LayoutGrid, Puzzle, Languages, RefreshCw, Settings as Gear, Trash2, TriangleAlert, X, XCircle } from 'lucide-react';
import { encoderLabel, encoderName, reasonText, type GpuVendor, type HwInfo } from '../../shared/hw';
import { glPluginErrors, glPlugins, useGlCatalog } from '../glRegistry';
import { useEffect, useState } from 'react';
import { ACCENTS, APP_ICONS, UI_SCALES, type Appearance } from '../../shared/appearance';
import { collectPaths, fmtBytes, type CacheInfo } from '../../shared/cache';
import { api, getState, useStore } from '../store';
import { Progress, Seg, Toggle } from './controls';
import { LogoMark } from './Home';
import { reportInstall } from './PluginCatalog';
import { ensureModel, ensureVoice, importModelFile, modelInBrowser } from '../actions';
import type { ModelInfo, VoiceInfo } from '../../shared/ipc';
import { gpuSpeedup, gpuWins, type AsrDeviceInfo, type AsrDevicePref } from '../../shared/asrDevice';
import { UpdateSection } from './Update';

export function SettingsDialog() {
  const a = useStore((s) => s.appearance);
  const themePref = useStore((s) => s.themePref);
  const defaultFormat = useStore((s) => s.defaultFormat);
  const custom = useStore((s) => s.customStatus);
  const previewQuality = useStore((s) => s.previewQuality);
  const [note, setNote] = useState('');
  const [langNote, setLangNote] = useState(false);
  const [dir, setDir] = useState(custom?.dir ?? '');
  const close = () => getState().setSettingsOpen(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const set = async (patch: Partial<Appearance>) => {
    const r = await api.setAppearance(patch);
    if (r.appearance) getState().setAppearance(r.appearance);
    if (patch.icon) setNote(iconNote(r.windows, r.shortcuts));
  };
  const pickIcon = async () => {
    const r = await api.pickAppIcon();
    if (r.ok && r.appearance) { getState().setAppearance(r.appearance); setNote(iconNote(r.windows, r.shortcuts)); } else if (r.error) setNote(r.error);
  };
  const openDir = async () => setDir(await api.openCustomDir());

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal settings-modal" role="dialog" aria-label={tx('Настройки')} data-testid="settings">
        <div className="modal-head">
          <h3><Gear size={17} />{tx('Настройки')}</h3>
          <button className="icon-btn" onClick={close} title={tx('Закрыть')}><X size={17} /></button>
        </div>

        <section className="settings-sec" data-testid="lang" data-native>
          <b><Languages size={14} />{tx('Язык · Language')}</b>
          <Seg value={uiLang()} onChange={(v) => { if (v !== uiLang()) { setLangNote(true); void api.setLang(v); } }} options={LANGS_UI.map((l) => ({ value: l.id, label: l.label }))} />
          <p className="hint">{langNote ? tx('Kadro перезапустится на выбранном языке — проект сохранится.') : tx('Язык меню, подсказок и сообщений. Kadro перезапустится, проект сохранится.')}</p>
        </section>

        <section className="settings-sec">
          <b>{tx('Тема')}</b>
          <Seg value={themePref} onChange={(v) => getState().setThemePref(v)}
            options={[{ value: 'dark', label: tx('Тёмная') }, { value: 'light', label: tx('Светлая') }, { value: 'system', label: tx('Как в Windows') }]} />
        </section>

        <section className="settings-sec" data-testid="format-pref">
          <b>{tx('Основной формат роликов')}</b>
          <Seg value={defaultFormat ?? '9:16'} onChange={(v) => getState().setDefaultFormat(v)}
            options={(['9:16', '16:9', '1:1', '4:5'] as const).map((v) => ({ value: v, label: v }))} />
          <p className="hint">{tx('Подсвечен на главном экране и выбран сразу в авто-ролике и ролике по сценарию.')}</p>
        </section>

        <section className="settings-sec">
          <b>{tx('Цвет акцента')}</b>
          <div className="accent-row">
            {ACCENTS.map((x) => (
              <button key={x.id} className={`accent-opt ${a.accent === x.id ? 'active' : ''}`} onClick={() => void set({ accent: x.id })} data-testid={`accent-${x.id}`}>
                <span className="accent-dot" style={{ background: x.swatch }} />{x.label}
              </button>
            ))}
          </div>
          <p className="hint">{tx('Кнопки, курсор на таймлайне, выделение и переключатели.')}</p>
        </section>

        <section className="settings-sec">
          <b>{tx('Значок программы')}</b>
          <div className="icon-row">
            {APP_ICONS.map((x) => (
              <button key={x.id} className={`icon-opt ${a.icon === x.id ? 'active' : ''}`} onClick={() => void set({ icon: x.id })} data-testid={`icon-${x.id}`}>
                <LogoMark icon={x.id} />{x.label}
              </button>
            ))}
            <button className={`icon-opt ${a.icon === 'custom' ? 'active' : ''} add`} onClick={() => void pickIcon()} data-testid="icon-custom">
              {a.icon === 'custom' ? <LogoMark icon="custom" /> : <ImagePlus size={30} />}{tx('Свой…')}</button>
          </div>
          <p className="hint">{tx('Меняется значок окна и ярлыков Kadro на рабочем столе, в меню «Пуск» и на панели задач. Свой — любая картинка PNG, JPG или ICO.')}</p>
          {note && <p className="hint" data-testid="icon-note">{note}</p>}
        </section>

        <section className="settings-sec">
          <b>{tx('Размер интерфейса')}</b>
          <Seg value={a.uiScale} onChange={(v) => void set({ uiScale: v })} options={UI_SCALES} />
          <p className="hint">{tx('Крупнее — удобнее на большом мониторе, мельче — больше места для таймлайна.')}</p>
        </section>

        <section className="settings-sec">
          <b>{tx('Своё оформление')}</b>
          <Toggle label={tx('Подключить мои стили (custom.css и theme.json)')} on={a.custom} onChange={(v) => void set({ custom: v })} testId="custom-toggle" />
          <p className="hint">
            {tx('Свои цвета, шрифты, скругления, фон — как у сайта: правишь файлы в папке оформления, Kadro применяет изменения сразу после сохранения. Сломал вид — выключи переключатель.')}</p>
          <div className="custom-row">
            <button className="btn small" onClick={() => void openDir()} data-testid="custom-open"><FolderOpen size={13} />{tx('Открыть папку оформления')}</button>
            <button className="btn ghost small" onClick={() => api.openDocs('customize')}><BookOpen size={13} />{tx('Инструкция')}</button>
          </div>
          {(dir || custom?.dir) && <p className="custom-path" data-testid="custom-dir">{dir || custom?.dir}</p>}
          {custom?.error && <div className="warn"><TriangleAlert size={15} /><span>{custom.error}</span></div>}
          {custom?.on && custom.skipped?.length ? <p className="hint">{txj('Пропущено в theme.json: {0}', custom.skipped.join(', '))}</p> : null}
        </section>

        <PluginsSection />

        <HardwareSection />

        <AsrDeviceSection />

        <section className="settings-sec">
          <b>{tx('Качество превью')}</b>
          <Seg value={previewQuality} onChange={(v) => getState().setPreviewQuality(v)}
            options={[{ value: 'high', label: tx('Высокое') }, { value: 'medium', label: tx('Среднее') }, { value: 'low', label: tx('Быстрое') }]} />
          <p className="hint">{tx('Картинка в плеере. «Быстрое» — плавнее на слабом компьютере и ноутбуке. На экспорт не влияет.')}</p>
        </section>

        <ModelsSection />

        <CacheSection />

        <UpdateSection />

        <section className="settings-sec" data-testid="help">
          <b>{tx('Помощь')}</b>
          <div className="custom-row">
            <button className="btn small" onClick={() => { close(); getState().setBugOpen({ what: '' }); }} data-testid="bug-open-settings"><Bug size={13} />{tx('Сообщить об ошибке')}</button>
            <button className="btn ghost small" onClick={() => api.openDocs('guide')}><BookOpen size={13} />{tx('Инструкция')}</button>
          </div>
          <p className="hint">{tx('Что-то не работает или есть идея — напиши: откроется готовый отчёт на GitHub с версией Kadro и журналом.')}</p>
        </section>
      </div>
    </div>
  );
}

/** Компьютер: процессор, память, видеокарты и чем кодируется видео (с причиной, если видеокарта не кодирует). */
export function HardwareSection() {
  const [hw, setHw] = useState<HwInfo | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void api.hardware().then(setHw); }, []);
  const recheck = async () => {
    setBusy(true);
    try { setHw(await api.hardware(true)); } finally { setBusy(false); }
  };
  // кому обновить драйвер: производитель видеокарты, у которой кодировщик упёрся в драйвер
  const vendorOfEnc: Record<string, GpuVendor> = { nvenc: 'nvidia', amf: 'amd', qsv: 'intel' };
  const driverFix = hw?.encoders.find((e) => !e.ok && (e.code === 'driver-old' || e.code === 'no-driver') && vendorOfEnc[e.id]);
  const fixVendor = driverFix ? vendorOfEnc[driverFix.id] as 'nvidia' | 'amd' | 'intel' : null;
  return (
    <section className="settings-sec" data-testid="hw">
      <b><Cpu size={14} />{tx('Компьютер')}</b>
      {!hw ? <p className="hint">{tx('Проверяю процессор и видеокарту…')}</p> : (
        <>
          <div className="hw-list">
            <div className="hw-row"><span>{tx('Процессор')}</span><em data-testid="hw-cpu">{txj('{0}, потоков: {1}', hw.cpu || tx('неизвестный'), hw.threads)}</em></div>
            <div className="hw-row"><span>{tx('Память')}</span><em>{tx('{0} ГБ', hw.ramGb)}</em></div>
            {hw.gpus.length === 0 && <div className="hw-row"><span>{tx('Видеокарта')}</span><em>{tx('не определилась')}</em></div>}
            {hw.gpus.map((g, i) => (
              <div className="hw-row" key={i} data-testid="hw-gpu"><span>{tx('Видеокарта')}</span>
                <em>{g.name}{g.driver ? tx(', драйвер {0}', g.driver) : ''}{g.vramGb ? tx(', {0} ГБ', g.vramGb) : ''}</em></div>
            ))}
          </div>
          <div className="hw-enc-list">
            {hw.encoders.map((e) => (
              <div key={e.id} className={`hw-enc ${e.ok ? 'ok' : 'bad'}`} data-testid={`hw-enc-${e.id}`} title={e.detail}>
                {e.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                <span><b>{encoderName(e.id)}</b> — {reasonText(e, hw.gpus)}</span>
              </div>
            ))}
          </div>
          <p className="hint" data-testid="hw-summary">{hw.best
            ? tx('Экспорт в режиме «Авто» кодирует видео: {0}. Это в несколько раз быстрее процессора.', encoderLabel(hw.best))
            : tx('Видео кодирует процессор — медленнее, чем видеокарта, но качество то же.')}</p>
          <div className="custom-row">
            <button className="btn small" disabled={busy} onClick={() => void recheck()} data-testid="hw-recheck"><RefreshCw size={13} />{busy ? tx('Проверяю…') : tx('Проверить снова')}</button>
            {fixVendor && <button className="btn small primary" onClick={() => void api.openDriverPage(fixVendor)} data-testid="hw-driver">{tx('Скачать драйвер {0}', { nvidia: 'NVIDIA', amd: 'AMD', intel: 'Intel' }[fixVendor])}</button>}
          </div>
          {fixVendor && <p className="hint">{tx('После обновления драйвера нажми «Проверить снова» — перезапускать Kadro не нужно.')}</p>}
        </>
      )}
    </section>
  );
}

/** «В 3,2 раза», «в 2 раза», «в 5 раз» (по-английски — «3.2 times»). */
function timesText(x: number): string {
  const n = x.toLocaleString(uiLocale(), { maximumFractionDigits: 1 });
  const word = Number.isInteger(x) ? pluralForm(x, tx('раз'), tx('раза'), tx('раз')) : tx('раза');
  return `${n} ${word}`;
}
const ASR_SHORT: Record<string, string> = { ru: 'GigaAM', multi: 'Parakeet' };

/** Распознавание речи (автосубтитры): на видеокарте через DirectML или на процессоре; «Авто» сравнивает и выбирает быстрое. */
function AsrDeviceSection() {
  const [info, setInfo] = useState<AsrDeviceInfo | null>(null);
  useEffect(() => { void api.asrDeviceInfo().then(setInfo); }, []);
  if (!info) return null;
  const set = (d: AsrDevicePref) => void api.setAsrDevice(d).then(setInfo);
  const benches = Object.entries(info.bench);
  const status = (): string => {
    if (!info.available) {
      if (info.why === 'gpu') return tx('Видеокарта не определилась — распознаю на процессоре.');
      if (info.why === 'build') return tx('В этой установке нет распознавания на видеокарте — распознаю на процессоре. Поможет переустановка Kadro.');
      return tx('Распознавание на видеокарте работает в Windows 10 и 11 — здесь распознаю на процессоре.');
    }
    if (info.pref === 'cpu') return tx('Распознаю на процессоре.');
    if (info.failed) return info.pref === 'gpu'
      ? tx('В прошлый раз видеокарта не включилась. Попробую снова, а не выйдет — распознаю на процессоре.')
      : tx('Видеокарта не подошла для распознавания — распознаю на процессоре.');
    if (info.pref === 'gpu') return tx('Распознаю на видеокарте.');
    if (!benches.length) return tx('При первом распознавании Kadro сравнит видеокарту и процессор на твоей записи и дальше будет распознавать на том, что быстрее.');
    return '';
  };
  const st = status();
  return (
    <section className="settings-sec" data-testid="asr-device-sec">
      <b><AudioLines size={14} />{tx('Распознавание речи')}</b>
      <Seg testId="asr-device" value={info.pref} onChange={set}
        options={[{ value: 'auto', label: tx('Авто') }, { value: 'gpu', label: tx('Видеокарта') }, { value: 'cpu', label: tx('Процессор') }]} />
      {st && <p className="hint" data-testid="asr-device-status" title={info.failed}>{st}</p>}
      {info.available && info.pref === 'auto' && !info.failed && benches.map(([m, b]) => (
        <p className="hint" key={m} data-testid={`asr-bench-${m}`}>
          {gpuWins(b)
            ? tx('{0}: на видеокарте в {1} быстрее — распознаю на ней.', ASR_SHORT[m] ?? m, timesText(gpuSpeedup(b)))
            : tx('{0}: на видеокарте не заметно быстрее — распознаю на процессоре.', ASR_SHORT[m] ?? m)}
        </p>
      ))}
      {info.last && (
        <p className="hint small" data-testid="asr-last">
          {tx('Последний раз: {0} с речи за {1} с — на {2}.', Math.round(info.last.speechSec), info.last.decodeSec.toLocaleString(uiLocale(), { maximumFractionDigits: 1 }), info.last.device === 'gpu' ? tx('видеокарте') : tx('процессоре'))}
        </p>
      )}
      {info.available && (benches.length > 0 || info.failed) && (
        <div className="custom-row">
          <button className="btn small" onClick={() => void api.resetAsrBench().then(setInfo)} data-testid="asr-rebench"><RefreshCw size={13} />{tx('Сравнить заново')}</button>
        </div>
      )}
    </section>
  );
}

/** Модели ИИ: что скачано, скачать, скачать в браузере и указать файл, удалить. */
function ModelsSection() {
  const [asr, setAsr] = useState<ModelInfo[]>([]);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [mt, setMt] = useState<string[]>([]);
  const jobs = useStore((s) => s.jobs);
  const job = Object.values(jobs).find((j) => /^(dl|tdl|imp)_/.test(j.id));
  const reload = async () => {
    const [a, v, m] = await Promise.all([api.models(), api.ttsVoices(), api.mtInfo().catch(() => ({ ready: [] as string[] }))]);
    setAsr(a); setVoices(v); setMt(m.ready);
  };
  useEffect(() => { void reload(); }, []);
  const after = (p: Promise<unknown>) => void p.finally(() => void reload());
  const row = (what: 'asr' | 'tts', id: string, label: string, sizeMb: number, ready: boolean) => (
    <div className={`model-row ${ready ? 'ready' : ''}`} key={`${what}-${id}`} data-testid={`model-${what}-${id}`}>
      <div className="model-name"><span>{label}</span><em>{ready ? tx('скачана') : tx('{0} МБ', sizeMb)}</em></div>
      <div className="model-btns">
        {ready
          ? <button className="btn ghost small" disabled={!!job} onClick={() => after(api.deleteModel(what, id))} data-testid="model-del" title={tx('Удалить с диска — освободит место, скачать можно снова')}><Trash2 size={13} /></button>
          : <>
            <button className="btn small" disabled={!!job} onClick={() => after(what === 'asr' ? ensureModel(id as ModelInfo['id']) : ensureVoice(id as VoiceInfo['id']))} data-testid="model-dl"><Download size={13} />{tx('Скачать')}</button>
            <button className="btn ghost small" disabled={!!job} onClick={() => void modelInBrowser(what, id)} title={tx('Скачать файл в браузере — если Kadro сам не может (VPN, прокси, антивирус)')} data-testid="model-browser"><Globe size={13} /></button>
            <button className="btn ghost small" disabled={!!job} onClick={() => after(importModelFile(what, id))} title={tx('Из файла…')} data-testid="model-file"><FileUp size={13} /></button>
          </>}
      </div>
    </div>
  );
  return (
    <section className="settings-sec" data-testid="models">
      <b><Brain size={14} />{tx('Модели ИИ')}</b>
      <p className="hint">{tx('Скачиваются один раз и дальше работают без интернета. Не скачивается — нажми значок глобуса: файл скачает браузер, потом укажи его кнопкой со стрелкой («Из файла…»).')}</p>
      {job && <div className="model-job" data-testid="model-job"><span>{job.stage ?? job.label}</span><Progress value={job.progress} /></div>}
      <div className="model-group">{tx('Субтитры (распознавание речи)')}</div>
      {asr.map((m) => row('asr', m.id, m.label, m.sizeMb, m.ready))}
      <div className="model-group">{tx('Озвучка текста')}</div>
      {voices.map((v) => row('tts', v.id, v.label, v.sizeMb, v.ready))}
      <p className="hint" data-testid="models-mt">{mt.length
        ? txj('Перевод субтитров: есть {0}. Другие языки скачаются сами при первом переводе.', mt.join(', '))
        : tx('Перевод субтитров: модели скачаются сами при первом переводе.')}</p>
    </section>
  );
}

/** Плагины-шейдеры: папка, что подключено, ошибки в файлах. */
function PluginsSection() {
  useGlCatalog();
  const [dir, setDir] = useState('');
  const list = glPlugins();
  const errors = glPluginErrors();
  return (
    <section className="settings-sec" data-testid="plugins">
      <b><Puzzle size={14} />{tx('Плагины')}</b>
      <p className="hint">
        {tx('Дополнительные переходы и эффекты: из каталога сообщества в один щелчок или свой файл .glsl (можно просто перетащить его в окно Kadro). Подходит любой переход с gl-transitions.com.')}</p>
      <div className="custom-row">
        <button className="btn small primary" onClick={() => { getState().setSettingsOpen(false); getState().setPluginCatalogOpen(true); }} data-testid="plugins-catalog"><LayoutGrid size={13} />{tx('Каталог плагинов')}</button>
        <button className="btn small" onClick={() => void api.pickPluginFiles().then(reportInstall)} data-testid="plugins-from-file"><FileUp size={13} />{tx('Из файла…')}</button>
        <button className="btn ghost small" onClick={() => void api.openPluginsDir().then(setDir)} data-testid="plugins-open"><FolderOpen size={13} />{tx('Папка')}</button>
        <button className="btn ghost small" onClick={() => api.openDocs('plugins')}><BookOpen size={13} />{tx('Как написать плагин')}</button>
      </div>
      {dir && <p className="custom-path" data-testid="plugins-dir">{dir}</p>}
      {list.length > 0 && (
        <ul className="plugin-list" data-testid="plugins-list">
          {list.map((d) => (
            <li key={d.id} data-testid={`plugin-${d.id}`}>
              <em>{d.kind === 'transition' ? tx('переход') : tx('эффект')}</em>{d.name}{d.author ? <span> · {d.author}</span> : null}
              {d.source && <button className="icon-btn plugin-del" title={tx('Удалить плагин')} data-testid="plugin-remove"
                onClick={() => void api.removePlugin(d.source!).then((ok) => getState().toast(ok ? tx('«{0}» удалён', d.name) : tx('Не удалось удалить'), ok ? 'info' : 'err'))}><Trash2 size={13} /></button>}
            </li>
          ))}
        </ul>
      )}
      {errors.map((e) => <div key={e.file + e.message} className="warn" data-testid="plugin-error" title={e.file}><TriangleAlert size={15} /><span>{e.message}</span></div>)}
    </section>
  );
}

/** Место на диске: превью и миниатюры (пересоздаются сами) и служебные копии (реверс, ИИ, группы). */
function CacheSection() {
  const [info, setInfo] = useState<CacheInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => { void api.cacheInfo().then(setInfo); }, []);
  const clear = async (what: 'preview' | 'derived') => {
    setBusy(true);
    try {
      // не трогаем то, что нужно открытому проекту — и его истории правок (Ctrl+Z)
      const s = getState();
      const refs = [...collectPaths([s.project, s.past, s.future])];
      const r = await api.clearCache(what, refs);
      setInfo(r.info);
      setNote(r.removed ? tx('Освобождено {0}.', fmtBytes(r.freed)) : tx('Удалять нечего — всё нужно проектам.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-sec" data-testid="cache">
      <b><HardDrive size={14} />{tx('Место на диске')}</b>
      <div className="cache-row">
        <div><span>{tx('Превью и миниатюры')}</span><em data-testid="cache-preview">{info ? fmtBytes(info.preview) : '…'}</em></div>
        <button className="btn small" disabled={busy || !info?.preview} onClick={() => void clear('preview')} data-testid="cache-clear-preview">{tx('Очистить')}</button>
      </div>
      <p className="hint">{tx('Лёгкие копии видео для плеера, кадры на таймлайне, волны звука. Пересоздаются сами, когда понадобятся; файлы открытого проекта не удаляются.')}</p>
      <div className="cache-row">
        <div><span>{tx('Служебные копии')}</span><em data-testid="cache-derived">{info ? fmtBytes(info.derived) : '…'}</em></div>
        <button className="btn small" disabled={busy || !info?.derived} onClick={() => void clear('derived')} data-testid="cache-clear-derived">{tx('Удалить ненужные')}</button>
      </div>
      <p className="hint">{tx('Реверс и замедление, результаты ИИ, группы, 3D, озвучка. Удаляются только копии, которых нет ни в открытом, ни в недавних проектах, ни в черновиках.')}</p>
      {!!info?.kept && <p className="hint">{txj('Записи голоса и журналы — {0}, не удаляются.', fmtBytes(info.kept))}</p>}
      {note && <p className="hint" data-testid="cache-note">{note}</p>}
    </section>
  );
}

function iconNote(windows?: boolean, shortcuts?: number): string {
  if (!windows) return tx('Значок окна поменялся.');
  if (!shortcuts) return tx('Значок окна поменялся. Ярлыков Kadro не нашлось или у них уже этот значок.');
  return tx('Готово: поменял значок у ярлыков ({0}). Если на рабочем столе ещё старый — нажми на нём F5.', shortcuts);
}
