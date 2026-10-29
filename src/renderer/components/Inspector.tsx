import { tx } from '../../shared/i18n';
import { txj } from '../txj';
import { AudioLines, Box, X, Snowflake, Activity, AlignCenter, AlignLeft, AlignRight, Bold, CaseUpper, ChevronLeft, ChevronRight, Italic, Pipette, RotateCcw, Volume2, ClipboardCopy, ClipboardPaste } from 'lucide-react';
import type { TtsVoiceId, VoiceInfo } from '../../shared/ipc';
import { alignToBeats, extractAudio, findBeats, freezeFrame, rebuildGroup, retimeClip, speakText, ungroupSelection, userCurve, userSpeed, copyClipAttrs, openPasteAttrs } from '../actions';
import { RAMP_MAX, RAMP_MIN, RAMP_PRESETS, RampMap, normalizeRamp, rampSpeedAt } from '../../shared/retime';
import { DEFAULT_MASK } from '../../shared/mask';
import { EFFECTS } from '../../shared/effects';
import { CLIP_ANIMS, CLIP_ANIM_DEFAULT_DUR } from '../../shared/clipAnim';
import { pinFromTransform } from '../../shared/perspective';
import { useEffect, useRef, useState } from 'react';
import { FILTER_CATS, FILTER_PRESETS } from '../../shared/color';
import { ASPECTS, FPS_LIST, RESOLUTIONS, shortSideOf, sizeFor, DEFAULT_CHROMA, DEFAULT_COLOR, DEFAULT_TRANSFORM, HIGHLIGHTS, TEXT_ANIMS, TEXT_PRESETS } from '../../shared/defaults';
import { clearKeyframes, clipDuration, clipEnd, projectDuration, setSettings, styleAllCaptions, updateClip } from '../../shared/timeline';
import type { BlendMode, ChromaKey, ClipAnim, Mask, RampPoint, AnimProp, AspectKey, Clip, MediaAsset, MediaClip, ProjectSettings, TextAnim, TextAnimType, TextClip, TextStyle, WordHighlight } from '../../shared/types';
import { retimeWords } from '../../shared/captions';
import { hasKeyHere, isAnimated, keyTimesOnTimeline, propValue, toggleKey, writeProps } from '../animEdit';
import { isGlType } from '../../shared/gl/glsl';
import { glDef } from '../glRegistry';
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
      <div className="panel-head">{multi > 1 ? tx('Выделено клипов: {0}', multi) : tx('Проект')}</div>
      <div className="panel-body">
        {multi <= 1 && <p className="hint inspector-tip">{tx('Нажми на клип на таймлайне — здесь появятся его настройки: размер, цвет, эффекты, скорость, звук и анимация.')}</p>}
        <div className="section-title" style={{ marginTop: 4 }}>{tx('Формат кадра')}</div>
        <div className="aspect-grid">
          {(Object.keys(ASPECTS) as AspectKey[]).map((a) => (
            <button key={a} className={`aspect-tile ${settings.aspect === a ? 'active' : ''}`} onClick={() => set({ aspect: a, ...sizeFor(a, shortSideOf(settings)) })}
              title={ASPECTS[a].label} data-testid={`aspect-${a}`}>
              <AspectIcon a={a} /><span>{a}</span>
            </button>
          ))}
        </div>
        <p className="hint small">{ASPECTS[settings.aspect].label.split('·')[1]?.trim() || tx('Свой формат')}</p>
        <Field label={tx('Фон за видео')}>
          <Seg value={settings.background} onChange={(v) => set({ background: v })} options={[
            { value: 'black', label: tx('Чёрный') }, { value: 'blur', label: tx('Размытие') }, { value: 'white', label: tx('Белый') },
          ]} />
        </Field>
        <Field label={tx('Разрешение')} right={<span className="value">{settings.width}×{settings.height}</span>}>
          <Seg value={shortSideOf(settings)} onChange={(v) => set(sizeFor(settings.aspect, v))} options={RESOLUTIONS.map((r) => ({ value: r.short, label: r.label }))} />
        </Field>
        <Field label={tx('Кадров в секунду')}>
          <Seg value={settings.fps} onChange={(v) => set({ fps: v })} options={FPS_LIST.map((f) => ({ value: f as number, label: String(f) }))} />
        </Field>
        <div className="stats">
          <div><span>{tx('Длительность')}</span><b>{fmtDur(projectDuration(project))}</b></div>
          <div><span>{tx('Клипов')}</span><b>{clips}</b></div>
          <div><span>{tx('Файлов')}</span><b>{project.assets.filter((a) => !a.derived).length}</b></div>
        </div>
        <div className="section-title">{tx('Клавиши')}</div>
        <dl className="keys">
          <dt>{tx('Пробел')}</dt><dd>{tx('пуск и пауза')}</dd>
          <dt>{tx('S или Ctrl+B')}</dt><dd>{tx('разрезать у курсора')}</dd>
          <dt>Delete</dt><dd>{tx('удалить выделенное')}</dd>
          <dt>Ctrl+D</dt><dd>{tx('копия клипа')}</dd>
          <dt>{tx('Ctrl/Shift+щелчок')}</dt><dd>{tx('выделить несколько (Ctrl+A — все)')}</dd>
          <dt>Ctrl+G</dt><dd>{tx('сгруппировать (с Shift — разгруппировать)')}</dd>
          <dt>Ctrl+Shift+C / V</dt><dd>{tx('скопировать / вставить параметры клипа')}</dd>
          <dt>Ctrl+S / Ctrl+E</dt><dd>{tx('сохранить проект / экспорт')}</dd>
          <dt>Ctrl+Z / Ctrl+Y</dt><dd>{tx('отменить / вернуть')}</dd>
          <dt>← →</dt><dd>{tx('на кадр (с Shift — на секунду)')}</dd>
          <dt>{tx('Ctrl+колесо')}</dt><dd>{tx('масштаб таймлайна')}</dd>
        </dl>
      </div>
    </>
  );
}

/** Скопировать параметры клипа и вставить их в другие — те же Ctrl+Shift+C и Ctrl+Shift+V. */
function AttrButtons() {
  const has = useStore((s) => !!s.copiedAttrs);
  return (
    <span className="attr-btns">
      <button className="icon-btn" title={tx('Скопировать параметры клипа (Ctrl+Shift+C)')} onClick={() => copyClipAttrs()} data-testid="attrs-copy"><ClipboardCopy size={15} /></button>
      <button className="icon-btn" title={tx('Вставить параметры в выделенные клипы (Ctrl+Shift+V)')} disabled={!has} onClick={() => openPasteAttrs()} data-testid="attrs-paste"><ClipboardPaste size={15} /></button>
    </span>
  );
}

// ---------- видео, фото, звук ----------
type MTab = 'basic' | 'anim' | 'color' | 'mask' | 'fx' | 'speed' | 'audio' | 'ai';

function MediaInspector({ clip, asset, trackKind }: { clip: MediaClip; asset?: MediaAsset; trackKind: string }) {
  const commit = useStore((s) => s.commit);
  const isAudio = asset?.kind === 'audio';
  const isImage = asset?.kind === 'image';
  const tabs: { id: MTab; label: string }[] = isAudio
    ? [{ id: 'audio', label: tx('Звук') }, { id: 'speed', label: tx('Скорость') }]
    : [
      { id: 'basic', label: tx('Кадр') }, { id: 'anim', label: tx('Анимация') }, { id: 'color', label: tx('Цвет') }, { id: 'mask', label: tx('Маска') },
      ...(clip.effects?.length ? [{ id: 'fx' as MTab, label: tx('Эффекты') }] : []),
      ...(!isImage ? [{ id: 'speed' as MTab, label: tx('Скорость') }] : []),
      ...(asset?.hasAudio ? [{ id: 'audio' as MTab, label: tx('Звук') }] : []),
      ...(!isImage ? [{ id: 'ai' as MTab, label: tx('ИИ') }] : []),
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
      <div className="panel-head"><span className="ellipsis" title={asset?.name}>{asset?.name ?? tx('Клип')}</span><AttrButtons /></div>
      {clip.group && (
        <div className="group-bar" data-testid="group-bar">
          <span>{txj('Группа: {0} клипа внутри', clip.group.tracks.reduce((n, t) => n + t.clips.length, 0))}</span>
          <button className="btn small" onClick={ungroupSelection} data-testid="ungroup">{tx('Разгруппировать')}</button>
          <button className="btn small" title={tx('Собрать заново (например, после смены формата кадра)')} onClick={() => void rebuildGroup(clip.id)}>{tx('Пересобрать')}</button>
        </div>
      )}
      <Tabs value={cur} tabs={tabs} onChange={setTab} />
      <div className="panel-body">
        {cur === 'basic' && (
          <>
            {clip.model3d && (
              <div className="m3d-bar" data-testid="m3d-bar">
                <Box size={16} /><span>3D: {clip.model3d.name}</span>
                <button className="btn small primary" onClick={() => getState().setModel3dEdit({ init: clip.model3d!, clipId: clip.id })} data-testid="m3d-edit">{tx('Изменить 3D')}</button>
              </div>
            )}
            <Field label={tx('Вписать в кадр')}>
              <Seg value={clip.fit} onChange={(v) => up({ fit: v }, 'fit')} options={[{ value: 'contain', label: tx('Целиком') }, { value: 'cover', label: tx('Заполнить') }]} />
            </Field>
            <AnimFields clip={clip} defs={MEDIA_ANIM} />
            {trackKind === 'video' && (
              <Field label={tx('Режим наложения')}>
                <select className="input" value={clip.blend ?? 'normal'} data-testid="blend" onChange={(e) => up({ blend: e.target.value as BlendMode }, 'blend')}>
                  {BLENDS.map((b) => <option key={b.mode} value={b.mode}>{b.label}</option>)}
                </select>
              </Field>
            )}
            {isImage && (
              <Slider label={tx('Длительность')} min={0.5} max={30} step={0.1} value={dur} format={(v) => tx('{0} с', v.toFixed(1))}
                onChange={(v) => up({ out: clip.in + v * clip.speed }, 'idur')} />
            )}
            <MediaPerspective clip={clip} asset={asset} />
            <button className="btn block" onClick={() => commit((p) => clearKeyframes(updateClip(p, clip.id, { transform: { ...DEFAULT_TRANSFORM, scale: trackKind === 'main' ? 1 : 0.6 }, opacity: 1 }), clip.id), `reset-${clip.id}`)}>
              <RotateCcw size={14} />{tx('Сбросить положение и анимацию')}</button>
          </>
        )}
        {cur === 'anim' && <ClipAnimTab clip={clip} />}
        {cur === 'mask' && <MaskTab clip={clip} />}
        {cur === 'fx' && (
          <>
            {(clip.effects ?? []).map((e) => {
              const def = EFFECTS.find((x) => x.type === e.type);
              const del = (
                <button className="icon-btn" style={{ width: 22, height: 22 }} title={tx('Убрать эффект')}
                  onClick={() => up({ effects: clip.effects!.filter((x) => x.type !== e.type) }, 'fxdel')}><X size={13} /></button>
              );
              if (def?.toggle) return <div key={e.type} className="field-row fx-toggle-row"><label>{def.label}</label>{del}</div>;
              const gl = isGlType(e.type) ? glDef(e.type) : undefined;
              const label = def?.label ?? gl?.name ?? (isGlType(e.type) ? tx('Плагин не найден: {0}', e.type.replace(/^plug:e\//, '')) : e.type);
              const setParam = (name: string, v: number) => up({ effects: clip.effects!.map((x) => (x.type === e.type ? { ...x, params: { ...x.params, [name]: v } } : x)) }, `fxp-${e.type}-${name}`);
              return (
                <div key={e.type} className={gl ? 'fx-gl' : undefined}>
                  <Slider label={label} min={0} max={1} step={0.01} value={e.amount} format={pct}
                    testId={`fxamt-${e.type}`} extra={del}
                    onChange={(v) => up({ effects: clip.effects!.map((x) => (x.type === e.type ? { ...x, amount: v } : x)) }, `fx-${e.type}`)} />
                  {gl?.params.filter((prm) => prm.type === 'float' && prm.min !== undefined && prm.max !== undefined).map((prm) => {
                    const cur = e.params?.[prm.name];
                    const val = typeof cur === 'number' ? cur : (prm.value as number);
                    return <Slider key={prm.name} label={`· ${prm.label ?? prm.name}`} min={prm.min!} max={prm.max!} step={(prm.max! - prm.min!) / 100} value={val}
                      format={(v) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2))} onChange={(v) => setParam(prm.name, v)} />;
                  })}
                </div>
              );
            })}
            {!(clip.effects ?? []).length && <p className="hint">{tx('Эффектов пока нет.')}</p>}
            <p className="hint small">{tx('Новые эффекты — в разделе «Эффекты» слева, наведи мышь, чтобы посмотреть. Шейдеры и свои плагины — там же, «Шейдеры» и «Плагины».')}</p>
          </>
        )}
        {cur === 'color' && (
          <div style={{ marginBottom: 6 }}>
            <Seg value={colorSub} onChange={setColorSub} options={[
              { value: 'basic', label: tx('Основное') }, { value: 'curves', label: tx('Кривые') }, { value: 'hsl', label: 'HSL' }, { value: 'lut', label: 'LUT' },
            ]} />
          </div>
        )}
        {cur === 'color' && colorSub === 'curves' && <CurvesPanel clip={clip} />}
        {cur === 'color' && colorSub === 'hsl' && <HslPanel clip={clip} />}
        {cur === 'color' && colorSub === 'lut' && <LutPanel clip={clip} />}
        {cur === 'color' && colorSub === 'basic' && (
          <>
            <Field label={tx('Фильтр')}>
              <select className="input" value={c.preset} onChange={(e) => up({ color: { ...c, preset: e.target.value, presetAmount: 1 } }, 'preset')}>
                <option value="none">{tx('Нет')}</option>
                {FILTER_CATS.map((cat) => (
                  <optgroup key={cat.id} label={cat.label}>
                    {FILTER_PRESETS.filter((f) => f.cat === cat.id).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
            {c.preset !== 'none' && (
              <Slider label={tx('Сила фильтра')} min={0} max={1} value={c.presetAmount} format={pct}
                onChange={(v) => up({ color: { ...c, presetAmount: v } }, 'pamt')} />
            )}
            <Slider label={tx('Яркость')} min={0.3} max={1.7} value={c.brightness} format={(v) => signedPct(v - 1)} testId="brightness"
              onChange={(v) => up({ color: { ...c, brightness: v } }, 'br')} onReset={() => up({ color: { ...c, brightness: 1 } }, 'br')} />
            <Slider label={tx('Контраст')} min={0.3} max={1.7} value={c.contrast} format={(v) => signedPct(v - 1)}
              onChange={(v) => up({ color: { ...c, contrast: v } }, 'ct')} onReset={() => up({ color: { ...c, contrast: 1 } }, 'ct')} />
            <Slider label={tx('Насыщенность')} min={0} max={2} value={c.saturation} format={(v) => signedPct(v - 1)}
              onChange={(v) => up({ color: { ...c, saturation: v } }, 'sat')} onReset={() => up({ color: { ...c, saturation: 1 } }, 'sat')} />
            <Slider label={tx('Теплота')} min={-1} max={1} value={c.warmth} format={signedPct}
              onChange={(v) => up({ color: { ...c, warmth: v } }, 'warm')} onReset={() => up({ color: { ...c, warmth: 0 } }, 'warm')} />
            <button className="btn block" onClick={() => up({ color: { ...DEFAULT_COLOR } }, 'creset')}><RotateCcw size={14} />{tx('Сбросить цвет')}</button>
            <p className="hint small" style={{ marginTop: 8 }}>{tx('Двойной клик по ползунку — вернуть значение по умолчанию.')}</p>
          </>
        )}
        {cur === 'speed' && <SpeedTab clip={clip} asset={asset} />}
        {cur === 'audio' && (
          <>
            <Toggle label={tx('Без звука')} on={clip.muted} onChange={(v) => up({ muted: v }, 'mute')} testId="mute" />
            <Slider label={tx('Громкость')} min={0} max={2} value={clip.volume} format={pct} testId="volume"
              onChange={(v) => up({ volume: v }, 'vol')} onReset={() => up({ volume: 1 }, 'vol')} />
            <Slider label={tx('Плавное появление')} min={0} max={Math.min(10, dur / 2)} step={0.05} value={clip.fadeIn} format={(v) => tx('{0} с', v.toFixed(1))}
              onChange={(v) => up({ fadeIn: v }, 'fi')} onReset={() => up({ fadeIn: 0 }, 'fi')} />
            <Slider label={tx('Плавное затухание')} min={0} max={Math.min(10, dur / 2)} step={0.05} value={clip.fadeOut} format={(v) => tx('{0} с', v.toFixed(1))}
              onChange={(v) => up({ fadeOut: v }, 'fo')} onReset={() => up({ fadeOut: 0 }, 'fo')} />
            {!isAudio && (
              <button className="btn block" onClick={() => void extractAudio(clip.id)} data-testid="extract-audio" style={{ marginTop: 6 }}>
                <AudioLines size={14} />{tx('Извлечь звук на отдельную дорожку')}</button>
            )}
            {!isAudio && <p className="hint small">{tx('Шум, паузы и эффекты голоса — во вкладке «ИИ».')}</p>}
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

const TILT_PRESETS: { label: string; tilt: { x: number; y: number }; hint: string }[] = [
  { label: tx('Лёжа'), tilt: { x: 55, y: 0 }, hint: tx('Как лист на столе — верх уходит вдаль') },
  { label: tx('Стена слева'), tilt: { x: 0, y: -45 }, hint: tx('Левый край уходит вдаль') },
  { label: tx('Стена справа'), tilt: { x: 0, y: 45 }, hint: tx('Правый край уходит вдаль') },
  { label: tx('Титры'), tilt: { x: 62, y: 0 }, hint: tx('Уходит к горизонту, как вступление в кино') },
];

/** Наклон в перспективе: два ползунка и готовые углы. */
function TiltFields({ tilt, onChange, disabled, testPrefix }: { tilt?: { x: number; y: number }; onChange: (t: { x: number; y: number } | undefined) => void; disabled?: boolean; testPrefix: string }) {
  const t = tilt ?? { x: 0, y: 0 };
  const set = (next: { x: number; y: number }) => onChange(Math.abs(next.x) < 0.05 && Math.abs(next.y) < 0.05 ? undefined : next);
  return (
    <div className={disabled ? 'is-disabled' : ''}>
      <div className="chips tilt-presets">
        {TILT_PRESETS.map((pr) => (
          <button key={pr.label} title={pr.hint} disabled={disabled} className={t.x === pr.tilt.x && t.y === pr.tilt.y ? 'active' : ''} onClick={() => set(pr.tilt)}>{pr.label}</button>
        ))}
        <button disabled={disabled || (!t.x && !t.y)} onClick={() => onChange(undefined)}>{tx('Ровно')}</button>
      </div>
      <Slider label={tx('Наклон вперёд-назад')} min={-70} max={70} step={1} value={t.x} format={(v) => `${Math.round(v)}°`} testId={`${testPrefix}-x`}
        onChange={(v) => !disabled && set({ ...t, x: v })} onReset={() => set({ ...t, x: 0 })} />
      <Slider label={tx('Поворот влево-вправо')} min={-70} max={70} step={1} value={t.y} format={(v) => `${Math.round(v)}°`} testId={`${testPrefix}-y`}
        onChange={(v) => !disabled && set({ ...t, y: v })} onReset={() => set({ ...t, y: 0 })} />
    </div>
  );
}

/** Перспектива видео и фото: наклон или «Углы» (картинка на 4 точках, точки тянутся в плеере). */
function MediaPerspective({ clip, asset }: { clip: MediaClip; asset?: MediaAsset }) {
  const commit = useStore((s) => s.commit);
  const settings = useStore((s) => s.project.settings);
  const up = (patch: Partial<MediaClip>, key: string) => commit((p) => updateClip(p, clip.id, patch), `${key}-${clip.id}`);
  const pinOn = !!clip.pin;
  return (
    <>
      <div className="section-title">{tx('Перспектива')}</div>
      <TiltFields tilt={clip.tilt} disabled={pinOn} onChange={(t) => up({ tilt: t }, 'tilt')} testPrefix="tilt" />
      <Toggle label={tx('Углы — натянуть на 4 точки')} hint={pinOn ? tx('Тяни белые точки в окне просмотра. Подходит, чтобы вставить видео в экран телефона, на билборд или стену.') : tx('Например, вставить видео в экран телефона или на стену')}
        on={pinOn} testId="pin-toggle"
        onChange={(v) => up({ pin: v && asset ? pinFromTransform(clip, asset.width, asset.height, settings.width, settings.height) : undefined }, 'pin')} />
      {pinOn && (
        <button className="btn block small" onClick={() => asset && up({ pin: pinFromTransform({ ...clip, tilt: undefined }, asset.width, asset.height, settings.width, settings.height) }, 'pinreset')}>
          {tx('Вернуть углы ровно')}</button>
      )}
    </>
  );
}

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
        <div className="section-title">{kind === 'in' ? tx('Появление') : tx('Исчезновение')}</div>
        <div className="anim-grid" data-testid={`canim-${kind}`}>
          <button className={!cur ? 'active' : ''} onClick={() => set(kind, undefined)}>{tx('Нет')}</button>
          {CLIP_ANIMS.map((a) => (
            <button key={a.type} className={cur?.type === a.type ? 'active' : ''} title={a.hint} data-testid={`canim-${kind}-${a.type}`}
              onClick={() => set(kind, { type: a.type, dur: cur?.dur ?? Math.min(CLIP_ANIM_DEFAULT_DUR, maxDur) })}>{kind === 'in' ? a.in : a.out}</button>
          ))}
        </div>
        {cur && (
          <Slider label={tx('Длительность')} min={0.1} max={maxDur} step={0.05} value={Math.min(cur.dur, maxDur)} format={(v) => tx('{0} с', v.toFixed(2))}
            onChange={(v) => set(kind, { ...cur, dur: v })} />
        )}
      </>
    );
  };
  return (
    <>
      <p className="hint">{tx('Как клип появляется в начале и исчезает в конце. Работает и на основной дорожке, и в наложениях, вместе с переходами.')}</p>
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
  const smooth = !!r?.smooth;
  const userRamp = userCurve(r);
  const active = userRamp ? r?.preset ?? 'custom' : 'none';
  const [draft, setDraft] = useState<RampPoint[] | null>(null);
  const curve = draft ?? userRamp ?? null;
  const srcLen = r ? r.out - r.in : clip.out - clip.in;
  const dur = clipDuration(clip);
  const isVideo = asset?.kind === 'video';
  // при плавном замедлении скорость вшита в копию: новую скорость применяем, когда ползунок отпустили
  const [speedDraft, setSpeedDraft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const speed = speedDraft ?? userSpeed(clip);
  const setSpeed = (v: number) => {
    if (!smooth) { up({ speed: v }, 'speed'); return; }
    setSpeedDraft(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void retimeClip(clip.id, { speed: v }).finally(() => setSpeedDraft(null)); }, 700);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const slowSomewhere = speed < 0.999 || (userRamp ?? []).some((q) => q.v * speed < 0.999);
  const pick = (id: string) => {
    setDraft(null);
    if (id === 'none') { if (userRamp) void retimeClip(clip.id, { ramp: null }); return; }
    if (id === 'custom') { setDraft(userRamp ?? [{ x: 0, v: 1 }, { x: 0.5, v: 1 }, { x: 1, v: 1 }]); return; }
    const pr = RAMP_PRESETS.find((x) => x.id === id)!;
    void retimeClip(clip.id, { ramp: pr.points, preset: pr.id });
  };
  return (
    <>
      <Field label={tx('Скорость')}>
        <Seg value={speed} onChange={setSpeed} options={[0.25, 0.5, 1, 1.5, 2, 3].map((v) => ({ value: v, label: `${v}×` }))} />
      </Field>
      <Slider label={tx('Точно')} min={0.25} max={4} step={0.05} value={speed} format={(v) => `${v.toFixed(2)}×`} testId="speed"
        onChange={setSpeed} onReset={() => setSpeed(1)} />
      <p className="hint">{txj('Длина на таймлайне: {0}. Высота голоса сохраняется.', fmtDur(dur))}</p>
      {isVideo && (
        <div className={`smooth-box ${smooth ? 'on' : ''}`}>
          <Toggle label={tx('Плавное замедление')} on={smooth} testId="smooth"
            hint={smooth
              ? tx('Промежуточные кадры дорисованы по движению — замедление без рывков. Новая скорость или кривая пересоберёт копию.')
              : slowSomewhere
                ? tx('Сейчас кадры при замедлении повторяются и картинка дёргается. Kadro дорисует промежуточные кадры по движению.')
                : tx('Пригодится, когда замедляешь клип (скорость меньше 1×) или ставишь кривую со слоу-мо.')}
            onChange={(v) => { if (!busy) void retimeClip(clip.id, { smooth: v }); }} />
          {!smooth && slowSomewhere && <p className="hint small">{tx('Дорисовка занимает время — примерно столько же, сколько длится клип, или дольше.')}</p>}
        </div>
      )}

      <div className="sub-head">{tx('Кривая скорости')}</div>
      <div className="ramp-grid">
        {[{ id: 'none', label: tx('Нет'), hint: tx('Без кривой'), points: null as RampPoint[] | null }, ...RAMP_PRESETS, { id: 'custom', label: tx('Своя'), hint: tx('Нарисуй кривую сам'), points: null }].map((pr) => (
          <button key={pr.id} className={`ramp-tile ${(draft ? 'custom' : active) === pr.id ? 'active' : ''}`} title={pr.hint} disabled={busy}
            onClick={() => pick(pr.id)} data-testid={`ramp-${pr.id}`}>
            <RampThumb points={pr.id === 'custom' ? r?.preset === 'custom' ? userRamp ?? null : null : pr.points} />
            <span>{pr.label}</span>
          </button>
        ))}
      </div>
      {curve && (
        <>
          <RampEditor points={curve} onChange={setDraft} disabled={busy} />
          <p className="hint small">
            {txj('Тяни точки вверх — быстрее, вниз — медленнее. Двойной клик добавляет точку, двойной клик по точке — убирает.{0}Длина станет {1}.', ' ', fmtDur(new RampMap(normalizeRamp(curve), srcLen).total / (smooth ? 1 : clip.speed)))}</p>
          {draft && (
            <div className="row-btns">
              <button className="btn primary" disabled={busy} data-testid="ramp-apply" onClick={() => { const d = draft; setDraft(null); void retimeClip(clip.id, { ramp: d, preset: 'custom' }); }}>{tx('Применить')}</button>
              <button className="btn" onClick={() => setDraft(null)}>{tx('Отмена')}</button>
            </div>
          )}
        </>
      )}

      <div className="sub-head">{tx('Ещё')}</div>
      <Toggle label={tx('Реверс — проиграть задом наперёд')} on={!!r?.reverse} testId="reverse"
        onChange={(v) => { if (!busy) void retimeClip(clip.id, { reverse: v }); }} />
      {isVideo && (
        <button className="btn block" disabled={busy} data-testid="freeze" onClick={() => void freezeFrame()} style={{ marginTop: 10 }}>
          <Snowflake size={14} />{tx('Стоп-кадр в позиции курсора')}</button>
      )}
      <p className="hint small" style={{ marginTop: 8 }}>
        {tx('Реверс, кривая и плавное замедление создают копию фрагмента — это занимает немного времени. Обрезка и разрезание работают как обычно.')}</p>
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

export const BLENDS: { mode: BlendMode; label: string }[] = [
  { mode: 'normal', label: tx('Обычный') }, { mode: 'multiply', label: tx('Умножение') }, { mode: 'screen', label: tx('Осветление (экран)') },
  { mode: 'overlay', label: tx('Перекрытие') }, { mode: 'darken', label: tx('Замена тёмным') }, { mode: 'lighten', label: tx('Замена светлым') },
  { mode: 'add', label: tx('Сложение') },
];
export const MASKS: { shape: Mask['shape'] | 'none'; label: string }[] = [
  { shape: 'none', label: tx('Нет') }, { shape: 'linear', label: tx('Линия') }, { shape: 'mirror', label: tx('Полоса') },
  { shape: 'circle', label: tx('Круг') }, { shape: 'rect', label: tx('Прямоугольник') },
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
    if (!ED) { getState().toast(tx('Пипетка недоступна — выбери цвет вручную')); return; }
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
          <Slider label={tx('Сдвиг по горизонтали')} min={-0.5} max={0.5} step={0.005} value={m.x} format={signedPct} onChange={(v) => setM({ x: v }, 'mx')} onReset={() => setM({ x: 0 }, 'mx')} />
          <Slider label={tx('Сдвиг по вертикали')} min={-0.5} max={0.5} step={0.005} value={m.y} format={signedPct} onChange={(v) => setM({ y: v }, 'my')} onReset={() => setM({ y: 0 }, 'my')} />
          {m.shape !== 'linear' && m.shape !== 'mirror' && (
            <Slider label={tx('Ширина')} min={0.02} max={1.5} step={0.01} value={m.w} format={pct} onChange={(v) => setM({ w: v }, 'mw')} />
          )}
          {m.shape !== 'linear' && (
            <Slider label={m.shape === 'mirror' ? tx('Толщина полосы') : tx('Высота')} min={0.02} max={1.5} step={0.01} value={m.h} format={pct} onChange={(v) => setM({ h: v }, 'mh')} />
          )}
          <Slider label={tx('Поворот')} min={-180} max={180} step={1} value={m.rotation} format={deg} onChange={(v) => setM({ rotation: v }, 'mr')} onReset={() => setM({ rotation: 0 }, 'mr')} />
          <Slider label={tx('Растушёвка')} min={0} max={0.5} step={0.005} value={m.feather} format={pct} onChange={(v) => setM({ feather: v }, 'mf')} />
          <Toggle label={tx('Инвертировать')} on={m.invert} onChange={(v) => setM({ invert: v }, 'mi')} />
        </>
      )}
      <div className="section-title">{tx('Хромакей — убрать цвет фона')}</div>
      <Toggle label={tx('Убрать цвет')} hint={tx('Зелёный или синий фон за человеком')} on={!!ch} onChange={(v) => up({ chroma: v ? { ...DEFAULT_CHROMA } : undefined }, 'chon')} testId="chroma-toggle" />
      {ch && (
        <>
          <div className="field-row" style={{ margin: '10px 0' }}>
            <label>{tx('Цвет фона')}</label>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="btn small" onClick={() => void pick()} title={tx('Ткни в цвет на экране')}><Pipette size={13} />{tx('Пипетка')}</button>
              <input type="color" className="color-input" value={ch.color} onChange={(e) => setC({ color: e.target.value }, 'chc')} />
            </span>
          </div>
          <Slider label={tx('Сила')} min={0.01} max={0.5} step={0.005} value={ch.similarity} format={pct} onChange={(v) => setC({ similarity: v }, 'chs')} testId="chroma-sim" />
          <Slider label={tx('Мягкость края')} min={0} max={0.3} step={0.005} value={ch.smoothness} format={pct} onChange={(v) => setC({ smoothness: v }, 'chb')} />
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
      <h4><Volume2 size={15} />{tx('Озвучить текст')}</h4>
      <p className="hint">{tx('Голос прочитает текст — звук ляжет на аудиодорожку, длина текста подстроится.')}</p>
      <select className="input" value={voice} onChange={(e) => setVoice(e.target.value as TtsVoiceId)} data-testid="tts-voice">
        {voices.map((x) => <option key={x.id} value={x.id}>{x.label}{x.ready ? '' : tx(' · скачается {0} МБ', x.sizeMb)}</option>)}
      </select>
      <Slider label={tx('Темп')} min={0.6} max={1.6} step={0.05} value={speed} format={(x) => `${x.toFixed(2)}×`} onChange={setSpeed} onReset={() => setSpeed(1)} />
      <button className="btn block" disabled={busy || !clip.text.trim()} onClick={() => void speakText(clip.id, voice, speed)} data-testid="tts-run">
        {busy ? tx('Озвучиваю…') : v && !v.ready ? tx('Скачать голос и озвучить') : tx('Озвучить')}
      </button>
    </div>
  );
}

function BeatBox({ asset }: { asset: MediaAsset }) {
  const busy = useJobRunning('bt_');
  return (
    <div className="ai-card">
      <h4><Activity size={15} />{tx('Ритм')}</h4>
      <p className="hint">{asset.beats?.length ? tx('{0} ударов в минуту, {1} долей — отмечены жёлтым на клипе. Склейки прилипают к долям.', Math.round(asset.bpm ?? 0), asset.beats.length) : tx('Найду доли такта: к ним прилипают склейки, а кнопка «Под бит» подгонит клипы.')}</p>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn small" disabled={busy} onClick={() => void findBeats(asset.id)} data-testid="find-beats">{asset.beats?.length ? tx('Найти заново') : tx('Найти ритм')}</button>
        {!!asset.beats?.length && <button className="btn small" onClick={() => alignToBeats()} data-testid="align-beats">{tx('Подогнать склейки')}</button>}
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
          <option value="none">{tx('Нет')}</option>
          {TEXT_ANIMS.map((a) => <option key={a.type} value={a.type}>{kind === 'in' ? a.in : a.out}</option>)}
        </select>
      </Field>
      {cur && (
        <Slider label={tx('Длительность')} min={0.1} max={maxDur} step={0.05} value={Math.min(cur.dur, maxDur)} format={(v) => tx('{0} с', v.toFixed(2))}
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
      <Field label={tx('Подсветка слова (для всех субтитров)')}>
        <select className="input" value={hl.mode} onChange={(e) => setAll({ ...hl, mode: e.target.value as WordHighlight['mode'] })} data-testid="highlight-mode">
          {HIGHLIGHTS.map((h) => <option key={h.mode} value={h.mode}>{h.label}</option>)}
        </select>
      </Field>
      {hl.mode !== 'none' && <ColorField label={tx('Цвет подсветки')} value={hl.color} onChange={(v) => setAll({ ...hl, color: v })} />}
      {!clip.words?.length && <p className="hint small">{tx('У этого субтитра нет разметки слов — пересоздай субтитры, чтобы подсветка заработала.')}</p>}
    </>
  );
}

// ---------- анимируемые свойства (ключевые кадры) ----------
interface AnimDef { prop: AnimProp; label: string; min: number; max: number; step: number; format: (v: number) => string; reset: number }
const deg = (v: number) => `${Math.round(v)}°`;
const MEDIA_ANIM: AnimDef[] = [
  { prop: 'scale', label: tx('Масштаб'), min: 0.1, max: 3, step: 0.01, format: pct, reset: 1 },
  { prop: 'x', label: tx('Сдвиг по горизонтали'), min: -1, max: 1, step: 0.005, format: signedPct, reset: 0 },
  { prop: 'y', label: tx('Сдвиг по вертикали'), min: -1, max: 1, step: 0.005, format: signedPct, reset: 0 },
  { prop: 'rotation', label: tx('Поворот'), min: -180, max: 180, step: 1, format: deg, reset: 0 },
  { prop: 'opacity', label: tx('Непрозрачность'), min: 0, max: 1, step: 0.01, format: pct, reset: 1 },
];
const TEXT_ANIM: AnimDef[] = [
  { prop: 'x', label: tx('По горизонтали'), min: 0, max: 1, step: 0.005, format: pct, reset: 0.5 },
  { prop: 'y', label: tx('По вертикали'), min: 0, max: 1, step: 0.005, format: pct, reset: 0.5 },
  { prop: 'scale', label: tx('Масштаб'), min: 0.2, max: 4, step: 0.01, format: pct, reset: 1 },
  { prop: 'rotation', label: tx('Поворот'), min: -180, max: 180, step: 1, format: deg, reset: 0 },
  { prop: 'opacity', label: tx('Непрозрачность'), min: 0, max: 1, step: 0.01, format: pct, reset: 1 },
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
        <button className="icon-btn" style={{ width: 24, height: 24 }} disabled={prev === undefined} onClick={() => go(prev!)} title={tx('К предыдущему ключу')}><ChevronLeft size={15} /></button>
        <span className="grow">{animated ? tx('Ключей: {0}', times.length) : tx('Ромбик — анимация во времени')}</span>
        <button className="icon-btn" style={{ width: 24, height: 24 }} disabled={next === undefined} onClick={() => go(next!)} title={tx('К следующему ключу')}><ChevronRight size={15} /></button>
        {animated && <button className="btn ghost small" onClick={() => commit((p) => clearKeyframes(p, clip.id))} title={tx('Убрать все ключи клипа')}>{tx('Убрать')}</button>}
      </div>
      {!inClip && animated && <p className="hint small">{tx('Поставь курсор на клип, чтобы менять ключи.')}</p>}
      {defs.map((d) => {
        const st = hasKeyHere(clip, d.prop, playhead) ? 'here' : isAnimated(clip, d.prop) ? 'animated' : 'none';
        return (
          <Slider key={d.prop} label={d.label} min={d.min} max={d.max} step={d.step} value={propValue(clip, d.prop, playhead)} format={d.format}
            testId={`anim-${d.prop}`}
            extra={<KeyButton state={st} testId={`key-${d.prop}`} onClick={() => { if (inClip) commit((p) => toggleKey(p, clip, d.prop, playhead)); else getState().toast(tx('Поставь курсор на клип')); }} />}
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
      <div className="panel-head"><span className="ellipsis">{isCaption ? tx('Субтитр') : tx('Текст')}</span><AttrButtons /></div>
      <Tabs value={tab} tabs={[{ id: 'text', label: tx('Текст') }, { id: 'style', label: tx('Оформление') }, { id: 'anim', label: tx('Анимация') }]} onChange={setTab} />
      <div className="panel-body">
        {tab === 'text' && (
          <>
            <textarea ref={area} className="input" value={clip.text} rows={3} data-testid="text-input"
              onChange={(e) => up({ text: e.target.value, words: retimeWords(e.target.value, clip.words) }, 'text')} placeholder={tx('Напиши текст')} />
            <Field label={tx('Шрифт')}>
              <FontPicker value={s.font} onChange={(font) => st({ font }, 'font')} testId="text-font" />
            </Field>
            <Slider label={tx('Размер')} min={12} max={300} step={1} value={s.size} format={(v) => String(Math.round(v))} testId="text-size"
              onChange={(v) => st({ size: v }, 'size')} />
            <div className="text-tools">
              <button className={`icon-btn ${s.bold ? 'on' : ''}`} title={tx('Жирный')} onClick={() => st({ bold: !s.bold }, 'b')}><Bold size={16} /></button>
              <button className={`icon-btn ${s.italic ? 'on' : ''}`} title={tx('Курсив')} onClick={() => st({ italic: !s.italic }, 'i')}><Italic size={16} /></button>
              <button className={`icon-btn ${s.uppercase ? 'on' : ''}`} title={tx('Заглавные')} onClick={() => st({ uppercase: !s.uppercase }, 'u')}><CaseUpper size={16} /></button>
              <span className="sep" />
              <button className={`icon-btn ${s.align === 'left' ? 'on' : ''}`} title={tx('По левому краю')} onClick={() => st({ align: 'left' }, 'al')}><AlignLeft size={16} /></button>
              <button className={`icon-btn ${s.align === 'center' ? 'on' : ''}`} title={tx('По центру')} onClick={() => st({ align: 'center' }, 'al')}><AlignCenter size={16} /></button>
              <button className={`icon-btn ${s.align === 'right' ? 'on' : ''}`} title={tx('По правому краю')} onClick={() => st({ align: 'right' }, 'al')}><AlignRight size={16} /></button>
            </div>
            <ColorField label={tx('Цвет текста')} value={s.color} onChange={(v) => st({ color: v }, 'color')} />
            <Slider label={tx('Длительность')} min={0.2} max={Math.max(30, clip.duration)} step={0.1} value={clip.duration} format={(v) => tx('{0} с', v.toFixed(1))}
              onChange={(v) => up({ duration: v }, 'dur')} />
            {isCaption && (
              <button className="btn block" onClick={() => { commit((p) => styleAllCaptions(p, clip.style, clip.y)); getState().toast(tx('Стиль применён ко всем субтитрам'), 'ok'); }}>
                {tx('Применить стиль ко всем субтитрам')}</button>
            )}
            <SpeakBox clip={clip} />
          </>
        )}
        {tab === 'style' && (
          <>
            <div className="tile-grid" style={{ marginTop: 4 }}>
              {TEXT_PRESETS.map((t) => (
                <button key={t.id} className="tile text-tile" onClick={() => st(t.style, 'preset')}>
                  <div className="text-sample"><span style={textPreviewStyle({ ...s, ...t.style })}>{tx('Аа')}</span></div>
                  <span className="label">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="section-title">{tx('Обводка')}</div>
            <ColorField label={tx('Цвет обводки')} value={s.strokeColor} onChange={(v) => st({ strokeColor: v, strokeWidth: s.strokeWidth || 6 }, 'sc')} />
            <Slider label={tx('Толщина')} min={0} max={20} step={0.5} value={s.strokeWidth} format={(v) => v.toFixed(1)}
              onChange={(v) => st({ strokeWidth: v }, 'sw')} />
            <Toggle label={tx('Тень')} on={s.shadow} onChange={(v) => st({ shadow: v }, 'sh')} />
            <div className="section-title">{tx('Плашка')}</div>
            <ColorField label={tx('Цвет плашки')} value={s.bgColor} onChange={(v) => st({ bgColor: v, bgOpacity: s.bgOpacity || 0.7 }, 'bgc')} />
            <Slider label={tx('Плотность')} min={0} max={1} value={s.bgOpacity} format={pct} onChange={(v) => st({ bgOpacity: v }, 'bgo')} />
            <div className="section-title">{tx('Строка')}</div>
            <Slider label={tx('Ширина строки')} min={0.3} max={1} step={0.01} value={s.maxWidth} format={pct}
              onChange={(v) => st({ maxWidth: v }, 'mw')} />
            <div className="section-title">{tx('Наклон в перспективе')}</div>
            <TiltFields tilt={clip.tilt} onChange={(t) => commit((p) => updateClip(p, clip.id, { tilt: t }), `ttilt-${clip.id}`)} testPrefix="text-tilt" />
            <p className="hint small">{tx('Текст можно двигать, растягивать и поворачивать прямо в окне просмотра.')}</p>
          </>
        )}
        {tab === 'anim' && (
          <>
            <AnimPick label={tx('Появление')} kind="in" clip={clip} />
            <AnimPick label={tx('Исчезновение')} kind="out" clip={clip} />
            {isCaption && <HighlightPick clip={clip} />}
            <div className="section-title">{tx('Движение по ключам')}</div>
            <AnimFields clip={clip} defs={TEXT_ANIM} />
          </>
        )}
      </div>
    </>
  );
}
