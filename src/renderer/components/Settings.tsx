// Окно «Настройки»: тема, цвет акцента, значок программы (окно и ярлыки Windows), размер интерфейса,
// своё оформление (custom.css и theme.json в папке данных — подхватываются на лету).
import { BookOpen, FolderOpen, ImagePlus, Settings as Gear, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ACCENTS, APP_ICONS, UI_SCALES, type Appearance } from '../../shared/appearance';
import { api, getState, useStore } from '../store';
import { Seg, Toggle } from './controls';
import { LogoMark } from './Home';

export function SettingsDialog() {
  const a = useStore((s) => s.appearance);
  const themePref = useStore((s) => s.themePref);
  const custom = useStore((s) => s.customStatus);
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
      </div>
    </div>
  );
}

function iconNote(windows?: boolean, shortcuts?: number): string {
  if (!windows) return 'Значок окна поменялся.';
  if (!shortcuts) return 'Значок окна поменялся. Ярлыков Kadro не нашлось или у них уже этот значок.';
  return `Готово: поменял значок у ярлыков (${shortcuts}). Если на рабочем столе ещё старый — нажми на нём F5.`;
}
