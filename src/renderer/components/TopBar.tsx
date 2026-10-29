import { tx } from '../../shared/i18n';
import { FolderOpen, FilePlus2, House, Monitor, Moon, Save, Settings, Sun, Upload } from 'lucide-react';
import type { ThemePref } from '../../shared/ipc';
import type { ReactNode } from 'react';
import { newProjectAction, openProject, saveProject } from '../actions';
import { renameProject } from '../../shared/timeline';
import { getState, useStore } from '../store';
import { LogoMark } from './Home';

export const THEMES: Record<ThemePref, { label: string; short: string; icon: ReactNode; next: ThemePref }> = {
  dark: { label: tx('Тёмная тема'), short: tx('Тёмная'), icon: <Moon size={15} />, next: 'light' },
  light: { label: tx('Светлая тема'), short: tx('Светлая'), icon: <Sun size={15} />, next: 'system' },
  system: { label: tx('Тема как в Windows'), short: tx('Как в Windows'), icon: <Monitor size={15} />, next: 'dark' },
};

export function TopBar() {
  const name = useStore((s) => s.project.name);
  const dirty = useStore((s) => s.dirty);
  const path = useStore((s) => s.projectPath);
  const commit = useStore((s) => s.commit);
  const setExportOpen = useStore((s) => s.setExportOpen);
  const setHome = useStore((s) => s.setHome);
  const themePref = useStore((s) => s.themePref);
  const setThemePref = useStore((s) => s.setThemePref);
  const th = THEMES[themePref];
  return (
    <header className="topbar">
      <button className="logo logo-btn" onClick={() => setHome(true)} title={tx('Главный экран: новый проект, мои проекты, демо, шаблоны')}><LogoMark />Kadro</button>
      <button className="btn ghost small" onClick={() => setHome(true)} data-testid="home-open-btn"><House size={14} />{tx('Главная')}</button>
      <input
        className="project-name" value={name} aria-label={tx('Название проекта')} data-testid="project-name"
        onChange={(e) => commit((p) => renameProject(p, e.target.value), 'rename')}
      />
      <span className="saved-state">{dirty ? (path ? tx('Есть несохранённые изменения') : tx('Черновик сохраняется автоматически')) : path ? tx('Сохранено') : ''}</span>
      <div className="spacer" />
      <button className="btn ghost small" title={tx('{0}. Нажми, чтобы переключить: тёмная → светлая → как в Windows', th.label)}
        onClick={() => setThemePref(th.next)} data-testid="theme-btn">{th.icon}{th.short}</button>
      <button className="icon-btn" title={tx('Настройки: тема, цвет акцента, значок программы, размер интерфейса, своё оформление')} onClick={() => getState().setSettingsOpen(true)} data-testid="topbar-settings"><Settings size={16} /></button>
      <button className="btn ghost small" title={tx('Новый пустой проект. Текущий не пропадёт — он останется в «Моих проектах»')} onClick={() => void newProjectAction()}><FilePlus2 size={15} />{tx('Новый')}</button>
      <button className="btn ghost small" title={tx('Открыть проект .kadro или добавить видео, фото, звук')} onClick={() => void openProject()}><FolderOpen size={15} />{tx('Открыть')}</button>
      <button className="btn ghost small" title={tx('Сохранить проект (Ctrl+S)')} onClick={() => void saveProject()}><Save size={15} />{tx('Сохранить')}</button>
      <button className="btn primary" data-testid="export-open" onClick={() => setExportOpen(true)}><Upload size={15} />{tx('Экспорт')}</button>
    </header>
  );
}
