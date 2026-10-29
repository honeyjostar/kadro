// Окно «Каталог плагинов»: переходы и эффекты сообщества из репозитория Kadro на GitHub — с живым превью
// (наведи — играет), установкой в один щелчок, обновлением и удалением. Свой файл .glsl — кнопкой или
// перетаскиванием в окно Kadro.
import { BookOpen, Check, Download, FileUp, Puzzle, RefreshCw, Search, Trash2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { pluginDef } from '../../shared/gl/glsl';
import type { CatalogItem, InstallResult } from '../../shared/pluginCatalog';
import { glPlugins, useGlCatalog } from '../glRegistry';
import { drawPreview } from '../pluginPreview';
import { api, getState } from '../store';
import { Seg } from './controls';

type Kind = 'all' | 'transition' | 'effect';

/** Итог установки — во всплывающие сообщения. */
export function reportInstall(r: InstallResult): void {
  const s = getState();
  for (const it of r.installed) s.toast(`«${it.name}» установлен — ${it.kind === 'transition' ? '«Переходы»' : '«Эффекты»'} → «Плагины»`, 'ok');
  for (const e of r.errors) s.toast(`Плагин не установлен: ${e}`, 'err');
}

export function PluginCatalog() {
  useGlCatalog();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const close = () => getState().setPluginCatalogOpen(false);
  const load = () => {
    setItems(null); setError('');
    void api.pluginCatalog().then((r) => { if (r.ok) setItems(r.items); else { setItems([]); setError(r.error ?? 'Каталог не загрузился'); } });
  };
  useEffect(load, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const installedSrc = new Map(glPlugins().map((d) => [d.id, d]));
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? []).filter((it) => (kind === 'all' || it.kind === kind)
      && (!s || [it.name, it.description ?? '', it.author ?? '', ...it.tags].some((x) => x.toLowerCase().includes(s))));
  }, [items, kind, q]);

  const install = async (it: CatalogItem) => {
    setBusy(it.id);
    const r = await api.installPlugins([it.id]);
    setBusy(null);
    reportInstall(r);
    if (r.installed.length) setItems((cur) => cur?.map((x) => (x.id === it.id ? { ...x, state: 'installed' } : x)) ?? cur);
  };
  const remove = async (it: CatalogItem) => {
    const def = installedSrc.get(`plug:${it.id}`);
    if (!def?.source) return;
    setBusy(it.id);
    const ok = await api.removePlugin(def.source);
    setBusy(null);
    if (ok) { setItems((cur) => cur?.map((x) => (x.id === it.id ? { ...x, state: 'new' } : x)) ?? cur); getState().toast(`«${it.name}» удалён`, 'info'); }
  };
  const fromFile = async () => reportInstall(await api.pickPluginFiles());

  const counts = { all: items?.length ?? 0, transition: items?.filter((x) => x.kind === 'transition').length ?? 0, effect: items?.filter((x) => x.kind === 'effect').length ?? 0 };

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal catalog-modal" role="dialog" aria-label="Каталог плагинов" data-testid="plugin-catalog">
        <div className="modal-head">
          <h3><Puzzle size={17} />Каталог плагинов</h3>
          <button className="icon-btn" onClick={close} title="Закрыть"><X size={17} /></button>
        </div>
        <p className="hint">
          Переходы и эффекты от сообщества Kadro. Наведи на карточку — превью заиграет. Установленные появляются
          в «Переходах» и «Эффектах» → «Плагины».
        </p>
        <div className="catalog-bar">
          <Seg value={kind} onChange={setKind} options={[
            { value: 'all', label: `Все ${counts.all || ''}`.trim() }, { value: 'transition', label: `Переходы ${counts.transition || ''}`.trim() }, { value: 'effect', label: `Эффекты ${counts.effect || ''}`.trim() },
          ]} />
          <label className="catalog-search"><Search size={14} />
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти: свет, ретро, сдвиг…" data-testid="catalog-search" />
          </label>
        </div>

        {items === null && <p className="hint catalog-state" data-testid="catalog-loading">Загружаю каталог…</p>}
        {error && (
          <div className="warn" data-testid="catalog-error"><TriangleAlert size={15} />
            <span>Каталог не загрузился: {error}. Проверь интернет — или поставь плагин из файла .glsl.</span>
            <button className="btn small" onClick={load}><RefreshCw size={13} />Повторить</button>
          </div>
        )}
        {items && !error && shown.length === 0 && <p className="hint catalog-state">Ничего не нашлось.</p>}

        <div className="catalog-grid">
          {shown.map((it) => <Card key={it.id} it={it} busy={busy === it.id} onInstall={() => void install(it)} onRemove={() => void remove(it)} />)}
        </div>

        <div className="catalog-foot">
          <button className="btn small" onClick={() => void fromFile()} data-testid="catalog-from-file"><FileUp size={13} />Установить из файла…</button>
          <button className="btn ghost small" onClick={() => api.openDocs('plugins')}><BookOpen size={13} />Как сделать свой и прислать в каталог</button>
        </div>
      </div>
    </div>
  );
}

function Card({ it, busy, onInstall, onRemove }: { it: CatalogItem; busy: boolean; onInstall: () => void; onRemove: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [broken, setBroken] = useState(false);
  const def = useMemo(() => pluginDef(it.kind, `catalog-${it.file.split('/')[1]}`, it.src).def, [it]);
  const hover = useRef(false);
  useEffect(() => {
    if (!def || !ref.current) return;
    setBroken(!drawPreview(def, ref.current, 0.5, 0.6));
  }, [def]);
  const play = () => {
    if (!def || !ref.current) return;
    hover.current = true;
    const t0 = performance.now();
    const step = (now: number) => {
      if (!hover.current || !ref.current) return;
      const t = (now - t0) / 1000;
      // переход: 1,6 с играет, 0,5 с стоит на следующем кадре; эффект — просто идёт время
      const cyc = t % 2.1;
      drawPreview(def, ref.current, Math.min(1, cyc / 1.6), 0.6 + t);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const stop = () => { hover.current = false; if (def && ref.current) drawPreview(def, ref.current, 0.5, 0.6); };
  useEffect(() => () => { hover.current = false; }, []);

  return (
    <div className={`catalog-card ${it.state}`} data-testid={`catalog-${it.id}`} onPointerEnter={play} onPointerLeave={stop}>
      <div className="catalog-preview">
        <canvas ref={ref} width={320} height={180} />
        <span className="catalog-kind">{it.kind === 'transition' ? 'переход' : 'эффект'}</span>
        {broken && <span className="catalog-broken">превью недоступно</span>}
      </div>
      <div className="catalog-body">
        <b>{it.name}</b>
        {it.description && <p>{it.description}</p>}
        <span className="catalog-meta">{[it.author, it.license].filter(Boolean).join(', ')}</span>
      </div>
      <div className="catalog-actions">
        {it.state === 'installed'
          ? <>
            <span className="catalog-ok"><Check size={14} />Установлен</span>
            <button className="icon-btn" title="Удалить плагин" onClick={onRemove} disabled={busy} data-testid="catalog-remove"><Trash2 size={14} /></button>
          </>
          : <button className="btn small primary" onClick={onInstall} disabled={busy} data-testid="catalog-install">
            {it.state === 'update' ? <><RefreshCw size={13} />Обновить</> : <><Download size={13} />Установить</>}
          </button>}
      </div>
    </div>
  );
}
