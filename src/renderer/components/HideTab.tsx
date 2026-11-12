// Вкладка «Скрыть»: лица и номера под размытием, мозаикой или чёрной плашкой — область едет за объектом.
import { Eye, EyeOff, ScanFace, SquareDashed, X } from 'lucide-react';
import { useEffect } from 'react';
import { mediaLocalTime } from '../../shared/anim';
import { regionSpan } from '../../shared/blur';
import { tx } from '../../shared/i18n';
import type { BlurStyle, MediaAsset, MediaClip } from '../../shared/types';
import { hideFaces, removeBlur, updateBlur } from '../actions';
import { useJobRunning } from '../hooks';
import { getState, useStore } from '../store';
import { txj } from '../txj';
import { fmtTime } from '../util';
import { Seg, Slider } from './controls';

export function HideTab({ clip, asset }: { clip: MediaClip; asset?: MediaAsset }) {
  const draw = useStore((s) => s.blurDraw);
  const fps = useStore((s) => s.project.settings.fps);
  const facesBusy = useJobRunning('fc_');
  const trackBusy = useJobRunning('tb_');
  const busy = facesBusy || trackBusy;
  // пока вкладка открыта — рамки областей видны на плеере
  useEffect(() => {
    getState().setBlurShow(clip.id);
    return () => getState().setBlurShow(null);
  }, [clip.id]);
  useEffect(() => {
    if (draw !== clip.id) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); getState().setBlurDraw(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [draw, clip.id]);
  const image = asset?.kind === 'image';
  const regions = clip.blurs ?? [];
  const at = (t: number) => fmtTime(Math.max(clip.start, clip.start + mediaLocalTime(clip, t)), fps);
  let faceN = 0;
  let objN = 0;
  const styles: { value: BlurStyle; label: string }[] = [
    { value: 'blur', label: tx('Размытие') }, { value: 'pixel', label: tx('Мозаика') }, { value: 'black', label: tx('Закрасить') },
  ];
  return (
    <>
      <p className="hint">{tx('Лица Kadro найдёт сам. Номер машины, логотип, экран телефона — обведи рамкой на плеере, дальше Kadro проследит, куда он едет.')}</p>
      <div className="row-btns hide-btns">
        <button className="btn primary" onClick={() => void hideFaces(clip.id)} disabled={busy} data-testid="hide-faces"><ScanFace size={14} />{tx('Скрыть лица')}</button>
        <button className={`btn ${draw === clip.id ? 'on' : ''}`} aria-pressed={draw === clip.id} disabled={busy} data-testid="hide-object"
          onClick={() => { getState().setPlaying(false); getState().setBlurDraw(draw === clip.id ? null : clip.id); }}>
          <SquareDashed size={14} />{tx('Обвести предмет')}</button>
      </div>
      {draw === clip.id && <p className="hint small hide-draw-hint" data-testid="hide-draw-hint">{tx('Обведи предмет мышью на плеере — в этом кадре он должен быть хорошо виден. Esc — отмена.')}</p>}
      {regions.length === 0 ? (
        <p className="hint small">{tx('Пока ничего не скрыто.')}</p>
      ) : (
        <div className="blur-list" data-testid="blur-list">
          {regions.map((r) => {
            const name = r.kind === 'face' ? txj('Лицо {0}', ++faceN) : txj('Предмет {0}', ++objN);
            const [a, b] = regionSpan(r);
            return (
              <div key={r.id} className={`blur-row ${r.off ? 'off' : ''}`} data-testid="blur-row">
                <div className="blur-row-head">
                  <b>{name}</b>
                  {!image && <span className="hint small">{at(a)}–{at(b)}</span>}
                  <span className="spacer" />
                  <button className="icon-btn" onClick={() => updateBlur(clip.id, r.id, { off: !r.off })} data-testid="blur-eye"
                    title={r.off ? tx('Снова скрыть') : tx('Показать как есть (на время, чтобы посмотреть)')}>{r.off ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                  <button className="icon-btn" onClick={() => removeBlur(clip.id, r.id)} title={tx('Не скрывать')} data-testid="blur-del"><X size={14} /></button>
                </div>
                <Seg value={r.style} options={styles} onChange={(v) => updateBlur(clip.id, r.id, { style: v })} testId="blur-style" />
                {r.style !== 'black' && (
                  <Slider label={tx('Сила')} min={0} max={1} step={0.01} value={r.strength} format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => updateBlur(clip.id, r.id, { strength: Math.round(v * 100) / 100 }, `blurs-${r.id}`)} />
                )}
              </div>
            );
          })}
          <button className="btn ghost small" onClick={() => removeBlur(clip.id)} data-testid="blur-clear">{tx('Убрать всё скрытие')}</button>
        </div>
      )}
      <p className="hint small">{tx('Скрытое видно и в плеере, и в готовом видео. Kadro ошибся с кадром — обведи предмет ещё раз там, где он снова виден.')}</p>
    </>
  );
}
