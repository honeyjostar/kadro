// Раздел «Гифки»: свои гифки, мемы и короткие ролики для монтажа. Загрузить файлы (копии остаются в Kadro) или
// подключить папку; наведи — гифка играет, нажми — встаёт поверх видео у курсора (по кругу, растягивается за край).
import { tx } from '../../shared/i18n';
import { txj } from '../txj';
import { FolderOpen, FolderPlus, ImagePlay, Search, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { GifList, LibMeta } from '../../shared/ipc';
import { addLogoSpin, placeLibraryFiles } from '../actions';
import { api, getState } from '../store';
import logoSpinGif from '../assets/kadro-spin.gif';

type GifFile = GifList['files'][number];

export function GifsPanel() {
  const [list, setList] = useState<GifList | null>(null);
  const [folder, setFolder] = useState<string | 'all'>('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const refresh = () => void api.gifsList().then(setList);
  useEffect(refresh, []);
  const upload = async (paths?: string[]) => {
    const n = await api.gifsAdd(paths ?? null);
    if (n) getState().toast(tx('Загружено гифок: {0}', n), 'ok');
    refresh();
  };
  const connect = async () => setList(await api.gifsAddFolder(null));
  const files = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list?.files ?? []).filter((f) => (folder === 'all' || f.folder === folder) && (!s || f.name.toLowerCase().includes(s)));
  }, [list, folder, q]);
  const put = async (f: GifFile) => {
    setBusy(true);
    try { await placeLibraryFiles([f.path], { mode: 'overlay' }); api.track('sticker'); } finally { setBusy(false); }
  };
  const own = list?.folders.find((x) => x.own);
  return (
    <>
      <div className="panel-head">{tx('Гифки')}</div>
      <div className={`panel-body gifs-panel ${over ? 'drop-over' : ''}`} data-testid="gifs-panel"
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void upload([...e.dataTransfer.files].map((x) => api.pathForFile(x)).filter(Boolean)); }}>
        <div className="row-btns">
          <button className="btn primary small" onClick={() => void upload()} data-testid="gifs-upload"><Upload size={13} />{tx('Загрузить гифки…')}</button>
          <button className="btn small" onClick={() => void connect()} data-testid="gifs-folder-add"><FolderPlus size={13} />{tx('Подключить папку…')}</button>
        </div>
        <p className="hint small">{tx('Мемы, реакции и моменты для монтажа: GIF, WebP, WebM, MP4. Перетащи файлы сюда или загрузи кнопкой. Нажми на гифку — она встанет поверх видео у курсора и будет играть по кругу.')}</p>

        <div className="chips gif-folders">
          <button className={folder === 'all' ? 'active' : ''} onClick={() => setFolder('all')}>{txj('Все {0}', list?.files.length ?? '')}</button>
          {list?.folders.map((f) => (
            <span key={f.path} className={`chip-wrap ${folder === f.path ? 'active' : ''}`}>
              <button className={folder === f.path ? 'active' : ''} onClick={() => setFolder(f.path)} title={f.path} data-testid="gifs-folder">{f.own ? tx('Загруженные') : f.name}{!f.exists && ' ⚠'}</button>
              {!f.own && <button className="chip-x" title={tx('Отключить папку (файлы останутся на месте)')} onClick={() => { void api.gifsRemoveFolder(f.path).then(setList); if (folder === f.path) setFolder('all'); }}><X size={11} /></button>}
            </span>
          ))}
        </div>
        {(list?.files.length ?? 0) > 12 && (
          <label className="catalog-search gif-search"><Search size={14} />
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('Найти по имени файла')} data-testid="gifs-search" />
          </label>
        )}

        <div className="gif-grid" data-testid="gifs-grid">
          <button className="gif-tile builtin" onClick={() => void addLogoSpin()} title={tx('Лого Kadro крутится — в угол кадра')} data-testid="gif-kadro">
            <img src={logoSpinGif} alt="" />
            <span className="gif-name">{tx('Лого Kadro')}</span>
          </button>
          {files.map((f) => <GifTile key={f.path} f={f} busy={busy} own={!!own && f.folder === own.path} onPut={() => void put(f)} onRemove={() => void api.gifsRemove(f.path).then(refresh)} />)}
        </div>
        {list && !list.files.length && (
          <div className="gif-empty"><ImagePlay size={22} /><span>{tx('Здесь пока только лого Kadro. Загрузи свои гифки или подключи папку с ними.')}</span></div>
        )}
        {own && <button className="btn ghost small" onClick={() => void api.gifsOpen()} style={{ marginTop: 10 }}><FolderOpen size={13} />{tx('Открыть папку загруженных')}</button>}
      </div>
    </>
  );
}

function GifTile({ f, busy, own, onPut, onRemove }: { f: GifFile; busy: boolean; own: boolean; onPut: () => void; onRemove: () => void }) {
  const [meta, setMeta] = useState<LibMeta | null>(null);
  const [hover, setHover] = useState(false);
  useEffect(() => { let on = true; void api.gifsMeta(f.path).then((m) => { if (on) setMeta(m); }); return () => { on = false; }; }, [f.path]);
  const url = api.mediaUrl(f.path);
  const thumb = meta?.thumb ? api.mediaUrl(meta.thumb) : null;
  return (
    <div className="gif-tile" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} data-testid="gif-tile">
      <button className="gif-hit" disabled={busy} onClick={onPut} title={tx('{0} — поверх видео у курсора', f.name)}
        draggable onDragStart={(e) => { e.dataTransfer.setData('application/x-kadro-paths', JSON.stringify([f.path])); e.dataTransfer.effectAllowed = 'copy'; }}>
        {hover
          ? (f.kind === 'video' ? <video src={url} muted loop autoPlay playsInline /> : <img src={url} alt="" />)
          : thumb ? <img src={thumb} alt="" /> : <span className="gif-ph"><ImagePlay size={18} /></span>}
        <span className="gif-name">{f.name.replace(/\.\w+$/, '')}</span>
      </button>
      {own && hover && <button className="gif-del" title={tx('Удалить из загруженных')} onClick={onRemove}><Trash2 size={12} /></button>}
    </div>
  );
}
