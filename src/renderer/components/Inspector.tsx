import { X, Snowflake, Activity, AlignCenter, AlignLeft, AlignRight, Bold, CaseUpper, ChevronLeft, ChevronRight, Italic, Pipette, RotateCcw, Volume2 } from 'lucide-react';
import type { TtsVoiceId, VoiceInfo } from '../../shared/ipc';
import { alignToBeats, findBeats, freezeFrame, rebuildGroup, retimeClip, speakText, ungroupSelection } from '../actions';
import { RAMP_MAX, RAMP_MIN, RAMP_PRESETS, RampMap, normalizeRamp, rampSpeedAt } from '../../shared/retime';
import { DEFAULT_MASK } from '../../shared/mask';
import { EFFECTS } from '../../shared/effects';
import { CLIP_ANIMS, CLIP_ANIM_DEFAULT_DUR } from '../../shared/clipAnim';
import { useEffect, useRef, useState } from 'react';
import { FILTER_CATS, FILTER_PRESETS } from '../../shared/color';
import { ASPECTS, DEFAULT_CHROMA, DEFAULT_COLOR, DEFAULT_TRANSFORM, HIGHLIGHTS, TEXT_ANIMS, TEXT_PRESETS } from '../../shared/defaults';
import { clearKeyframes, clipDuration, clipEnd, projectDuration, setSettings, styleAllCaptions, updateClip } from '../../shared/timeline';
import type { BlendMode, ChromaKey, ClipAnim, Mask, RampPoint, AnimProp, AspectKey, Clip, MediaAsset, MediaClip, ProjectSettings, TextAnim, TextAnimType, TextClip, TextStyle, WordHighlight } from '../../shared/types';
import { retimeWords } from '../../shared/captions';
import { hasKeyHere, isAnimated, keyTimesOnTimeline, propValue, toggleKey, writeProps } from '../animEdit';
import { useClipJob, useJobRunning, useSelected } from '../hooks';
import { api, getState, useStore } from '../store';
import { fmtDur } from '../util';
import { ColorField, Field, FontPicker, KeyButton, Seg, Slider, Toggle } from './controls';
import { AiTools, textPreviewStyle } from './LeftPanel';
import { CurvesPanel, HslPanel, LutPanel } from './GradeTab';

export function Inspector() {
  const sel = useSelected();
  const n = useStore((s) => s.selection.length);
  return (
    <aside className="inspector" data-testid="inspector">
      {!sel ? <ProjectInspector multi={n} />
        : sel.clip.type === 'text' ? <TextInspector key={sel.clip.id} clip={sel.clip} />
          : <MediaInspector key={sel.clip.id} clip={sel.clip} asset={sel.asset} trackKind={sel.track.kind} />}
    </aside>
  );
}

function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { id: T; label: string }[]; onChange: (t: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => <button key={t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)} data-testid={`itab-${t.id}`}>{t.label}</button>)}
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const signedPct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;

// ---------- проект ----------
function AspectIcon({ a }: { a: AspectKey }) {
  const { w, h } = ASPECTS[a];
  const k = 22 / Math.max(w, h);
  return <span className="aspect-icon" style={{ width: Math.round(w * k), height: Math.round(h * k) }} />;
}

function ProjectInspector({ multi }: { multi: number }) {
  const settings = useStore((s) => s.project.settings);
  const project = useStore((s) => s.project);
  const commit = useStore((s) => s.commit);
  const set = (patch: Partial<ProjectSettings>) => commit((p) => setSettings(p, patch));
  const clips = project.tracks.reduce((n, t) => n + t.clips.length, 0);
  return (
    <>
      <div className="panel-head">{multi > 1 ? `Выделено клипов: ${multi}` : 'Проект'}</div>
      <div className="panel-body">
        {multi <= 1 && <p className="hint inspector-tip">Нажми на клип на таймлайне — здесь появятся его настройки: размер, цвет, эффекты, скорость, звук и анимация.</p>}
        <div className="section-title" style={{ marginTop: 4 }}>Формат кадра</div>
        <div className="aspect-grid">
          {(Object.keys(ASPECTS) as AspectKey[]).map((a) => (
            <button key={a} className={`aspect-tile ${settings.aspect === a ? 'active' : ''}`} onClick={() => set({ aspect: a, width: ASPECTS[a].w, height: ASPECTS[a].h })}
              title={ASPECTS[a].label} data-testid={`aspect-${a}`}>
              <AspectIcon a={a} /><span>{a}</span>
            </button>
          ))}
        </div>
        <p className="hint small">{ASPECTS[settings.aspect].label.split('·')[1]?.trim() || 'Свой формат'}</p>
        <Field label="Фон за видео">
          <Seg value={settings.background} onChange={(v) => set({ background: v })} options={[
            { value: 'black', label: 'Чёрный' }, { value: 'blur', label: 'Размытие' }, { value: 'white', label: 'Белый' },
          ]} />
        </Field>
        <Field label="Кадров в секунду">
          <Seg value={settings.fps} onChange={(v) => set({ fps: v })} options={[24, 25, 30, 50, 60].map((f) => ({ value: f, label: String(f) }))} />
        </Field>
        <div className="stats">
          <div><span>Длительность</span><b>{fmtDur(projectDuration(project))}</b></div>
          <div><span>Клипов</span><b>{clips}</b></div>
          <div><span>Файлов</span><b>{project.assets.filter((a) => !a.derived).length}</b></div>
        </div>
        <div className="section-title">Клавиши</div>
        <dl className="keys">
          <dt>Пробел</dt><dd>пуск и пауза</dd>
          <dt>S или Ctrl+B</dt><dd>разрезать у курсора</dd>
          <dt>Delete</dt><dd>удалить выделенное</dd>
          <dt>Ctrl+D</dt><dd>копия клипа</dd>
          <dt>Ctrl+G</dt><dd>сгруппировать (с Shift — разгруппировать)</dd>
          <dt>Ctrl+S / Ctrl+E</dt><dd>сохранить проект / экспорт</dd>
          <dt>Ctrl+Z / Ctrl+Y</dt><dd>отменить / вернуть</dd>
          <dt>← →</dt><dd>на кадр (с Shift — на секунду)</dd>
          <dt>Ctrl+колесо</dt><dd>масштаб таймлайна</dd>
        </dl>
      </div>
    </>
  );
}

// ---------- видео, фото, звук ----------
type MTab = 'basic' | 'anim' | 'color' | 'mask' | 'fx' | 'speed' | 'audio' | 'ai';

function MediaInspector({ clip, asset, trackKind }: { clip: MediaClip; asset?: MediaAsset; trackKind: string }) {
  const commit = useStore((s) => s.commit);
  const isAudio = asset?.kind === 'audio';
  const isImage = asset?.kind === 'image';
  const tabs: { id: MTab; label: string }[] = isAudio
    ? [{ id: 'audio', label: 'Звук' }, { id: 'speed', label: 'Скорость' }]
    : [
      { id: 'basic', label: 'Кадр' }, { id: 'anim', label: 'Анимация' }, { id: 'color', label: 'Цвет' }, { id: 'mask', label: 'Маска' },
      ...(clip.effects?.length ? [{ id: 'fx' as MTab, label: 'Эффекты' }] : []),
      ...(!isImage ? [{ id: 'speed' as MTab, label: 'Скорость' }] : []),
      ...(asset?.hasAudio ? [{ id: 'audio' as MTab, label: 'Звук' }] : []),
      ...(!isImage ? [{ id: 'ai' as MTab, label: 'ИИ' }] : []),
    ];
  const [tab, setTab] = useState<MTab>(() => (lastMediaTab && tabs.some((t) => t.id === lastMediaTab) ? lastMediaTab : tabs[0].id));
  useEffect(() => { lastMediaTab = tab; }, [tab]);
  const [colorSub, setColorSub] = useState<ColorSub>(lastColorSub);
  useEffect(() => { lastColorSub = colorSub; }, [colorSub]);
  const cur = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  const up = (patch: Partial<MediaClip>, key: string) => commit((p) => updateClip(p, clip.id, patch), `${key}-${clip.id}`);
  const c = clip.color;
  const dur = clipDuration(clip);
  return (
    <>
      <div className="panel-head"><span className="ellipsis" title={asset?.name}>{asset?.name ?? 'Клип'}</span></div>
      {clip.group && (
        <div className="group-bar" data-testid="group-bar">
          <span>Группа: {clip.group.tracks.reduce((n, t) => n + t.clips.length, 0)} клипа внутри</span>
          <button className="btn small" onClick={ungroupSelection} data-testid="ungroup">Разгруппировать</button>
          <button className="btn small" title="Собрать заново (например, после смены формата кадра)" onClick={() => void rebuildGroup(clip.id)}>Пересобрать</button>
        </div>
      )}
      <Tabs value={cur} tabs={tabs} onChange={setTab} />
      <div className="panel-body">
        {cur === 'basic' && (
          <>
            <Field label="Вписать в кадр">
              <Seg value={clip.fit} onChange={(v) => up({ fit: v }, 'fit')} options={[{ value: 'contain', label: 'Целиком' }, { value: 'cover', label: 'Заполнить' }]} />
            </Field>
            <AnimFields clip={clip} defs={MEDIA_ANIM} />
            {trackKind === 'video' && (
              <Field label="Режим наложения">
                <select className="input" value={clip.blend ?? 'normal'} data-testid="blend" onChange={(e) => up({ blend: e.target.value as BlendMode }, 'blend')}>
                  {BLENDS.map((b) => <option key={b.mode} value={b.mode}>{b.label}</option>)}
                </select>
              </Field>
            )}
            {isImage && (
              <Slider label="Длительность" min={0.5} max={30} step={0.1} value={dur} format={(v) => `${v.toFixed(1)} с`}
                onChange={(v) => up({ out: clip.in + v * clip.speed }, 'idur')} />
            )}
            <button className="btn block" onClick={() => commit((p) => clearKeyframes(updateClip(p, clip.id, { transform: { ...DEFAULT_TRANSFORM, scale: trackKind === 'main' ? 1 : 0.6 }, opacity: 1 }), clip.id), `reset-${clip.id}`)}>
              <RotateCcw size={14} />Сбросить положение и анимацию
            </button>
          </>
        )}
        {cur === 'anim' && <ClipAnimTab clip={clip} />}
        {cur === 'mask' && <MaskTab clip={clip} />}
        {cur === 'fx' && (
          <>
            {(clip.effects ?? []).map((e) => {
              const def = EFFECTS.find((x) => x.type === e.type);
              const del = (
                <button className="icon-btn" style={{ width: 22, height: 22 }} title="Убрать эффект"
                  onClick={() => up({ effects: clip.effects!.filter((x) => x.type !== e.type) }, 'fxdel')}><X size={13} /></button>
              );
              if (def?.toggle) return <div key={e.type} className="field-row fx-toggle-row"><label>{def.label}</label>{del}</div>;
              return (
                <Slider key={e.type} label={def?.label ?? e.type} min={0} max={1} step={0.01} value={e.amount} format={pct}
                  testId={`fxamt-${e.type}`} extra={del}
                  onChange={(v) => up({ effects: clip.effects!.map((x) => (x.type === e.type ? { ...x, amount: v } : x)) }, `fx-${e.type}`)} />
              );
            })}
            {!(clip.effects ?? []).length && <p className="hint">Эффектов пока нет.</p>}
            <p className="hint small">Новые эффекты — в разделе «Эффекты» слева: {EFFECTS.length} штук, наведи мышь, чтобы посмотреть.</p>
          </>
        )}
        {cur === 'color' && (
          <div style={{ marginBottom: 6 }}>
            <Seg value={colorSub} onChange={setColorSub} options={[
              { value: 'basic', label: 'Основное' }, { value: 'curves', label: 'Кривые' }, { value: 'hsl', label: 'HSL' }, { value: 'lut', label: 'LUT' },
            ]} />
          </div>
        )}
        {cur === 'color' && colorSub === 'curves' && <CurvesPanel clip={clip} />}
        {cur === 'color' && colorSub === 'hsl' && <HslPanel clip={clip} />}
        {cur === 'color' && colorSub === 'lut' && <LutPanel clip={clip} />}
        {cur === 'color' && colorSub === 'basic' && (
          <>
            <Field label="Фильтр">
              <select className="input" value={c.preset} onChange={(e) => up({ color: { ...c, preset: e.target.value, presetAmount: 1 } }, 'preset')}>
                <option value="none">Нет</option>
                {FILTER_CATS.map((cat) => (
                  <optgroup key={cat.id} label={cat.label}>
                    {FILTER_PRESETS.filter((f) => f.cat === cat.id).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
            {c.preset !== 'none' && (
              <Slider label="Сила фильтра" min={0} max={1} value={c.presetAmount} format={pct}
                onChange={(v) => up({ color: { ...c, presetAmount: v } }, 'pamt')} />
            )}
            <Slider label="Яркость" min={0.3} max={1.7} value={c.brightness} format={(v) => signedPct(v - 1)} testId="brightness"
              onChange={(v) => up({ color: { ...c, brightness: v } }, 'br')} onReset={() => up({ color: { ...c, brightness: 1 } }, 'br')} />
            <Slider label="Контраст" min={0.3} max={1.7} value={c.contrast} format={(v) => signedPct(v - 1)}
              onChange={(v) => up({ color: { ...c, contrast: v } }, 'ct')} onReset={() => up({ color: { ...c, contrast: 1 } }, 'ct')} />
            <Slider label="Насыщенность" min={0} max={2} value={c.saturation} format={(v) => signedPct(v - 1)}
              onChange={(v) => up({ color: { ...c, saturation: v } }, 'sat')} onReset={() => up({ color: { ...c, saturation: 1 } }, 'sat')} />
            <Slider label="Теплота" min={-1} max={1} value={c.warmth} format={signedPct}
              onChange={(v) => up({ color: { ...c, warmth: v } }, 'warm')} onReset={() => up({ color: { ...c, warmth: 0 } }, 'warm')} />
            <button className="btn block" onClick={() => up({ color: { ...DEFAULT_COLOR } }, 'creset')}><RotateCcw size={14} />Сбросить цвет</button>
            <p className="hint small" style={{ marginTop: 8 }}>Двойной клик по ползунку — вернуть значение по умолчанию.</p>
          </>
        )}
        {cur === 'speed' && <SpeedTab clip={clip} asset={asset} />}
        {cur === 'audio' && (
          <>
            <Toggle label="Без звука" on={clip.muted} onChange={(v) => up({ muted: v }, 'mute')} testId="mute" />
            <Slider label="Громкость" min={0} max={2} value={clip.volume} format={pct} testId="volume"
              onChange={(v) => up({ volume: v }, 'vol')} onReset={() => up({ volume: 1 }, 'vol')} />
            <Slider label="Плавное появление" min={0} max={Math.min(10, dur / 2)} step={0.05} value={clip.fadeIn} format={(v) => `${v.toFixed(1)} с`}
              onChange={(v) => up({ fadeIn: v }, 'fi')} onReset={() => up({ fadeIn: 0 }, 'fi')} />
            <Slider label="Плавное затухание" min={0} max={Math.min(10, dur / 2)} step={0.05} value={clip.fadeOut} format={(v) => `${v.toFixed(1)} с`}
              onChange={(v) => up({ fadeOut: v }, 'fo')} onReset={() => up({ fadeOut: 0 }, 'fo')} />
            {!isAudio && <p className="hint small">Шум, паузы и эффекты голоса — во вкладке «ИИ».</p>}
            {isAudio && asset && <BeatBox asset={asset} />}
            {isAudio && <AiTools compact />}
          </>
        )}
        {cur === 'ai' && <AiTools compact />}
      </div>
    </>
  );
}
let lastMediaTab: MTab | null = null;

/** Появление и исчезновение видео или фото: плитки с подписями и длительность. */
function ClipAnimTab({ clip }: { clip: MediaClip }) {
  const commit = useStore((s) => s.commit);
  const dur = clipDuration(clip);
  const maxDur = Math.max(0.1, Math.min(3, dur / 2));
  const set = (kind: 'in' | 'out', a: ClipAnim | undefined) => {
    const next = { ...clip.anim, [kind]: a };
    commit((p) => updateClip(p, clip.id, { anim: next.in || next.out ? next : undefined }), `canim-${kind}-${clip.id}`);
  };
  const section = (kind: 'in' | 'out') => {
    const cur = clip.anim?.[kind];
    return (
      <>
        <div className="section-title">{kind === 'in' ? 'Появление' : 'Исчезновение'}</div>
        <div className="anim-grid" data-testid={`canim-${kind}`}>
          <button className={!cur ? 'active' : ''} onClick={() => set(kind, undefined)}>Нет</button>
          {CLIP_ANIMS.map((a) => (
            <button key={a.type} className={cur?.type === a.type ? 'active' : ''} title={a.hint} data-testid={`canim-${kind}-${a.type}`}
              onClick={() => set(kind, { type: a.type, dur: cur?.dur ?? Math.min(CLIP_ANIM_DEFAULT_DUR, maxDur) })}>{kind === 'in' ? a.in : a.out}</button>
          ))}
        </div>
        {cur && (
          <Slider label="Длительность" min={0.1} max={maxDur} step={0.05} value={Math.min(cur.dur, maxDur)} format={(v) => `${v.toFixed(2)} с`}
            onChange={(v) => set(kind, { ...cur, dur: v })} />
        )}
      </>
    );
  };
  return (
    <>
      <p className="hint">Как клип появляется в начале и исчезает в конце. Работает и на основной дорожке, и в наложениях, вместе с переходами.</p>
      {section('in')}
      {section('out')}
    </>
  );
}
type ColorSub = 'basic' | 'curves' | 'hsl' | 'lut';
let lastColorSub: ColorSub = 'basic';

// ---------- скорость: постоянная, кривая, реверс, стоп-кадр ----------
function SpeedTab({ clip, asset }: { clip: MediaClip; asset?: MediaAsset }) {
  const commit = useStore((s) => s.commit);
  const up = (patch: Partial<MediaClip>, key: string) => commit((p) => updateClip(p, clip.id, patch), `${key}-${clip.id}`);
  const busy = !!useClipJob(clip.id);
  const r = clip.retime;
  const active = r?.ramp ? r.preset ?? 'custom' : 'none';
  const [draft, setDraft] = useState<RampPoint[] | null>(null);
  const curve = draft ?? r?.ramp ?? null;
  const srcLen = r ? r.out - r.in : clip.out - clip.in;
  const dur = clipDuration(clip);
  const isVideo = asset?.kind === 'video';
  const pick = (id: string) => {
    setDraft(null);
    if (id === 'none') { if (r?.ramp) void retimeClip(clip.id, { ramp: null }); return; }
    if (id === 'custom') { setDraft(r?.ramp ?? [{ x: 0, v: 1 }, { x: 0.5, v: 1 }, { x: 1, v: 1 }]); return; }
    const pr = RAMP_PRESETS.find((x) => x.id === id)!;
    void retimeClip(clip.id, { ramp: pr.points, preset: pr.id });
  };
  return (
    <>
      <Field label="Скорость">
        <Seg value={clip.speed} onChange={(v) => up({ speed: v }, 'speedp')} options={[0.5, 1, 1.5, 2, 3].map((v) => ({ value: v, label: `${v}×` }))} />
      </Field>
      <Slider label="Точно" min={0.25} max={4} step={0.05} value={clip.speed} format={(v) => `${v.toFixed(2)}×`} testId="speed"
        onChange={(v) => up({ speed: v }, 'speed')} onReset={() => up({ speed: 1 }, 'speed')} />
      <p className="hint">Длина на таймлайне: {fmtDur(dur)}. Высота голоса сохраняется.</p>

      <div className="sub-head">Кривая скорости</div>
      <div className="ramp-grid">
        {[{ id: 'none', label: 'Нет', hint: 'Без кривой', points: null as RampPoint[] | null }, ...RAMP_PRESETS, { id: 'custom', label: 'Своя', hint: 'Нарисуй кривую сам', points: null }].map((pr) => (
          <button key={pr.id} className={`ramp-tile ${(draft ? 'custom' : active) === pr.id ? 'active' : ''}`} title={pr.hint} disabled={busy}
            onClick={() => pick(pr.id)} data-testid={`ramp-${pr.id}`}>
            <RampThumb points={pr.id === 'custom' ? r?.preset === 'custom' ? r.ramp ?? null : null : pr.points} />
            <span>{pr.label}</span>
          </button>
        ))}
      </div>
      {curve && (
        <>
          <RampEditor points={curve} onChange={setDraft} disabled={busy} />
          <p className="hint small">
            Тяни точки вверх — быстрее, вниз — медленнее. Двойной клик добавляет точку, двойной клик по точке — убирает.
            {' '}Длина станет {fmtDur(new RampMap(normalizeRamp(curve), srcLen).total / clip.speed)}.
          </p>
          {draft && (
            <div className="row-btns">
              <button className="btn primary" disabled={busy} data-testid="ramp-apply" onClick={() => { const d = draft; setDraft(null); void retimeClip(clip.id, { ramp: d, preset: 'custom' }); }}>Применить</button>
              <button className="btn" onClick={() => setDraft(null)}>Отмена</button>
            </div>
          )}
        </>
      )}

      <div className="sub-head">Ещё</div>
      <Toggle label="Реверс — проиграть задом наперёд" on={!!r?.reverse} testId="reverse"
        onChange={(v) => { if (!busy) void retimeClip(clip.id, { reverse: v }); }} />
      {isVideo && (
        <button className="btn block" disabled={busy} data-testid="freeze" onClick={() => void freezeFrame()} style={{ marginTop: 10 }}>
          <Snowflake size={14} />Стоп-кадр в позиции курсора
        </button>
      )}
      <p className="hint small" style={{ marginTop: 8 }}>
        Реверс и кривая создают копию фрагмента — это занимает немного времени. Обрезка и разрезание работают как обычно.
      </p>
    </>
  );
}

const RW = 260;
const RH = 120;
const RPAD = 7;
const vy = (v: number) => (1 - (Math.log10(v) + 1) / 2) * RH;
const yv = (y: number) => Math.min(RAMP_MAX, Math.max(RAMP_MIN, 10 ** ((1 - y / RH) * 2 - 1)));

function RampThumb({ points }: { points: RampPoint[] | null }) {
  const W = 56; const H = 30;
  const d = points
    ? Array.from({ length: 29 }, (_, i) => { const x = i / 28; return `${(x * W).toFixed(1)},${(((1 - (Math.log10(rampSpeedAt(points, x)) + 1) / 2) * (H - 4)) + 2).toFixed(1)}`; }).join(' ')
    : `0,${H / 2} ${W},${H / 2}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="ramp-thumb">
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="axis" />
      <polyline points={d} />
    </svg>
  );
}

function RampEditor({ points, onChange, disabled }: { points: RampPoint[]; onChange: (p: RampPoint[]) => void; disabled?: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const pts = normalizeRamp(points);
  const at = (e: { clientX: number; clientY: number }) => {
    const b = svg.current!.getBoundingClientRect();
    const ux = ((e.clientX - b.left) / b.width) * (RW + 2 * RPAD) - RPAD;
    const uy = ((e.clientY - b.top) / b.height) * (RH + 2 * RPAD) - RPAD;
    return { x: Math.min(1, Math.max(0, ux / RW)), y: Math.min(RH, Math.max(0, uy)) };
  };
  const move = (e: React.PointerEvent) => {
    const i = drag.current;
    if (i === null || disabled) return;
    const q = at(e);
    const next = pts.map((p) => ({ ...p }));
    const lo = i === 0 ? 0 : next[i - 1].x + 0.02;
    const hi = i === next.length - 1 ? 1 : next[i + 1].x - 0.02;
    next[i] = { x: i === 0 ? 0 : i === next.length - 1 ? 1 : Math.min(hi, Math.max(lo, q.x)), v: Math.round(yv(q.y) * 100) / 100 };
    onChange(next);
  };
  const line = Array.from({ length: 101 }, (_, i) => `${(i / 100) * RW},${vy(rampSpeedAt(pts, i / 100)).toFixed(2)}`).join(' ');
  return (
    <svg ref={svg} className="ramp-editor" viewBox={`${-RPAD} ${-RPAD} ${RW + 2 * RPAD} ${RH + 2 * RPAD}`} preserveAspectRatio="none" data-testid="ramp-editor"
      onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}
      onDoubleClick={(e) => {
        if (disabled || (e.target as Element).tagName === 'circle') return;
        const q = at(e);
        onChange([...pts, { x: q.x, v: rampSpeedAt(pts, q.x) }].sort((a, b) => a.x - b.x));
      }}>
      {[10, 1, 0.1].map((v) => (
        <g key={v}>
          <line x1={0} x2={RW} y1={vy(v)} y2={vy(v)} className={v === 1 ? 'axis' : 'grid'} />
          <text x={4} y={Math.min(RH - 3, Math.max(10, vy(v) - 3))} className="lbl">{v}×</text>
        </g>
      ))}
      <polyline points={line} className="curve" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x * RW} cy={vy(p.v)} r={5} data-testid={`ramp-pt-${i}`}
          onPointerDown={(e) => { if (disabled) return; (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = i; onChange(pts); }}
          onDoubleClick={() => { if (!disabled && i > 0 && i < pts.length - 1) onChange(pts.filter((_, j) => j !== i)); }} />
      ))}
    </svg>
  );
}

const BLENDS: { mode: BlendMode; label: string }[] = [
  { mode: 'normal', label: 'Обычный' }, { mode: 'multiply', label: 'Умножение' }, { mode: 'screen', label: 'Осветление (экран)' },
  { mode: 'overlay', label: 'Перекрытие' }, { mode: 'darken', label: 'Замена тёмным' }, { mode: 'lighten', label: 'Замена светлым' },
  { mode: 'add', label: 'Сложение' },
];
const MASKS: { shape: Mask['shape'] | 'none'; label: string }[] = [
  { shape: 'none', label: 'Нет' }, { shape: 'linear', label: 'Линия' }, { shape: 'mirror', label: 'Полоса' },
  { shape: 'circle', label: 'Круг' }, { shape: 'rect', label: 'Прямоугольник' },
];

function MaskTab({ clip }: { clip: MediaClip }) {
  const commit = useStore((s) => s.commit);
  const m = clip.mask;
  const up = (patch: Partial<MediaClip>, key: string) => commit((p) => updateClip(p, clip.id, patch), `${key}-${clip.id}`);
  const setM = (patch: Partial<Mask>, key: string) => up({ mask: { ...(m ?? DEFAULT_MASK), ...patch } }, key);
  const ch = clip.chroma;
  const setC = (patch: Partial<ChromaKey>, key: string) => up({ chroma: { ...(ch ?? DEFAULT_CHROMA), ...patch } }, key);
  const pick = async () => {
    const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!ED) { getState().toast('Пипетка недоступна — выбери цвет вручную'); return; }
    try { const r = await new ED().open(); setC({ color: r.sRGBHex }, 'chc'); } catch { /* отменено */ }
  };
  return (
    <>
      <div className="mask-shapes">
        {MASKS.map((x) => (
          <button key={x.shape} className={`tile mask-tile ${(m?.shape ?? 'none') === x.shape ? 'active' : ''}`} data-testid={`mask-${x.shape}`}
            onClick={() => up({ mask: x.shape === 'none' ? undefined : { ...(m ?? DEFAULT_MASK), shape: x.shape as Mask['shape'], ...(x.shape === 'linear' ? { feather: m?.feather ?? 0.05 } : {}) } }, 'mshape')}>
            <MaskIcon shape={x.shape} /><span className="label">{x.label}</span>
          </button>
        ))}
      </div>
      {m && (
        <>
          <Slider label="Сдвиг по горизонтали" min={-0.5} max={0.5} step={0.005} value={m.x} format={signedPct} onChange={(v) => setM({ x: v }, 'mx')} onReset={() => setM({ x: 0 }, 'mx')} />
          <Slider label="Сдвиг по вертикали" min={-0.5} max={0.5} step={0.005} value={m.y} format={signedPct} onChange={(v) => setM({ y: v }, 'my')} onReset={() => setM({ y: 0 }, 'my')} />
          {m.shape !== 'linear' && m.shape !== 'mirror' && (
            <Slider label="Ширина" min={0.02} max={1.5} step={0.01} value={m.w} format={pct} onChange={(v) => setM({ w: v }, 'mw')} />
          )}
          {m.shape !== 'linear' && (
            <Slider label={m.shape === 'mirror' ? 'Толщина полосы' : 'Высота'} min={0.02} max={1.5} step={0.01} value={m.h} format={pct} onChange={(v) => setM({ h: v }, 'mh')} />
          )}
          <Slider label="Поворот" min={-180} max={180} step={1} value={m.rotation} format={deg} onChange={(v) => setM({ rotation: v }, 'mr')} onReset={() => setM({ rotation: 0 }, 'mr')} />
          <Slider label="Растушёвка" min={0} max={0.5} step={0.005} value={m.feather} format={pct} onChange={(v) => setM({ feather: v }, 'mf')} />
          <Toggle label="Инвертировать" on={m.invert} onChange={(v) => setM({ invert: v }, 'mi')} />
        </>
      )}
      <div className="section-title">Хромакей — убрать цвет фона</div>
      <Toggle label="Убрать цвет" hint="Зелёный или синий фон за человеком" on={!!ch} onChange={(v) => up({ chroma: v ? { ...DEFAULT_CHROMA } : undefined }, 'chon')} testId="chroma-toggle" />
      {ch && (
        <>
          <div className="field-row" style={{ margin: '10px 0' }}>
            <label>Цвет фона</label>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="btn small" onClick={() => void pick()} title="Ткни в цвет на экране"><Pipette size={13} />Пипетка</button>
              <input type="color" className="color-input" value={ch.color} onChange={(e) => setC({ color: e.target.value }, 'chc')} />
            </span>
          </div>
          <Slider label="Сила" min={0.01} max={0.5} step={0.005} value={ch.similarity} format={pct} onChange={(v) => setC({ similarity: v }, 'chs')} testId="chroma-sim" />
          <Slider label="Мягкость края" min={0} max={0.3} step={0.005} value={ch.smoothness} format={pct} onChange={(v) => setC({ smoothness: v }, 'chb')} />
        </>
      )}
    </>
  );
}

function MaskIcon({ shape }: { shape: Mask['shape'] | 'none' }) {
  return (
    <svg viewBox="0 0 40 28" className="mask-icon" aria-hidden>
      <rect x="1" y="1" width="38" height="26" rx="3" className="frame" />
      {shape === 'linear' && <path d="M1 15h38V27H1z" className="fill" />}
      {shape === 'mirror' && <path d="M1 10h38v8H1z" className="fill" />}
      {shape === 'circle' && <ellipse cx="20" cy="14" rx="9" ry="9" className="fill" />}
      {shape === 'rect' && <rect x="10" y="7" width="20" height="14" rx="1" className="fill" />}
      {shape === 'none' && <path d="M8 22 32 6" className="frame" />}
    </svg>
  );
}
let lastTextTab: 'text' | 'style' | 'anim' = 'text';
let lastVoice: TtsVoiceId = 'irina';
let lastSpeed = 1;

function SpeakBox({ clip }: { clip: TextClip }) {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voice, setVoice] = useState<TtsVoiceId>(lastVoice);
  const [speed, setSpeed] = useState(lastSpeed);
  const ttsRunning = useJobRunning('tts');
  const dlRunning = useJobRunning('tdl_');
  const busy = ttsRunning || dlRunning;
  useEffect(() => { void api.ttsVoices().then(setVoices); }, [busy]);
  useEffect(() => { lastVoice = voice; lastSpeed = speed; }, [voice, speed]);
  const v = voices.find((x) => x.id === voice);
  return (
    <div className="ai-card" style={{ marginTop: 14 }}>
      <h4><Volume2 size={15} />Озвучить текст</h4>
      <p className="hint">Голос прочитает текст — звук ляжет на аудиодорожку, длина текста подстроится.</p>
      <select className="input" value={voice} onChange={(e) => setVoice(e.target.value as TtsVoiceId)} data-testid="tts-voice">
        {voices.map((x) => <option key={x.id} value={x.id}>{x.label}{x.ready ? '' : ` · скачается ${x.sizeMb} МБ`}</option>)}
      </select>
      <Slider label="Темп" min={0.6} max={1.6} step={0.05} value={speed} format={(x) => `${x.toFixed(2)}×`} onChange={setSpeed} onReset={() => setSpeed(1)} />
      <button className="btn block" disabled={busy || !clip.text.trim()} onClick={() => void speakText(clip.id, voice, speed)} data-testid="tts-run">
        {busy ? 'Озвучиваю…' : v && !v.ready ? 'Скачать голос и озвучить' : 'Озвучить'}
      </button>
    </div>
  );
}

function BeatBox({ asset }: { asset: MediaAsset }) {
  const busy = useJobRunning('bt_');
  return (
    <div className="ai-card">
      <h4><Activity size={15} />Ритм</h4>
      <p className="hint">{asset.beats?.length ? `${Math.round(asset.bpm ?? 0)} ударов в минуту, ${asset.beats.length} долей — отмечены жёлтым на клипе. Склейки прилипают к долям.` : 'Найду доли такта: к ним прилипают склейки, а кнопка «Под бит» подгонит клипы.'}</p>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn small" disabled={busy} onClick={() => void findBeats(asset.id)} data-testid="find-beats">{asset.beats?.length ? 'Найти заново' : 'Найти ритм'}</button>
        {!!asset.beats?.length && <button className="btn small" onClick={() => alignToBeats()} data-testid="align-beats">Подогнать склейки</button>}
      </div>
    </div>
  );
}

function AnimPick({ label, kind, clip }: { label: string; kind: 'in' | 'out'; clip: TextClip }) {
  const commit = useStore((s) => s.commit);
  const cur = clip.anim?.[kind];
  const set = (a: TextAnim | undefined) => commit((p) => updateClip(p, clip.id, { anim: { ...clip.anim, [kind]: a } }), `anim${kind}-${clip.id}`);
  const maxDur = Math.max(0.2, Math.min(3, clip.duration * 0.9));
  return (
    <>
      <Field label={label}>
        <select className="input" value={cur?.type ?? 'none'} data-testid={`anim-${kind}`}
          onChange={(e) => set(e.target.value === 'none' ? undefined : { type: e.target.value as TextAnimType, dur: cur?.dur ?? Math.min(0.5, maxDur) })}>
          <option value="none">Нет</option>
          {TEXT_ANIMS.map((a) => <option key={a.type} value={a.type}>{kind === 'in' ? a.in : a.out}</option>)}
        </select>
      </Field>
      {cur && (
        <Slider label="Длительность" min={0.1} max={maxDur} step={0.05} value={Math.min(cur.dur, maxDur)} format={(v) => `${v.toFixed(2)} с`}
          onChange={(v) => set({ ...cur, dur: v })} />
      )}
    </>
  );
}

function HighlightPick({ clip }: { clip: TextClip }) {
  const commit = useStore((s) => s.commit);
  const hl = clip.style.highlight ?? { mode: 'none', color: '#ffe14d' };
  const setAll = (h: WordHighlight) => commit((p) => styleAllCaptions(p, { highlight: h }), 'hl');
  return (
    <>
      <Field label="Подсветка слова (для всех субтитров)">
        <select className="input" value={hl.mode} onChange={(e) => setAll({ ...hl, mode: e.target.value as WordHighlight['mode'] })} data-testid="highlight-mode">
          {HIGHLIGHTS.map((h) => <option key={h.mode} value={h.mode}>{h.label}</option>)}
        </select>
      </Field>
      {hl.mode !== 'none' && <ColorField label="Цвет подсветки" value={hl.color} onChange={(v) => setAll({ ...hl, color: v })} />}
      {!clip.words?.length && <p className="hint small">У этого субтитра нет разметки слов — пересоздай субтитры, чтобы подсветка заработала.</p>}
    </>
  );
}

// ---------- анимируемые свойства (ключевые кадры) ----------
interface AnimDef { prop: AnimProp; label: string; min: number; max: number; step: number; format: (v: number) => string; reset: number }
const deg = (v: number) => `${Math.round(v)}°`;
const MEDIA_ANIM: AnimDef[] = [
  { prop: 'scale', label: 'Масштаб', min: 0.1, max: 3, step: 0.01, format: pct, reset: 1 },
  { prop: 'x', label: 'Сдвиг по горизонтали', min: -1, max: 1, step: 0.005, format: signedPct, reset: 0 },
  { prop: 'y', label: 'Сдвиг по вертикали', min: -1, max: 1, step: 0.005, format: signedPct, reset: 0 },
  { prop: 'rotation', label: 'Поворот', min: -180, max: 180, step: 1, format: deg, reset: 0 },
  { prop: 'opacity', label: 'Непрозрачность', min: 0, max: 1, step: 0.01, format: pct, reset: 1 },
];
const TEXT_ANIM: AnimDef[] = [
  { prop: 'x', label: 'По горизонтали', min: 0, max: 1, step: 0.005, format: pct, reset: 0.5 },
  { prop: 'y', label: 'По вертикали', min: 0, max: 1, step: 0.005, format: pct, reset: 0.5 },
  { prop: 'scale', label: 'Масштаб', min: 0.2, max: 4, step: 0.01, format: pct, reset: 1 },
  { prop: 'rotation', label: 'Поворот', min: -180, max: 180, step: 1, format: deg, reset: 0 },
  { prop: 'opacity', label: 'Непрозрачность', min: 0, max: 1, step: 0.01, format: pct, reset: 1 },
];

function AnimFields({ clip, defs }: { clip: Clip; defs: AnimDef[] }) {
  const playhead = useStore((s) => s.playhead);
  const commit = useStore((s) => s.commit);
  const times = keyTimesOnTimeline(clip);
  const animated = times.length > 0;
  const prev = [...times].reverse().find((t) => t < playhead - 1e-3);
  const next = times.find((t) => t > playhead + 1e-3);
  const inClip = playhead >= clip.start - 1e-6 && playhead <= clipEnd(clip) + 1e-6;
  const go = (t: number) => { getState().setPlaying(false); getState().setPlayhead(t); };
  return (
    <>
      <div className="key-nav">
        <button className="icon-btn" style={{ width: 24, height: 24 }} disabled={prev === undefined} onClick={() => go(prev!)} title="К предыдущему ключу"><ChevronLeft size={15} /></button>
        <span className="grow">{animated ? `Ключей: ${times.length}` : 'Ромбик — анимация во времени'}</span>
        <button className="icon-btn" style={{ width: 24, height: 24 }} disabled={next === undefined} onClick={() => go(next!)} title="К следующему ключу"><ChevronRight size={15} /></button>
        {animated && <button className="btn ghost small" onClick={() => commit((p) => clearKeyframes(p, clip.id))} title="Убрать все ключи клипа">Убрать</button>}
      </div>
      {!inClip && animated && <p className="hint small">Поставь курсор на клип, чтобы менять ключи.</p>}
      {defs.map((d) => {
        const st = hasKeyHere(clip, d.prop, playhead) ? 'here' : isAnimated(clip, d.prop) ? 'animated' : 'none';
        return (
          <Slider key={d.prop} label={d.label} min={d.min} max={d.max} step={d.step} value={propValue(clip, d.prop, playhead)} format={d.format}
            testId={`anim-${d.prop}`}
            extra={<KeyButton state={st} testId={`key-${d.prop}`} onClick={() => { if (inClip) commit((p) => toggleKey(p, clip, d.prop, playhead)); else getState().toast('Поставь курсор на клип'); }} />}
            onChange={(v) => commit((p) => writeProps(p, clip, { [d.prop]: v }, playhead), `anim-${d.prop}-${clip.id}`)}
            onReset={() => commit((p) => writeProps(p, clip, { [d.prop]: d.reset }, playhead), `anim-${d.prop}-${clip.id}`)} />
        );
      })}
    </>
  );
}

// ---------- текст и субтитры ----------
function TextInspector({ clip }: { clip: TextClip }) {
  const commit = useStore((s) => s.commit);
  const [tab, setTab] = useState<'text' | 'style' | 'anim'>(() => lastTextTab);
  useEffect(() => { lastTextTab = tab; }, [tab]);
  const area = useRef<HTMLTextAreaElement>(null);
  const s = clip.style;
  const up = (patch: Partial<TextClip>, key: string) => commit((p) => updateClip(p, clip.id, patch), `${key}-${clip.id}`);
  const st = (patch: Partial<TextStyle>, key: string) => up({ style: { ...s, ...patch } }, key);
  useEffect(() => {
    const focus = () => { setTab('text'); setTimeout(() => { area.current?.focus(); area.current?.select(); }, 0); };
    window.addEventListener('kadro:edit-text', focus);
    return () => window.removeEventListener('kadro:edit-text', focus);
  }, []);
  const isCaption = clip.role === 'caption';
  return (
    <>
      <div className="panel-head">{isCaption ? 'Субтитр' : 'Текст'}</div>
      <Tabs value={tab} tabs={[{ id: 'text', label: 'Текст' }, { id: 'style', label: 'Оформление' }, { id: 'anim', label: 'Анимация' }]} onChange={setTab} />
      <div className="panel-body">
        {tab === 'text' && (
          <>
            <textarea ref={area} className="input" value={clip.text} rows={3} data-testid="text-input"
              onChange={(e) => up({ text: e.target.value, words: retimeWords(e.target.value, clip.words) }, 'text')} placeholder="Напиши текст" />
            <Field label="Шрифт">
              <FontPicker value={s.font} onChange={(font) => st({ font }, 'font')} testId="text-font" />
            </Field>
            <Slider label="Размер" min={12} max={300} step={1} value={s.size} format={(v) => String(Math.round(v))} testId="text-size"
              onChange={(v) => st({ size: v }, 'size')} />
            <div className="text-tools">
              <button className={`icon-btn ${s.bold ? 'on' : ''}`} title="Жирный" onClick={() => st({ bold: !s.bold }, 'b')}><Bold size={16} /></button>
              <button className={`icon-btn ${s.italic ? 'on' : ''}`} title="Курсив" onClick={() => st({ italic: !s.italic }, 'i')}><Italic size={16} /></button>
              <button className={`icon-btn ${s.uppercase ? 'on' : ''}`} title="Заглавные" onClick={() => st({ uppercase: !s.uppercase }, 'u')}><CaseUpper size={16} /></button>
              <span className="sep" />
              <button className={`icon-btn ${s.align === 'left' ? 'on' : ''}`} title="По левому краю" onClick={() => st({ align: 'left' }, 'al')}><AlignLeft size={16} /></button>
              <button className={`icon-btn ${s.align === 'center' ? 'on' : ''}`} title="По центру" onClick={() => st({ align: 'center' }, 'al')}><AlignCenter size={16} /></button>
              <button className={`icon-btn ${s.align === 'right' ? 'on' : ''}`} title="По правому краю" onClick={() => st({ align: 'right' }, 'al')}><AlignRight size={16} /></button>
            </div>
            <ColorField label="Цвет текста" value={s.color} onChange={(v) => st({ color: v }, 'color')} />
            <Slider label="Длительность" min={0.2} max={Math.max(30, clip.duration)} step={0.1} value={clip.duration} format={(v) => `${v.toFixed(1)} с`}
              onChange={(v) => up({ duration: v }, 'dur')} />
            {isCaption && (
              <button className="btn block" onClick={() => { commit((p) => styleAllCaptions(p, clip.style, clip.y)); getState().toast('Стиль применён ко всем субтитрам', 'ok'); }}>
                Применить стиль ко всем субтитрам
              </button>
            )}
            <SpeakBox clip={clip} />
          </>
        )}
        {tab === 'style' && (
          <>
            <div className="tile-grid" style={{ marginTop: 4 }}>
              {TEXT_PRESETS.map((t) => (
                <button key={t.id} className="tile text-tile" onClick={() => st(t.style, 'preset')}>
                  <div className="text-sample"><span style={textPreviewStyle({ ...s, ...t.style })}>Аа</span></div>
                  <span className="label">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="section-title">Обводка</div>
            <ColorField label="Цвет обводки" value={s.strokeColor} onChange={(v) => st({ strokeColor: v, strokeWidth: s.strokeWidth || 6 }, 'sc')} />
            <Slider label="Толщина" min={0} max={20} step={0.5} value={s.strokeWidth} format={(v) => v.toFixed(1)}
              onChange={(v) => st({ strokeWidth: v }, 'sw')} />
            <Toggle label="Тень" on={s.shadow} onChange={(v) => st({ shadow: v }, 'sh')} />
            <div className="section-title">Плашка</div>
            <ColorField label="Цвет плашки" value={s.bgColor} onChange={(v) => st({ bgColor: v, bgOpacity: s.bgOpacity || 0.7 }, 'bgc')} />
            <Slider label="Плотность" min={0} max={1} value={s.bgOpacity} format={pct} onChange={(v) => st({ bgOpacity: v }, 'bgo')} />
            <div className="section-title">Строка</div>
            <Slider label="Ширина строки" min={0.3} max={1} step={0.01} value={s.maxWidth} format={pct}
              onChange={(v) => st({ maxWidth: v }, 'mw')} />
            <p className="hint small">Текст можно двигать, растягивать и поворачивать прямо в окне просмотра.</p>
          </>
        )}
        {tab === 'anim' && (
          <>
            <AnimPick label="Появление" kind="in" clip={clip} />
            <AnimPick label="Исчезновение" kind="out" clip={clip} />
            {isCaption && <HighlightPick clip={clip} />}
            <div className="section-title">Движение по ключам</div>
            <AnimFields clip={clip} defs={TEXT_ANIM} />
          </>
        )}
      </div>
    </>
  );
}
