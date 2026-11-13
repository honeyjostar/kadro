// Маскот Kadro: человечек с экраном-знаком Kadro вместо головы. Рисунки рассчитаны на тёмный фон, поэтому у маскота
// своя тёмная «сцена» — одинаково смотрится в тёмной и светлой теме. Позы — resources/mascot (scripts/make-mascot.py).
import cheer from '../assets/mascot/cheer.webp';
import fingerup from '../assets/mascot/fingerup.webp';
import hello from '../assets/mascot/hello.webp';
import point from '../assets/mascot/point.webp';
import present from '../assets/mascot/present.webp';
import sad from '../assets/mascot/sad.webp';
import think from '../assets/mascot/think.webp';
import thumbsup from '../assets/mascot/thumbsup.webp';
import you from '../assets/mascot/you.webp';

const POSES = { cheer, fingerup, hello, point, present, sad, think, thumbsup, you };
export type MascotPose = keyof typeof POSES;

/** size — высота фигуры, пикс. bare — без своей сцены (когда фон вокруг и так тёмный, как у маскота). */
export function Mascot({ pose, size = 96, bare = false }: { pose: MascotPose; size?: number; bare?: boolean }) {
  return (
    <span className={`mascot ${bare ? 'bare' : ''}`} data-testid="mascot" data-pose={pose}>
      <img src={POSES[pose]} alt="" style={{ height: size }} draggable={false} />
    </span>
  );
}
