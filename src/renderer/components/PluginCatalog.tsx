// Окно «Мастерская»: переходы, эффекты и шаблоны сообщества из репозитория Kadro на GitHub — с живым превью
// (наведи — играет), установкой в один щелчок, обновлением и удалением. Свой файл .glsl — кнопкой или
// перетаскиванием в окно Kadro; своё прислать в Мастерскую — через форму на GitHub.
import { tx } from '../../shared/i18n';
import { txj } from '../txj';
import { BookOpen, Check, Download, FileUp, LayoutTemplate, Puzzle, RefreshCw, Search, Send, Trash2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { pluginDef } from '../../shared/gl/glsl';
import type { CatalogItem, InstallResult } from '../../shared/pluginCatalog';
import { glPlugins, useGlCatalog } from '../glRegistry';
import { drawPreview } from '../pluginPreview';
import { useSamplesReady } from '../sampleFrames';
import { api, getState } from '../store';
import { Seg } from './controls';
import { WORKSHOP_SUBMIT } from '../../shared/links';
import { isTemplate, type Template } from '../../shared/templates';

type Kind = 'all' | 'transition' | 'effect' | 'template';

/** Итог установки — во всплывающие сообщения. */
export function reportInstall(r: InstallResult): void {
  const s = getState();
  for (const it of r.installed) {
    if (it.kind === 'template') s.toast(tx('«{0}» в «Шаблонах» → «Мои шаблоны»', tx(it.name)), 'ok');
    else s.toast(tx('«{0}» установлен — {1} → «Плагины»', tx(it.name), it.kind === 'transition' ? tx('«Переходы»') : tx('«Эффекты»')), 'ok');
  }
  for (const e of r.errors) s.toast(tx('Плагин не установлен: {0}', e), 'err');
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
    void api.pluginCatalog().then((r) => { if (r.ok) setItems(r.items); else { setItems([]); setError(r.error ?? tx('Каталог не загрузился')); } });
  };
  useEffect(load, []);
  useEffect(() => { api.track('workshop/open'); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const installedSrc = new Map(glPlugins().map((d) => [d.id, d]));
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? []).filter((it) => (kind === 'all' || it.kind === kind)
      && (!s || [it.name, tx(it.name), it.description ?? '', tx(it.description ?? ''), it.author ?? '', ...it.tags].some((x) => x.toLowerCase().includes(s))));
  }, [items, kind, q]);

  const install = async (it: CatalogItem) => {
    setBusy(it.id);
    api.track('workshop/install');
    const r = await api.installPlugins([it.id]);
    setBusy(null);
    reportInstall(r);
    if (r.installed.length) setItems((cur) => cur?.map((x) => (x.id === it.id ? { ...x, state: 'installed' } : x)) ?? cur);
  };
  const remove = async (it: CatalogItem) => {
    if (it.kind === 'template') {
      setBusy(it.id);
      const ok = await api.removeWorkshopTemplate(it.file.split('/')[1]);
      setBusy(null);
      if (ok) { setItems((cur) => cur?.map((x) => (x.id === it.id ? { ...x, state: 'new' } : x)) ?? cur); getState().toast(tx('«{0}» удалён', it.name), 'info'); }
      return;
    }
    const def = installedSrc.get(`plug:${it.id}`);
    if (!def?.source) return;
    setBusy(it.id);
    const ok = await api.removePlugin(def.source);
    setBusy(null);
    if (ok) { setItems((cur) => cur?.map((x) => (x.id === it.id ? { ...x, state: 'new' } : x)) ?? cur); getState().toast(tx('«{0}» удалён', it.name), 'info'); }
  };
  const fromFile = async () => reportInstall(await api.pickPluginFiles());

  const counts = { all: items?.length ?? 0, transition: items?.filter((x) => x.kind === 'transition').length ?? 0, effect: items?.filter((x) => x.kind === 'effect').length ?? 0, template: items?.filter((x) => x.kind === 'template').length ?? 0 };

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal catalog-modal" role="dialog" aria-label={tx('Мастерская')} data-testid="plugin-catalog">
        <div className="modal-head">
          <h3><Puzzle size={17} />{tx('Мастерская')}</h3>
          <button className="icon-btn" onClick={close} title={tx('Закрыть')}><X size={17} /></button>
        </div>
        <p className="hint">
          {tx('Переходы, эффекты и шаблоны от сообщества Kadro. Наведи на карточку — превью заиграет. Переходы и эффекты появляются в «Переходах» и «Эффектах» → «Плагины», шаблоны — в «Шаблонах» → «Мои шаблоны».')}</p>
        <div className="catalog-bar">
          <Seg value={kind} onChange={setKind} options={[
            { value: 'all', label: tx('Все {0}', counts.all || '').trim() }, { value: 'transition', label: tx('Переходы {0}', counts.transition || '').trim() }, { value: 'effect', label: tx('Эффекты {0}', counts.effect || '').trim() },
            { value: 'template', label: tx('Шаблоны {0}', counts.template || '').trim() },
          ]} />
          <label className="catalog-search"><Search size={14} />
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('Найти: свет, ретро, сдвиг…')} data-testid="catalog-search" />
          </label>
        </div>

        {items === null && <p className="hint catalog-state" data-testid="catalog-loading">{tx('Загружаю каталог…')}</p>}
        {error && (
          <div className="warn" data-testid="catalog-error"><TriangleAlert size={15} />
            <span>{txj('Каталог не загрузился: {0}. Проверь интернет — или поставь плагин из файла .glsl.', error)}</span>
            <button className="btn small" onClick={load}><RefreshCw size={13} />{tx('Повторить')}</button>
          </div>
        )}
        {items && !error && shown.length === 0 && <p className="hint catalog-state">{tx('Ничего не нашлось.')}</p>}

        <div className="catalog-grid">
          {shown.map((it) => (it.kind === 'template'
            ? <TemplateCard key={it.id} it={it} busy={busy === it.id} onInstall={() => void install(it)} onRemove={() => void remove(it)} />
            : <Card key={it.id} it={it} busy={busy === it.id} onInstall={() => void install(it)} onRemove={() => void remove(it)} />))}
        </div>

        <div className="catalog-foot">
          <button className="btn small" onClick={() => void fromFile()} data-testid="catalog-from-file"><FileUp size={13} />{tx('Установить из файла…')}</button>
          <button className="btn small" onClick={() => { api.track('workshop/publish'); void api.openUrl(WORKSHOP_SUBMIT); }} data-testid="workshop-publish"><Send size={13} />{tx('Прислать своё')}</button>
          <button className="btn ghost small" onClick={() => api.openDocs('plugins')}><BookOpen size={13} />{tx('Как сделать свой')}</button>
        </div>
      </div>
    </div>
  );
}

function Card({ it, busy, onInstall, onRemove }: { it: CatalogItem; busy: boolean; onInstall: () => void; onRemove: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [broken, setBroken] = useState(false);
  const def = useMemo(() => (it.kind === 'template' ? null : pluginDef(it.kind, `catalog-${it.file.split('/')[1]}`, it.src).def), [it]);
  const hover = useRef(false);
  const ready = useSamplesReady();
  useEffect(() => {
    if (!def || !ref.current) return;
    setBroken(!drawPreview(def, ref.current, 0.5, 0.6));
  }, [def, ready]);
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
        <span className="catalog-kind">{it.kind === 'transition' ? tx('переход') : tx('эффект')}</span>
        {broken && <span className="catalog-broken">{tx('превью недоступно')}</span>}
      </div>
      <div className="catalog-body">
        <b>{tx(it.name)}</b>
        {it.description && <p>{tx(it.description)}</p>}
        <span className="catalog-meta">{[it.author, it.license].filter(Boolean).join(', ')}</span>
      </div>
      <div className="catalog-actions">
        {it.state === 'installed'
          ? <>
            <span className="catalog-ok"><Check size={14} />{tx('Установлен')}</span>
            <button className="icon-btn" title={tx('Удалить плагин')} onClick={onRemove} disabled={busy} data-testid="catalog-remove"><Trash2 size={14} /></button>
          </>
          : <button className="btn small primary" onClick={onInstall} disabled={busy} data-testid="catalog-install">
            {it.state === 'update' ? <><RefreshCw size={13} />{tx('Обновить')}</> : <><Download size={13} />{tx('Установить')}</>}
          </button>}
      </div>
    </div>
  );
}

/** Карточка шаблона: окошки по длине (цветом шаблона), первая надпись, сколько кадров и секунд. */
function TemplateCard({ it, busy, onInstall, onRemove }: { it: CatalogItem; busy: boolean; onInstall: () => void; onRemove: () => void }) {
  const t = useMemo<Template | null>(() => { try { const j = JSON.parse(it.src) as unknown; return isTemplate(j) ? j : null; } catch { return null; } }, [it]);
  const total = t ? t.slots.reduce((a, x) => a + x.duration, 0) : 0;
  return (
    <div className={`catalog-card ${it.state}`} data-testid={`catalog-${it.id}`}>
      <div className="catalog-preview tpl-preview" style={{ background: t?.swatch ?? 'var(--raised)' }}>
        <span className="tpl-slots">{t?.slots.map((x, i) => <i key={i} style={{ flexGrow: x.duration }} />)}</span>
        {t?.texts[0] && <span className="tpl-text" data-user-text>{t.texts[0].text}</span>}
        <span className="catalog-kind"><LayoutTemplate size={11} /> {tx('шаблон')} · {t?.aspect}</span>
      </div>
      <div className="catalog-body">
        <b>{tx(it.name)}</b>
        {it.description && <p>{tx(it.description)}</p>}
        <span className="catalog-meta">{[t ? txj('{0} кадров, {1} с', t.slots.length, total.toFixed(1)) : '', it.author, it.license].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="catalog-actions">
        {it.state === 'installed'
          ? <>
            <span className="catalog-ok"><Check size={14} />{tx('В «Моих шаблонах»')}</span>
            <button className="icon-btn" title={tx('Удалить шаблон')} onClick={onRemove} disabled={busy} data-testid="catalog-remove"><Trash2 size={14} /></button>
          </>
          : <button className="btn small primary" onClick={onInstall} disabled={busy || !t} data-testid="catalog-install">
            {it.state === 'update' ? <><RefreshCw size={13} />{tx('Обновить')}</> : <><Download size={13} />{tx('Добавить')}</>}
          </button>}
      </div>
    </div>
  );
}
