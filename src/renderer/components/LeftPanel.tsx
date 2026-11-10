import { tx } from '../../shared/i18n';
import { txj } from '../txj';
import {
  Clapperboard,
  Zap, AudioLines, BellRing, Blend, Volume2, Captions, Crop, Film, Image as ImageIcon, Layers, Mic, Move, Music, Palette, Plus,
  LayoutTemplate, Smile, Sparkles, Trash2, Type, Upload, Wand2, FolderOpen, Box, Shuffle, WandSparkles, MoreHorizontal, Search, SkipBack, ArrowRightToLine, Scissors, FileText, Languages, Play, Pause, FileUp, Download, Users, ZoomIn, ArrowLeftCircle, Speaker, Timer,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FILTER_CATS, FILTER_PRESETS, applyColorToPixel, effectiveColor, type FilterCat } from '../../shared/color';
import { gradePixel } from '../../shared/grade';
import { DEFAULT_COLOR, FONT_CATS, FONTS, HIGHLIGHTS, type FontCat, TEXT_ANIMS, TEXT_PRESETS, TRANSITION_CATS, TRANSITIONS, type TransitionCat, VOICE_FX } from '../../shared/defaults';
import { GL_TRANSITION_CATS } from '../../shared/gl/glsl';
import { applyGlEffects, drawAnyTransition } from '../engine/glDraw';
import { glEffects, glTransitions, useGlCatalog } from '../glRegistry';
import { retimeWords } from '../../shared/captions';
import { applyBlogStyle, BLOG_STYLES, CAP_GROUPS, captionLook, restyleCaptions, type BlogStyle } from '../../shared/blogCaptions';
import { togglePreview, usePreview } from '../audioPreview';
import { LANGS, guessLang, langInline, langLabel, routeFor, targetsFrom, type LangCode } from '../../shared/translate';
import type { ModelInfo, TtsVoiceId, VoiceInfo } from '../../shared/ipc';
import { DUB_PAIRS } from '../../shared/dub';
import { CLONE_OFFSET, CLONE_OFFSETS } from '../../shared/clone';
import { MEMES, type MemeId } from '../../shared/memes';
import { STICKER_GROUPS, STICKER_MOTIONS } from '../../shared/stickers';
import {
  addText, animAllCaptions, clipEnd, findClip, mainTrack, projectDuration, removeAsset, setTransition, styleAllCaptions, updateClip,
} from '../../shared/timeline';
import { EFFECT_CATS, EFFECTS, fxGeometry, particleEffects, type EffectCat } from '../../shared/effects';
import { drawParticles } from '../../shared/particles';
import { applyPixelEffects } from '../engine/effectsPreview';
import type { EffectType, MediaAsset, MediaClip, PersonFx, StickerMotion, TextAnimType, TextClip, TextStyle, TransitionType, WordHighlight } from '../../shared/types';
import {
  addAssetToTimeline, autoReframe, disableDenoise, disableRemoveBg, disableStab, enhanceVoice, importPaths, makeCaptions, pickAndImport, removeBackground, removePauses, translateCaptions,
  setVoiceEffect, stabilizeClip, retouchClip, startFromTemplate, saveAsTemplate, disableRetouch, startRecording, stopRecording, cancelRecording, voiceLevel,
  loadDemoFiles, tryTemplate, autoVariant, importAudio, findOnTimeline, importSubtitles, exportSubtitles, dubProject, setPersonFx, addSubscribe, cloneSelf, applyMeme, addSticker,
} from '../actions';
import { useMenu, type MenuEntry } from './Menu';
import { sampleCanvas, useSamplesReady } from '../sampleFrames';
import { listMics, recPrefs, type MicInfo } from '../recorder';
import { BUILTIN_TEMPLATES, TEMPLATE_CATS, templateDuration, type Template, type TemplateCat } from '../../shared/templates';
import { TemplatePreview } from './Home';
import { LibraryView } from './Library';
import { Objects3DPanel } from './Objects3D';
import { useClipJob, useJobRunning, useSelected } from '../hooks';
import { api, getState, useStore, type LeftTab } from '../store';
import { fmtDur, fmtTime, peakLevel } from '../util';
import { ColorField, FontPicker, Progress, Seg, Slider, Toggle } from './controls';
import { aiCovers, aiSource } from '../../shared/ai';
import { NEON_DEFAULT, personWanted } from '../../shared/person';
import { SUBSCRIBE_COLORS } from '../../shared/subscribe';
import { SFX, SFX_IDS, sfxFile, type SfxId } from '../../shared/sfx';

const TABS: { id: LeftTab; label: string; icon: ReactNode }[] = [
  { id: 'media', label: tx('Медиа'), icon: <Film size={19} /> },
  { id: 'audio', label: tx('Аудио'), icon: <Music size={19} /> },
  { id: 'text', label: tx('Текст'), icon: <Type size={19} /> },
  { id: 'captions', label: tx('Субтитры'), icon: <Captions size={19} /> },
  { id: 'effects', label: tx('Эффекты'), icon: <Zap size={19} /> },
  { id: 'transitions', label: tx('Переходы'), icon: <Blend size={19} /> },
  { id: 'filters', label: tx('Фильтры'), icon: <Palette size={19} /> },
  { id: 'ai', label: tx('ИИ'), icon: <Sparkles size={19} /> },
  { id: 'templates', label: tx('Шаблоны'), icon: <LayoutTemplate size={19} /> },
  { id: '3d', label: '3D', icon: <Box size={19} /> },
];

export function Rail() {
  const tab = useStore((s) => s.leftTab);
  const setTab = useStore((s) => s.setLeftTab);
  return (
    <nav className="rail" aria-label={tx('Разделы')}>
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
            <span className="hint small">{txj('{0} кадров, {1}', t.slots.length, fmtDur(templateDuration(t)))}</span>
            <button className="btn primary block small" disabled={busy} onClick={() => void run(() => startFromTemplate(t, 'pick'))} data-testid="tpl-pick"><FolderOpen size={13} />{tx('Свои файлы…')}</button>
            <button className="btn block small" disabled={busy || !libCount} onClick={() => void run(() => startFromTemplate(t, 'library'))} data-testid="tpl-library">
              {txj('Из медиатеки{0}', libCount ? ` (${libCount})` : '')}</button>
            {hasDemo && <button className="btn ghost block small" disabled={busy} onClick={() => void run(() => tryTemplate(t))} data-testid="tpl-try">{tx('Пример')}</button>}
            {t.custom && <button className="btn ghost small" onClick={() => void api.deleteTemplate(t.id).then(refresh)}><Trash2 size={13} />{tx('Удалить шаблон')}</button>}
          </div>
        )}
      </div>
    );
  };
  const list = cat === 'mine' ? mine : BUILTIN_TEMPLATES.filter((t) => cat === 'all' || t.cat === cat);
  return (
    <>
      <div className="panel-head">{tx('Шаблоны')}</div>
      <div className="panel-body">
        <div className="auto-card" data-testid="tpl-auto-card">
          <b><WandSparkles size={15} />{tx('Авто-ролик')}</b>
          <span className="hint small">{tx('Kadro сам возьмёт лучшие куски видео и смонтирует их в ритм музыки.')}</span>
          <div className="row-btns">
            <button className="btn primary small" disabled={busy} onClick={() => getState().setAutoOpen({ files: autoLast?.files ?? [], fresh: false })} data-testid="tpl-auto">{autoLast ? tx('Настроить…') : tx('Собрать…')}</button>
            {autoLast && <button className="btn small" disabled={busy} onClick={() => void run(autoVariant)} title={tx('Другие куски видео и переходы, те же файлы и стиль')} data-testid="tpl-auto-variant"><Shuffle size={13} />{tx('Ещё вариант')}</button>}
          </div>
        </div>
        <div className="auto-card" data-testid="tpl-ref-card">
          <b><Clapperboard size={15} />{tx('Повторить по ролику')}</b>
          <span className="hint small">{tx('Как шаблоны CapCut: выбери понравившийся ролик — Kadro повторит его склейки, вспышки и музыку с твоими видео.')}</span>
          <div className="row-btns">
            <button className="btn small" disabled={busy} onClick={() => getState().setRefOpen({ fresh: false })} data-testid="tpl-ref">{tx('Выбрать ролик…')}</button>
          </div>
        </div>
        <div className="auto-card" data-testid="tpl-script-card">
          <b><FileText size={15} />{tx('Ролик по сценарию')}</b>
          <span className="hint small">{tx('Текст → озвучка, кадры из твоих видео и субтитры точно по тексту.')}</span>
          <div className="row-btns">
            <button className="btn small" disabled={busy} onClick={() => getState().setScriptOpen(true)} data-testid="tpl-script">{tx('Написать сценарий…')}</button>
          </div>
        </div>
        <p className="hint">{tx('Готовый монтаж с переходами, цветом, эффектами и надписями. Наведи на шаблон, чтобы посмотреть, нажми — и выбери свои видео и фото по порядку.')}</p>
        <div className="chips">
          <button className={cat === 'all' ? 'active' : ''} onClick={() => setCat('all')}>{tx('Все')}</button>
          {TEMPLATE_CATS.map((c) => <button key={c.id} className={cat === c.id ? 'active' : ''} onClick={() => setCat(c.id)}>{c.label}</button>)}
          {mine.length > 0 && <button className={cat === 'mine' ? 'active' : ''} onClick={() => setCat('mine')}>{tx('Мои шаблоны')}</button>}
        </div>
        <div className="tpl-list">{list.map(card)}</div>
        {cat === 'all' && mine.length > 0 && (<><div className="sub-head">{tx('Мои шаблоны')}</div><div className="tpl-list">{mine.map(card)}</div></>)}
        <div className="sub-head">{tx('Сохранить свой')}</div>
        <p className="hint small">{tx('Длительности клипов основной дорожки, переходы, цвет, эффекты, наезды и надписи станут шаблоном — без самих видео.')}</p>
        <div className="row-btns">
          <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder={tx('Название')} value={name} onChange={(e) => setName(e.target.value)} data-testid="tpl-name" />
          <button className="btn" disabled={!hasMain || busy} onClick={() => void run(async () => { if (await saveAsTemplate(name)) { setName(''); refresh(); } })} data-testid="tpl-save">{tx('Сохранить')}</button>
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
        <Upload size={15} />{accept === 'audio' ? tx('Добавить музыку') : tx('Добавить файлы')}
      </button>
      <span className="hint small">{compact ? tx('или перетащи файлы сюда') : accept === 'audio' ? tx('MP3, WAV, M4A, FLAC — или перетащи сюда') : tx('или перетащи сюда видео, фото, музыку')}</span>
    </div>
  );
}

function assetBadge(a: MediaAsset): string {
  if (a.missing) return tx('Файл не найден');
  if (a.proxy === 'pending') return tx('Готовлю…');
  if (a.proxy === 'error') return tx('Ошибка превью');
  return a.kind === 'video' ? fmtDur(a.duration) : a.kind === 'audio' ? fmtDur(a.duration) : tx('Фото');
}

/** Что можно сделать с файлом проекта: правая кнопка мыши или «⋯». */
function assetMenu(a: MediaAsset, used: boolean): MenuEntry[] {
  const audio = a.kind === 'audio';
  const remove = () => {
    if (!used || confirm(tx('Убрать «{0}» из проекта? Клипы с этим файлом пропадут с таймлайна.', a.name))) getState().commit((p) => removeAsset(p, a.id));
  };
  const piece: MenuEntry[] = a.kind === 'image' ? [] : [
    { label: tx('Взять кусок…'), hint: tx('начало и конец'), icon: <Scissors size={14} />, onClick: () => getState().setSourceView(a.id), disabled: a.missing, testId: 'menu-piece' },
  ];
  return [
    ...piece,
    ...(audio ? [
      { label: tx('На таймлайн с начала ролика'), icon: <SkipBack size={14} />, onClick: () => addAssetToTimeline(a.id, 'auto', 0), testId: 'menu-start', disabled: a.missing },
      { label: tx('На таймлайн к курсору'), icon: <Plus size={14} />, onClick: () => addAssetToTimeline(a.id, 'auto'), testId: 'menu-cursor', disabled: a.missing },
    ] : [
      { label: tx('На таймлайн к курсору'), icon: <Plus size={14} />, onClick: () => addAssetToTimeline(a.id, 'auto'), testId: 'menu-cursor', disabled: a.missing },
      { label: tx('В конец ролика'), icon: <ArrowRightToLine size={14} />, onClick: () => addAssetToTimeline(a.id, 'main', projectDuration(getState().project)), testId: 'menu-end', disabled: a.missing },
      { label: tx('Поверх видео'), hint: tx('картинка в картинке'), icon: <Layers size={14} />, onClick: () => addAssetToTimeline(a.id, 'overlay'), testId: 'menu-overlay', disabled: a.missing },
    ]),
    'sep',
    { label: tx('Найти на таймлайне'), icon: <Search size={14} />, onClick: () => findOnTimeline(a.id), disabled: !used, testId: 'menu-find' },
    { label: tx('Показать в папке'), icon: <FolderOpen size={14} />, onClick: () => api.showInFolder(a.path), disabled: a.missing, testId: 'menu-folder' },
    'sep',
    { label: tx('Убрать из проекта'), icon: <Trash2 size={14} />, onClick: remove, danger: true, testId: 'menu-remove' },
  ];
}

function MediaItem({ a, used, selected, onSelect }: { a: MediaAsset; used: boolean; selected: boolean; onSelect: (e: React.MouseEvent) => void }) {
  const thumb = a.thumbs?.[Math.floor((a.thumbs.length - 1) / 2)] ?? (a.kind === 'image' ? a.previewPath || a.path : undefined);
  const menu = useMenu();
  return (
    <div
      className={`media-item ${a.missing ? 'missing' : ''} ${selected ? 'selected' : ''}`} draggable data-testid="media-item" title={a.missing ? tx('Файл не найден: {0}', a.path) : a.name}
      onClick={onSelect}
      onDragStart={(e) => { e.dataTransfer.setData('application/x-kadro-asset', a.id); e.dataTransfer.effectAllowed = 'copy'; }}
      onDoubleClick={() => addAssetToTimeline(a.id, 'auto', a.kind === 'audio' && getState().audioPlace === 'start' ? 0 : undefined)}
      onContextMenu={(e) => menu.open(e, assetMenu(a, used))}
    >
      <div className="media-thumb" style={thumb ? { backgroundImage: `url("${api.mediaUrl(thumb)}")` } : undefined}>
        {!thumb && (a.kind === 'audio' ? <AudioLines size={22} /> : a.kind === 'image' ? <ImageIcon size={22} /> : <Film size={22} />)}
      </div>
      {used && <span className="used-dot" title={tx('Уже на таймлайне')} />}
      <div className="media-actions">
        <button title={a.kind === 'audio' ? tx('На таймлайн') : tx('На таймлайн к курсору')} onClick={(e) => { e.stopPropagation(); addAssetToTimeline(a.id, 'auto', a.kind === 'audio' && getState().audioPlace === 'start' ? 0 : undefined); }} data-testid="media-add"><Plus size={14} /></button>
        {a.kind !== 'image' && !a.missing && <button title={tx('Взять кусок: отметить начало и конец')} onClick={(e) => { e.stopPropagation(); getState().setSourceView(a.id); }} data-testid="media-piece"><Scissors size={14} /></button>}
        <button title={tx('Ещё: куда добавить, найти на таймлайне, показать в папке, убрать')} onClick={(e) => { e.stopPropagation(); menu.open(e, assetMenu(a, used)); }} data-testid="media-more"><MoreHorizontal size={14} /></button>
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
    if (added.length) { getState().select(added); getState().toast(tx('На таймлайне файлов: {0}', added.length), 'ok'); }
    setSel([]);
  };
  return (
    <>
      <div className="panel-head">{tx('Медиа')}</div>
      <div className="panel-body">
        <div className="media-switch" role="tablist">
          <button role="tab" aria-selected={view === 'project'} className={view === 'project' ? 'active' : ''} onClick={() => setView('project')} data-testid="media-view-project">
            {txj('В проекте{0}', assets.length ? ` · ${assets.length}` : '')}</button>
          <button role="tab" aria-selected={view === 'library'} className={view === 'library' ? 'active' : ''} onClick={() => setView('library')} data-testid="media-view-library">
            {tx('Библиотека')}</button>
        </div>
        {view === 'library' ? <LibraryView /> : (<>
        <DropZone accept="any" compact={assets.length > 0} />
        {assets.filter((a) => a.kind !== 'audio' && !a.missing).length > 1 && (
          <button className="btn block auto-from-media" onClick={() => getState().setAutoOpen({
            files: assets.filter((a) => a.kind !== 'audio' && !a.missing).map((a) => a.path),
            music: assets.find((a) => a.kind === 'audio' && !a.missing)?.path ?? null, fresh: false,
          })} data-testid="media-auto"><WandSparkles size={14} />{tx('Авто-ролик из этих файлов')}</button>
        )}
        {assets.length > 0 && (
          <>
            <div style={{ marginTop: 12 }}>
              <Seg value={filter} onChange={setFilter} options={[
                { value: 'all', label: tx('Все') }, { value: 'video', label: tx('Видео') }, { value: 'image', label: tx('Фото') }, { value: 'audio', label: tx('Звук') },
              ]} />
            </div>
            <div className="media-grid">{list.map((a) => <MediaItem key={a.id} a={a} used={used.has(a.id)} selected={sel.includes(a.id)} onSelect={(e) => onSelect(a, e)} />)}</div>
            {sel.length > 0 && (
              <div className="lib-bar media-bar" data-testid="media-bar">
                <span>{txj('Выбрано: {0}', sel.length)}</span>
                <button className="btn small" onClick={() => setSel([])}>{tx('Снять')}</button>
                <button className="btn small" onClick={() => placeSel('end')} data-testid="media-place-end">{tx('В конец')}</button>
                <button className="btn primary small" onClick={() => placeSel('auto')} data-testid="media-place">{tx('На таймлайн')}</button>
              </div>
            )}
            {!list.length && <p className="hint">{tx('Здесь пока пусто.')}</p>}
            <p className="hint small" style={{ marginTop: 12 }}>{tx('Двойной клик или «+» — на таймлайн к курсору. Ножницы — взять из видео только кусок. Щелчок с Ctrl или Shift — выбрать несколько. Правая кнопка мыши — всё, что можно сделать с файлом.')}</p>
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
    <div className={`audio-row ${a.missing ? 'missing' : ''}`} draggable title={a.missing ? tx('Файл не найден: {0}', a.path) : a.name} data-testid="audio-row"
      onDragStart={(e) => { e.dataTransfer.setData('application/x-kadro-asset', a.id); e.dataTransfer.effectAllowed = 'copy'; }}
      onDoubleClick={add} onContextMenu={(e) => menu.open(e, assetMenu(a, used))}>
      <PreviewWave id={a.id} path={a.path} peaks={a.peaks} disabled={a.missing} />
      <div className="audio-name">
        <span className="name">{a.name}</span>
        <span className="hint small">{fmtTime(a.duration)}{used ? tx(' · на таймлайне') : a.missing ? tx(' · файл не найден') : tx(' · только в списке')}</span>
      </div>
      {used && <button className="icon-btn" title={tx('Найти на таймлайне')} onClick={() => findOnTimeline(a.id)} data-testid="audio-find"><Search size={15} /></button>}
      <button className="icon-btn" title={place === 'start' ? tx('На таймлайн с начала ролика') : tx('На таймлайн к курсору')} onClick={add} data-testid="audio-add"><Plus size={16} /></button>
      <button className="icon-btn" title={tx('Ещё')} onClick={(e) => menu.open(e, assetMenu(a, used))} data-testid="audio-more"><MoreHorizontal size={16} /></button>
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
      <div className="panel-head">{tx('Аудио')}</div>
      <div className="panel-body">
        <RecordBox />
        <div className="audio-place">
          <span className="hint small">{tx('Куда класть добавленную музыку')}</span>
          <Seg value={place} onChange={(v) => getState().setAudioPlace(v)} options={[
            { value: 'start', label: tx('С начала') }, { value: 'cursor', label: tx('К курсору') }, { value: 'list', label: tx('Только в список') },
          ]} />
        </div>
        <DropZone accept="audio" compact={assets.length > 0} />
        {assets.length > 0 ? (
          <>
            <div className="audio-list">
              {assets.map((a) => <AudioRow key={a.id} a={a} used={used.has(a.id)} />)}
            </div>
            <p className="hint small" style={{ marginTop: 10 }}>{tx('Звук — на дорожках под видео. «Лупа» — показать, где файл на таймлайне. Правая кнопка мыши — все действия с файлом.')}</p>
          </>
        ) : (
          <p className="hint" style={{ marginTop: 14 }}>{tx('Музыка и звуки ложатся на отдельные дорожки под видео. Громкость, затухание и скорость — справа, когда клип выделен.')}</p>
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
      <div className="rec-title"><Mic size={15} />{tx('Запись голоса')}</div>
      {!rec ? (
        <>
          {mics.length > 1 && (
            <select className="input" value={mic} onChange={(e) => setMic(e.target.value)} data-testid="rec-mic">
              {mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          )}
          <Toggle label={tx('Заглушить звук проекта на время записи')} on={mute} onChange={setMute} hint={tx('Чтобы звук из колонок не попал в микрофон')} />
          <button className="btn rec-btn block" disabled={saving} onClick={() => void startRecording(mic, mute)} data-testid="rec-start">
            <span className="rec-dot" />{txj('Записать с {0}', fmtTime(playhead))}</button>
        </>
      ) : (
        <>
          <div className="rec-live">
            <span className="rec-dot blink" />
            <b data-testid="rec-time">{fmtTime(elapsed)}</b>
            <div className="rec-meter"><i style={{ width: `${Math.round(level * 100)}%` }} /></div>
          </div>
          <div className="row-btns">
            <button className="btn primary" onClick={() => void stopRecording()} data-testid="rec-stop">{tx('Готово')}</button>
            <button className="btn" onClick={cancelRecording} data-testid="rec-cancel">{tx('Отмена')}</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Волна звука с кнопкой «слушать»: щелчок по кнопке — пуск/пауза, по волне — слушать с этого места. */
export function PreviewWave({ id, path, peaks, disabled }: { id: string; path: string; peaks?: number[]; disabled?: boolean }) {
  const { playing, progress } = usePreview(id);
  return (
    <div className={`preview-wave ${playing ? 'playing' : ''}`}>
      <button className="preview-play" disabled={disabled} title={playing ? tx('Пауза') : tx('Послушать')} data-testid="audio-preview"
        onClick={(e) => { e.stopPropagation(); togglePreview(id, path); }} onDoubleClick={(e) => e.stopPropagation()}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="preview-track" onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        const r = e.currentTarget.getBoundingClientRect();
        togglePreview(id, path, Math.min(0.99, Math.max(0, (e.clientX - r.left) / r.width)));
      }} onDoubleClick={(e) => e.stopPropagation()}>
        <MiniWave peaks={peaks} />
        {progress > 0 && <span className="preview-pos" style={{ left: `${progress * 100}%` }} />}
      </div>
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
/** Образец стиля «как у блогеров»: произносимое слово подсвечено, ключевое — своим цветом, эмодзи над ними. */
function BlogSample({ b }: { b: BlogStyle }) {
  const st = { ...b.style };
  const words = b.group === '1' ? [tx('Огонь')] : b.group === '2' ? [tx('Это'), tx('огонь')] : [tx('Это'), tx('просто'), tx('огонь')];
  const hl = st.highlight?.mode && st.highlight.mode !== 'none' ? st.highlight : undefined;
  const last = words.length - 1;
  const wordStyle = (i: number): React.CSSProperties => {
    if (!hl) return i === last && b.keywords && st.keyColor ? { color: st.keyColor } : {};
    if (hl.mode === 'box') return i === last ? { background: hl.color, borderRadius: 4, padding: '0 3px' } : {};
    if (hl.mode === 'karaoke') return i < last ? { color: hl.color } : {};
    if (i === last) return { color: hl.color, display: 'inline-block', transform: hl.mode === 'pop' ? 'scale(1.15)' : undefined };
    return i === 0 && b.keywords && st.keyColor ? { color: st.keyColor } : {};
  };
  return (
    <div className="text-sample blog-sample">
      {b.emoji && <span className="blog-emoji">🔥</span>}
      <span style={{ ...textPreviewStyle(st), textTransform: st.uppercase ? 'uppercase' : undefined, fontSize: b.group === '1' ? 17 : 13 }}>
        {words.map((w, i) => <span key={i} style={wordStyle(i)}>{w}{i < last ? ' ' : ''}</span>)}
      </span>
    </div>
  );
}

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
  const add = (style?: Partial<TextStyle>, text = tx('Текст')) => {
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
      <div className="panel-head">{tx('Текст')}</div>
      <div className="panel-body">
        <button className="btn primary block" onClick={() => add()} data-testid="add-text"><Plus size={15} />{tx('Добавить текст')}</button>
        <p className="hint small" style={{ marginTop: 8 }}>{tx('Текст появится у курсора на таймлайне. Двигай его прямо в окне просмотра.')}</p>
        <div className="ai-card subscribe-card" data-testid="subscribe-card">
          <h4><BellRing size={15} />{tx('Кнопка «Подписаться»')}</h4>
          <p className="hint">{tx('Выскакивает, курсор нажимает — «Вы подписаны», звенит колокольчик. Длится 3 секунды.')}</p>
          <div className="subscribe-row">
            {SUBSCRIBE_COLORS.map((c) => (
              <button key={c.id} className="subscribe-swatch" style={{ background: c.color }} title={tx('Добавить: {0}', c.label)} onClick={() => addSubscribe(c.color)} data-testid={`add-subscribe-${c.id}`}>
                <BellRing size={13} />{tx('Подписаться')}
              </button>
            ))}
          </div>
        </div>
        <StickersCard />
        <div className="section-title">{tx('Готовые стили')}</div>
        <div className="tile-grid">
          {TEXT_PRESETS.map((t) => (
            <button key={t.id} className="tile text-tile" onClick={() => add(t.style)} title={tx('Добавить: {0}', t.label)}>
              <div className="text-sample"><span style={textPreviewStyle(t.style)}>{tx('Привет')}</span></div>
              <span className="label">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="section-title">{txj('Шрифты · {0}', FONTS.length)}</div>
        <div className="chips" style={{ marginBottom: 8 }}>
          <button className={fontCat === 'all' ? 'active' : ''} onClick={() => setFontCat('all')}>{tx('Все')}</button>
          {FONT_CATS.map((c) => <button key={c.id} className={fontCat === c.id ? 'active' : ''} onClick={() => setFontCat(c.id)}>{c.label}</button>)}
        </div>
        <div className="font-list">
          {FONTS.filter((f) => fontCat === 'all' || f.cat === fontCat).map((f) => (
            <button key={f.family} className="font-row" onClick={() => add({ font: f.family })} style={{ fontFamily: `'${f.family}'` }} title={tx('Добавить текст шрифтом {0}', f.label)}>
              {f.label} <span>{tx('Привет, мир')}</span>
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

/** Перевод субтитров без интернета (модели OPUS-MT): с какого, на какой, вместо оригинала или двумя строками. */
function TranslateCard({ captions }: { captions: TextClip[] }) {
  const [info, setInfo] = useState<{ pairs: string[]; sizes: Record<string, number>; ready: string[] } | null>(null);
  const running = useJobRunning('mt_');
  const guessed = useMemo(() => guessLang(captions.slice(0, 30).map((c) => c.text.split('\n')[0]).join(' ')), [captions]);
  const [from, setFrom] = useState<LangCode | null>(null);
  const [to, setTo] = useState<LangCode | null>(null);
  const [mode, setMode] = useState<'replace' | 'both'>('replace');
  useEffect(() => { void api.mtInfo().then(setInfo).catch(() => setInfo({ pairs: [], sizes: {}, ready: [] })); }, [running]);
  const have = useMemo(() => new Set(info?.pairs ?? []), [info]);
  const src = from ?? guessed;
  const targets = targetsFrom(src, have);
  const dst = to && targets.includes(to) ? to : targets.includes(src === 'en' ? 'ru' : 'en') ? (src === 'en' ? 'ru' : 'en') : targets[0];
  const route = dst ? routeFor(src, dst, have) ?? [] : [];
  const missing = route.filter((p) => !info?.ready.includes(p));
  const mb = Math.round(missing.reduce((n, p) => n + (info?.sizes[p] ?? 0), 0) / 1e6);
  const sources = LANGS.filter((l) => targetsFrom(l.code, have).length > 0);
  return (
    <div className="ai-card" data-testid="translate-card">
      <h4><Languages size={15} />{tx('Перевод субтитров')}</h4>
      <p className="hint">{tx('Переведу все субтитры на другой язык прямо на компьютере. Время и стиль не меняются.')}</p>
      {info && !info.pairs.length && <p className="hint">{tx('Нужен интернет, чтобы один раз скачать модель перевода.')}</p>}
      {info && info.pairs.length > 0 && <>
        <div className="mt-langs">
          <label>{tx('С языка')}<select className="input" value={src} onChange={(e) => setFrom(e.target.value as LangCode)} data-testid="mt-from">
              {sources.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
          <label>{tx('На язык')}<select className="input" value={dst ?? ''} onChange={(e) => setTo(e.target.value as LangCode)} data-testid="mt-to">
              {targets.map((c) => <option key={c} value={c}>{langLabel(c)}</option>)}
            </select>
          </label>
        </div>
        <Seg value={mode} onChange={setMode} options={[{ value: 'replace', label: tx('Вместо оригинала') }, { value: 'both', label: tx('Две строки') }]} />
        <p className="hint small" data-testid="mt-note">
          {route.length > 1 ? tx('Через английский. ') : ''}{missing.length ? tx('Модель скачается один раз, ~{0} МБ.', mb) : tx('Модель уже скачана — работает без интернета.')}
        </p>
        <button className="btn primary block" disabled={running || !dst} onClick={() => dst && void translateCaptions(src, dst, mode)} data-testid="mt-run">
          {running ? tx('Перевожу…') : tx('Перевести на {0}', dst ? langInline(dst) : '…')}
        </button>
      </>}
    </div>
  );
}

/** Человек отдельным слоем (на удалении фона): портрет, неоновый контур, текст за человеком. */
function PersonCard({ clip, busy }: { clip: MediaClip | null; busy: boolean }) {
  const f = clip?.person ?? {};
  const ready = !!clip && !!aiSource(clip, 'removeBg');
  const set = (patch: Partial<PersonFx>) => { if (clip) void setPersonFx(clip.id, patch); };
  return (
    <div className={`ai-card person-card ${!clip ? 'off' : ''}`} data-testid="person-card">
      <h4><Sparkles size={15} />{tx('Человек отдельным слоем')}</h4>
      <p className="hint">{tx('Kadro вырежет человека и положит его поверх фона: фон можно размыть, вокруг человека — неон, надписи — за человеком.')}</p>
      {!clip ? <div className="hint small">{tx('Нужен видеоклип')}</div> : <>
        <Toggle label={tx('Портрет — фон размыт')} hint={tx('Как портретный режим на iPhone')} on={!!f.blur} testId="person-blur"
          onChange={(v) => set({ blur: v ? 0.6 : undefined })} />
        {!!f.blur && <Slider label={tx('Размытие фона')} min={0.1} max={1} step={0.05} value={f.blur} format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => set({ blur: v })} testId="person-blur-amount" />}
        <Toggle label={tx('Неоновый контур')} hint={tx('Светящийся контур вокруг человека, вспыхивает под бит музыки')} on={!!f.neon} testId="person-neon"
          onChange={(v) => set({ neon: v ? { ...NEON_DEFAULT } : undefined })} />
        {f.neon && <>
          <ColorField label={tx('Цвет неона')} value={f.neon.color} onChange={(color) => set({ neon: { ...f.neon!, color } })} />
          <Slider label={tx('Толщина')} min={4} max={40} step={1} value={f.neon.width} format={(v) => `${Math.round(v)}`}
            onChange={(width) => set({ neon: { ...f.neon!, width } })} testId="person-neon-width" />
          <Toggle label={tx('Вспыхивает под бит')} hint={tx('Нужен найденный ритм у музыки (вкладка «Аудио»), иначе — 2 раза в секунду')} on={f.neon.pulse}
            onChange={(pulse) => set({ neon: { ...f.neon!, pulse } })} testId="person-neon-pulse" />
        </>}
        <Toggle label={tx('Текст за человеком')} hint={tx('Надписи — за спиной человека, субтитры — всё равно сверху')} on={!!f.front} testId="person-front"
          onChange={(v) => set({ front: v || undefined })} />
        {personWanted(clip.person) && !ready && <p className="hint small">{busy ? tx('Вырезаю человека…') : tx('Нужно удалить фон — запустится само.')}</p>}
      </>}
    </div>
  );
}

/** «Клон себя»: копия клипа с другого момента или второй дубль поверх, с удалённым фоном. */
function CloneCard({ clip, busy }: { clip: MediaClip | null; busy: boolean }) {
  const project = useStore((s) => s.project);
  const [mode, setMode] = useState<'offset' | 'take'>('offset');
  const [seconds, setSeconds] = useState(CLONE_OFFSET);
  const takes = project.assets.filter((a) => a.kind === 'video' && !a.derived && a.id !== clip?.assetId);
  const [take, setTake] = useState<string>('');
  const takeId = takes.some((a) => a.id === take) ? take : takes[0]?.id ?? '';
  const run = () => { if (clip) void cloneSelf(clip.id, mode === 'offset' ? { kind: 'offset', seconds } : { kind: 'take', assetId: takeId }); };
  return (
    <div className={`ai-card ${!clip ? 'off' : ''}`} data-testid="clone-card">
      <h4><Users size={15} />{tx('Клон себя')}</h4>
      <p className="hint">{tx('Ты дважды в кадре. Камера должна стоять на месте: Kadro положит второго тебя поверх и уберёт у него фон.')}</p>
      {!clip ? <div className="hint small">{tx('Нужен видеоклип')}</div> : <>
        <Seg value={mode} onChange={setMode} testId="clone-mode"
          options={[{ value: 'offset', label: tx('Из этого же видео') }, { value: 'take', label: tx('Второй дубль') }]} />
        {mode === 'offset' ? <>
          <div className="field-row"><label>{tx('Второй ты — через')}</label></div>
          <div className="chips" data-testid="clone-offset">
            {CLONE_OFFSETS.map((v) => <button key={v} className={seconds === v ? 'active' : ''} onClick={() => setSeconds(v)} data-value={v}>{tx('{0} с', v)}</button>)}
          </div>
          <p className="hint small">{tx('Подойди в другое место кадра и продолжай — Kadro возьмёт тебя с того момента. Звук клона выключен.')}</p>
        </> : takes.length ? (
          <select value={takeId} onChange={(e) => setTake(e.target.value)} data-testid="clone-take">
            {takes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        ) : <p className="hint small">{tx('Добавь в проект второй дубль — видео с того же места камеры.')}</p>}
        <button className="btn block" disabled={busy || (mode === 'take' && !takeId)} onClick={run} data-testid="clone-run">
          {busy ? tx('Делаю клона…') : tx('Сделать клона')}</button>
      </>}
    </div>
  );
}

/** Послушать звук стыка. */
function playSfx(id: SfxId): void {
  const f = sfxFile(id);
  if (!f) return;
  try { const a = new Audio(api.mediaUrl(f)); a.volume = SFX[id].vol; void a.play().catch(() => undefined); } catch { /* без звука */ }
}

const DUB_VOICES: Record<'ru' | 'en', TtsVoiceId[]> = { en: ['amy', 'ryan'], ru: ['irina', 'dmitri', 'denis', 'ruslan'] };

/** Дубляж: речь ролика → перевод → озвучка другим голосом по тем же таймингам. */
function DubCard({ captions }: { captions: TextClip[] }) {
  const guessed = useMemo(() => (captions.length ? guessLang(captions.slice(0, 30).map((c) => c.text.split('\n')[0]).join(' ')) : null), [captions]);
  const [pair, setPair] = useState<number | null>(null);
  const pi = pair ?? (guessed === 'en' ? 1 : 0);
  const { from, to } = DUB_PAIRS[pi];
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voice, setVoice] = useState<TtsVoiceId | null>(null);
  const [original, setOriginal] = useState<'duck' | 'mute'>('duck');
  const [subs, setSubs] = useState(true);
  const [stage, setStage] = useState<string | null>(null);
  useEffect(() => { void api.ttsVoices().then(setVoices).catch(() => undefined); }, [stage]);
  const list = DUB_VOICES[to as 'ru' | 'en'];
  const v = voice && list.includes(voice) ? voice : list[0];
  const info = voices.find((x) => x.id === v);
  const run = async () => {
    setStage(tx('Готовлю'));
    try { await dubProject({ from, to, voice: v, original, subs }, (label) => setStage(label)); } finally { setStage(null); }
  };
  return (
    <div className="ai-card" data-testid="dub-card">
      <h4><AudioLines size={15} />{tx('Дубляж')}</h4>
      <p className="hint">{tx('Переведу речь и озвучу другим голосом по тем же таймингам — прямо на компьютере. Как в HeyGen, только бесплатно.')}</p>
      <Seg value={pi} onChange={setPair} testId="dub-pair" options={DUB_PAIRS.map((d, i) => ({ value: i, label: d.label }))} />
      <div className="field">
        <div className="field-row"><label>{tx('Голос')}</label></div>
        <div className="chips dub-voices">
          {list.map((id) => {
            const x = voices.find((y) => y.id === id);
            return <button key={id} className={v === id ? 'active' : ''} disabled={!!stage} onClick={() => setVoice(id)} title={x?.label} data-testid={`dub-voice-${id}`}>{x?.label.split(' ')[0] ?? id}</button>;
          })}
        </div>
      </div>
      <div className="field">
        <div className="field-row"><label>{tx('Оригинальная речь')}</label></div>
        <Seg value={original} onChange={setOriginal} testId="dub-original" options={[{ value: 'duck', label: tx('Тихо под голосом') }, { value: 'mute', label: tx('Выключить') }]} />
      </div>
      <Toggle label={tx('Субтитры — на языке дубляжа')} on={subs} onChange={setSubs} testId="dub-subs" />
      <p className="hint small">{!captions.length ? tx('Субтитров ещё нет — сначала распознаю речь. ') : ''}{info && !info.ready ? tx('Голос скачается один раз, ~{0} МБ.', info.sizeMb) : ''}</p>
      <button className="btn primary block" disabled={!!stage} onClick={() => void run()} data-testid="dub-run">
        {stage ? `${stage}…` : tx('Сделать дубляж на {0}', langInline(to))}
      </button>
    </div>
  );
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
  const project = useStore((s) => s.project);
  const look = useMemo(() => (captions.length ? captionLook(project) : null), [project, captions.length]);
  return (
    <>
      <div className="panel-head">{tx('Субтитры')}</div>
      <div className="panel-body">
        <div className="ai-card">
          <h4><Wand2 size={15} />{tx('Автосубтитры')}</h4>
          <p className="hint">{tx('Распознаю речь со всего таймлайна и расставлю субтитры по словам. Работает без интернета.')}</p>
          <div className="model-list">
            {models.map((m) => (
              <label key={m.id} className={`model ${model === m.id ? 'active' : ''}`}>
                <input type="radio" name="asr" checked={model === m.id} onChange={() => setModel(m.id)} />
                <div>
                  <div>{m.label}</div>
                  <div className="hint small">{m.note} · {m.ready ? tx('скачана') : tx('скачается один раз, {0} МБ', m.sizeMb)}</div>
                </div>
              </label>
            ))}
          </div>
          <Toggle label={tx('Слушать и музыкальные дорожки')} hint={tx('Обычно выключено: песни мешают распознаванию')} on={music} onChange={setMusic} />
          <button className="btn primary block" disabled={running} onClick={() => void makeCaptions(model, music)} data-testid="make-captions">
            {running ? tx('Распознаю…') : captions.length ? tx('Создать заново') : tx('Создать субтитры')}
          </button>
        </div>

        <div className="ai-card" data-testid="subs-file">
          <h4><FileText size={15} />{tx('Готовые субтитры')}</h4>
          <p className="hint">{tx('Файл .srt или .vtt: время и текст встанут как в файле. Можно просто перетащить файл в окно.')}</p>
          <div className="col-btns">
            <button className="btn block" onClick={() => void importSubtitles()} data-testid="subs-import"><FileUp size={15} />{tx('Загрузить .srt / .vtt')}</button>
            {first && <button className="btn block" onClick={() => void exportSubtitles()} data-testid="subs-export"><Download size={15} />{tx('Сохранить .srt')}</button>}
          </div>
        </div>

        {first && <TranslateCard captions={captions} />}
        <DubCard captions={captions} />

        {first && (
          <>
            <div className="section-title">{tx('Как у блогеров')}</div>
            <div className="tile-grid blog-grid" data-testid="blog-styles">
              {BLOG_STYLES.map((b) => (
                <button key={b.id} className="tile text-tile blog-tile" onClick={() => commit((p) => applyBlogStyle(p, b, vertical), 'blogstyle')} data-testid={`blog-${b.id}`}>
                  <BlogSample b={b} />
                  <span className="label">{b.label}</span>
                </button>
              ))}
            </div>
            {look && (
              <>
                <div className="field">
                  <div className="field-row"><label>{tx('Слов в субтитре')}</label></div>
                  <Seg testId="cap-group" value={look.group} onChange={(g) => commit((p) => restyleCaptions(p, { group: g }))} options={CAP_GROUPS} />
                </div>
                <Toggle label={tx('Ключевые слова цветом')} hint={tx('Числа, имена и главные слова — другим цветом')} on={look.keywords} testId="cap-keywords"
                  onChange={(v) => commit((p) => restyleCaptions(p, { keywords: v, style: v && !first.style.keyColor ? { keyColor: '#ffd400' } : undefined }))} />
                {look.keywords && (
                  <ColorField label={tx('Цвет ключевых слов')} value={first.style.keyColor ?? '#ffd400'}
                    onChange={(v) => commit((p) => styleAllCaptions(p, { keyColor: v }), 'keyc')} />
                )}
                <Toggle label={tx('Эмодзи по смыслу')} hint={tx('Над субтитром, когда звучит слово: деньги 💰, огонь 🔥, идея 💡')} on={look.emoji} testId="cap-emoji"
                  onChange={(v) => commit((p) => restyleCaptions(p, { emoji: v }))} />
              </>
            )}

            <div className="section-title">{tx('Стиль всех субтитров')}</div>
            <div className="tile-grid">
              {TEXT_PRESETS.map((t) => (
                <button key={t.id} className="tile text-tile" onClick={() => commit((p) => styleAllCaptions(p, t.style), 'capstyle')}>
                  <div className="text-sample"><span style={textPreviewStyle({ ...first.style, ...t.style })}>{tx('Субтитр')}</span></div>
                  <span className="label">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="field">
              <div className="field-row"><label>{tx('Шрифт')}</label></div>
              <FontPicker value={first.style.font} onChange={(font) => commit((p) => styleAllCaptions(p, { font }))} />
            </div>
            <Slider label={tx('Размер')} min={24} max={140} step={1} value={first.style.size} format={(v) => `${Math.round(v)}`}
              onChange={(v) => commit((p) => styleAllCaptions(p, { size: v }), 'capsize')} />
            <Slider label={tx('Высота на экране')} min={0.08} max={0.94} step={0.01} value={first.y} format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => commit((p) => styleAllCaptions(p, {}, v), 'capy')}
              onReset={() => commit((p) => styleAllCaptions(p, {}, vertical ? 0.64 : 0.86))} />
            <Toggle label={tx('Заглавными буквами')} on={first.style.uppercase} onChange={(v) => commit((p) => styleAllCaptions(p, { uppercase: v }))} />
            <div className="field">
              <div className="field-row"><label>{tx('Подсветка произносимого слова')}</label></div>
              <select className="input" value={first.style.highlight?.mode ?? 'none'} data-testid="cap-highlight"
                onChange={(e) => commit((p) => styleAllCaptions(p, { highlight: { color: first.style.highlight?.color ?? '#ffe14d', mode: e.target.value as WordHighlight['mode'] } }))}>
                {HIGHLIGHTS.map((h) => <option key={h.mode} value={h.mode}>{h.label}</option>)}
              </select>
            </div>
            {first.style.highlight && first.style.highlight.mode !== 'none' && (
              <ColorField label={tx('Цвет подсветки')} value={first.style.highlight.color}
                onChange={(v) => commit((p) => styleAllCaptions(p, { highlight: { ...first.style.highlight!, color: v } }), 'hlc')} />
            )}
            <div className="field">
              <div className="field-row"><label>{tx('Появление каждого субтитра')}</label></div>
              <select className="input" value={first.anim?.in?.type ?? 'none'} data-testid="cap-anim"
                onChange={(e) => commit((p) => animAllCaptions(p, e.target.value === 'none' ? undefined : { type: e.target.value as TextAnimType, dur: 0.2 }))}>
                <option value="none">{tx('Нет')}</option>
                {TEXT_ANIMS.map((a) => <option key={a.type} value={a.type}>{a.in}</option>)}
              </select>
            </div>

            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{txj('Текст ({0})', captions.length)}</span>
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
/** Образец для живых превью эффектов — настоящий кадр (мотоциклист в неоне). */
function effectScene(): HTMLCanvasElement { return sampleCanvas('neon', THUMB_W, THUMB_H); }

/** Миниатюра эффекта: в покое — один кадр, при наведении — эффект в движении. */
function EffectThumb({ type }: { type: EffectType }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false);
  const ready = useSamplesReady();
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
      applyGlEffects(layer, fake, t, 3);
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
  }, [type, hover, ready]);
  return <canvas ref={ref} width={THUMB_W} height={THUMB_H} className="swatch tr-thumb" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} />;
}

const MEME_ICONS: Record<MemeId, ReactNode> = { drama: <ZoomIn size={18} />, tbc: <ArrowLeftCircle size={18} />, bass: <Speaker size={18} />, slowmo: <Timer size={18} /> };

/** Стикеры: эмодзи крупно, с движением по кругу; движение видно при наведении. */
function StickersCard() {
  const [motion, setMotion] = useState<StickerMotion>('bounce');
  const [group, setGroup] = useState(STICKER_GROUPS[0].id);
  const items = STICKER_GROUPS.find((g) => g.id === group)?.items ?? [];
  return (
    <div className="ai-card sticker-card" data-testid="stickers">
      <h4><Smile size={15} />{tx('Стикеры')}</h4>
      <p className="hint">{tx('Эмодзи крупно, всё время в движении. Встаёт у курсора на 3 секунды — двигай и растягивай как текст.')}</p>
      <div className="chips" data-testid="sticker-motion">
        {STICKER_MOTIONS.map((m) => <button key={m.id} className={motion === m.id ? 'active' : ''} onClick={() => setMotion(m.id)} data-value={m.id}>{m.label}</button>)}
      </div>
      <div className="chips sticker-groups">
        {STICKER_GROUPS.map((g) => <button key={g.id} className={group === g.id ? 'active' : ''} onClick={() => setGroup(g.id)}>{g.label}</button>)}
      </div>
      <div className="sticker-grid" data-motion={motion}>
        {items.map((e) => (
          <button key={e} onClick={() => addSticker(e, motion)} title={tx('Добавить стикер')} data-testid="sticker"><span>{e}</span></button>
        ))}
      </div>
    </div>
  );
}

/** Мем-кнопки: мем начинается у розовой линии времени, со своим звуком; Ctrl+Z убирает целиком. */
function MemeButtons() {
  const [busy, setBusy] = useState<MemeId | null>(null);
  const run = async (id: MemeId) => { setBusy(id); try { await applyMeme(id); } finally { setBusy(null); } };
  return (
    <div className="meme-card" data-testid="memes">
      <div className="section-title">{tx('Мемы')}</div>
      <div className="meme-grid">
        {MEMES.map((m) => (
          <button key={m.id} className="meme-btn" disabled={!!busy} onClick={() => void run(m.id)} title={m.hint} data-testid={`meme-${m.id}`}>
            <span className="meme-ico">{MEME_ICONS[m.id]}</span>
            <b>{busy === m.id ? tx('Делаю…') : m.label}</b>
            <span className="hint small">{m.hint}</span>
          </button>
        ))}
      </div>
      <p className="hint small">{tx('Начинается у розовой линии времени, со своим звуком. Не понравилось — Ctrl+Z.')}</p>
    </div>
  );
}

function EffectsPanel() {
  const sel = useSelected();
  const commit = useStore((s) => s.commit);
  const [cat, setCat] = useState<EffectCat | 'shader' | 'plugins' | 'all'>('all');
  const clip = sel?.clip.type === 'media' && sel.asset?.kind !== 'audio' ? (sel.clip as MediaClip) : null;
  const toggle = (type: EffectType) => {
    if (!clip) { getState().toast(tx('Сначала выдели видео или фото на таймлайне — эффект встанет на него')); return; }
    const has = clip.effects?.some((e) => e.type === type);
    const def = EFFECTS.find((x) => x.type === type);
    const effects = has ? clip.effects!.filter((e) => e.type !== type) : [...(clip.effects ?? []), { type, amount: def?.toggle ? 1 : 0.6 }];
    commit((p) => updateClip(p, clip.id, { effects: effects.length ? effects : undefined }));
  };
  useGlCatalog();
  // встроенные эффекты + шейдеры (свои Kadro и плагины пользователя)
  const shaders = glEffects().map((d) => ({ type: d.id as EffectType, label: d.name, hint: d.description ?? '', cat: (d.source ? 'plugins' : 'shader') as EffectCat | 'shader' | 'plugins' }));
  const all: { type: EffectType; label: string; hint: string; cat: EffectCat | 'shader' | 'plugins' }[] = [...EFFECTS, ...shaders];
  const list = all.filter((e) => cat === 'all' || e.cat === cat);
  const hasPlugins = shaders.some((x) => x.cat === 'plugins');
  return (
    <>
      <div className="panel-head">{txj('Эффекты · {0}', all.length)}</div>
      <div className="panel-body">
        <MemeButtons />
        <p className="hint">{clip ? tx('Нажми — эффект добавится, ещё раз — уберётся. Наведи мышь, чтобы посмотреть. Сила — справа, во вкладке «Эффекты».') : tx('Выдели клип на таймлайне — эффекты применяются к нему. Наведи мышь на эффект, чтобы посмотреть.')}</p>
        <div className="chips" style={{ margin: '10px 0 8px' }}>
          <button className={cat === 'all' ? 'active' : ''} onClick={() => setCat('all')}>{tx('Все')}</button>
          {EFFECT_CATS.map((c) => <button key={c.id} className={cat === c.id ? 'active' : ''} onClick={() => setCat(c.id)}>{c.label}</button>)}
          <button className={cat === 'shader' ? 'active' : ''} onClick={() => setCat('shader')} data-testid="fxcat-shader">{tx('Шейдеры')}</button>
          {hasPlugins && <button className={cat === 'plugins' ? 'active' : ''} onClick={() => setCat('plugins')} data-testid="fxcat-plugins">{tx('Плагины')}</button>}
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
/** Два настоящих кадра для живых превью переходов: дорога на закате → мотоциклист в неоне. */
const THUMB_W = 192;
const THUMB_H = 108;
function sampleFrames(): [HTMLCanvasElement, HTMLCanvasElement] {
  return [sampleCanvas('road', THUMB_W, THUMB_H), sampleCanvas('neon', THUMB_W, THUMB_H)];
}

/** Миниатюра перехода: в покое — середина перехода, при наведении — перехода целиком по кругу. */
function TransitionThumb({ type }: { type: TransitionType | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false);
  const ready = useSamplesReady();
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    const scratch = document.createElement('canvas');
    scratch.width = THUMB_W; scratch.height = THUMB_H;
    const [a, b] = sampleFrames();
    const draw = (p: number) => {
      if (!type) { ctx.drawImage(p < 0.5 ? a : b, 0, 0); return; }
      drawAnyTransition(ctx, type, p, a, b, THUMB_W, THUMB_H, scratch);
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
  }, [type, hover, ready]);
  return <canvas ref={ref} width={THUMB_W} height={THUMB_H} className="swatch tr-thumb" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} />;
}

function TransitionsPanel() {
  const project = useStore((s) => s.project);
  const junction = useStore((s) => s.junction);
  const selection = useStore((s) => s.selection);
  const playhead = useStore((s) => s.playhead);
  const commit = useStore((s) => s.commit);
  const [cat, setCat] = useState<string>('all');
  useGlCatalog();
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
    if (!targetId) { getState().toast(tx('Переход ставится между двумя клипами — добавь на основную дорожку ещё одно видео или фото')); return; }
    commit((p) => setTransition(p, targetId!, type ? { type, duration: durNow } : null));
    if (type && auto) getState().toast(tx('Переход поставлен на ближайший к курсору стык'), 'ok');
  };
  const applyAll = () => {
    if (!cur) return;
    commit((p) => main.clips.slice(0, -1).reduce((acc, c) => setTransition(acc, c.id, { ...cur }), p));
    getState().toast(tx('Переход поставлен на все стыки'), 'ok');
  };
  const joints = Math.max(0, main.clips.length - 1);
  const setSound = (id: SfxId | null) => {
    if (!targetId) { getState().toast(tx('Звук ставится на стык двух клипов — добавь на основную дорожку ещё одно видео или фото')); return; }
    commit((p) => updateClip(p, targetId!, { cutSound: id ?? undefined }));
  };
  const soundAll = () => {
    const id = target?.cutSound;
    if (!id) return;
    commit((p) => main.clips.slice(0, -1).reduce((acc, c) => updateClip(acc, c.id, { cutSound: id }), p));
    getState().toast(tx('Звук стоит на всех стыках: {0}', joints), 'ok');
  };
  // встроенные + 123 шейдера gl-transitions + плагины пользователя
  const shaders = glTransitions().map((d) => ({ type: d.id as TransitionType, label: d.name, cat: d.source ? 'plugins' : d.cat, hint: d.author ? tx('{0} — автор {1}', d.name, d.author) : d.name }));
  const all: { type: TransitionType; label: string; cat: string; hint?: string }[] = [...TRANSITIONS, ...shaders];
  const list = all.filter((t) => cat === 'all' || t.cat === cat);
  const glCats = GL_TRANSITION_CATS.filter((c) => shaders.some((x) => x.cat === c.id));
  const hasPlugins = shaders.some((x) => x.cat === 'plugins');
  return (
    <>
      <div className="panel-head">{txj('Переходы · {0}', all.length)}</div>
      <div className="panel-body">
        <p className="hint">
          {joints === 0 ? tx('Переходы ставятся между двумя клипами на основной дорожке. Добавь хотя бы два.') :
            auto ? tx('Нажми на переход — он встанет на стык рядом с курсором. Наведи мышь, чтобы посмотреть.') : tx('Выбран стык. Нажми на переход, чтобы поставить его. Наведи мышь, чтобы посмотреть.')}
        </p>
        <div className="chips" style={{ margin: '10px 0 8px' }}>
          <button className={cat === 'all' ? 'active' : ''} onClick={() => setCat('all')}>{tx('Все')}</button>
          {TRANSITION_CATS.map((c) => <button key={c.id} className={cat === c.id ? 'active' : ''} onClick={() => setCat(c.id)}>{c.label}</button>)}
          {glCats.map((c) => <button key={c.id} className={`gl ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)} data-testid={`trcat-${c.id}`}>{c.label}</button>)}
          {hasPlugins && <button className={cat === 'plugins' ? 'active' : ''} onClick={() => setCat('plugins')} data-testid="trcat-plugins">{tx('Плагины')}</button>}
        </div>
        <div className="tile-grid">
          <button className={`tile ${target && !cur ? 'active' : ''}`} onClick={() => apply(null)} disabled={!target}>
            <TransitionThumb type={null} />
            <span className="label">{tx('Без перехода')}</span>
          </button>
          {list.map((t) => (
            <button key={t.type} className={`tile ${cur?.type === t.type ? 'active' : ''}`} onClick={() => apply(t.type)} disabled={!target} data-testid={`tr-${t.type}`} title={t.hint}>
              <TransitionThumb type={t.type} />
              <span className="label">{t.label}</span>
            </button>
          ))}
        </div>
        <Slider label={tx('Длительность')} min={0.1} max={2} step={0.05} value={durNow} format={(v) => tx('{0} с', v.toFixed(2))}
          onChange={(v) => { setDur(v); if (cur && targetId) commit((p) => setTransition(p, targetId!, { ...cur, duration: v }), `trdur-${targetId}`); }} />
        <button className="btn block" disabled={!cur || joints < 2} onClick={applyAll}>{tx('Поставить на все стыки')}</button>

        <div className="section-title">{tx('Звук на стыке')}</div>
        <div className="chips" data-testid="sfx-chips">
          <button className={target && !target.cutSound ? 'active' : ''} disabled={!target} onClick={() => setSound(null)} data-testid="sfx-none">{tx('Нет')}</button>
          {SFX_IDS.map((id) => (
            <button key={id} className={target?.cutSound === id ? 'active' : ''} disabled={!target} onClick={() => { setSound(id); playSfx(id); }} data-testid={`sfx-${id}`}>
              <Volume2 size={12} />{SFX[id].label}
            </button>
          ))}
        </div>
        <p className="hint small">{tx('Свуш — на быстрых переходах, щелчок — на резких склейках, «бум» — на главном моменте.')}</p>
        <button className="btn block" disabled={!target?.cutSound || joints < 2} onClick={soundAll} data-testid="sfx-all">{tx('Звук на все стыки')}</button>
      </div>
    </>
  );
}

// ---------- Фильтры ----------
/** Миниатюра фильтра: кадр клипа (или образец) через тот же расчёт цвета, что у плеера и экспорта. */
function FilterThumb({ id, src }: { id: string; src?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ready = useSamplesReady();
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
      paint(sampleCanvas('valley', THUMB_W, THUMB_H), THUMB_W, THUMB_H); // долина: небо, зелень, снег — фильтр виден сразу
    }
    return () => { alive = false; };
  }, [id, src, ready]);
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
    if (!clip) { getState().toast(tx('Сначала выдели видео или фото на таймлайне — фильтр встанет на него')); return; }
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
    getState().toast(tx('Фильтр применён ко всем клипам'), 'ok');
  };
  const list = FILTER_PRESETS.filter((f) => f.id === 'none' || cat === 'all' || f.cat === cat);
  return (
    <>
      <div className="panel-head">{txj('Фильтры · {0}', FILTER_PRESETS.length - 1)}</div>
      <div className="panel-body">
        <p className="hint">{clip ? tx('Миниатюры показывают твой кадр. Нажми, чтобы применить.') : tx('Выдели видео или фото на таймлайне — фильтр применится к нему, а миниатюры покажут твой кадр.')}</p>
        {clip && clip.color.preset !== 'none' && (
          <Slider label={tx('Сила фильтра')} min={0} max={1} step={0.01} value={clip.color.presetAmount} format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => commit((p) => updateClip(p, clip.id, { color: { ...clip.color, presetAmount: v } }), `famt-${clip.id}`)} />
        )}
        <div className="chips" style={{ margin: '10px 0 8px' }}>
          <button className={cat === 'all' ? 'active' : ''} onClick={() => setCat('all')}>{tx('Все')}</button>
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
        {clip && <button className="btn block" style={{ marginTop: 10 }} onClick={applyAll}>{tx('Применить ко всем клипам')}</button>}
        <p className="hint small" style={{ marginTop: 10 }}>{tx('Яркость, контраст, насыщенность и теплота — справа во вкладке «Цвет».')}</p>
      </div>
    </>
  );
}

// ---------- ИИ ----------
function AiStatus({ clip, kind }: { clip: MediaClip; kind: 'removeBg' | 'denoise' }) {
  const r = clip[kind];
  if (!r.enabled) return null;
  if (aiCovers(r, clip.in, clip.out)) return <div className="status-line ok">{tx('Готово — уже в превью и экспорте')}</div>;
  return <div className="status-line err">{tx('Клип обрезали после обработки — запусти заново')}</div>;
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
          <h4><Captions size={15} />{tx('Автосубтитры')}</h4>
          <p className="hint">{tx('Русский и английский, по словам, с редактированием.')}</p>
          <button className="btn block" onClick={() => setTab('captions')}>{tx('Открыть субтитры')}</button>
        </div>
      )}
      {!compact && (
        <div className="ai-card">
          <h4><Scissors size={15} />{tx('Нарезать в шортсы')}</h4>
          <p className="hint">{tx('Длинное видео → лучшие моменты → вертикальные ролики с субтитрами и крючком.')}</p>
          <button className="btn block" onClick={() => getState().setShortsOpen(true)} data-testid="ai-shorts">{tx('Найти моменты')}</button>
        </div>
      )}
      {!compact && (
        <div className="ai-card">
          <h4><AudioLines size={15} />{tx('Дубляж')}</h4>
          <p className="hint">{tx('Перевод речи и озвучка другим голосом по тем же таймингам: русский ⇄ английский.')}</p>
          <button className="btn block" onClick={() => setTab('captions')} data-testid="ai-dub">{tx('Открыть дубляж')}</button>
        </div>
      )}
      {!clip && !compact && <p className="hint" style={{ margin: '14px 0 4px' }}>{tx('Для остальных инструментов выдели клип на таймлайне.')}</p>}
      {job && <div className="ai-card"><div className="hint">{job.label}{job.stage ? ` · ${job.stage}` : ''}</div><Progress value={job.progress} /></div>}

      {asset?.kind !== 'audio' && <div className={`ai-card ${!clip || !isVideo ? 'off' : ''}`}>
        <h4><ImageIcon size={15} />{tx('Удалить фон')}</h4>
        <p className="hint">{tx('Вырезает человека из видео. Под ним — фон проекта или нижняя дорожка.')}</p>
        {clip && isVideo && personWanted(clip.person) ? (
          <p className="hint small" data-testid="removebg-person">{tx('Фон остаётся: вырезанный человек нужен для портрета, неона или текста за человеком (ниже).')}</p>
        ) : clip && isVideo ? (
          clip.removeBg.enabled ? (
            <>
              <AiStatus clip={clip} kind="removeBg" />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {!aiCovers(clip.removeBg, clip.in, clip.out) && <button className="btn small" disabled={busy} onClick={() => void removeBackground(clip.id)}>{tx('Обработать заново')}</button>}
                <button className="btn small" onClick={() => disableRemoveBg(clip.id)}>{tx('Вернуть фон')}</button>
              </div>
            </>
          ) : <button className="btn block" disabled={busy} onClick={() => void removeBackground(clip.id)} data-testid="ai-removebg">{tx('Удалить фон')}</button>
        ) : <div className="hint small">{tx('Нужен видеоклип')}</div>}
      </div>}

      {asset?.kind !== 'audio' && <PersonCard clip={clip && isVideo ? clip : null} busy={busy} />}
      {asset?.kind !== 'audio' && <CloneCard clip={clip && isVideo ? clip : null} busy={busy} />}

      <div className={`ai-card ${!clip || !hasAudio ? 'off' : ''}`}>
        <h4><AudioLines size={15} />{tx('Чистый голос')}</h4>
        <p className="hint">{tx('Убирает шум, гул и ветер, оставляя речь.')}</p>
        {clip && hasAudio ? (
          clip.denoise.enabled ? (
            <>
              <AiStatus clip={clip} kind="denoise" />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {!aiCovers(clip.denoise, clip.in, clip.out) && <button className="btn small" disabled={busy} onClick={() => void enhanceVoice(clip.id)}>{tx('Обработать заново')}</button>}
                <button className="btn small" onClick={() => disableDenoise(clip.id)}>{tx('Выключить')}</button>
              </div>
            </>
          ) : <button className="btn block" disabled={busy} onClick={() => void enhanceVoice(clip.id)} data-testid="ai-denoise">{tx('Очистить голос')}</button>
        ) : <div className="hint small">{tx('Нужен клип со звуком')}</div>}
      </div>

      {asset?.kind !== 'audio' && (
        <div className={`ai-card ${!clip || !isVideo ? 'off' : ''}`}>
          <h4><Move size={15} />{tx('Стабилизация')}</h4>
          <p className="hint">{tx('Убирает тряску камеры. Края слегка обрезаются, чтобы не было чёрных полос.')}</p>
          {clip && isVideo ? (
            clip.stab?.enabled ? (
              <>
                {aiCovers(clip.stab, clip.in, clip.out)
                  ? <div className="status-line ok">{tx('Готово — уже в превью и экспорте')}</div>
                  : <div className="status-line err">{tx('Клип обрезали после обработки — запусти заново')}</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {!aiCovers(clip.stab, clip.in, clip.out) && <button className="btn small" disabled={busy} onClick={() => void stabilizeClip(clip.id, stabStrength)}>{tx('Заново')}</button>}
                  <button className="btn small" onClick={() => disableStab(clip.id)}>{tx('Выключить')}</button>
                </div>
              </>
            ) : (
              <>
                <Slider label={tx('Сила')} min={0} max={1} step={0.05} value={stabStrength} format={(v) => `${Math.round(v * 100)}%`} onChange={setStabStrength} />
                <button className="btn block" disabled={busy} onClick={() => void stabilizeClip(clip.id, stabStrength)} data-testid="ai-stab">{tx('Стабилизировать')}</button>
              </>
            )
          ) : <div className="hint small">{tx('Нужен видеоклип')}</div>}
        </div>
      )}

      {asset?.kind !== 'audio' && (
        <div className={`ai-card ${!clip || !isVideo ? 'off' : ''}`}>
          <h4><Smile size={15} />{tx('Ретушь лица')}</h4>
          <p className="hint">{tx('Сглаживает и осветляет кожу, остальной кадр не трогает.')}</p>
          {clip && isVideo ? (
            <>
              <Slider label={tx('Сглаживание кожи')} min={0} max={1} step={0.05} value={smooth} format={(v) => `${Math.round(v * 100)}%`} onChange={setSmooth} testId="beauty-smooth" />
              <Slider label={tx('Осветление')} min={0} max={1} step={0.05} value={bright} format={(v) => `${Math.round(v * 100)}%`} onChange={setBright} testId="beauty-bright" />
              {clip.beauty?.enabled && (aiCovers(clip.beauty, clip.in, clip.out)
                ? <div className="status-line ok">{tx('Готово — уже в превью и экспорте')}</div>
                : <div className="status-line err">{tx('Клип обрезали после обработки — примени заново')}</div>)}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn grow" disabled={busy || (smooth < 0.01 && bright < 0.01)} onClick={() => void retouchClip(clip.id, smooth, bright)} data-testid="ai-beauty">
                  {clip.beauty?.enabled ? tx('Применить заново') : tx('Применить')}
                </button>
                {clip.beauty?.enabled && <button className="btn" onClick={() => disableRetouch(clip.id)} data-testid="ai-beauty-off">{tx('Убрать')}</button>}
              </div>
            </>
          ) : <div className="hint small">{tx('Нужен видеоклип')}</div>}
        </div>
      )}

      {asset?.kind !== 'audio' && (
        <div className={`ai-card ${!clip || !isVideo ? 'off' : ''}`}>
          <h4><Crop size={15} />{tx('Автокадрирование')}</h4>
          <p className="hint">{tx('Для вертикального ролика из горизонтального видео: кадр сам следует за человеком.')}</p>
          {clip && isVideo
            ? <button className="btn block" disabled={busy} onClick={() => void autoReframe(clip.id)} data-testid="ai-reframe">{tx('Следить за человеком')}</button>
            : <div className="hint small">{tx('Нужен видеоклип')}</div>}
        </div>
      )}

      <div className={`ai-card ${!clip || !hasAudio ? 'off' : ''}`} data-testid="studio-card">
        <h4><AudioLines size={15} />{tx('Студийный голос')}</h4>
        <p className="hint">{tx('Одна кнопка — как с хорошим микрофоном: без шипения и гула, тёплый и разборчивый, громкость ровная.')}</p>
        {clip && hasAudio ? (clip.voice?.effect === 'studio' && clip.voice.enabled ? (
          <>
            {aiCovers(clip.voice, clip.in, clip.out)
              ? <div className="status-line ok">{tx('Готово — уже в превью и экспорте')}</div>
              : <div className="status-line err">{tx('Клип обрезали после обработки — примени заново')}</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn grow" disabled={busy} onClick={() => void setVoiceEffect(clip.id, 'studio')} data-testid="ai-studio">{tx('Применить заново')}</button>
              <button className="btn" disabled={busy} onClick={() => void setVoiceEffect(clip.id, 'none')} data-testid="ai-studio-off">{tx('Убрать')}</button>
            </div>
          </>
        ) : <button className="btn block" disabled={busy} onClick={() => void setVoiceEffect(clip.id, 'studio')} data-testid="ai-studio">{tx('Сделать голос студийным')}</button>
        ) : <div className="hint small">{tx('Нужен клип со звуком')}</div>}
      </div>

      <div className={`ai-card ${!clip || !hasAudio ? 'off' : ''}`}>
        <h4><Mic size={15} />{tx('Изменить голос')}</h4>
        <p className="hint">{tx('Эффект для звука клипа. Чистка шума сохраняется.')}</p>
        {clip && hasAudio ? (
          <div className="voice-grid">
            {VOICE_FX.map((v) => (
              <button key={v.id} className={`btn small ${(clip.voice?.effect ?? 'none') === v.id && (v.id === 'none' || aiCovers(clip.voice, clip.in, clip.out)) ? 'on' : ''}`}
                disabled={busy} onClick={() => void setVoiceEffect(clip.id, v.id)} data-testid={`voice-${v.id}`}>{v.label}</button>
            ))}
          </div>
        ) : <div className="hint small">{tx('Нужен клип со звуком')}</div>}
      </div>

      <div className={`ai-card ${!clip || !hasAudio ? 'off' : ''}`}>
        <h4><Wand2 size={15} />{tx('Убрать паузы')}</h4>
        <p className="hint">{tx('Находит тишину между фразами и вырезает её — ролик становится плотнее.')}</p>
        {clip && hasAudio
          ? <button className="btn block" disabled={busy} onClick={() => void removePauses(clip.id)} data-testid="ai-pauses">{tx('Убрать паузы')}</button>
          : <div className="hint small">{tx('Нужен клип со звуком')}</div>}
      </div>
    </>
  );
}

function AiPanel() {
  return (
    <>
      <div className="panel-head">{tx('ИИ-инструменты')}</div>
      <div className="panel-body"><AiTools /></div>
    </>
  );
}
