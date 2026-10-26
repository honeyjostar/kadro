import {
  Zap, AudioLines, Blend, Captions, Crop, Film, Image as ImageIcon, Layers, Mic, Move, Music, Palette, Plus,
  LayoutTemplate, Smile, Sparkles, Trash2, Type, Upload, Wand2, FolderOpen, Box, Shuffle, WandSparkles, MoreHorizontal, Search, SkipBack, ArrowRightToLine, Scissors,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FILTER_CATS, FILTER_PRESETS, applyColorToPixel, effectiveColor, type FilterCat } from '../../shared/color';
import { gradePixel } from '../../shared/grade';
import { DEFAULT_COLOR, FONT_CATS, FONTS, HIGHLIGHTS, type FontCat, TEXT_ANIMS, TEXT_PRESETS, TRANSITION_CATS, TRANSITIONS, type TransitionCat, VOICE_FX } from '../../shared/defaults';
import { drawTransition } from '../../shared/transitions';
import { retimeWords } from '../../shared/captions';
import type { ModelInfo } from '../../shared/ipc';
import {
  addText, animAllCaptions, clipEnd, findClip, mainTrack, projectDuration, removeAsset, setTransition, styleAllCaptions, updateClip,
} from '../../shared/timeline';
import { EFFECT_CATS, EFFECTS, fxGeometry, particleEffects, type EffectCat } from '../../shared/effects';
import { drawParticles } from '../../shared/particles';
import { applyPixelEffects } from '../engine/effectsPreview';
import type { EffectType, MediaAsset, MediaClip, TextAnimType, TextClip, TextStyle, TransitionType, WordHighlight } from '../../shared/types';
import {
  addAssetToTimeline, autoReframe, disableDenoise, disableRemoveBg, disableStab, enhanceVoice, importPaths, makeCaptions, pickAndImport, removeBackground, removePauses,
  setVoiceEffect, stabilizeClip, retouchClip, startFromTemplate, saveAsTemplate, disableRetouch, startRecording, stopRecording, cancelRecording, voiceLevel,
  loadDemoFiles, tryTemplate, autoVariant, importAudio, findOnTimeline,
} from '../actions';
import { useMenu, type MenuEntry } from './Menu';
import { listMics, recPrefs, type MicInfo } from '../recorder';
import { BUILTIN_TEMPLATES, TEMPLATE_CATS, templateDuration, type Template, type TemplateCat } from '../../shared/templates';
import { TemplatePreview } from './Home';
import { LibraryView } from './Library';
import { Objects3DPanel } from './Objects3D';
import { useClipJob, useJobRunning, useSelected } from '../hooks';
import { api, getState, useStore, type LeftTab } from '../store';
import { fmtDur, fmtTime, peakLevel } from '../util';
import { ColorField, FontPicker, Progress, Seg, Slider, Toggle } from './controls';
import { aiCovers } from '../../shared/ai';

const TABS: { id: LeftTab; label: string; icon: ReactNode }[] = [
  { id: 'media', label: 'Медиа', icon: <Film size={19} /> },
  { id: 'audio', label: 'Аудио', icon: <Music size={19} /> },
  { id: 'text', label: 'Текст', icon: <Type size={19} /> },
  { id: 'captions', label: 'Субтитры', icon: <Captions size={19} /> },
  { id: 'effects', label: 'Эффекты', icon: <Zap size={19} /> },
  { id: 'transitions', label: 'Переходы', icon: <Blend size={19} /> },
  { id: 'filters', label: 'Фильтры', icon: <Palette size={19} /> },
  { id: 'ai', label: 'ИИ', icon: <Sparkles size={19} /> },
  { id: 'templates', label: 'Шаблоны', icon: <LayoutTemplate size={19} /> },
  { id: '3d', label: '3D', icon: <Box size={19} /> },
];

export function Rail() {
  const tab = useStore((s) => s.leftTab);
  const setTab = useStore((s) => s.setLeftTab);
  return (
    <nav className="rail" aria-label="Разделы">
      {TABS.map((t) => (
        <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}>
          {t.icon}<span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function LeftPanel() {
  const tab = useStore((s) => s.leftTab);
  return (
    <aside className="panel">
      {tab === 'media' && <MediaPanel />}
      {tab === 'audio' && <AudioPanel />}
      {tab === 'text' && <TextPanel />}
      {tab === 'captions' && <CaptionsPanel />}
      {tab === 'effects' && <EffectsPanel />}
      {tab === 'transitions' && <TransitionsPanel />}
      {tab === 'filters' && <FiltersPanel />}
      {tab === 'ai' && <AiPanel />}
      {tab === 'templates' && <TemplatesPanel />}
      {tab === '3d' && <Objects3DPanel />}
    </aside>
  );
}

// ---------- Шаблоны ----------
function TemplatesPanel() {
  const [mine, setMine] = useState<Template[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [cat, setCat] = useState<TemplateCat | 'all' | 'mine'>('all');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const libCount = useStore((s) => s.project.assets.filter((a) => !a.derived && (a.kind === 'video' || a.kind === 'image')).length);
  const hasMain = useStore((s) => s.project.tracks[0]?.clips.length > 0);
  const hasDemo = useStore((s) => !!s.demo && Object.keys(s.demo.scenes).length > 0);
  const autoLast = useStore((s) => s.autoLast);
  const refresh = () => void api.listTemplates().then(setMine);
  useEffect(refresh, []);
  useEffect(() => { void loadDemoFiles(); }, []);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const card = (t: Template) => {
    const isOpen = open === t.id;
    return (
      <div key={t.id} className={`tpl-card ${isOpen ? 'open' : ''} ${t.aspect === '16:9' || t.aspect === '21:9' || t.aspect === '4:3' ? 'wide' : ''}`} data-testid={`tpl-${t.id}`}
        onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)}>
        <button className="tpl-head" onClick={() => setOpen(isOpen ? null : t.id)} aria-expanded={isOpen} title={t.hint}>
          <TemplatePreview t={t} active={hover === t.id || isOpen} />
          <span className="tpl-badge">{t.aspect}</span>
          <span className="tpl-name">{t.name}</span>
          <span className="hint small tpl-hint">{t.hint}</span>
        </button>
        {isOpen && (
          <div className="tpl-actions">
            <b className="tpl-open-name">{t.name}</b>
            <span className="hint small">{t.hint}</span>
            <span className="hint small">{t.slots.length} кадров, {fmtDur(templateDuration(t))}</span>
            <button className="btn primary block small" disabled={busy} onClick={() => void run(() => startFromTemplate(t, 'pick'))} data-testid="tpl-pick"><FolderOpen size={13} />Свои файлы…</button>
            <button className="btn block small" disabled={busy || !libCount} onClick={() => void run(() => startFromTemplate(t, 'library'))} data-testid="tpl-library">
              Из медиатеки{libCount ? ` (${libCount})` : ''}
            </button>
            {hasDemo && <button className="btn ghost block small" disabled={busy} onClick={() => void run(() => tryTemplate(t))} data-testid="tpl-try">Пример</button>}
            {t.custom && <button className="btn ghost small" onClick={() => void api.deleteTemplate(t.id).then(refresh)}><Trash2 size={13} />Удалить шаблон</button>}
          </div>
        )}
      </div>
    );
  };
  const list = cat === 'mine' ? mine : BUILTIN_TEMPLATES.filter((t) => cat === 'all' || t.cat === cat);
  return (
    <>
      <div className="panel-head">Шаблоны</div>
      <div className="panel-body">
        <div className="auto-card" data-testid="tpl-auto-card">
          <b><WandSparkles size={15} />Авто-ролик</b>
          <span className="hint small">Kadro сам возьмёт лучшие куски видео и смонтирует их в ритм музыки.</span>
          <div className="row-btns">
            <button className="btn primary small" disabled={busy} onClick={() => getState().setAutoOpen({ files: autoLast?.files ?? [], fresh: false })} data-testid="tpl-auto">{autoLast ? 'Настроить…' : 'Собрать…'}</button>
            {autoLast && <button className="btn small" disabled={busy} onClick={() => void run(autoVariant)} title="Другие куски видео и переходы, те же файлы и стиль" data-testid="tpl-auto-variant"><Shuffle size={13} />Ещё вариант</button>}
          </div>
        </div>
        <p className="hint">Готовый монтаж с переходами, цветом, эффектами и надписями. Наведи на шаблон, чтобы посмотреть, нажми — и выбери свои видео и фото по порядку.</p>
        <div className="chips">
          <button className={cat === 'all' ? 'active' : ''} onClick={() => setCat('all')}>Все</button>
          {TEMPLATE_CATS.map((c) => <button key={c.id} className={cat === c.id ? 'active' : ''} onClick={() => setCat(c.id)}>{c.label}</button>)}
          {mine.length > 0 && <button className={cat === 'mine' ? 'active' : ''} onClick={() => setCat('mine')}>Мои шаблоны</button>}
        </div>
        <div className="tpl-list">{list.map(card)}</div>
        {cat === 'all' && mine.length > 0 && (<><div className="sub-head">Мои шаблоны</div><div className="tpl-list">{mine.map(card)}</div></>)}
        <div className="sub-head">Сохранить свой</div>
        <p className="hint small">Длительности клипов основной дорожки, переходы, цвет, эффекты, наезды и надписи станут шаблоном — без самих видео.</p>
        <div className="row-btns">
          <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} data-testid="tpl-name" />
          <button className="btn" disabled={!hasMain || busy} onClick={() => void run(async () => { if (await saveAsTemplate(name)) { setName(''); refresh(); } })} data-testid="tpl-save">Сохранить</button>
        </div>
      </div>
    </>
  );
}

// ---------- общие куски ----------
function DropZone({ accept, children, compact = false }: { accept: 'any' | 'audio'; children?: ReactNode; compact?: boolean }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`dropzone ${over ? 'over' : ''} ${compact ? 'compact' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
        void (accept === 'audio' ? importAudio(paths) : importPaths(paths));
      }}
    >
      {children}
      <button className="btn primary" onClick={() => void (accept === 'audio' ? importAudio() : pickAndImport())} data-testid="import-btn">
        <Upload size={15} />{accept === 'audio' ? 'Добавить музыку' : 'Добавить файлы'}
      </button>
      <span className="hint small">{compact ? 'или перетащи файлы сюда' : accept === 'audio' ? 'MP3, WAV, M4A, FLAC — или перетащи сюда' : 'или перетащи сюда видео, фото, музыку'}</span>
    </div>
  );
}

function assetBadge(a: MediaAsset): string {
  if (a.missing) return 'Файл не найден';
  if (a.proxy === 'pending') return 'Готовлю…';
  if (a.proxy === 'error') return 'Ошибка превью';
  return a.kind === 'video' ? fmtDur(a.duration) : a.kind === 'audio' ? fmtDur(a.duration) : 'Фото';
}

/** Что можно сделать с файлом проекта: правая кнопка мыши или «⋯». */
function assetMenu(a: MediaAsset, used: boolean): MenuEntry[] {
  const audio = a.kind === 'audio';
  const remove = () => {
    if (!used || confirm(`Убрать «${a.name}» из проекта? Клипы с этим файлом пропадут с таймлайна.`)) getState().commit((p) => removeAsset(p, a.id));
  };
  const piece: MenuEntry[] = a.kind === 'image' ? [] : [
    { label: 'Взять кусок…', hint: 'начало и конец', icon: <Scissors size={14} />, onClick: () => getState().setSourceView(a.id), disabled: a.missing, testId: 'menu-piece' },
  ];
  return [
    ...piece,
    ...(audio ? [
      { label: 'На таймлайн с начала ролика', icon: <SkipBack size={14} />, onClick: () => addAssetToTimeline(a.id, 'auto', 0), testId: 'menu-start', disabled: a.missing },
      { label: 'На таймлайн к курсору', icon: <Plus size={14} />, onClick: () => addAssetToTimeline(a.id, 'auto'), testId: 'menu-cursor', disabled: a.missing },
    ] : [
      { label: 'На таймлайн к курсору', icon: <Plus size={14} />, onClick: () => addAssetToTimeline(a.id, 'auto'), testId: 'menu-cursor', disabled: a.missing },
      { label: 'В конец ролика', icon: <ArrowRightToLine size={14} />, onClick: () => addAssetToTimeline(a.id, 'main', projectDuration(getState().project)), testId: 'menu-end', disabled: a.missing },
      { label: 'Поверх видео', hint: 'картинка в картинке', icon: <Layers size={14} />, onClick: () => addAssetToTimeline(a.id, 'overlay'), testId: 'menu-overlay', disabled: a.missing },
    ]),
    'sep',
    { label: 'Найти на таймлайне', icon: <Search size={14} />, onClick: () => findOnTimeline(a.id), disabled: !used, testId: 'menu-find' },
    { label: 'Показать в папке', icon: <FolderOpen size={14} />, onClick: () => api.showInFolder(a.path), disabled: a.missing, testId: 'menu-folder' },
    'sep',
    { label: 'Убрать из проекта', icon: <Trash2 size={14} />, onClick: remove, danger: true, testId: 'menu-remove' },
  ];
}

function MediaItem({ a, used, selected, onSelect }: { a: MediaAsset; used: boolean; selected: boolean; onSelect: (e: React.MouseEvent) => void }) {
  const thumb = a.thumbs?.[Math.floor((a.thumbs.length - 1) / 2)] ?? (a.kind === 'image' ? a.previewPath || a.path : undefined);
  const menu = useMenu();
  return (
    <div
      className={`media-item ${a.missing ? 'missing' : ''} ${selected ? 'selected' : ''}`} draggable data-testid="media-item" title={a.missing ? `Файл не найден: ${a.path}` : a.name}
      onClick={onSelect}
      onDragStart={(e) => { e.dataTransfer.setData('application/x-kadro-asset', a.id); e.dataTransfer.effectAllowed = 'copy'; }}
      onDoubleClick={() => addAssetToTimeline(a.id, 'auto', a.kind === 'audio' && getState().audioPlace === 'start' ? 0 : undefined)}
      onContextMenu={(e) => menu.open(e, assetMenu(a, used))}
    >
      <div className="media-thumb" style={thumb ? { backgroundImage: `url("${api.mediaUrl(thumb)}")` } : undefined}>
        {!thumb && (a.kind === 'audio' ? <AudioLines size={22} /> : a.kind === 'image' ? <ImageIcon size={22} /> : <Film size={22} />)}
      </div>
      {used && <span className="used-dot" title="Уже на таймлайне" />}
      <div className="media-actions">
        <button title={a.kind === 'audio' ? 'На таймлайн' : 'На таймлайн к курсору'} onClick={(e) => { e.stopPropagation(); addAssetToTimeline(a.id, 'auto', a.kind === 'audio' && getState().audioPlace === 'start' ? 0 : undefined); }} data-testid="media-add"><Plus size={14} /></button>
        {a.kind !== 'image' && !a.missing && <button title="Взять кусок: отметить начало и конец" onClick={(e) => { e.stopPropagation(); getState().setSourceView(a.id); }} data-testid="media-piece"><Scissors size={14} /></button>}
        <button title="Ещё: куда добавить, найти на таймлайне, показать в папке, убрать" onClick={(e) => { e.stopPropagation(); menu.open(e, assetMenu(a, used)); }} data-testid="media-more"><MoreHorizontal size={14} /></button>
      </div>
      <div className="media-meta"><span className="name">{a.name}</span><span className="dur">{assetBadge(a)}</span></div>
      {menu.node}
    </div>
  );
}

function useUsedAssets(): Set<string> {
  const tracks = useStore((s) => s.project.tracks);
  return useMemo(() => new Set(tracks.flatMap((t) => t.clips.flatMap((c) => (c.type === 'media' ? [c.assetId, c.retime?.assetId ?? ''] : [])))), [tracks]);
}

// ---------- Медиа ----------
let mediaView: 'project' | 'library' = 'project';
function MediaPanel() {
  const all = useStore((s) => s.project.assets);
  const assets = all.filter((a) => !a.derived);
  const used = useUsedAssets();
  const [filter, setFilter] = useState<'all' | 'video' | 'image' | 'audio'>('all');
  const [view, setView] = useState(mediaView);
  const jump = useStore((s) => s.libJump);
  useEffect(() => { mediaView = view; }, [view]);
  useEffect(() => { if (jump) setView('library'); }, [jump]);
  const list = assets.filter((a) => filter === 'all' || a.kind === filter);
  // выбор нескольких файлов: Ctrl — добавить/убрать, Shift — диапазон
  const [sel, setSel] = useState<string[]>([]);
  const last = useRef<string | null>(null);
  useEffect(() => { setSel((s) => s.filter((id) => all.some((a) => a.id === id))); }, [all]);
  const onSelect = (a: MediaAsset, e: React.MouseEvent) => {
    if (e.shiftKey && last.current) {
      const i0 = list.findIndex((x) => x.id === last.current);
      const i1 = list.findIndex((x) => x.id === a.id);
      if (i0 >= 0 && i1 >= 0) {
        const ids = list.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).map((x) => x.id);
        setSel((s) => (e.ctrlKey || e.metaKey ? [...new Set([...s, ...ids])] : ids));
        return;
      }
    }
    last.current = a.id;
    if (e.ctrlKey || e.metaKey) setSel((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id]));
    else setSel((s) => (s.length === 1 && s[0] === a.id ? [] : [a.id]));
  };
  const placeSel = (mode: 'auto' | 'end') => {
    let at = mode === 'end' ? projectDuration(getState().project) : getState().playhead;
    const ids = list.filter((a) => sel.includes(a.id) && !a.missing).map((a) => a.id);
    const added: string[] = [];
    for (const id of ids) {
      const c = addAssetToTimeline(id, mode === 'end' ? 'main' : 'auto', at);
      const f = c ? findClip(getState().project, c) : undefined;
      if (c) added.push(c);
      if (f && f.track.kind !== 'audio') at = clipEnd(f.clip);
    }
    if (added.length) { getState().select(added); getState().toast(`На таймлайне файлов: ${added.length}`, 'ok'); }
    setSel([]);
  };
  return (
    <>
      <div className="panel-head">Медиа</div>
      <div className="panel-body">
        <div className="media-switch" role="tablist">
          <button role="tab" aria-selected={view === 'project'} className={view === 'project' ? 'active' : ''} onClick={() => setView('project')} data-testid="media-view-project">
            В проекте{assets.length ? ` · ${assets.length}` : ''}
          </button>
          <button role="tab" aria-selected={view === 'library'} className={view === 'library' ? 'active' : ''} onClick={() => setView('library')} data-testid="media-view-library">
            Библиотека
          </button>
        </div>
        {view === 'library' ? <LibraryView /> : (<>
        <DropZone accept="any" compact={assets.length > 0} />
        {assets.filter((a) => a.kind !== 'audio' && !a.missing).length > 1 && (
          <button className="btn block auto-from-media" onClick={() => getState().setAutoOpen({
            files: assets.filter((a) => a.kind !== 'audio' && !a.missing).map((a) => a.path),
            music: assets.find((a) => a.kind === 'audio' && !a.missing)?.path ?? null, fresh: false,
          })} data-testid="media-auto"><WandSparkles size={14} />Авто-ролик из этих файлов</button>
        )}
        {assets.length > 0 && (
          <>
            <div style={{ marginTop: 12 }}>
              <Seg value={filter} onChange={setFilter} options={[
                { value: 'all', label: 'Все' }, { value: 'video', label: 'Видео' }, { value: 'image', label: 'Фото' }, { value: 'audio', label: 'Звук' },
              ]} />
            </div>
            <div className="media-grid">{list.map((a) => <MediaItem key={a.id} a={a} used={used.has(a.id)} selected={sel.includes(a.id)} onSelect={(e) => onSelect(a, e)} />)}</div>
            {sel.length > 0 && (
              <div className="lib-bar media-bar" data-testid="media-bar">
                <span>Выбрано: {sel.length}</span>
                <button className="btn small" onClick={() => setSel([])}>Снять</button>
                <button className="btn small" onClick={() => placeSel('end')} data-testid="media-place-end">В конец</button>
                <button className="btn primary small" onClick={() => placeSel('auto')} data-testid="media-place">На таймлайн</button>
              </div>
            )}
            {!list.length && <p className="hint">Здесь пока пусто.</p>}
            <p className="hint small" style={{ marginTop: 12 }}>Двойной клик или «+» — на таймлайн к курсору. Ножницы — взять из видео только кусок. Щелчок с Ctrl или Shift — выбрать несколько. Правая кнопка мыши — всё, что можно сделать с файлом.</p>
          </>
        )}
        </>)}
      </div>
    </>
  );
}

// ---------- Аудио ----------
function AudioRow({ a, used }: { a: MediaAsset; used: boolean }) {
  const menu = useMenu();
  const place = useStore((s) => s.audioPlace);
  const add = () => addAssetToTimeline(a.id, 'auto', place === 'start' ? 0 : undefined);
  return (
    <div className={`audio-row ${a.missing ? 'missing' : ''}`} draggable title={a.missing ? `Файл не найден: ${a.path}` : a.name} data-testid="audio-row"
      onDragStart={(e) => { e.dataTransfer.setData('application/x-kadro-asset', a.id); e.dataTransfer.effectAllowed = 'copy'; }}
      onDoubleClick={add} onContextMenu={(e) => menu.open(e, assetMenu(a, used))}>
      <MiniWave peaks={a.peaks} />
      <div className="audio-name">
        <span className="name">{a.name}</span>
        <span className="hint small">{fmtTime(a.duration)}{used ? ' · на таймлайне' : a.missing ? ' · файл не найден' : ' · только в списке'}</span>
      </div>
      {used && <button className="icon-btn" title="Найти на таймлайне" onClick={() => findOnTimeline(a.id)} data-testid="audio-find"><Search size={15} /></button>}
      <button className="icon-btn" title={place === 'start' ? 'На таймлайн с начала ролика' : 'На таймлайн к курсору'} onClick={add} data-testid="audio-add"><Plus size={16} /></button>
      <button className="icon-btn" title="Ещё" onClick={(e) => menu.open(e, assetMenu(a, used))} data-testid="audio-more"><MoreHorizontal size={16} /></button>
      {menu.node}
    </div>
  );
}

function AudioPanel() {
  const assets = useStore((s) => s.project.assets).filter((a) => a.kind === 'audio' && !a.derived);
  const used = useUsedAssets();
  const place = useStore((s) => s.audioPlace);
  return (
    <>
      <div className="panel-head">Аудио</div>
      <div className="panel-body">
        <RecordBox />
        <div className="audio-place">
          <span className="hint small">Куда класть добавленную музыку</span>
          <Seg value={place} onChange={(v) => getState().setAudioPlace(v)} options={[
            { value: 'start', label: 'С начала' }, { value: 'cursor', label: 'К курсору' }, { value: 'list', label: 'Только в список' },
          ]} />
        </div>
        <DropZone accept="audio" compact={assets.length > 0} />
        {assets.length > 0 ? (
          <>
            <div className="audio-list">
              {assets.map((a) => <AudioRow key={a.id} a={a} used={used.has(a.id)} />)}
            </div>
            <p className="hint small" style={{ marginTop: 10 }}>Звук — на дорожках под видео. «Лупа» — показать, где файл на таймлайне. Правая кнопка мыши — все действия с файлом.</p>
          </>
        ) : (
          <p className="hint" style={{ marginTop: 14 }}>Музыка и звуки ложатся на отдельные дорожки под видео. Громкость, затухание и скорость — справа, когда клип выделен.</p>
        )}
      </div>
    </>
  );
}

function RecordBox() {
  const rec = useStore((s) => s.recording);
  const playhead = useStore((s) => s.playhead);
  const saving = useJobRunning('rec_');
  const [mics, setMics] = useState<MicInfo[]>([]);
  const [mic, setMic] = useState(recPrefs.mic);
  const [mute, setMute] = useState(recPrefs.mute);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { recPrefs.mic = mic; recPrefs.mute = mute; }, [mic, mute]);
  useEffect(() => {
    const load = () => void listMics().then(setMics);
    load();
    navigator.mediaDevices?.addEventListener?.('devicechange', load);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', load);
  }, [rec]);
  useEffect(() => {
    if (!rec) { setLevel(0); setElapsed(0); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = () => { setLevel(voiceLevel()); setElapsed((performance.now() - t0) / 1000); raf = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [rec]);
  return (
    <div className={`rec-box ${rec ? 'live' : ''}`} data-testid="rec-box">
      <div className="rec-title"><Mic size={15} />Запись голоса</div>
      {!rec ? (
        <>
          {mics.length > 1 && (
            <select className="input" value={mic} onChange={(e) => setMic(e.target.value)} data-testid="rec-mic">
              {mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          )}
          <Toggle label="Заглушить звук проекта на время записи" on={mute} onChange={setMute} hint="Чтобы звук из колонок не попал в микрофон" />
          <button className="btn rec-btn block" disabled={saving} onClick={() => void startRecording(mic, mute)} data-testid="rec-start">
            <span className="rec-dot" />Записать с {fmtTime(playhead)}
          </button>
        </>
      ) : (
        <>
          <div className="rec-live">
            <span className="rec-dot blink" />
            <b data-testid="rec-time">{fmtTime(elapsed)}</b>
            <div className="rec-meter"><i style={{ width: `${Math.round(level * 100)}%` }} /></div>
          </div>
          <div className="row-btns">
            <button className="btn primary" onClick={() => void stopRecording()} data-testid="rec-stop">Готово</button>
            <button className="btn" onClick={cancelRecording} data-testid="rec-cancel">Отмена</button>
          </div>
        </>
      )}
    </div>
  );
}

function MiniWave({ peaks }: { peaks?: number[] }) {
  const bars = useMemo(() => {
    if (!peaks?.length) return [];
    const n = 28;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.floor((i * peaks.length) / n);
      const b = Math.max(a + 1, Math.floor(((i + 1) * peaks.length) / n));
      out.push(peakLevel(Math.max(...peaks.slice(a, b))));
    }
    return out;
  }, [peaks]);
  return (
    <div className="mini-wave">
      {bars.length ? bars.map((v, i) => <i key={i} style={{ height: `${Math.max(8, v * 100)}%` }} />) : <AudioLines size={18} />}
    </div>
  );
}

// ---------- Текст ----------
export function textPreviewStyle(s: Partial<TextStyle>): React.CSSProperties {
  const st = { ...s };
  return {
    fontFamily: `'${st.font ?? 'Montserrat'}'`,
    fontWeight: st.bold === false ? 400 : 700,
    color: st.color ?? '#fff',
    WebkitTextStroke: st.strokeWidth ? `${Math.min(3, st.strokeWidth / 3)}px ${st.strokeColor}` : undefined,
    paintOrder: 'stroke fill',
    textShadow: st.shadow ? '0 2px 6px rgba(0,0,0,.6)' : undefined,
    background: st.bgOpacity ? hexA(st.bgColor ?? '#000', st.bgOpacity) : undefined,
    padding: st.bgOpacity ? '1px 7px' : undefined,
    borderRadius: 4,
  };
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function TextPanel() {
  const commit = useStore((s) => s.commit);
  const [fontCat, setFontCat] = useState<FontCat | 'all'>('all');
  const add = (style?: Partial<TextStyle>, text = 'Текст') => {
    let id = '';
    commit((p) => { const r = addText(p, getState().playhead, text, style); id = r.clipId; return r.project; });
    if (id) {
      getState().select([id]);
      // сразу печатать: справа открывается поле текста с выделенным словом «Текст»
      setTimeout(() => window.dispatchEvent(new Event('kadro:edit-text')), 30);
    }
  };
  return (
    <>
      <div className="panel-head">Текст</div>
      <div className="panel-body">
        <button className="btn primary block" onClick={() => add()} data-testid="add-text"><Plus size={15} />Добавить текст</button>
        <p className="hint small" style={{ marginTop: 8 }}>Текст появится у курсора на таймлайне. Двигай его прямо в окне просмотра.</p>
        <div className="section-title">Готовые стили</div>
        <div className="tile-grid">
          {TEXT_PRESETS.map((t) => (
            <button key={t.id} className="tile text-tile" onClick={() => add(t.style)} title={`Добавить: ${t.label}`}>
              <div className="text-sample"><span style={textPreviewStyle(t.style)}>Привет</span></div>
              <span className="label">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="section-title">Шрифты · {FONTS.length}</div>
        <div className="chips" style={{ marginBottom: 8 }}>
          <button className={fontCat === 'all' ? 'active' : ''} onClick={() => setFontCat('all')}>Все</button>
          {FONT_CATS.map((c) => <button key={c.id} className={fontCat === c.id ? 'active' : ''} onClick={() => setFontCat(c.id)}>{c.label}</button>)}
        </div>
        <div className="font-list">
          {FONTS.filter((f) => fontCat === 'all' || f.cat === fontCat).map((f) => (
            <button key={f.family} className="font-row" onClick={() => add({ font: f.family })} style={{ fontFamily: `'${f.family}'` }} title={`Добавить текст шрифтом ${f.label}`}>
              {f.label} <span>Привет, мир</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------- Субтитры ----------
function useCaptions(): TextClip[] {
  const tracks = useStore((s) => s.project.tracks);
  return useMemo(() => tracks.flatMap((t) => t.clips.filter((c): c is TextClip => c.type === 'text' && c.role === 'caption')).sort((a, b) => a.start - b.start), [tracks]);
}

function CaptionsPanel() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState<'multi' | 'ru'>('multi');
  const [music, setMusic] = useState(false);
  const capRunning = useJobRunning('cap_');
  const dlRunning = useJobRunning('dl_');
  const running = capRunning || dlRunning;
  const captions = useCaptions();
  const commit = useStore((s) => s.commit);
  const selection = useStore((s) => s.selection);
  useEffect(() => { void api.models().then(setModels); }, [running]);
  const first = captions[0];
  const vertical = useStore((s) => s.project.settings.height > s.project.settings.width);
  return (
    <>
      <div className="panel-head">Субтитры</div>
      <div className="panel-body">
        <div className="ai-card">
          <h4><Wand2 size={15} />Автосубтитры</h4>
          <p className="hint">Распознаю речь со всего таймлайна и расставлю субтитры по словам. Работает без интернета.</p>
          <div className="model-list">
            {models.map((m) => (
              <label key={m.id} className={`model ${model === m.id ? 'active' : ''}`}>
                <input type="radio" name="asr" checked={model === m.id} onChange={() => setModel(m.id)} />
                <div>
                  <div>{m.label}</div>
                  <div className="hint small">{m.note} · {m.ready ? 'скачана' : `скачается один раз, ${m.sizeMb} МБ`}</div>
                </div>
              </label>
            ))}
          </div>
          <Toggle label="Слушать и музыкальные дорожки" hint="Обычно выключено: песни мешают распознаванию" on={music} onChange={setMusic} />
          <button className="btn primary block" disabled={running} onClick={() => void makeCaptions(model, music)} data-testid="make-captions">
            {running ? 'Распознаю…' : captions.length ? 'Создать заново' : 'Создать субтитры'}
          </button>
        </div>

        {first && (
          <>
            <div className="section-title">Стиль всех субтитров</div>
            <div className="tile-grid">
              {TEXT_PRESETS.map((t) => (
                <button key={t.id} className="tile text-tile" onClick={() => commit((p) => styleAllCaptions(p, t.style), 'capstyle')}>
                  <div className="text-sample"><span style={textPreviewStyle({ ...first.style, ...t.style })}>Субтитр</span></div>
                  <span className="label">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="field">
              <div className="field-row"><label>Шрифт</label></div>
              <FontPicker value={first.style.font} onChange={(font) => commit((p) => styleAllCaptions(p, { font }))} />
            </div>
            <Slider label="Размер" min={24} max={140} step={1} value={first.style.size} format={(v) => `${Math.round(v)}`}
              onChange={(v) => commit((p) => styleAllCaptions(p, { size: v }), 'capsize')} />
            <Slider label="Высота на экране" min={0.08} max={0.94} step={0.01} value={first.y} format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => commit((p) => styleAllCaptions(p, {}, v), 'capy')}
              onReset={() => commit((p) => styleAllCaptions(p, {}, vertical ? 0.64 : 0.86))} />
            <Toggle label="Заглавными буквами" on={first.style.uppercase} onChange={(v) => commit((p) => styleAllCaptions(p, { uppercase: v }))} />
            <div className="field">
              <div className="field-row"><label>Подсветка произносимого слова</label></div>
              <select className="input" value={first.style.highlight?.mode ?? 'none'} data-testid="cap-highlight"
                onChange={(e) => commit((p) => styleAllCaptions(p, { highlight: { color: first.style.highlight?.color ?? '#ffe14d', mode: e.target.value as WordHighlight['mode'] } }))}>
                {HIGHLIGHTS.map((h) => <option key={h.mode} value={h.mode}>{h.label}</option>)}
              </select>
            </div>
            {first.style.highlight && first.style.highlight.mode !== 'none' && (
              <ColorField label="Цвет подсветки" value={first.style.highlight.color}
                onChange={(v) => commit((p) => styleAllCaptions(p, { highlight: { ...first.style.highlight!, color: v } }), 'hlc')} />
            )}
            <div className="field">
              <div className="field-row"><label>Появление каждого субтитра</label></div>
              <select className="input" value={first.anim?.in?.type ?? 'none'} data-testid="cap-anim"
                onChange={(e) => commit((p) => animAllCaptions(p, e.target.value === 'none' ? undefined : { type: e.target.value as TextAnimType, dur: 0.2 }))}>
                <option value="none">Нет</option>
                {TEXT_ANIMS.map((a) => <option key={a.type} value={a.type}>{a.in}</option>)}
              </select>
            </div>

            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Текст ({captions.length})</span>
            </div>
            <div className="cue-list">
              {captions.map((c) => (
                <div key={c.id} className={`cue ${selection.includes(c.id) ? 'active' : ''}`}>
                  <button className="cue-time" onClick={() => { getState().select([c.id]); getState().setPlaying(false); getState().setPlayhead(c.start + 0.01); }}>
                    {fmtTime(c.start, 30, false)}
                  </button>
                  <textarea
                    className="cue-text" rows={1} value={c.text} data-testid="cue-text"
                    onFocus={() => { getState().select([c.id]); getState().setPlaying(false); getState().setPlayhead(c.start + 0.01); }}
                    onChange={(e) => commit((p) => updateClip(p, c.id, { text: e.target.value, words: retimeWords(e.target.value, c.words) }), `cue-${c.id}`)}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ---------- Эффекты ----------
/** Образец для живых превью эффектов: небо, солнце, холмы, фигурка. */
let fxScene: HTMLCanvasElement | null = null;
function effectScene(): HTMLCanvasElement {
  if (fxScene) return fxScene;
  const cv = document.createElement('canvas');
  cv.width = THUMB_W; cv.height = THUMB_H;
  const g = cv.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, THUMB_H);
  sky.addColorStop(0, '#3a7bd5'); sky.addColorStop(0.6, '#f2a65a'); sky.addColorStop(1, '#ff6b6b');
  g.fillStyle = sky; g.fillRect(0, 0, THUMB_W, THUMB_H);
  g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(88, 30, 12, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2f6b3a'; g.beginPath(); g.moveTo(0, 56); g.quadraticCurveTo(36, 36, 70, 54); g.quadraticCurveTo(100, 44, 128, 52); g.lineTo(128, 72); g.lineTo(0, 72); g.fill();
  g.fillStyle = '#1d3f25'; g.beginPath(); g.moveTo(0, 64); g.quadraticCurveTo(50, 52, 128, 66); g.lineTo(128, 72); g.lineTo(0, 72); g.fill();
  g.fillStyle = '#15131a'; g.beginPath(); g.arc(40, 40, 4, 0, Math.PI * 2); g.fill(); g.fillRect(38, 44, 4, 12);
  fxScene = cv;
  return cv;
}

/** Миниатюра эффекта: в покое — один кадр, при наведении — эффект в движении. */
function EffectThumb({ type }: { type: EffectType }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    const scene = effectScene();
    const fake = { id: `thumb-${type}`, effects: [{ type, amount: 0.75 }] } as unknown as MediaClip;
    const layer = document.createElement('canvas');
    layer.width = THUMB_W; layer.height = THUMB_H;
    const lc = layer.getContext('2d', { willReadFrequently: true })!;
    const draw = (t: number) => {
      lc.globalCompositeOperation = 'copy';
      lc.drawImage(scene, 0, 0);
      lc.globalCompositeOperation = 'source-over';
      applyPixelEffects(layer, fake, t);
      const g = fxGeometry(fake.effects, t, 3);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, THUMB_W, THUMB_H);
      ctx.save();
      ctx.translate(THUMB_W / 2 + g.dx * THUMB_W, THUMB_H / 2 + g.dy * THUMB_H);
      ctx.rotate((g.drot * Math.PI) / 180);
      ctx.scale(g.scale, g.scale);
      ctx.drawImage(layer, -THUMB_W / 2, -THUMB_H / 2);
      ctx.restore();
      const pe = particleEffects(fake.effects);
      if (pe.length) drawParticles(ctx, pe, t, THUMB_W, THUMB_H, 0.22); // в миниатюре частицы крупнее, иначе не видно
    };
    if (!hover) { draw(type === 'flash' ? 0.05 : type === 'zoomin' || type === 'zoomout' ? 1.5 : 1.3); return; }
    let raf = 0;
    const t0 = performance.now();
    const loop = () => { draw(((performance.now() - t0) / 1000) % 3); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [type, hover]);
  return <canvas ref={ref} width={THUMB_W} height={THUMB_H} className="swatch tr-thumb" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} />;
}

function EffectsPanel() {
  const sel = useSelected();
  const commit = useStore((s) => s.commit);
  const [cat, setCat] = useState<EffectCat | 'all'>('all');
  const clip = sel?.clip.type === 'media' && sel.asset?.kind !== 'audio' ? (sel.clip as MediaClip) : null;
  const toggle = (type: EffectType) => {
    if (!clip) { getState().toast('Сначала выдели видео или фото на таймлайне — эффект встанет на него'); return; }
    const has = clip.effects?.some((e) => e.type === type);
    const def = EFFECTS.find((x) => x.type === type);
    const effects = has ? clip.effects!.filter((e) => e.type !== type) : [...(clip.effects ?? []), { type, amount: def?.toggle ? 1 : 0.6 }];
    commit((p) => updateClip(p, clip.id, { effects: effects.length ? effects : undefined }));
  };
  const list = EFFECTS.filter((e) => cat === 'all' || e.cat === cat);
  return (
    <>
      <div className="panel-head">Эффекты · {EFFECTS.length}</div>
      <div className="panel-body">
        <p className="hint">{clip ? 'Нажми — эффект добавится, ещё раз — уберётся. Наведи мышь, чтобы посмотреть. Сила — справа, во вкладке «Эффекты».' : 'Выдели клип на таймлайне — эффекты применяются к нему. Наведи мышь на эффект, чтобы посмотреть.'}</p>
        <div className="chips" style={{ margin: '10px 0 8px' }}>
          <button className={cat === 'all' ? 'active' : ''} onClick={() => setCat('all')}>Все</button>
          {EFFECT_CATS.map((c) => <button key={c.id} className={cat === c.id ? 'active' : ''} onClick={() => setCat(c.id)}>{c.label}</button>)}
        </div>
        <div className="tile-grid fx-grid">
          {list.map((e) => {
            const on = !!clip?.effects?.some((x) => x.type === e.type);
            return (
              <button key={e.type} className={`tile ${on ? 'active' : ''}`} onClick={() => toggle(e.type)} title={e.hint} data-testid={`fx-${e.type}`}>
                <EffectThumb type={e.type} />
                <span className="label">{e.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ---------- Переходы ----------
/** Два образца для живых превью переходов: «А» — тёплый, «Б» — холодный. */
let samplePair: [HTMLCanvasElement, HTMLCanvasElement] | null = null;
const THUMB_W = 128;
const THUMB_H = 72;
function sampleFrames(): [HTMLCanvasElement, HTMLCanvasElement] {
  if (samplePair) return samplePair;
  const make = (c1: string, c2: string, letter: string, ink: string) => {
    const cv = document.createElement('canvas');
    cv.width = THUMB_W; cv.height = THUMB_H;
    const g = cv.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, THUMB_W, THUMB_H);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.fillStyle = gr; g.fillRect(0, 0, THUMB_W, THUMB_H);
    g.fillStyle = ink; g.font = "700 38px 'Unbounded'"; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(letter, THUMB_W / 2, THUMB_H / 2 + 2);
    return cv;
  };
  samplePair = [make('#ff8a3d', '#ff3d7f', 'A', 'rgba(255,255,255,0.9)'), make('#2d7dd2', '#47e6c1', 'B', 'rgba(10,20,40,0.85)')];
  return samplePair;
}

/** Миниатюра перехода: в покое — середина перехода, при наведении — перехода целиком по кругу. */
function TransitionThumb({ type }: { type: TransitionType | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    const scratch = document.createElement('canvas');
    scratch.width = THUMB_W; scratch.height = THUMB_H;
    const [a, b] = sampleFrames();
    const draw = (p: number) => {
      if (!type) { ctx.drawImage(p < 0.5 ? a : b, 0, 0); return; }
      drawTransition(ctx, type, p, a, b, THUMB_W, THUMB_H, scratch);
    };
    if (!hover) { draw(type === 'circlecrop' || type === 'rectcrop' ? 0.15 : 0.45); return; }
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      const k = ((performance.now() - t0) / 1400) % 1.4; // 1 с перехода + пауза
      draw(Math.min(1, k));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [type, hover]);
  return <canvas ref={ref} width={THUMB_W} height={THUMB_H} className="swatch tr-thumb" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} />;
}

function TransitionsPanel() {
  const project = useStore((s) => s.project);
  const junction = useStore((s) => s.junction);
  const selection = useStore((s) => s.selection);
  const playhead = useStore((s) => s.playhead);
  const commit = useStore((s) => s.commit);
  const [cat, setCat] = useState<TransitionCat | 'all'>('all');
  const main = mainTrack(project);
  // кому ставим переход: выбранный стык, выделенный клип основной дорожки (переход в конце клипа)
  // или — если ничего не выбрано — стык, ближайший к розовой линии времени
  let targetId: string | null = junction;
  if (!targetId && selection.length === 1) {
    const i = main.clips.findIndex((c) => c.id === selection[0]);
    if (i >= 0 && i < main.clips.length - 1) targetId = selection[0];
  }
  let auto = false;
  if (!targetId && main.clips.length > 1) {
    let best = Infinity;
    for (const c of main.clips.slice(0, -1)) {
      const d = Math.abs(clipEnd(c) - playhead);
      if (d < best) { best = d; targetId = c.id; }
    }
    auto = true;
  }
  const target = targetId ? (findClip(project, targetId)?.clip as MediaClip | undefined) : undefined;
  const cur = target?.transitionOut;
  const [dur, setDur] = useState(0.5);
  const durNow = cur?.duration ?? dur;
  const apply = (type: TransitionType | null) => {
    if (!targetId) { getState().toast('Переход ставится между двумя клипами — добавь на основную дорожку ещё одно видео или фото'); return; }
    commit((p) => setTransition(p, targetId!, type ? { type, duration: durNow } : null));
    if (type && auto) getState().toast('Переход поставлен на ближайший к курсору стык', 'ok');
  };
  const applyAll = () => {
    if (!cur) return;
    commit((p) => main.clips.slice(0, -1).reduce((acc, c) => setTransition(acc, c.id, { ...cur }), p));
    getState().toast('Переход поставлен на все стыки', 'ok');
  };
  const joints = Math.max(0, main.clips.length - 1);
  const list = TRANSITIONS.filter((t) => cat === 'all' || t.cat === cat);
  return (
    <>
      <div className="panel-head">Переходы · {TRANSITIONS.length}</div>
      <div className="panel-body">
        <p className="hint">
          {joints === 0 ? 'Переходы ставятся между двумя клипами на основной дорожке. Добавь хотя бы два.' :
            auto ? 'Нажми на переход — он встанет на стык рядом с курсором. Наведи мышь, чтобы посмотреть.' : 'Выбран стык. Нажми на переход, чтобы поставить его. Наведи мышь, чтобы посмотреть.'}
        </p>
        <div className="chips" style={{ margin: '10px 0 8px' }}>
          <button className={cat === 'all' ? 'active' : ''} onClick={() => setCat('all')}>Все</button>
          {TRANSITION_CATS.map((c) => <button key={c.id} className={cat === c.id ? 'active' : ''} onClick={() => setCat(c.id)}>{c.label}</button>)}
        </div>
        <div className="tile-grid">
          <button className={`tile ${target && !cur ? 'active' : ''}`} onClick={() => apply(null)} disabled={!target}>
            <TransitionThumb type={null} />
            <span className="label">Без перехода</span>
          </button>
          {list.map((t) => (
            <button key={t.type} className={`tile ${cur?.type === t.type ? 'active' : ''}`} onClick={() => apply(t.type)} disabled={!target} data-testid={`tr-${t.type}`}>
              <TransitionThumb type={t.type} />
              <span className="label">{t.label}</span>
            </button>
          ))}
        </div>
        <Slider label="Длительность" min={0.1} max={2} step={0.05} value={durNow} format={(v) => `${v.toFixed(2)} с`}
          onChange={(v) => { setDur(v); if (cur && targetId) commit((p) => setTransition(p, targetId!, { ...cur, duration: v }), `trdur-${targetId}`); }} />
        <button className="btn block" disabled={!cur || joints < 2} onClick={applyAll}>Поставить на все стыки</button>
      </div>
    </>
  );
}

// ---------- Фильтры ----------
/** Миниатюра фильтра: кадр клипа (или образец) через тот же расчёт цвета, что у плеера и экспорта. */
function FilterThumb({ id, src }: { id: string; src?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    let alive = true;
    const paint = (img: CanvasImageSource, iw: number, ih: number) => {
      if (!alive) return;
      // «заполнить»: кадр обрезается по миниатюре
      const k = Math.max(THUMB_W / iw, THUMB_H / ih);
      ctx.drawImage(img, (THUMB_W - iw * k) / 2, (THUMB_H - ih * k) / 2, iw * k, ih * k);
      if (id === 'none') return;
      const adj = { ...DEFAULT_COLOR, preset: id };
      const e = effectiveColor(adj);
      const data = ctx.getImageData(0, 0, THUMB_W, THUMB_H);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        const o = applyColorToPixel([d[i], d[i + 1], d[i + 2]], e);
        const g = gradePixel({}, null, [o[0] / 255, o[1] / 255, o[2] / 255], adj);
        d[i] = g[0] * 255; d[i + 1] = g[1] * 255; d[i + 2] = g[2] * 255;
      }
      ctx.putImageData(data, 0, 0);
    };
    if (src) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => paint(img, img.naturalWidth, img.naturalHeight);
      img.src = api.mediaUrl(src);
    } else {
      paint(effectScene(), THUMB_W, THUMB_H);
    }
    return () => { alive = false; };
  }, [id, src]);
  return <canvas ref={ref} width={THUMB_W} height={THUMB_H} className="swatch tr-thumb" />;
}

function FiltersPanel() {
  const sel = useSelected();
  const commit = useStore((s) => s.commit);
  const project = useStore((s) => s.project);
  const [cat, setCat] = useState<FilterCat | 'all'>('all');
  const clip = sel?.clip.type === 'media' && sel.asset?.kind !== 'audio' ? (sel.clip as MediaClip) : null;
  const thumb = clip && sel?.asset ? sel.asset.thumbs?.[Math.floor((sel.asset.thumbs?.length ?? 1) / 2)] ?? (sel.asset.kind === 'image' ? sel.asset.previewPath : undefined) : undefined;
  const setPreset = (id: string) => {
    if (!clip) { getState().toast('Сначала выдели видео или фото на таймлайне — фильтр встанет на него'); return; }
    commit((p) => updateClip(p, clip.id, { color: { ...clip.color, preset: id, presetAmount: clip.color.preset === id ? clip.color.presetAmount : 1 } }));
  };
  const applyAll = () => {
    if (!clip) return;
    commit((p) => p.tracks.flatMap((t) => t.clips).reduce((acc, c) => {
      if (c.type !== 'media') return acc;
      const a = project.assets.find((x) => x.id === c.assetId);
      if (!a || a.kind === 'audio') return acc;
      return updateClip(acc, c.id, { color: { ...c.color, preset: clip.color.preset, presetAmount: clip.color.presetAmount } });
    }, p));
    getState().toast('Фильтр применён ко всем клипам', 'ok');
  };
  const list = FILTER_PRESETS.filter((f) => f.id === 'none' || cat === 'all' || f.cat === cat);
  return (
    <>
      <div className="panel-head">Фильтры · {FILTER_PRESETS.length - 1}</div>
      <div className="panel-body">
        <p className="hint">{clip ? 'Миниатюры показывают твой кадр. Нажми, чтобы применить.' : 'Выдели видео или фото на таймлайне — фильтр применится к нему, а миниатюры покажут твой кадр.'}</p>
        {clip && clip.color.preset !== 'none' && (
          <Slider label="Сила фильтра" min={0} max={1} step={0.01} value={clip.color.presetAmount} format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => commit((p) => updateClip(p, clip.id, { color: { ...clip.color, presetAmount: v } }), `famt-${clip.id}`)} />
        )}
        <div className="chips" style={{ margin: '10px 0 8px' }}>
          <button className={cat === 'all' ? 'active' : ''} onClick={() => setCat('all')}>Все</button>
          {FILTER_CATS.map((c) => <button key={c.id} className={cat === c.id ? 'active' : ''} onClick={() => setCat(c.id)}>{c.label}</button>)}
        </div>
        <div className="tile-grid">
          {list.map((f) => (
            <button key={f.id} className={`tile ${clip?.color.preset === f.id ? 'active' : ''}`} onClick={() => setPreset(f.id)} data-testid={`filter-${f.id}`}>
              <FilterThumb id={f.id} src={thumb} />
              <span className="label">{f.label}</span>
            </button>
          ))}
        </div>
        {clip && <button className="btn block" style={{ marginTop: 10 }} onClick={applyAll}>Применить ко всем клипам</button>}
        <p className="hint small" style={{ marginTop: 10 }}>Яркость, контраст, насыщенность и теплота — справа во вкладке «Цвет».</p>
      </div>
    </>
  );
}

// ---------- ИИ ----------
function AiStatus({ clip, kind }: { clip: MediaClip; kind: 'removeBg' | 'denoise' }) {
  const r = clip[kind];
  if (!r.enabled) return null;
  if (aiCovers(r, clip.in, clip.out)) return <div className="status-line ok">Готово — уже в превью и экспорте</div>;
  return <div className="status-line err">Клип обрезали после обработки — запусти заново</div>;
}

export function AiTools({ compact = false }: { compact?: boolean }) {
  const sel = useSelected();
  const clip = sel?.clip.type === 'media' ? (sel.clip as MediaClip) : null;
  const asset = sel?.asset;
  const job = useClipJob(clip?.id);
  const busy = !!job;
  const setTab = useStore((s) => s.setLeftTab);
  const isVideo = asset?.kind === 'video';
  const hasAudio = !!asset?.hasAudio;
  const [stabStrength, setStabStrength] = useState(0.5);
  const [smooth, setSmooth] = useState(clip?.beauty?.smooth ?? 0.6);
  const [bright, setBright] = useState(clip?.beauty?.bright ?? 0.3);
  useEffect(() => { if (clip?.beauty) { setSmooth(clip.beauty.smooth); setBright(clip.beauty.bright); } }, [clip?.id, clip?.beauty]);
  return (
    <>
      {!compact && (
        <div className="ai-card">
          <h4><Captions size={15} />Автосубтитры</h4>
          <p className="hint">Русский и английский, по словам, с редактированием.</p>
          <button className="btn block" onClick={() => setTab('captions')}>Открыть субтитры</button>
        </div>
      )}
      {!clip && !compact && <p className="hint" style={{ margin: '14px 0 4px' }}>Для остальных инструментов выдели клип на таймлайне.</p>}
      {job && <div className="ai-card"><div className="hint">{job.label}{job.stage ? ` · ${job.stage}` : ''}</div><Progress value={job.progress} /></div>}

      {asset?.kind !== 'audio' && <div className={`ai-card ${!clip || !isVideo ? 'off' : ''}`}>
        <h4><ImageIcon size={15} />Удалить фон</h4>
        <p className="hint">Вырезает человека из видео. Под ним — фон проекта или нижняя дорожка.</p>
        {clip && isVideo ? (
          clip.removeBg.enabled ? (
            <>
              <AiStatus clip={clip} kind="removeBg" />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {!aiCovers(clip.removeBg, clip.in, clip.out) && <button className="btn small" disabled={busy} onClick={() => void removeBackground(clip.id)}>Обработать заново</button>}
                <button className="btn small" onClick={() => disableRemoveBg(clip.id)}>Вернуть фон</button>
              </div>
            </>
          ) : <button className="btn block" disabled={busy} onClick={() => void removeBackground(clip.id)} data-testid="ai-removebg">Удалить фон</button>
        ) : <div className="hint small">Нужен видеоклип</div>}
      </div>}

      <div className={`ai-card ${!clip || !hasAudio ? 'off' : ''}`}>
        <h4><AudioLines size={15} />Чистый голос</h4>
        <p className="hint">Убирает шум, гул и ветер, оставляя речь.</p>
        {clip && hasAudio ? (
          clip.denoise.enabled ? (
            <>
              <AiStatus clip={clip} kind="denoise" />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {!aiCovers(clip.denoise, clip.in, clip.out) && <button className="btn small" disabled={busy} onClick={() => void enhanceVoice(clip.id)}>Обработать заново</button>}
                <button className="btn small" onClick={() => disableDenoise(clip.id)}>Выключить</button>
              </div>
            </>
          ) : <button className="btn block" disabled={busy} onClick={() => void enhanceVoice(clip.id)} data-testid="ai-denoise">Очистить голос</button>
        ) : <div className="hint small">Нужен клип со звуком</div>}
      </div>

      {asset?.kind !== 'audio' && (
        <div className={`ai-card ${!clip || !isVideo ? 'off' : ''}`}>
          <h4><Move size={15} />Стабилизация</h4>
          <p className="hint">Убирает тряску камеры. Края слегка обрезаются, чтобы не было чёрных полос.</p>
          {clip && isVideo ? (
            clip.stab?.enabled ? (
              <>
                {aiCovers(clip.stab, clip.in, clip.out)
                  ? <div className="status-line ok">Готово — уже в превью и экспорте</div>
                  : <div className="status-line err">Клип обрезали после обработки — запусти заново</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {!aiCovers(clip.stab, clip.in, clip.out) && <button className="btn small" disabled={busy} onClick={() => void stabilizeClip(clip.id, stabStrength)}>Заново</button>}
                  <button className="btn small" onClick={() => disableStab(clip.id)}>Выключить</button>
                </div>
              </>
            ) : (
              <>
                <Slider label="Сила" min={0} max={1} step={0.05} value={stabStrength} format={(v) => `${Math.round(v * 100)}%`} onChange={setStabStrength} />
                <button className="btn block" disabled={busy} onClick={() => void stabilizeClip(clip.id, stabStrength)} data-testid="ai-stab">Стабилизировать</button>
              </>
            )
          ) : <div className="hint small">Нужен видеоклип</div>}
        </div>
      )}

      {asset?.kind !== 'audio' && (
        <div className={`ai-card ${!clip || !isVideo ? 'off' : ''}`}>
          <h4><Smile size={15} />Ретушь лица</h4>
          <p className="hint">Сглаживает и осветляет кожу, остальной кадр не трогает.</p>
          {clip && isVideo ? (
            <>
              <Slider label="Сглаживание кожи" min={0} max={1} step={0.05} value={smooth} format={(v) => `${Math.round(v * 100)}%`} onChange={setSmooth} testId="beauty-smooth" />
              <Slider label="Осветление" min={0} max={1} step={0.05} value={bright} format={(v) => `${Math.round(v * 100)}%`} onChange={setBright} testId="beauty-bright" />
              {clip.beauty?.enabled && (aiCovers(clip.beauty, clip.in, clip.out)
                ? <div className="status-line ok">Готово — уже в превью и экспорте</div>
                : <div className="status-line err">Клип обрезали после обработки — примени заново</div>)}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn grow" disabled={busy || (smooth < 0.01 && bright < 0.01)} onClick={() => void retouchClip(clip.id, smooth, bright)} data-testid="ai-beauty">
                  {clip.beauty?.enabled ? 'Применить заново' : 'Применить'}
                </button>
                {clip.beauty?.enabled && <button className="btn" onClick={() => disableRetouch(clip.id)} data-testid="ai-beauty-off">Убрать</button>}
              </div>
            </>
          ) : <div className="hint small">Нужен видеоклип</div>}
        </div>
      )}

      {asset?.kind !== 'audio' && (
        <div className={`ai-card ${!clip || !isVideo ? 'off' : ''}`}>
          <h4><Crop size={15} />Автокадрирование</h4>
          <p className="hint">Для вертикального ролика из горизонтального видео: кадр сам следует за человеком.</p>
          {clip && isVideo
            ? <button className="btn block" disabled={busy} onClick={() => void autoReframe(clip.id)} data-testid="ai-reframe">Следить за человеком</button>
            : <div className="hint small">Нужен видеоклип</div>}
        </div>
      )}

      <div className={`ai-card ${!clip || !hasAudio ? 'off' : ''}`}>
        <h4><Mic size={15} />Изменить голос</h4>
        <p className="hint">Эффект для звука клипа. Чистка шума сохраняется.</p>
        {clip && hasAudio ? (
          <div className="voice-grid">
            {VOICE_FX.map((v) => (
              <button key={v.id} className={`btn small ${(clip.voice?.effect ?? 'none') === v.id && (v.id === 'none' || aiCovers(clip.voice, clip.in, clip.out)) ? 'on' : ''}`}
                disabled={busy} onClick={() => void setVoiceEffect(clip.id, v.id)} data-testid={`voice-${v.id}`}>{v.label}</button>
            ))}
          </div>
        ) : <div className="hint small">Нужен клип со звуком</div>}
      </div>

      <div className={`ai-card ${!clip || !hasAudio ? 'off' : ''}`}>
        <h4><Wand2 size={15} />Убрать паузы</h4>
        <p className="hint">Находит тишину между фразами и вырезает её — ролик становится плотнее.</p>
        {clip && hasAudio
          ? <button className="btn block" disabled={busy} onClick={() => void removePauses(clip.id)} data-testid="ai-pauses">Убрать паузы</button>
          : <div className="hint small">Нужен клип со звуком</div>}
      </div>
    </>
  );
}

function AiPanel() {
  return (
    <>
      <div className="panel-head">ИИ-инструменты</div>
      <div className="panel-body"><AiTools /></div>
    </>
  );
}
