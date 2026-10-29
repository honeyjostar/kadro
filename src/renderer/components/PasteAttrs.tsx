// Окно «Вставить параметры» (Ctrl+Shift+V): что скопировано с клипа (Ctrl+Shift+C) — по группам, с
// понятными значениями; галочками выбираешь, что перенести на выделенные клипы.
import { ClipboardPaste, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MEDIA_GROUPS, TEXT_GROUPS, pasteAttrs, pasteTargets, type AttrGroup, type ClipAttrs } from '../../shared/attrs';
import { CLIP_ANIMS } from '../../shared/clipAnim';
import { FILTER_PRESETS } from '../../shared/color';
import { TEXT_ANIMS, TRANSITIONS } from '../../shared/defaults';
import { EFFECTS } from '../../shared/effects';
import { tx } from '../../shared/i18n';
import type { ChromaKey, ColorAdjust, Effect, Grade, Keyframes, Mask, TextStyle, Transform, Transition } from '../../shared/types';
import { glDef } from '../glRegistry';
import { getState, useStore } from '../store';
import { plural } from '../util';
import { BLENDS, MASKS } from './Inspector';

export const GROUP_LABEL = (): Record<AttrGroup, string> => ({
  frame: tx('Кадр: размер, положение, поворот'),
  keys: tx('Ключевые кадры'),
  anim: tx('Появление и исчезновение'),
  color: tx('Цвет: фильтр, коррекция, кривые, LUT'),
  fx: tx('Эффекты'),
  mask: tx('Маска и хромакей'),
  speed: tx('Скорость'),
  audio: tx('Звук'),
  transition: tx('Переход после клипа'),
  style: tx('Оформление текста'),
});

const clipsWord = (n: number) => plural(n, tx('клип'), tx('клипа'), tx('клипов'));
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signed = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;
const effName = (t: string) => EFFECTS.find((e) => e.type === t)?.label ?? glDef(t)?.name ?? t;
const trName = (t: string) => TRANSITIONS.find((e) => e.type === t)?.label ?? glDef(t)?.name ?? t;

/** Скопированные значения группы — короткими фразами. */
export function describe(a: ClipAttrs, g: AttrGroup): string[] {
  const v = (a.values[g] ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  switch (g) {
    case 'frame': {
      if (a.kind === 'text') {
        out.push(tx('Положение {0}% × {1}%', Math.round((v.x as number) * 100), Math.round((v.y as number) * 100)));
        if ((v.scale as number ?? 1) !== 1) out.push(tx('Масштаб {0}', pct(v.scale as number)));
        if (v.rotation) out.push(tx('Поворот {0}°', Math.round(v.rotation as number)));
      } else {
        const t = v.transform as Transform;
        out.push(v.fit === 'cover' ? tx('Заполнить') : tx('Целиком'));
        if (t.scale !== 1) out.push(tx('Масштаб {0}', pct(t.scale)));
        if (t.x || t.y) out.push(tx('Сдвиг {0} / {1}', signed(t.x), signed(t.y)));
        if (t.rotation) out.push(tx('Поворот {0}°', Math.round(t.rotation)));
        if (v.pin) out.push(tx('Углы — натянуть на 4 точки'));
        if (v.blend && v.blend !== 'normal') out.push(tx('Наложение: {0}', BLENDS.find((b) => b.mode === v.blend)?.label ?? String(v.blend)));
      }
      if (v.opacity !== undefined && v.opacity !== 1) out.push(tx('Непрозрачность {0}', pct(v.opacity as number)));
      if (v.tilt) out.push(tx('Наклон в перспективе'));
      break;
    }
    case 'keys': {
      const k = (v.keyframes ?? {}) as Keyframes;
      const props = Object.entries(k).filter(([, pts]) => (pts as unknown[])?.length);
      if (!props.length) out.push(tx('Нет'));
      else out.push(tx('Ключей: {0}', props.reduce((n, [, pts]) => n + (pts as unknown[]).length, 0)));
      break;
    }
    case 'anim': {
      const an = (v.anim ?? {}) as { in?: { type: string; dur: number }; out?: { type: string; dur: number } };
      const name = (t: string, side: 'in' | 'out') => {
        const list = a.kind === 'text' ? TEXT_ANIMS : CLIP_ANIMS;
        const x = list.find((y) => y.type === t);
        return x ? (side === 'in' ? x.in : x.out) : t;
      };
      if (an.in) out.push(tx('Появление: {0}, {1} с', name(an.in.type, 'in'), an.in.dur.toFixed(1)));
      if (an.out) out.push(tx('Исчезновение: {0}, {1} с', name(an.out.type, 'out'), an.out.dur.toFixed(1)));
      if (!out.length) out.push(tx('Нет'));
      break;
    }
    case 'color': {
      const c = v.color as ColorAdjust;
      const gr = v.grade as Grade | undefined;
      if (c.preset !== 'none') out.push(tx('Фильтр «{0}» {1}', FILTER_PRESETS.find((f) => f.id === c.preset)?.label ?? c.preset, pct(c.presetAmount)));
      if (c.brightness !== 1) out.push(tx('Яркость {0}', signed(c.brightness - 1)));
      if (c.contrast !== 1) out.push(tx('Контраст {0}', signed(c.contrast - 1)));
      if (c.saturation !== 1) out.push(tx('Насыщенность {0}', signed(c.saturation - 1)));
      if (c.warmth) out.push(tx('Теплота {0}', signed(c.warmth)));
      if (gr?.curves) out.push(tx('Кривые'));
      if (gr?.hsl && Object.keys(gr.hsl).length) out.push('HSL');
      if (gr?.lut) out.push(tx('LUT «{0}»', gr.lut.name));
      if (!out.length) out.push(tx('Без изменений'));
      break;
    }
    case 'fx': {
      const e = (v.effects ?? []) as Effect[];
      for (const x of e) out.push(`${effName(x.type)} ${pct(x.amount)}`);
      if (!out.length) out.push(tx('Нет'));
      break;
    }
    case 'mask': {
      const m = v.mask as Mask | undefined;
      const ck = v.chroma as ChromaKey | undefined;
      if (m) out.push(tx('Маска: {0}{1}', MASKS.find((x) => x.shape === m.shape)?.label ?? m.shape, m.invert ? tx(', наоборот') : ''));
      if (ck) out.push(tx('Хромакей {0}', ck.color));
      if (!out.length) out.push(tx('Нет'));
      break;
    }
    case 'speed': out.push(`${(v.speed as number).toFixed(2)}×`); break;
    case 'audio': {
      out.push(v.muted ? tx('Без звука') : tx('Громкость {0}', pct(v.volume as number)));
      if (v.fadeIn) out.push(tx('Плавное появление {0} с', (v.fadeIn as number).toFixed(1)));
      if (v.fadeOut) out.push(tx('Плавное затухание {0} с', (v.fadeOut as number).toFixed(1)));
      break;
    }
    case 'transition': {
      const t = v.transitionOut as Transition | undefined;
      out.push(t ? tx('{0}, {1} с', trName(t.type), t.duration.toFixed(1)) : tx('Без перехода'));
      break;
    }
    case 'style': {
      const s = v.style as TextStyle;
      out.push(tx('Шрифт {0}, {1}', s.font, Math.round(s.size)));
      out.push(tx('Цвет {0}', s.color));
      if (s.strokeWidth > 0) out.push(tx('Обводка {0}', s.strokeColor));
      if (s.bgOpacity > 0) out.push(tx('Плашка {0}', s.bgColor));
      if (s.shadow) out.push(tx('Тень'));
      break;
    }
  }
  return out;
}

export function PasteAttrsDialog({ attrs }: { attrs: ClipAttrs }) {
  const selection = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const groups = (attrs.kind === 'media' ? MEDIA_GROUPS : TEXT_GROUPS).filter((g) => attrs.values[g]);
  const [on, setOn] = useState<Set<AttrGroup>>(() => new Set(groups.filter((g) => !attrs.plain.includes(g))));
  const targets = useMemo(() => pasteTargets(project, selection, attrs), [project, selection, attrs]);
  const close = () => getState().setPasteOpen(false);
  const labels = GROUP_LABEL();
  const apply = () => {
    if (!on.size || !targets.length) return;
    let n = 0;
    getState().commit((p) => { const r = pasteAttrs(p, targets, attrs, [...on]); n = r.count; return r.project; });
    getState().toast(n ? tx('Параметры вставлены: {0} {1}. Отменить — Ctrl+Z', n, clipsWord(n)) : tx('Нечего вставлять в эти клипы'), n ? 'ok' : 'info');
    close();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') { e.preventDefault(); apply(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const toggle = (g: AttrGroup) => setOn((cur) => { const n = new Set(cur); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const skipped = selection.length - targets.length;
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal paste-modal" role="dialog" aria-label={tx('Вставить параметры')} data-testid="paste-attrs">
        <div className="modal-head">
          <h3><ClipboardPaste size={17} />{tx('Вставить параметры')}</h3>
          <button className="icon-btn" onClick={close} title={tx('Закрыть')}><X size={17} /></button>
        </div>
        <p className="hint">{tx('Скопировано с «{0}». Отметь, что перенести на выделенные клипы.', attrs.from)}</p>
        <div className="paste-list">
          {groups.map((g) => (
            <label key={g} className={`paste-row ${on.has(g) ? 'on' : ''}`} data-testid={`paste-${g}`}>
              <input type="checkbox" checked={on.has(g)} onChange={() => toggle(g)} />
              <div>
                <b>{labels[g]}</b>
                <span>{describe(attrs, g).join(' · ')}</span>
              </div>
            </label>
          ))}
        </div>
        <div className="paste-tools">
          <button className="btn ghost small" onClick={() => setOn(new Set(groups))}>{tx('Выбрать всё')}</button>
          <button className="btn ghost small" onClick={() => setOn(new Set())}>{tx('Снять всё')}</button>
        </div>
        <p className="hint small">
          {attrs.kind === 'media' ? tx('ИИ-обработка (удаление фона, стабилизация, ретушь, голос) не переносится — её считают для каждого видео отдельно.') : ''}
          {skipped > 0 ? ` ${tx('Клипов другого вида в выделении: {0} — их не трогаю.', skipped)}` : ''}
        </p>
        <div className="actions">
          <button className="btn" onClick={close}>{tx('Отмена')}</button>
          <button className="btn primary" onClick={apply} disabled={!on.size || !targets.length} data-testid="paste-apply">
            {targets.length ? tx('Вставить в {0} {1}', targets.length, clipsWord(targets.length)) : tx('Выдели клипы для вставки')}
          </button>
        </div>
      </div>
    </div>
  );
}
