import { FolderOpen, FilePlus2, Save, Upload } from 'lucide-react';
import { newProjectAction, openProject, saveProject } from '../actions';
import { renameProject } from '../../shared/timeline';
import { useStore } from '../store';

export function TopBar() {
  const name = useStore((s) => s.project.name);
  const dirty = useStore((s) => s.dirty);
  const path = useStore((s) => s.projectPath);
  const commit = useStore((s) => s.commit);
  const setExportOpen = useStore((s) => s.setExportOpen);
  return (
    <header className="topbar">
      <div className="logo"><span className="logo-mark" />Kadro</div>
      <input
        className="project-name" value={name} aria-label="Название проекта" data-testid="project-name"
        onChange={(e) => commit((p) => renameProject(p, e.target.value), 'rename')}
      />
      <span className="saved-state">{dirty ? (path ? 'Есть несохранённые изменения' : 'Черновик сохраняется автоматически') : path ? 'Сохранено' : ''}</span>
      <div className="spacer" />
      <button className="icon-btn" title="Новый проект" onClick={() => { if (!dirty || confirm('Начать новый проект? Несохранённые изменения останутся только в черновике.')) newProjectAction(); }}><FilePlus2 size={17} /></button>
      <button className="icon-btn" title="Открыть проект" onClick={() => void openProject()}><FolderOpen size={17} /></button>
      <button className="icon-btn" title="Сохранить проект (Ctrl+S)" onClick={() => void saveProject()}><Save size={17} /></button>
      <button className="btn primary" data-testid="export-open" onClick={() => setExportOpen(true)}><Upload size={15} />Экспорт</button>
    </header>
  );
}
