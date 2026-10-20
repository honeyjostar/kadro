import { FolderOpen, FilePlus2, House, Save, Upload } from 'lucide-react';
import { newProjectAction, openProject, saveProject } from '../actions';
import { renameProject } from '../../shared/timeline';
import { useStore } from '../store';
import { LogoMark } from './Home';

export function TopBar() {
  const name = useStore((s) => s.project.name);
  const dirty = useStore((s) => s.dirty);
  const path = useStore((s) => s.projectPath);
  const commit = useStore((s) => s.commit);
  const setExportOpen = useStore((s) => s.setExportOpen);
  const setHome = useStore((s) => s.setHome);
  return (
    <header className="topbar">
      <button className="logo logo-btn" onClick={() => setHome(true)} title="Главный экран: новый проект, недавние, демо, шаблоны"><LogoMark />Kadro</button>
      <button className="btn ghost small" onClick={() => setHome(true)} data-testid="home-open-btn"><House size={14} />Главная</button>
      <input
        className="project-name" value={name} aria-label="Название проекта" data-testid="project-name"
        onChange={(e) => commit((p) => renameProject(p, e.target.value), 'rename')}
      />
      <span className="saved-state">{dirty ? (path ? 'Есть несохранённые изменения' : 'Черновик сохраняется автоматически') : path ? 'Сохранено' : ''}</span>
      <div className="spacer" />
      <button className="btn ghost small" title="Новый пустой проект. Текущий не пропадёт — он останется в «Недавних»" onClick={() => void newProjectAction()}><FilePlus2 size={15} />Новый</button>
      <button className="btn ghost small" title="Открыть файл проекта .kadro" onClick={() => void openProject()}><FolderOpen size={15} />Открыть</button>
      <button className="btn ghost small" title="Сохранить проект (Ctrl+S)" onClick={() => void saveProject()}><Save size={15} />Сохранить</button>
      <button className="btn primary" data-testid="export-open" onClick={() => setExportOpen(true)}><Upload size={15} />Экспорт</button>
    </header>
  );
}
