// Поиск по всему (Ctrl+K или лупа вверху): эффекты, переходы, фильтры, разделы и команды Kadro.
// Набрал — Enter. Эффект и фильтр встают на выделенные клипы, переход — на выбранный стык или ближайший к курсору.
import { Search as SearchIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { tx } from '../../shared/i18n';
import { FILTER_PRESETS } from '../../shared/color';
import { EFFECTS } from '../../shared/effects';
import { TRANSITIONS } from '../../shared/defaults';
import { searchItems, type SearchItem } from '../../shared/search';
import type { EffectType, TransitionType } from '../../shared/types';
import {
  syncByAudio, addEffectTo, addMarkerAtPlayhead, applyTransition, deleteSelection, duplicateSelection, saveFrame, saveProject, selectedVisualClips, setFilterOn, splitAtPlayhead,
} from '../actions';
import { useFavs } from '../favs';
import { glEffects, glTransitions, useGlCatalog } from '../glRegistry';
import { getState, type LeftTab } from '../store';
import { TABS } from './LeftPanel';
import { togglePlayerFullscreen } from './Player';

interface Item extends SearchItem { keys?: string; run: () => void }

/** Эффект или фильтр — на все выделенные видео и фото; ничего не выделено — подсказка и нужный раздел. */
function onSelected(tab: LeftTab, what: string, apply: (id: string) => void): void {
  const clips = selectedVisualClips();
  if (!clips.length) {
    getState().setLeftTab(tab);
    getState().toast(what);
    return;
  }
  clips.forEach((c) => apply(c.id));
}

function buildItems(fav: ReturnType<typeof useFavs.getState>['s']): Item[] {
  const s = getState();
  const boost = (k: 'fx' | 'tr' | 'filter', id: string) => (fav.fav[k].includes(id) ? 2 : 0) + (fav.recent[k].includes(id) ? 1 : 0);
  const cmd = tx('Команды');
  const items: Item[] = [
    { id: 'cmd-export', group: cmd, label: tx('Экспорт видео'), keywords: ['mp4', 'gif', 'mp3', tx('сохранить ролик')], keys: 'Ctrl+E', run: () => s.setExportOpen(true) },
    { id: 'cmd-save', group: cmd, label: tx('Сохранить проект'), keys: 'Ctrl+S', run: () => void saveProject(false) },
    { id: 'cmd-save-as', group: cmd, label: tx('Сохранить проект как…'), keys: 'Ctrl+Shift+S', run: () => void saveProject(true) },
    { id: 'cmd-undo', group: cmd, label: tx('Отменить'), keys: 'Ctrl+Z', run: () => s.undo() },
    { id: 'cmd-redo', group: cmd, label: tx('Вернуть отменённое'), keys: 'Ctrl+Y', run: () => s.redo() },
    { id: 'cmd-split', group: cmd, label: tx('Разрезать у курсора'), keywords: [tx('ножницы')], keys: 'S', run: () => splitAtPlayhead() },
    { id: 'cmd-dup', group: cmd, label: tx('Копия выделенного клипа'), keywords: [tx('дублировать')], keys: 'Ctrl+D', run: () => duplicateSelection() },
    { id: 'cmd-del', group: cmd, label: tx('Удалить выделенное'), keys: 'Delete', run: () => deleteSelection() },
    { id: 'cmd-marker', group: cmd, label: tx('Поставить маркер у курсора'), keys: 'M', run: () => addMarkerAtPlayhead() },
    { id: 'cmd-frame', group: cmd, label: tx('Сохранить кадр картинкой (PNG)'), keywords: [tx('скриншот')], keys: 'Shift+E', run: () => void saveFrame() },
    { id: 'cmd-full', group: cmd, label: tx('Плеер на весь экран'), keys: 'F', run: () => togglePlayerFullscreen() },
    { id: 'cmd-wide', group: cmd, label: tx('Скрыть или показать боковые панели'), keywords: [tx('большой плеер')], keys: 'Ctrl+\\', run: () => s.setWide(!s.wide) },
    { id: 'cmd-cover', group: cmd, label: tx('Обложка для YouTube и TikTok'), keywords: [tx('превью'), 'thumbnail'], run: () => s.setCoverOpen(true) },
    { id: 'cmd-sync', group: cmd, label: tx('Синхронизировать по звуку'), keywords: [tx('мультикамера'), tx('ракурсы'), tx('хлопок')], run: () => void syncByAudio() },
    { id: 'cmd-script', group: cmd, label: tx('Ролик по сценарию'), run: () => s.setScriptOpen(true) },
    { id: 'cmd-shorts', group: cmd, label: tx('Нарезать в шортсы'), run: () => s.setShortsOpen(true) },
    { id: 'cmd-settings', group: cmd, label: tx('Настройки'), run: () => s.setSettingsOpen(true) },
    { id: 'cmd-keys', group: cmd, label: tx('Все горячие клавиши'), keys: 'F1', run: () => s.setKeysOpen(true) },
    { id: 'cmd-plugins', group: cmd, label: tx('Каталог плагинов'), run: () => s.setPluginCatalogOpen(true) },
    { id: 'cmd-bug', group: cmd, label: tx('Сообщить об ошибке'), run: () => s.setBugOpen({ what: '' }) },
    { id: 'cmd-home', group: cmd, label: tx('Главный экран'), keywords: [tx('мои проекты')], run: () => s.setHome(true) },
  ];
  for (const t of TABS) {
    items.push({ id: `tab-${t.id}`, group: tx('Разделы'), label: t.label, run: () => { if (s.wide) s.setWide(false); s.setLeftTab(t.id); } });
  }
  const fxAll: { type: EffectType; label: string; hint: string }[] = [...EFFECTS, ...glEffects().map((d) => ({ type: d.id as EffectType, label: d.name, hint: d.description ?? '' }))];
  for (const e of fxAll) {
    items.push({ id: `fx-${e.type}`, group: tx('Эффекты'), label: e.label, keywords: [e.hint], boost: boost('fx', e.type),
      run: () => onSelected('effects', tx('Сначала выдели видео или фото на таймлайне — эффект встанет на него'), (id) => addEffectTo(id, e.type, e.label)) });
  }
  const trAll: { type: TransitionType; label: string }[] = [...TRANSITIONS, ...glTransitions().map((d) => ({ type: d.id as TransitionType, label: d.name }))];
  for (const t of trAll) {
    items.push({ id: `tr-${t.type}`, group: tx('Переходы'), label: t.label, boost: boost('tr', t.type), run: () => { applyTransition(t.type, undefined, t.label); } });
  }
  for (const f of FILTER_PRESETS.filter((x) => x.id !== 'none')) {
    items.push({ id: `filter-${f.id}`, group: tx('Фильтры'), label: f.label, boost: boost('filter', f.id),
      run: () => onSelected('filters', tx('Сначала выдели видео или фото на таймлайне — фильтр встанет на него'), (id) => setFilterOn(id, f.id, f.label)) });
  }
  return items;
}

export function SearchDialog() {
  useGlCatalog();
  const fav = useFavs((f) => f.s);
  const items = useMemo(() => buildItems(fav), [fav]);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // пустой запрос — команды и разделы, а сверху избранное и недавнее
  const found = useMemo(() => {
    if (q.trim()) return searchItems(q, items, 60);
    const mine = items.filter((x) => (x.boost ?? 0) > 0).sort((a, b) => (b.boost ?? 0) - (a.boost ?? 0)).slice(0, 8);
    return [...mine, ...items.filter((x) => x.id.startsWith('cmd-') || x.id.startsWith('tab-'))];
  }, [q, items]);
  const close = () => getState().setSearchOpen(false);
  const run = (it: Item | undefined) => { if (!it) return; close(); it.run(); };
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' }); }, [active]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(found.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(found[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  return (
    <div className="modal-back palette-back" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="palette" role="dialog" aria-label={tx('Поиск по всему')} data-testid="search">
        <div className="palette-input">
          <SearchIcon size={17} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} data-testid="search-input"
            placeholder={tx('Эффект, переход, фильтр или команда…')} aria-label={tx('Что найти')} />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" ref={listRef} role="listbox">
          {found.map((it, i) => (
            <button key={it.id} role="option" aria-selected={i === active} className={i === active ? 'active' : ''} data-testid="search-item" data-id={it.id}
              onMouseMove={() => { if (i !== active) setActive(i); }} onClick={() => run(it)}>
              <span className="palette-label">{it.label}</span>
              <span className="palette-group">{it.group}</span>
              {it.keys && <kbd>{it.keys}</kbd>}
            </button>
          ))}
          {!found.length && <p className="hint palette-empty">{tx('Ничего не нашлось. Попробуй другое слово.')}</p>}
        </div>
        <div className="palette-foot hint small">{tx('↑ ↓ — выбрать, Enter — применить. Эффект и фильтр встанут на выделенные клипы, переход — на выбранный стык.')}</div>
      </div>
    </div>
  );
}
