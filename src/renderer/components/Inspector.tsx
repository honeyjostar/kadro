import { AlignCenter, AlignLeft, AlignRight, Bold, CaseUpper, Italic, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FILTER_PRESETS } from '../../shared/color';
import { ASPECTS, DEFAULT_COLOR, DEFAULT_TRANSFORM, FONTS, TEXT_PRESETS } from '../../shared/defaults';
import { clipDuration, projectDuration, setSettings, styleAllCaptions, updateClip } from '../../shared/timeline';
import type { AspectKey, MediaAsset, MediaClip, ProjectSettings, TextClip, TextStyle } from '../../shared/types';
import { useSelected } from '../hooks';
import { getState, useStore } from '../store';
import { fmtDur } from '../util';
import { ColorField, Field, Seg, Slider, Toggle } from './controls';
import { AiTools, textPreviewStyle } from './LeftPanel';

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
          <div><span>Файлов</span><b>{project.assets.length}</b></div>
        </div>
        <div className="section-title">Клавиши</div>
        <dl className="keys">
          <dt>Пробел</dt><dd>пуск и пауза</dd>
          <dt>S или Ctrl+B</dt><dd>разрезать у курсора</dd>
          <dt>Delete</dt><dd>удалить выделенное</dd>
          <dt>Ctrl+D</dt><dd>копия клипа</dd>
          <dt>Ctrl+Z / Ctrl+Y</dt><dd>отменить / вернуть</dd>
          <dt>← →</dt><dd>на кадр (с Shift — на секунду)</dd>
          <dt>Ctrl+колесо</dt><dd>масштаб таймлайна</dd>
        </dl>
      </div>
    </>
  );
}

// ---------- видео, фото, звук ----------
type MTab = 'basic' | 'color' | 'speed' | 'audio' | 'ai';

function MediaInspector({ clip, asset, trackKind }: { clip: MediaClip; asset?: MediaAsset; trackKind: string }) {
  const commit = useStore((s) => s.commit);
  const isAudio = asset?.kind === 'audio';
  const isImage = asset?.kind === 'image';
  const tabs: { id: MTab; label: string }[] = isAudio
    ? [{ id: 'audio', label: 'Звук' }, { id: 'speed', label: 'Скорость' }]
    : [
      { id: 'basic', label: 'Основное' }, { id: 'color', label: 'Цвет' },
      ...(!isImage ? [{ id: 'speed' as MTab, label: 'Скорость' }] : []),
      ...(asset?.hasAudio ? [{ id: 'audio' as MTab, label: 'Звук' }] : []),
      ...(!isImage ? [{ id: 'ai' as MTab, label: 'ИИ' }] : []),
    ];
  const [tab, setTab] = useState<MTab>(() => (lastMediaTab && tabs.some((t) => t.id === lastMediaTab) ? lastMediaTab : tabs[0].id));
  useEffect(() => { lastMediaTab = tab; }, [tab]);
  const cur = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  const up = (patch: Partial<MediaClip>, key: string) => commit((p) => updateClip(p, clip.id, patch), `${key}-${clip.id}`);
  const t = clip.transform;
  const c = clip.color;
  const dur = clipDuration(clip);
  return (
    <>
      <div className="panel-head"><span className="ellipsis" title={asset?.name}>{asset?.name ?? 'Клип'}</span></div>
      <Tabs value={cur} tabs={tabs} onChange={setTab} />
      <div className="panel-body">
        {cur === 'basic' && (
          <>
            <Field label="Вписать в кадр">
              <Seg value={clip.fit} onChange={(v) => up({ fit: v }, 'fit')} options={[{ value: 'contain', label: 'Целиком' }, { value: 'cover', label: 'Заполнить' }]} />
            </Field>
            <Slider label="Масштаб" min={0.1} max={3} step={0.01} value={t.scale} format={pct} testId="scale"
              onChange={(v) => up({ transform: { ...t, scale: v } }, 'scale')} onReset={() => up({ transform: { ...t, scale: 1 } }, 'scale')} />
            <Slider label="Сдвиг по горизонтали" min={-1} max={1} step={0.005} value={t.x} format={signedPct}
              onChange={(v) => up({ transform: { ...t, x: v } }, 'tx')} onReset={() => up({ transform: { ...t, x: 0 } }, 'tx')} />
            <Slider label="Сдвиг по вертикали" min={-1} max={1} step={0.005} value={t.y} format={signedPct}
              onChange={(v) => up({ transform: { ...t, y: v } }, 'ty')} onReset={() => up({ transform: { ...t, y: 0 } }, 'ty')} />
            <Slider label="Поворот" min={-180} max={180} step={1} value={t.rotation} format={(v) => `${Math.round(v)}°`}
              onChange={(v) => up({ transform: { ...t, rotation: v } }, 'rot')} onReset={() => up({ transform: { ...t, rotation: 0 } }, 'rot')} />
            {isImage && (
              <Slider label="Длительность" min={0.5} max={30} step={0.1} value={dur} format={(v) => `${v.toFixed(1)} с`}
                onChange={(v) => up({ out: clip.in + v * clip.speed }, 'idur')} />
            )}
            <button className="btn block" onClick={() => up({ transform: { ...DEFAULT_TRANSFORM, scale: trackKind === 'main' ? 1 : 0.6 } }, 'reset')}>
              <RotateCcw size={14} />Сбросить положение
            </button>
          </>
        )}
        {cur === 'color' && (
          <>
            <Field label="Фильтр">
              <select className="input" value={c.preset} onChange={(e) => up({ color: { ...c, preset: e.target.value, presetAmount: 1 } }, 'preset')}>
                {FILTER_PRESETS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
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
        {cur === 'speed' && (
          <>
            <Field label="Скорость">
              <Seg value={clip.speed} onChange={(v) => up({ speed: v }, 'speedp')} options={[0.5, 1, 1.5, 2, 3].map((v) => ({ value: v, label: `${v}×` }))} />
            </Field>
            <Slider label="Точно" min={0.25} max={4} step={0.05} value={clip.speed} format={(v) => `${v.toFixed(2)}×`} testId="speed"
              onChange={(v) => up({ speed: v }, 'speed')} onReset={() => up({ speed: 1 }, 'speed')} />
            <p className="hint">Длина на таймлайне: {fmtDur(dur)}. Высота голоса сохраняется.</p>
          </>
        )}
        {cur === 'audio' && (
          <>
            <Toggle label="Без звука" on={clip.muted} onChange={(v) => up({ muted: v }, 'mute')} testId="mute" />
            <Slider label="Громкость" min={0} max={2} value={clip.volume} format={pct} testId="volume"
              onChange={(v) => up({ volume: v }, 'vol')} onReset={() => up({ volume: 1 }, 'vol')} />
            <Slider label="Плавное появление" min={0} max={Math.min(10, dur / 2)} step={0.05} value={clip.fadeIn} format={(v) => `${v.toFixed(1)} с`}
              onChange={(v) => up({ fadeIn: v }, 'fi')} onReset={() => up({ fadeIn: 0 }, 'fi')} />
            <Slider label="Плавное затухание" min={0} max={Math.min(10, dur / 2)} step={0.05} value={clip.fadeOut} format={(v) => `${v.toFixed(1)} с`}
              onChange={(v) => up({ fadeOut: v }, 'fo')} onReset={() => up({ fadeOut: 0 }, 'fo')} />
            {!isAudio && <p className="hint small">Шум и паузы — во вкладке «ИИ».</p>}
            {isAudio && <AiTools compact />}
          </>
        )}
        {cur === 'ai' && <AiTools compact />}
      </div>
    </>
  );
}
let lastMediaTab: MTab | null = null;

// ---------- текст и субтитры ----------
function TextInspector({ clip }: { clip: TextClip }) {
  const commit = useStore((s) => s.commit);
  const [tab, setTab] = useState<'text' | 'style'>('text');
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
      <Tabs value={tab} tabs={[{ id: 'text', label: 'Текст' }, { id: 'style', label: 'Оформление' }]} onChange={setTab} />
      <div className="panel-body">
        {tab === 'text' && (
          <>
            <textarea ref={area} className="input" value={clip.text} rows={3} data-testid="text-input"
              onChange={(e) => up({ text: e.target.value }, 'text')} placeholder="Напиши текст" />
            <Field label="Шрифт">
              <select className="input" value={s.font} onChange={(e) => st({ font: e.target.value }, 'font')} style={{ fontFamily: `'${s.font}'` }}>
                {FONTS.map((f) => <option key={f.family} value={f.family} style={{ fontFamily: `'${f.family}'` }}>{f.label}</option>)}
              </select>
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
            <div className="section-title">Расположение</div>
            <Slider label="По горизонтали" min={0} max={1} step={0.005} value={clip.x} format={pct}
              onChange={(v) => up({ x: v }, 'x')} onReset={() => up({ x: 0.5 }, 'x')} />
            <Slider label="По вертикали" min={0} max={1} step={0.005} value={clip.y} format={pct}
              onChange={(v) => up({ y: v }, 'y')} onReset={() => up({ y: 0.5 }, 'y')} />
            <Slider label="Ширина строки" min={0.3} max={1} step={0.01} value={s.maxWidth} format={pct}
              onChange={(v) => st({ maxWidth: v }, 'mw')} />
            <p className="hint small">Текст можно двигать и растягивать прямо в окне просмотра.</p>
          </>
        )}
      </div>
    </>
  );
}
