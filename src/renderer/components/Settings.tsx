// Окно «Настройки»: тема, цвет акцента, значок программы (окно и ярлыки Windows), размер интерфейса,
// своё оформление (custom.css и theme.json в папке данных — подхватываются на лету), качество превью и кэш.
import { BookOpen, FolderOpen, HardDrive, ImagePlus, Puzzle, Settings as Gear, TriangleAlert, X } from 'lucide-react';
import { glPluginErrors, glPlugins, useGlCatalog } from '../glRegistry';
import { useEffect, useState } from 'react';
import { ACCENTS, APP_ICONS, UI_SCALES, type Appearance } from '../../shared/appearance';
import { collectPaths, fmtBytes, type CacheInfo } from '../../shared/cache';
import { api, getState, useStore } from '../store';
import { Seg, Toggle } from './controls';
import { LogoMark } from './Home';

export function SettingsDialog() {
  const a = useStore((s) => s.appearance);
  const themePref = useStore((s) => s.themePref);
  const custom = useStore((s) => s.customStatus);
  const previewQuality = useStore((s) => s.previewQuality);
  const [note, setNote] = useState('');
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
      <div className="modal settings-modal" role="dialog" aria-label="Настройки" data-testid="settings">
        <div className="modal-head">
          <h3><Gear size={17} />Настройки</h3>
          <button className="icon-btn" onClick={close} title="Закрыть"><X size={17} /></button>
        </div>

        <section className="settings-sec">
          <b>Тема</b>
          <Seg value={themePref} onChange={(v) => getState().setThemePref(v)}
            options={[{ value: 'dark', label: 'Тёмная' }, { value: 'light', label: 'Светлая' }, { value: 'system', label: 'Как в Windows' }]} />
        </section>

        <section className="settings-sec">
          <b>Цвет акцента</b>
          <div className="accent-row">
            {ACCENTS.map((x) => (
              <button key={x.id} className={`accent-opt ${a.accent === x.id ? 'active' : ''}`} onClick={() => void set({ accent: x.id })} data-testid={`accent-${x.id}`}>
                <span className="accent-dot" style={{ background: x.swatch }} />{x.label}
              </button>
            ))}
          </div>
          <p className="hint">Кнопки, курсор на таймлайне, выделение и переключатели.</p>
        </section>

        <section className="settings-sec">
          <b>Значок программы</b>
          <div className="icon-row">
            {APP_ICONS.map((x) => (
              <button key={x.id} className={`icon-opt ${a.icon === x.id ? 'active' : ''}`} onClick={() => void set({ icon: x.id })} data-testid={`icon-${x.id}`}>
                <LogoMark icon={x.id} />{x.label}
              </button>
            ))}
            <button className={`icon-opt ${a.icon === 'custom' ? 'active' : ''} add`} onClick={() => void pickIcon()} data-testid="icon-custom">
              {a.icon === 'custom' ? <LogoMark icon="custom" /> : <ImagePlus size={30} />}Свой…
            </button>
          </div>
          <p className="hint">Меняется значок окна и ярлыков Kadro на рабочем столе, в меню «Пуск» и на панели задач. Свой — любая картинка PNG, JPG или ICO.</p>
          {note && <p className="hint" data-testid="icon-note">{note}</p>}
        </section>

        <section className="settings-sec">
          <b>Размер интерфейса</b>
          <Seg value={a.uiScale} onChange={(v) => void set({ uiScale: v })} options={UI_SCALES} />
          <p className="hint">Крупнее — удобнее на большом мониторе, мельче — больше места для таймлайна.</p>
        </section>

        <section className="settings-sec">
          <b>Своё оформление</b>
          <Toggle label="Подключить мои стили (custom.css и theme.json)" on={a.custom} onChange={(v) => void set({ custom: v })} testId="custom-toggle" />
          <p className="hint">
            Свои цвета, шрифты, скругления, фон — как у сайта: правишь файлы в папке оформления, Kadro применяет изменения сразу после сохранения.
            Сломал вид — выключи переключатель.
          </p>
          <div className="custom-row">
            <button className="btn small" onClick={() => void openDir()} data-testid="custom-open"><FolderOpen size={13} />Открыть папку оформления</button>
            <button className="btn ghost small" onClick={() => api.openDocs('customize')}><BookOpen size={13} />Инструкция</button>
          </div>
          {(dir || custom?.dir) && <p className="custom-path" data-testid="custom-dir">{dir || custom?.dir}</p>}
          {custom?.error && <div className="warn"><TriangleAlert size={15} /><span>{custom.error}</span></div>}
          {custom?.on && custom.skipped?.length ? <p className="hint">Пропущено в theme.json: {custom.skipped.join(', ')}</p> : null}
        </section>

        <PluginsSection />

        <section className="settings-sec">
          <b>Качество превью</b>
          <Seg value={previewQuality} onChange={(v) => getState().setPreviewQuality(v)}
            options={[{ value: 'high', label: 'Высокое' }, { value: 'medium', label: 'Среднее' }, { value: 'low', label: 'Быстрое' }]} />
          <p className="hint">Картинка в плеере. «Быстрое» — плавнее на слабом компьютере и ноутбуке. На экспорт не влияет.</p>
        </section>

        <CacheSection />
      </div>
    </div>
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
      <b><Puzzle size={14} />Плагины</b>
      <p className="hint">
        Свои переходы и эффекты на GLSL: положи файл .glsl в папку плагинов — он сразу появится в разделе «Переходы» или «Эффекты» → «Плагины».
        Подходит любой переход с gl-transitions.com.
      </p>
      <div className="custom-row">
        <button className="btn small" onClick={() => void api.openPluginsDir().then(setDir)} data-testid="plugins-open"><FolderOpen size={13} />Открыть папку плагинов</button>
        <button className="btn ghost small" onClick={() => api.openDocs('plugins')}><BookOpen size={13} />Как написать плагин</button>
      </div>
      {dir && <p className="custom-path" data-testid="plugins-dir">{dir}</p>}
      {list.length > 0 && (
        <ul className="plugin-list" data-testid="plugins-list">
          {list.map((d) => <li key={d.id}><em>{d.kind === 'transition' ? 'переход' : 'эффект'}</em>{d.name}{d.author ? <span> · {d.author}</span> : null}</li>)}
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
      setNote(r.removed ? `Освобождено ${fmtBytes(r.freed)}.` : 'Удалять нечего — всё нужно проектам.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-sec" data-testid="cache">
      <b><HardDrive size={14} />Место на диске</b>
      <div className="cache-row">
        <div><span>Превью и миниатюры</span><em data-testid="cache-preview">{info ? fmtBytes(info.preview) : '…'}</em></div>
        <button className="btn small" disabled={busy || !info?.preview} onClick={() => void clear('preview')} data-testid="cache-clear-preview">Очистить</button>
      </div>
      <p className="hint">Лёгкие копии видео для плеера, кадры на таймлайне, волны звука. Пересоздаются сами, когда понадобятся; файлы открытого проекта не удаляются.</p>
      <div className="cache-row">
        <div><span>Служебные копии</span><em data-testid="cache-derived">{info ? fmtBytes(info.derived) : '…'}</em></div>
        <button className="btn small" disabled={busy || !info?.derived} onClick={() => void clear('derived')} data-testid="cache-clear-derived">Удалить ненужные</button>
      </div>
      <p className="hint">Реверс и замедление, результаты ИИ, группы, 3D, озвучка. Удаляются только копии, которых нет ни в открытом, ни в недавних проектах, ни в черновиках.</p>
      {!!info?.kept && <p className="hint">Записи голоса и журналы — {fmtBytes(info.kept)}, не удаляются.</p>}
      {note && <p className="hint" data-testid="cache-note">{note}</p>}
    </section>
  );
}

function iconNote(windows?: boolean, shortcuts?: number): string {
  if (!windows) return 'Значок окна поменялся.';
  if (!shortcuts) return 'Значок окна поменялся. Ярлыков Kadro не нашлось или у них уже этот значок.';
  return `Готово: поменял значок у ярлыков (${shortcuts}). Если на рабочем столе ещё старый — нажми на нём F5.`;
}
