import {
  Zap, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AudioLines, Blend, Captions, Crop, Film, Image as ImageIcon, Layers, Mic, Move, Music, Palette, Plus,
  Sparkles, Trash2, Type, Upload, Wand2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FILTER_PRESETS, effectiveColor, svgFilterMarkup } from '../../shared/color';
import { DEFAULT_COLOR, FONTS, HIGHLIGHTS, TEXT_ANIMS, TEXT_PRESETS, TRANSITIONS, VOICE_FX } from '../../shared/defaults';
import { retimeWords } from '../../shared/captions';
import type { ModelInfo } from '../../shared/ipc';
import {
  addText, animAllCaptions, findClip, mainTrack, removeAsset, setTransition, styleAllCaptions, updateClip,
} from '../../shared/timeline';
import { EFFECTS } from '../../shared/effects';
import type { EffectType, MediaAsset, MediaClip, TextAnimType, TextClip, TextStyle, TransitionType, WordHighlight } from '../../shared/types';
import {
  addAssetToTimeline, autoReframe, disableDenoise, disableRemoveBg, disableStab, enhanceVoice, importPaths, makeCaptions, pickAndImport, removeBackground, removePauses,
  setVoiceEffect, stabilizeClip,
} from '../actions';
import { useClipJob, useJobRunning, useSelected } from '../hooks';
import { api, getState, useStore, type LeftTab } from '../store';
import { fmtDur, fmtTime, peakLevel } from '../util';
import { ColorField, Progress, Seg, Slider, Toggle } from './controls';
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
    </aside>
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
        void importPaths(paths);
      }}
    >
      {children}
      <button className="btn primary" onClick={() => void pickAndImport()} data-testid="import-btn">
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

function MediaItem({ a, used }: { a: MediaAsset; used: boolean }) {
  const thumb = a.thumbs?.[Math.floor((a.thumbs.length - 1) / 2)] ?? (a.kind === 'image' ? a.previewPath || a.path : undefined);
  const commit = useStore((s) => s.commit);
  return (
    <div
      className={`media-item ${a.missing ? 'missing' : ''}`} draggable data-testid="media-item" title={a.missing ? `Файл не найден: ${a.path}` : a.name}
      onDragStart={(e) => { e.dataTransfer.setData('application/x-kadro-asset', a.id); e.dataTransfer.effectAllowed = 'copy'; }}
      onDoubleClick={() => addAssetToTimeline(a.id, 'auto')}
    >
      <div className="media-thumb" style={thumb ? { backgroundImage: `url("${api.mediaUrl(thumb)}")` } : undefined}>
        {!thumb && (a.kind === 'audio' ? <AudioLines size={22} /> : a.kind === 'image' ? <ImageIcon size={22} /> : <Film size={22} />)}
      </div>
      {used && <span className="used-dot" title="Уже на таймлайне" />}
      <div className="media-actions">
        <button title="Добавить на таймлайн" onClick={() => addAssetToTimeline(a.id, 'auto')} data-testid="media-add"><Plus size={14} /></button>
        {a.kind !== 'audio' && <button title="Добавить поверх (картинка в картинке)" onClick={() => addAssetToTimeline(a.id, 'overlay')}><Layers size={14} /></button>}
        <button title="Убрать из проекта" onClick={() => {
          if (!used || confirm(`Убрать «${a.name}» из проекта? Клипы с этим файлом пропадут с таймлайна.`)) commit((p) => removeAsset(p, a.id));
        }}><Trash2 size={14} /></button>
      </div>
      <div className="media-meta"><span className="name">{a.name}</span><span className="dur">{assetBadge(a)}</span></div>
    </div>
  );
}

function useUsedAssets(): Set<string> {
  const tracks = useStore((s) => s.project.tracks);
  return useMemo(() => new Set(tracks.flatMap((t) => t.clips.map((c) => (c.type === 'media' ? c.assetId : '')))), [tracks]);
}

// ---------- Медиа ----------
function MediaPanel() {
  const assets = useStore((s) => s.project.assets);
  const used = useUsedAssets();
  const [filter, setFilter] = useState<'all' | 'video' | 'image' | 'audio'>('all');
  const list = assets.filter((a) => filter === 'all' || a.kind === filter);
  return (
    <>
      <div className="panel-head">Медиа</div>
      <div className="panel-body">
        <DropZone accept="any" compact={assets.length > 0} />
        {assets.length > 0 && (
          <>
            <div style={{ marginTop: 12 }}>
              <Seg value={filter} onChange={setFilter} options={[
                { value: 'all', label: 'Все' }, { value: 'video', label: 'Видео' }, { value: 'image', label: 'Фото' }, { value: 'audio', label: 'Звук' },
              ]} />
            </div>
            <div className="media-grid">{list.map((a) => <MediaItem key={a.id} a={a} used={used.has(a.id)} />)}</div>
            {!list.length && <p className="hint">Здесь пока пусто.</p>}
            <p className="hint small" style={{ marginTop: 12 }}>Двойной клик или «+» — на таймлайн к курсору. Можно перетащить прямо на нужную дорожку.</p>
          </>
        )}
      </div>
    </>
  );
}

// ---------- Аудио ----------
function AudioPanel() {
  const assets = useStore((s) => s.project.assets).filter((a) => a.kind === 'audio');
  const used = useUsedAssets();
  return (
    <>
      <div className="panel-head">Аудио</div>
      <div className="panel-body">
        <DropZone accept="audio" compact={assets.length > 0} />
        {assets.length > 0 ? (
          <div className="audio-list">
            {assets.map((a) => (
              <div key={a.id} className="audio-row" draggable title={a.name}
                onDragStart={(e) => { e.dataTransfer.setData('application/x-kadro-asset', a.id); e.dataTransfer.effectAllowed = 'copy'; }}
                onDoubleClick={() => addAssetToTimeline(a.id, 'auto')}>
                <MiniWave peaks={a.peaks} />
                <div className="audio-name">
                  <span className="name">{a.name}</span>
                  <span className="hint small">{fmtTime(a.duration)}{used.has(a.id) ? ' · на таймлайне' : ''}</span>
                </div>
                <button className="icon-btn" title="Добавить к курсору" onClick={() => addAssetToTimeline(a.id, 'auto')}><Plus size={16} /></button>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint" style={{ marginTop: 14 }}>Музыка и звуки ложатся на отдельные дорожки под видео. Громкость, затухание и скорость — справа, когда клип выделен.</p>
        )}
      </div>
    </>
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
  const add = (style?: Partial<TextStyle>, text = 'Текст') => {
    let id = '';
    commit((p) => { const r = addText(p, getState().playhead, text, style); id = r.clipId; return r.project; });
    if (id) getState().select([id]);
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
        <div className="section-title">Шрифты</div>
        <div className="font-list">
          {FONTS.map((f) => (
            <button key={f.family} className="font-row" onClick={() => add({ font: f.family })} style={{ fontFamily: `'${f.family}'` }}>
              {f.label} <span>Съешь же ещё</span>
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
              <select className="input" value={first.style.font} onChange={(e) => commit((p) => styleAllCaptions(p, { font: e.target.value }))}>
                {FONTS.map((f) => <option key={f.family} value={f.family}>{f.label}</option>)}
              </select>
            </div>
            <Slider label="Размер" min={24} max={140} step={1} value={first.style.size} format={(v) => `${Math.round(v)}`}
              onChange={(v) => commit((p) => styleAllCaptions(p, { size: v }), 'capsize')} />
            <Slider label="Высота на экране" min={0.08} max={0.94} step={0.01} value={first.y} format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => commit((p) => styleAllCaptions(p, {}, v), 'capy')}
              onReset={() => commit((p) => styleAllCaptions(p, {}, vertical ? 0.72 : 0.86))} />
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
const FX_SWATCH: Record<EffectType, string> = {
  shake: 'linear-gradient(100deg,#4a6da6 40%,#6f95d1 40% 46%,#4a6da6 46%)',
  pulse: 'radial-gradient(circle,#ff3d7f 0 22%,#4a6da6 23% 34%,#2b3f63 35%)',
  flash: 'linear-gradient(90deg,#fff 0%,#f6f6f6 35%,#4a6da6 100%)',
  glitch: 'linear-gradient(180deg,#4a6da6 0 30%,#ff3d7f 30% 38%,#4a6da6 38% 62%,#46e0d0 62% 70%,#4a6da6 70%)',
  rgbsplit: 'linear-gradient(90deg,#ff2d55 0 30%,#4a6da6 30% 70%,#2d8cff 70%)',
  vhs: 'repeating-linear-gradient(180deg,#5f6f8a 0 3px,#3d4a60 3px 5px)',
  grain: 'radial-gradient(circle at 30% 30%,#8a8a8a 1px,transparent 1.5px) 0 0/5px 5px,#555',
  vignette: 'radial-gradient(circle,#d9963a 30%,#2a1a08 85%)',
  blur: 'radial-gradient(circle,#d9963a 10%,#4a6da6 70%)',
  pixelate: 'conic-gradient(#4a6da6 25%,#d9963a 0 50%,#4a6da6 0 75%,#d9963a 0) 0 0/12px 12px',
  mirror: 'linear-gradient(90deg,#d9963a 0 25%,#4a6da6 25% 50%,#4a6da6 50% 75%,#d9963a 75%)',
  invert: 'linear-gradient(90deg,#d9963a 50%,#2669c5 50%)',
  rainbow: 'linear-gradient(90deg,#ff3d3d,#ffb23d,#e8ff3d,#3dff8a,#3dc5ff,#8a3dff,#ff3dd2)',
};

function EffectsPanel() {
  const sel = useSelected();
  const commit = useStore((s) => s.commit);
  const clip = sel?.clip.type === 'media' && sel.asset?.kind !== 'audio' ? (sel.clip as MediaClip) : null;
  const toggle = (type: EffectType) => {
    if (!clip) { getState().toast('Выдели видео или фото на таймлайне'); return; }
    const has = clip.effects?.some((e) => e.type === type);
    const effects = has ? clip.effects!.filter((e) => e.type !== type) : [...(clip.effects ?? []), { type, amount: 0.5 }];
    commit((p) => updateClip(p, clip.id, { effects: effects.length ? effects : undefined }));
  };
  return (
    <>
      <div className="panel-head">Эффекты</div>
      <div className="panel-body">
        <p className="hint">{clip ? 'Нажми на эффект, чтобы добавить или убрать. Силу — во вкладке «Эффекты» справа.' : 'Выдели клип на таймлайне — эффекты применяются к нему.'}</p>
        <div className="tile-grid fx-grid" style={{ marginTop: 10 }}>
          {EFFECTS.map((e) => {
            const on = !!clip?.effects?.some((x) => x.type === e.type);
            return (
              <button key={e.type} className={`tile ${on ? 'active' : ''}`} onClick={() => toggle(e.type)} title={e.hint} data-testid={`fx-${e.type}`}>
                <div className={`swatch fx-swatch fx-${e.type}`} style={{ background: FX_SWATCH[e.type] }} />
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
const SW_A = '#4a6da6';
const SW_B = '#d9963a';
function transitionSwatch(t: TransitionType | 'none'): { bg: string; icon?: ReactNode } {
  switch (t) {
    case 'none': return { bg: `linear-gradient(90deg, ${SW_A} 50%, ${SW_B} 50%)` };
    case 'fade': return { bg: `linear-gradient(90deg, ${SW_A} 15%, ${SW_B} 85%)` };
    case 'fadeblack': return { bg: `linear-gradient(90deg, ${SW_A} 10%, #000 50%, ${SW_B} 90%)` };
    case 'fadewhite': return { bg: `linear-gradient(90deg, ${SW_A} 10%, #fff 50%, ${SW_B} 90%)` };
    case 'slideleft': return { bg: `linear-gradient(90deg, ${SW_A} 40%, ${SW_B} 40%)`, icon: <ArrowLeft size={16} /> };
    case 'slideright': return { bg: `linear-gradient(90deg, ${SW_B} 60%, ${SW_A} 60%)`, icon: <ArrowRight size={16} /> };
    case 'slideup': return { bg: `linear-gradient(180deg, ${SW_A} 40%, ${SW_B} 40%)`, icon: <ArrowUp size={16} /> };
    case 'slidedown': return { bg: `linear-gradient(180deg, ${SW_B} 60%, ${SW_A} 60%)`, icon: <ArrowDown size={16} /> };
    case 'wipeleft': return { bg: `linear-gradient(100deg, ${SW_A} 45%, ${SW_B} 45%)` };
    case 'wiperight': return { bg: `linear-gradient(80deg, ${SW_B} 55%, ${SW_A} 55%)` };
    case 'circleopen': return { bg: `radial-gradient(circle, ${SW_B} 0 34%, ${SW_A} 35%)` };
    case 'zoomin': return { bg: `radial-gradient(circle, ${SW_B} 0 18%, ${SW_A} 60%)` };
  }
}

function TransitionsPanel() {
  const project = useStore((s) => s.project);
  const junction = useStore((s) => s.junction);
  const selection = useStore((s) => s.selection);
  const commit = useStore((s) => s.commit);
  const main = mainTrack(project);
  // кому ставим переход: выбранный стык или выделенный клип основной дорожки (переход в конце клипа)
  let targetId: string | null = junction;
  if (!targetId && selection.length === 1) {
    const i = main.clips.findIndex((c) => c.id === selection[0]);
    if (i >= 0 && i < main.clips.length - 1) targetId = selection[0];
  }
  const target = targetId ? (findClip(project, targetId)?.clip as MediaClip | undefined) : undefined;
  const cur = target?.transitionOut;
  const [dur, setDur] = useState(0.5);
  const durNow = cur?.duration ?? dur;
  const apply = (type: TransitionType | null) => {
    if (!targetId) { getState().toast('Сначала выбери стык между клипами на основной дорожке'); return; }
    commit((p) => setTransition(p, targetId!, type ? { type, duration: durNow } : null));
  };
  const applyAll = () => {
    if (!cur) return;
    commit((p) => main.clips.slice(0, -1).reduce((acc, c) => setTransition(acc, c.id, { ...cur }), p));
    getState().toast('Переход поставлен на все стыки', 'ok');
  };
  const joints = Math.max(0, main.clips.length - 1);
  return (
    <>
      <div className="panel-head">Переходы</div>
      <div className="panel-body">
        <p className="hint">
          {joints === 0 ? 'Переходы ставятся между двумя клипами на основной дорожке. Добавь хотя бы два.' :
            target ? 'Выбран стык. Нажми на переход, чтобы поставить его.' : 'Нажми на квадратик между клипами на таймлайне, чтобы выбрать стык.'}
        </p>
        <div className="tile-grid" style={{ marginTop: 10 }}>
          <button className={`tile ${target && !cur ? 'active' : ''}`} onClick={() => apply(null)} disabled={!target}>
            <div className="swatch" style={{ background: transitionSwatch('none').bg }} />
            <span className="label">Без перехода</span>
          </button>
          {TRANSITIONS.map((t) => {
            const sw = transitionSwatch(t.type);
            return (
              <button key={t.type} className={`tile ${cur?.type === t.type ? 'active' : ''}`} onClick={() => apply(t.type)} disabled={!target} data-testid={`tr-${t.type}`}>
                <div className="swatch" style={{ background: sw.bg }}>{sw.icon}</div>
                <span className="label">{t.label}</span>
              </button>
            );
          })}
        </div>
        <Slider label="Длительность" min={0.1} max={2} step={0.05} value={durNow} format={(v) => `${v.toFixed(2)} с`}
          onChange={(v) => { setDur(v); if (cur && targetId) commit((p) => setTransition(p, targetId!, { ...cur, duration: v }), `trdur-${targetId}`); }} />
        <button className="btn block" disabled={!cur || joints < 2} onClick={applyAll}>Поставить на все стыки</button>
      </div>
    </>
  );
}

// ---------- Фильтры ----------
const SAMPLE_BG = 'linear-gradient(180deg, #6fa3d6 0%, #b9d3ea 38%, #f2c48d 52%, #c97b4a 58%, #4d7a3a 62%, #263f1c 100%)';

function FiltersPanel() {
  const sel = useSelected();
  const commit = useStore((s) => s.commit);
  const project = useStore((s) => s.project);
  const clip = sel?.clip.type === 'media' && sel.asset?.kind !== 'audio' ? (sel.clip as MediaClip) : null;
  const thumb = clip && sel?.asset ? sel.asset.thumbs?.[0] ?? (sel.asset.kind === 'image' ? sel.asset.previewPath : undefined) : undefined;
  const defs = useMemo(() => FILTER_PRESETS.map((f) => svgFilterMarkup(`kfp-${f.id}`, effectiveColor({ ...DEFAULT_COLOR, preset: f.id }))).join(''), []);
  const setPreset = (id: string) => {
    if (!clip) { getState().toast('Выдели клип на таймлайне, чтобы применить фильтр'); return; }
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
  return (
    <>
      <div className="panel-head">Фильтры</div>
      <div className="panel-body">
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden><defs dangerouslySetInnerHTML={{ __html: defs }} /></svg>
        {!clip && <p className="hint">Выдели видео или фото на таймлайне — фильтр применится к нему.</p>}
        <div className="tile-grid filter-grid" style={{ marginTop: 8 }}>
          {FILTER_PRESETS.map((f) => (
            <button key={f.id} className={`tile ${clip?.color.preset === f.id ? 'active' : ''}`} onClick={() => setPreset(f.id)} data-testid={`filter-${f.id}`}>
              <div className="swatch filter-swatch" style={{
                backgroundImage: thumb ? `url("${api.mediaUrl(thumb)}")` : SAMPLE_BG,
                filter: f.id === 'none' ? undefined : `url(#kfp-${f.id})`,
              }} />
              <span className="label">{f.label}</span>
            </button>
          ))}
        </div>
        {clip && clip.color.preset !== 'none' && (
          <Slider label="Сила фильтра" min={0} max={1} step={0.01} value={clip.color.presetAmount} format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => commit((p) => updateClip(p, clip.id, { color: { ...clip.color, presetAmount: v } }), `famt-${clip.id}`)} />
        )}
        {clip && <button className="btn block" onClick={applyAll}>Применить ко всем клипам</button>}
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
