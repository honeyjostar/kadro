// Библиотека во вкладке «Медиа»: папки с видео, фото и музыкой, добавленные один раз, — в любом проекте.
// Внутри: подпапки, превью, поиск, фильтр; файл берётся в проект двойным кликом, кнопкой «+» или перетаскиванием на таймлайн.
import { AudioLines, ChevronRight, Film, Folder, FolderPlus, Image as ImageIcon, Plus, Search, WandSparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LibFile, LibFolder, LibListing, LibMeta } from '../../shared/ipc';
import { placeLibraryFiles } from '../actions';
import { api, getState, useStore } from '../store';
import { fmtDur, plural } from '../util';
import { Seg } from './controls';

type Filter = 'all' | 'video' | 'image' | 'audio';
type Sort = 'name' | 'new';

// где пользователь был в библиотеке — сохраняется при переключении вкладок
const memo: { root: string | null; dir: string | null; filter: Filter; sort: Sort } = { root: null, dir: null, filter: 'all', sort: 'name' };
const metaCache = new Map<string, LibMeta>();

const files = (n: number) => `${n} ${plural(n, 'файл', 'файла', 'файлов')}`;

export function LibraryView() {
  const [folders, setFolders] = useState<LibFolder[] | null>(null);
  const [root, setRoot] = useState<string | null>(memo.root);
  const [dir, setDir] = useState<string | null>(memo.dir);
  const [listing, setListing] = useState<LibListing | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<LibFile[] | null>(null);
  const [filter, setFilter] = useState<Filter>(memo.filter);
  const [sort, setSort] = useState<Sort>(memo.sort);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const assets = useStore((s) => s.project.assets);
  const inProject = useMemo(() => new Set(assets.filter((a) => !a.derived).map((a) => a.path)), [assets]);
  const jump = useStore((s) => s.libJump);

  useEffect(() => { void api.libFolders().then(setFolders); }, []);
  useEffect(() => { Object.assign(memo, { root, dir, filter, sort }); }, [root, dir, filter, sort]);
  // папку бросили в окно — сразу открываем её
  useEffect(() => {
    if (!jump) return;
    getState().setLibJump(null);
    void api.libFolders().then((f) => { setFolders(f); const hit = f.find((x) => x.path === jump || jump.startsWith(x.path)); if (hit) open(hit.path, jump); });
  }, [jump]);
  useEffect(() => {
    if (!dir) { setListing(null); return; }
    let alive = true;
    void api.libList(dir).then((l) => { if (alive) setListing(l); });
    return () => { alive = false; };
  }, [dir]);
  useEffect(() => {
    if (!root || !query.trim()) { setFound(null); return; }
    const id = setTimeout(() => void api.libSearch(root, query).then(setFound), 220);
    return () => clearTimeout(id);
  }, [root, query]);

  const open = (r: string, d = r) => { setRoot(r); setDir(d); setQuery(''); setSel([]); };
  const add = async () => {
    const before = new Set((folders ?? []).map((f) => f.path));
    const next = await api.libAdd();
    setFolders(next);
    const added = next.find((f) => !before.has(f.path));
    if (added) open(added.path);
  };
  const remove = async (p: string) => { setFolders(await api.libRemove(p)); if (root === p) { setRoot(null); setDir(null); } };
  const place = async (paths: string[]) => {
    setBusy(true);
    try { await placeLibraryFiles(paths); } finally { setBusy(false); }
  };

  /** Окно «Авто-ролик» с файлами из библиотеки: видео и фото по порядку, музыка — первая из этих файлов. */
  const autoFrom = (fs: LibFile[]) => getState().setAutoOpen({
    files: fs.filter((f) => f.kind !== 'audio').map((f) => f.path),
    music: fs.find((f) => f.kind === 'audio')?.path ?? null,
    fresh: false,
  });
  const list = useMemo(() => {
    const src = found ?? listing?.files ?? [];
    const f = src.filter((x) => filter === 'all' || x.kind === filter);
    return sort === 'new' ? [...f].sort((a, b) => b.mtime - a.mtime) : f;
  }, [found, listing, filter, sort]);

  // ---------- список папок ----------
  if (!root || !dir) {
    return (
      <div className="lib" data-testid="library">
        <button className="btn primary block" onClick={() => void add()} data-testid="lib-add"><FolderPlus size={15} />Добавить папку</button>
        <p className="hint small lib-note">Папки со съёмками, футажами и музыкой, которые нужны во многих проектах. Добавь один раз — они будут здесь всегда. Файлы не копируются. Можно просто перетащить папку в окно.</p>
        {folders && folders.length > 0 && (
          <div className="lib-folders">
            {folders.map((f) => (
              <div key={f.path} className={`lib-folder ${f.exists ? '' : 'missing'}`} title={f.path}>
                <button className="lib-folder-open" disabled={!f.exists} onClick={() => open(f.path)} data-testid="lib-folder">
                  <Folder size={18} />
                  <span className="lib-folder-text">
                    <b>{f.name}</b>
                    <span className="hint small">{f.exists ? (f.count >= 5000 ? 'больше 5000 файлов' : files(f.count)) : 'папка не найдена — её переместили или удалили'}</span>
                  </span>
                  {f.exists && <ChevronRight size={15} />}
                </button>
                <button className="icon-btn" title="Убрать из библиотеки (файлы останутся на диске)" onClick={() => void remove(f.path)}><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------- внутри папки ----------
  const rootName = folders?.find((f) => f.path === root)?.name ?? root.split(/[\\/]/).pop();
  const sep = root.includes('\\') ? '\\' : '/';
  const crumbs = [{ name: rootName ?? '', path: root }];
  for (const seg of dir.slice(root.length).split(/[\\/]/).filter(Boolean)) crumbs.push({ name: seg, path: crumbs[crumbs.length - 1].path + sep + seg });
  const searching = found !== null;
  return (
    <div className="lib" data-testid="library">
      <nav className="lib-crumbs" aria-label="Где ты в библиотеке">
        <button onClick={() => { setRoot(null); setDir(null); }} data-testid="lib-home">Библиотека</button>
        {crumbs.map((c, i) => (
          <span key={c.path} className="lib-crumb">
            <ChevronRight size={12} />
            <button disabled={i === crumbs.length - 1} onClick={() => { setDir(c.path); setQuery(''); }}>{c.name}</button>
          </span>
        ))}
      </nav>
      <label className="lib-search">
        <Search size={14} />
        <input className="input" placeholder={`Найти в «${rootName}»`} value={query} onChange={(e) => setQuery(e.target.value)} data-testid="lib-search" />
        {query && <button className="icon-btn" title="Очистить" onClick={() => setQuery('')}><X size={13} /></button>}
      </label>
      <div className="lib-tools">
        <Seg value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Все' }, { value: 'video', label: 'Видео' }, { value: 'image', label: 'Фото' }, { value: 'audio', label: 'Звук' }]} />
      </div>
      {listing?.error && <p className="hint">{listing.error}</p>}
      {!searching && listing && listing.dirs.length > 0 && (
        <div className="lib-subdirs">
          {listing.dirs.map((d) => (
            <button key={d.path} className="lib-subdir" onClick={() => { setDir(d.path); setSel([]); }} data-testid="lib-subdir">
              <Folder size={15} /><span className="ellipsis">{d.name}</span><span className="hint small">{d.count || ''}</span>
            </button>
          ))}
        </div>
      )}
      {list.filter((f) => f.kind !== 'audio').length > 1 && (
        <button className="btn small block lib-auto" title="Собрать ролик из видео и фото этой папки — под музыку из неё, если есть" onClick={() => autoFrom(list)} data-testid="lib-auto">
          <WandSparkles size={13} />Авто-ролик из этой папки
        </button>
      )}
      <div className="lib-head">
        <span className="hint small">{searching ? `Найдено: ${found!.length}${found!.length >= 400 ? ' (первые 400)' : ''}` : files(list.length)}</span>

        <select className="lib-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} title="Порядок файлов" data-testid="lib-sort">
          <option value="name">По имени</option>
          <option value="new">Сначала новые</option>
        </select>
      </div>
      <div className="media-grid lib-grid">
        {list.map((f) => (
          <LibTile key={f.path} f={f} used={inProject.has(f.path)} selected={sel.includes(f.path)} sel={sel}
            onSelect={(multi) => setSel(multi ? (sel.includes(f.path) ? sel.filter((x) => x !== f.path) : [...sel, f.path]) : [f.path])}
            onPlace={() => void place(sel.includes(f.path) && sel.length > 1 ? sel : [f.path])} />
        ))}
      </div>
      {listing && !list.length && !listing.error && (
        <p className="hint">{searching ? 'Ничего не нашлось.' : filter === 'all' ? 'Здесь нет видео, фото и музыки — загляни в подпапки.' : 'Таких файлов здесь нет.'}</p>
      )}
      <p className="hint small" style={{ marginTop: 10 }}>Двойной клик или «+» — на таймлайн к курсору. Можно перетащить на нужную дорожку. С Ctrl — выбрать несколько.</p>
      {sel.length > 1 && (
        <div className="lib-bar">
          <span>Выбрано: {sel.length}</span>
          <button className="btn small" onClick={() => setSel([])}>Снять</button>
          <button className="btn small" onClick={() => autoFrom(list.filter((f) => sel.includes(f.path)))} title="Собрать ролик из выбранных файлов" data-testid="lib-auto-sel"><WandSparkles size={13} />Авто-ролик</button>
          <button className="btn primary small" disabled={busy} onClick={() => void place(sel)} data-testid="lib-place">На таймлайн</button>
        </div>
      )}
    </div>
  );
}

function LibTile({ f, used, selected, sel, onSelect, onPlace }: {
  f: LibFile; used: boolean; selected: boolean; sel: string[]; onSelect: (multi: boolean) => void; onPlace: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [meta, setMeta] = useState<LibMeta | undefined>(() => metaCache.get(f.path));
  useEffect(() => {
    if (meta) return;
    const el = ref.current;
    if (!el) return;
    // превью делаем, только когда плитка видна
    const io = new IntersectionObserver((ents) => {
      if (!ents.some((x) => x.isIntersecting)) return;
      io.disconnect();
      void api.libMeta(f.path).then((m) => { metaCache.set(f.path, m); setMeta(m); });
    });
    io.observe(el);
    return () => io.disconnect();
  }, [f.path, meta]);
  const icon = f.kind === 'audio' ? <AudioLines size={22} /> : f.kind === 'image' ? <ImageIcon size={22} /> : <Film size={22} />;
  const badge = meta?.broken ? 'Не открывается' : f.kind === 'image' ? 'Фото' : meta?.duration ? fmtDur(meta.duration) : '';
  return (
    <div
      ref={ref} className={`media-item lib-item ${selected ? 'selected' : ''} ${meta?.broken ? 'missing' : ''}`} draggable title={f.path} data-testid="lib-file"
      onClick={(e) => onSelect(e.ctrlKey || e.metaKey || e.shiftKey)}
      onDoubleClick={onPlace}
      onDragStart={(e) => {
        const paths = selected && sel.length > 1 ? sel : [f.path];
        e.dataTransfer.setData('application/x-kadro-paths', JSON.stringify(paths));
        e.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <div className="media-thumb" style={meta?.thumb ? { backgroundImage: `url("${api.mediaUrl(meta.thumb)}")` } : undefined}>
        {!meta?.thumb && icon}
      </div>
      {used && <span className="used-dot" title="Уже в проекте" />}
      <div className="media-actions">
        <button title="На таймлайн к курсору" onClick={(e) => { e.stopPropagation(); onPlace(); }} data-testid="lib-file-add"><Plus size={14} /></button>
      </div>
      <div className="media-meta"><span className="name">{f.name}</span><span className="dur">{badge}</span></div>
    </div>
  );
}
