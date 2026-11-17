// «Шаблоны» → «Фоны»: живые фоны для TikTok, Reels и Shorts. Карточка оживает при наведении (тот же шейдер, что в
// плеере и экспорте), нажатие — фон на таймлайн.
import { tx } from '../../shared/i18n';
import { useEffect, useRef, useState } from 'react';
import { BG_GROUPS, BG_PRESETS, type BgGroup, type BgPreset } from '../../shared/backgrounds';
import { addBackground } from '../actions';
import { rewardsOpen } from '../../shared/rewards';
import { useStore } from '../store';
import { Lock } from 'lucide-react';
import { glRunner } from '../engine/gl';
import { glDef } from '../glRegistry';

const PW = 108;
const PH = 192;
let black: HTMLCanvasElement | null = null;
const blank = () => {
  if (!black) { black = document.createElement('canvas'); black.width = 4; black.height = 4; const c = black.getContext('2d'); if (c) { c.fillStyle = '#000'; c.fillRect(0, 0, 4, 4); } }
  return black;
};

/** Живой кадр фона на холсте карточки (пока карточка под мышкой — анимация; без WebGL — только цветная заливка). */
function BgPreview({ b, live }: { b: BgPreset; live: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const cv = ref.current;
    const def = glDef(b.effect.type);
    const run = glRunner();
    if (!cv || !def || !run.available) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const frame = (t: number) => {
      const out = run.effect(def, blank(), PW * 2, PH * 2, b.effect.amount, t, 0, b.effect.params as Record<string, number>);
      if (out) { ctx.drawImage(out, 0, 0, cv.width, cv.height); setDrawn(true); }
    };
    frame(2.5); // неподвижный кадр сразу — чтобы видно было, что это
    if (!live) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = () => { frame(2.5 + (performance.now() - t0) / 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [b, live]);
  return (
    <span className="bg-thumb" style={drawn ? undefined : { background: b.swatch }}>
      <canvas ref={ref} width={PW * 2} height={PH * 2} />
    </span>
  );
}

export function BackgroundsSection() {
  const [group, setGroup] = useState<BgGroup>('calm');
  const [hover, setHover] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = useStore((s) => rewardsOpen(s.rewards));
  const list = BG_PRESETS.filter((b) => b.group === group);
  return (
    <div className="bg-section" data-testid="bg-section">
      <div className="sub-head">{tx('Фоны')}</div>
      <p className="hint small">{tx('Живые фоны для TikTok, Reels и Shorts: под голос, цитаты, биты и разделённый экран. Нарисованы Kadro — можно использовать где угодно.')}</p>
      <div className="chips">{BG_GROUPS.map((g) => <button key={g.id} className={group === g.id ? 'active' : ''} onClick={() => setGroup(g.id)} data-testid={`bg-group-${g.id}`}>{g.label}</button>)}</div>
      <div className="bg-grid">
        {list.map((b) => (
          <button key={b.id} className={`bg-card ${b.reward ? 'reward' : ''} ${b.reward && !open ? 'locked' : ''}`} title={b.reward && !open ? tx('{0} — из «Набора создателя»', b.hint) : b.hint} disabled={busy} data-testid={`bg-${b.id}`}
            onMouseEnter={() => setHover(b.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(b.id)} onBlur={() => setHover(null)}
            onClick={() => { setBusy(true); void addBackground(b.id).finally(() => setBusy(false)); }}>
            <BgPreview b={b} live={hover === b.id} />
            {b.reward && <span className="reward-tag">{open ? <>★</> : <Lock size={11} />}</span>}
            <span className="bg-name">{b.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
