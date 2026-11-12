// Вкладка «3D» у фото: объём по карте глубины и движение камеры — наезд, облёт, проплыть.
import { Box } from 'lucide-react';
import { tx } from '../../shared/i18n';
import type { Photo3dMotion } from '../../shared/photo3d';
import type { MediaClip } from '../../shared/types';
import { make3dPhoto, set3dPhoto } from '../actions';
import { useJobRunning } from '../hooks';
import { Seg, Slider } from './controls';

export function Photo3dTab({ clip }: { clip: MediaClip }) {
  const busy = useJobRunning('dp_');
  const p = clip.photo3d;
  const motions: { value: Photo3dMotion; label: string }[] = [
    { value: 'dolly', label: tx('Наезд') }, { value: 'orbit', label: tx('Облёт') }, { value: 'swing', label: tx('Проплыть') },
  ];
  return (
    <>
      <p className="hint">{tx('Фото оживает с объёмом: нейросеть понимает, что ближе, а что дальше, и ближнее движется сильнее — как будто камера живая.')}</p>
      {!p ? (
        <>
          <button className="btn primary block" disabled={busy} onClick={() => void make3dPhoto(clip.id)} data-testid="p3d-make"><Box size={14} />{tx('Сделать 3D-фото')}</button>
          <p className="hint small">{tx('В первый раз Kadro скачает модель глубины (100 МБ). Дальше — без интернета.')}</p>
        </>
      ) : (
        <>
          <div className="section-title">{tx('Движение камеры')}</div>
          <Seg value={p.motion} options={motions} onChange={(v) => set3dPhoto(clip.id, { motion: v })} testId="p3d-motion" />
          <Slider label={tx('Сила')} min={0.1} max={1} step={0.05} value={p.amount} format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => set3dPhoto(clip.id, { amount: Math.round(v * 100) / 100 }, `p3d-${clip.id}`)} testId="p3d-amount" />
          <p className="hint small">{tx('Движение идёт всё время показа фото. Длиннее клип — плавнее.')}</p>
          <button className="btn block" onClick={() => set3dPhoto(clip.id, null)} data-testid="p3d-off">{tx('Убрать 3D')}</button>
        </>
      )}
    </>
  );
}
