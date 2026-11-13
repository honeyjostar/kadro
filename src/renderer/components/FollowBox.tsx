// «Следовать за объектом»: текст, стикер или видео поверх едет за лицом, машиной, мячом в видео под ним.
import { Crosshair, Unlink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { tx } from '../../shared/i18n';
import type { Clip } from '../../shared/types';
import { unfollow } from '../actions';
import { useJobRunning } from '../hooks';
import { getState, useStore } from '../store';
import { Toggle } from './controls';

export function FollowBox({ clip }: { clip: Clip }) {
  const draw = useStore((s) => s.followDraw);
  const busy = useJobRunning('tb_');
  const [scale, setScale] = useState(clip.follow?.scale ?? false);
  const on = draw?.id === clip.id;
  useEffect(() => {
    if (!on) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); getState().setFollowDraw(null); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [on]);
  return (
    <div className="follow-box" data-testid="follow-box">
      <div className="section-title">{tx('Следовать за объектом')}</div>
      {clip.follow ? (
        <>
          <div className="status-line ok" data-testid="follow-on">{tx('Едет за объектом в видео')}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn small" disabled={busy} onClick={() => { getState().setPlaying(false); getState().setFollowDraw({ id: clip.id, scale }); }}>{tx('Обвести заново')}</button>
            <button className="btn small" onClick={() => unfollow(clip.id)} data-testid="follow-off"><Unlink size={13} />{tx('Отвязать')}</button>
          </div>
        </>
      ) : (
        <>
          <p className="hint small">{tx('Поставь бегунок туда, где объект хорошо виден, нажми и обведи его в плеере — клип поедет за ним.')}</p>
          <Toggle label={tx('Менять размер вместе с объектом')} on={scale} onChange={setScale} testId="follow-scale" />
          <button className={`btn block ${on ? 'on' : ''}`} disabled={busy} aria-pressed={on} data-testid="follow-draw"
            onClick={() => { getState().setPlaying(false); getState().setFollowDraw(on ? null : { id: clip.id, scale }); }}>
            <Crosshair size={14} />{on ? tx('Обведи объект в плеере…') : tx('Обвести объект')}</button>
        </>
      )}
    </div>
  );
}
