// «Мои проекты» на главном экране — как в CapCut: обложки, поиск, порядок, переименовать, копия,
// показать в папке, убрать из списка, удалить в корзину (правая кнопка мыши или «⋯»).
import { Copy, FolderOpen, MoreHorizontal, PencilLine, Play, Search, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RecentProject } from '../../shared/ipc';
import { filterProjects, type ProjectSort } from '../../shared/projects';
import { renameProject } from '../../shared/timeline';
import { openRecent } from '../actions';
import { api, getState, useStore } from '../store';
import { fmtDur } from '../util';
import { useMenu } from './Menu';

const FIRST = 12;

export function when(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `сегодня в ${hm}`;
  if (diff === 1) return `вчера в ${hm}`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function ProjectsSection({ list, busy, run, reload }: {
  list: RecentProject[]; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<void>; reload: () => void;
}) {
  const hasClips = useStore((s) => s.project.tracks.some((t) => t.clips.length > 0));
  const currentName = useStore((s) => s.project.name);
  const currentPath = useStore((s) => s.projectPath);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ProjectSort>('date');
  const [all, setAll] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const others = list.filter((r) => r.path !== currentPath);
  const shown = filterProjects(others, query, sort);
  const visible = all || query ? shown : shown.slice(0, FIRST);
  if (!hasClips && !others.length) return null;

  const toast = (t: string, kind?: 'ok' | 'err') => getState().toast(t, kind);
  const rename = async (r: RecentProject, name: string) => {
    setRenaming(null);
    if (!name.trim() || name.trim() === r.name) return;
    const res = await api.renameProjectFile(r.path, name);
    if ('error' in res) { toast(res.error, 'err'); return; }
    toast('Проект переименован', 'ok');
    reload();
  };
  const duplicate = async (r: RecentProject) => {
    const res = await api.duplicateProject(r.path);
    if ('error' in res) toast(res.error, 'err'); else { toast('Копия проекта готова', 'ok'); reload(); }
  };
  const trash = async (r: RecentProject) => {
    if (!confirm(`Удалить проект «${r.name}»? Файл проекта уйдёт в корзину Windows (видео и фото останутся на месте).`)) return;
    const res = await api.trashProject(r.path);
    if ('error' in res) toast(res.error, 'err'); else { toast('Проект в корзине', 'ok'); reload(); }
  };
  const forget = (r: RecentProject) => { api.forgetRecent(r.path); reload(); };

  return (
    <section className="home-section" data-testid="projects">
      <div className="home-section-head">
        <h2>Мои проекты</h2>
        {others.length > 0 && <span className="hint">{others.length + (hasClips ? 1 : 0)}</span>}
        <div className="spacer" />
        {others.length > 4 && (
          <>
            <label className="proj-search">
              <Search size={14} />
              <input className="input" placeholder="Найти проект" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="projects-search" />
              {query && <button className="icon-btn" onClick={() => setQuery('')} title="Очистить"><X size={13} /></button>}
            </label>
            <select className="input proj-sort" value={sort} onChange={(e) => setSort(e.target.value as ProjectSort)} data-testid="projects-sort" title="Порядок">
              <option value="date">Сначала новые</option>
              <option value="name">По названию</option>
            </select>
          </>
        )}
      </div>
      <div className="home-recent proj-grid" data-testid="home-recent">
        {hasClips && !query && <CurrentCard name={currentName} />}
        {visible.map((r) => (
          <ProjectCard key={r.path} r={r} disabled={busy} renaming={renaming === r.path}
            onOpen={() => void run(() => openRecent(r.path))}
            onRename={() => setRenaming(r.path)} onRenameDone={(n) => void rename(r, n)} onRenameCancel={() => setRenaming(null)}
            onDuplicate={() => void duplicate(r)} onTrash={() => void trash(r)} onForget={() => forget(r)} />
        ))}
      </div>
      {query && !shown.length && <p className="hint">Ничего не нашлось.</p>}
      {!query && shown.length > FIRST && (
        <button className="btn ghost proj-more" onClick={() => setAll(!all)} data-testid="projects-all">
          {all ? 'Свернуть' : `Показать все (${shown.length})`}
        </button>
      )}
    </section>
  );
}

function CurrentCard({ name }: { name: string }) {
  const [edit, setEdit] = useState(false);
  return (
    <div className="recent-card now">
      <button className="recent-open" onClick={() => getState().setHome(false)} data-testid="project-current" aria-label={`Вернуться к проекту «${name}»`}>
        <span className="recent-thumb now"><Play size={20} fill="currentColor" /></span>
      </button>
      {edit
        ? <NameInput value={name} onDone={(n) => { setEdit(false); if (n.trim()) getState().commit((p) => renameProject(p, n.trim()), 'rename'); }} onCancel={() => setEdit(false)} />
        : <b className="proj-name" onDoubleClick={() => setEdit(true)} title="Двойной щелчок — переименовать">{name}</b>}
      <span className="hint small proj-meta">открыт сейчас</span>
    </div>
  );
}

function ProjectCard({ r, disabled, renaming, onOpen, onRename, onRenameDone, onRenameCancel, onDuplicate, onTrash, onForget }: {
  r: RecentProject; disabled: boolean; renaming: boolean;
  onOpen: () => void; onRename: () => void; onRenameDone: (name: string) => void; onRenameCancel: () => void;
  onDuplicate: () => void; onTrash: () => void; onForget: () => void;
}) {
  const menu = useMenu();
  const items = () => [
    { label: 'Открыть', icon: <Play size={14} />, onClick: onOpen, testId: 'proj-open' },
    { label: 'Переименовать', icon: <PencilLine size={14} />, onClick: onRename, testId: 'proj-rename' },
    { label: 'Копия проекта', icon: <Copy size={14} />, onClick: onDuplicate, testId: 'proj-copy' },
    { label: 'Показать в папке', icon: <FolderOpen size={14} />, onClick: () => api.showInFolder(r.path), testId: 'proj-folder' },
    'sep' as const,
    { label: 'Убрать из списка', hint: 'файл останется', icon: <X size={14} />, onClick: onForget, testId: 'proj-forget' },
    { label: 'Удалить в корзину', icon: <Trash2 size={14} />, onClick: onTrash, danger: true, testId: 'proj-trash' },
  ];
  const ratio = r.aspect && /^\d+:\d+$/.test(r.aspect) ? r.aspect.replace(':', ' / ') : '16 / 9';
  return (
    <div className="recent-card" title={r.path} data-testid="project-card" onContextMenu={(e) => menu.open(e, items())}>
      <button className="recent-open" disabled={disabled} onClick={onOpen} aria-label={`Открыть «${r.name}»`}>
        <span className="recent-thumb" style={r.thumb ? { backgroundImage: `url("${api.mediaUrl(r.thumb)}")` } : undefined}>
          {!r.thumb && <span className="proj-shape" style={{ aspectRatio: ratio }} />}
          {r.duration > 0 && <span className="proj-dur">{fmtDur(r.duration)}</span>}
          {r.draft && <span className="proj-tag">черновик</span>}
        </span>
      </button>
      {renaming
        ? <NameInput value={r.name} onDone={onRenameDone} onCancel={onRenameCancel} />
        : <b className="proj-name" onDoubleClick={onRename} title="Двойной щелчок — переименовать">{r.name}</b>}
      <span className="hint small proj-meta">{when(r.mtime)}{r.aspect ? `, ${r.aspect}` : ''}</span>
      <button className="recent-forget proj-more-btn" onClick={(e) => menu.open(e, items())} title="Переименовать, копия, удалить…" aria-label="Действия с проектом" data-testid="project-more">
        <MoreHorizontal size={14} />
      </button>
      {menu.node}
    </div>
  );
}

function NameInput({ value, onDone, onCancel }: { value: string; onDone: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const finish = (ok: boolean) => { if (finished.current) return; finished.current = true; if (ok) onDone(v); else onCancel(); };
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input ref={ref} className="input proj-rename" value={v} onChange={(e) => setV(e.target.value)} data-testid="project-rename-input"
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); }}
      onBlur={() => finish(true)} maxLength={120} aria-label="Название проекта" />
  );
}
