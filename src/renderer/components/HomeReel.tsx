// Ролик на главном экране: телефон с вертикальным роликом — доиграл — телефон поворачивается и становится
// широким экраном с горизонтальным роликом того же монтажа — доиграл — обратно в телефон. Без горизонтального
// ролика (старая установка) — просто вертикальный по кругу. «Уменьшить движение» в Windows — без поворота.
import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { tx } from '../../shared/i18n';
import { api } from '../store';

/** Сколько длится поворот (как в styles.css, .home-device). */
const TURN_MS = 900;

export function HomeReel({ vertical, wide, withSound }: { vertical: string | null; wide: string | null; withSound: boolean }) {
  const [mode, setMode] = useState<'phone' | 'screen'>('phone');
  const [sound, setSound] = useState(false);
  const v = useRef<HTMLVideoElement>(null);
  const h = useRef<HTMLVideoElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // один доиграл — повернуться и запустить другой, когда поворот закончится
  const turn = (to: 'phone' | 'screen') => {
    const next = to === 'screen' ? h.current : v.current;
    if (!next) return;
    setMode(to);
    next.currentTime = 0;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void next.play().catch(() => undefined), TURN_MS * 0.7);
  };

  if (!vertical) return <div className="home-device phone"><div className="home-device-body"><div className="home-phone-empty" /></div></div>;
  return (
    <div className={`home-device ${mode}`} data-testid="home-device" data-mode={mode}>
      <div className="home-device-body">
        <video ref={v} className="home-reel-v" src={api.mediaUrl(vertical)} autoPlay muted={!sound} loop={!wide} playsInline
          onEnded={() => wide && turn('screen')} data-testid="home-reel" />
        {wide && (
          <video ref={h} className="home-reel-h" src={api.mediaUrl(wide)} muted={!sound} playsInline preload="auto"
            onEnded={() => turn('phone')} data-testid="home-reel-wide" />
        )}
      </div>
      <span className="home-device-stand" aria-hidden />
      {withSound && (
        <button className="home-sound" onClick={() => setSound(!sound)} title={sound ? tx('Выключить звук') : tx('Включить звук')}>
          {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}{sound ? tx('Звук включён') : tx('Со звуком')}
        </button>
      )}
    </div>
  );
}
