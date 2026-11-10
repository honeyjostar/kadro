// Заставка при запуске (см. src/shared/intro.ts). Рисуется из preload — до того, как загрузится сама программа:
// разметка и стили вставляются, как только у страницы появляется <body>, а убирается заставка, когда программа
// нарисовала окно и анимация доиграла. Щелчок или клавиша — пропустить (они не доходят до программы).
import { FADE_MS, INTRO_GIVE_UP_MS, INTRO_MS } from '../shared/intro';

/** ms — длительность анимации (для автотестов можно растянуть). */
export interface IntroInfo { show: boolean; icon: string; accent: string; dark: boolean; ms?: number }

const css = (T: number) => `
#kadro-intro{position:fixed;inset:0;z-index:2147483000;overflow:hidden;cursor:none;opacity:1;transition:opacity ${FADE_MS}ms ease;
  --ki-bg:#15131a;--ki-raised:#25212d;--ki-line:#36303f;--ki-muted:#4a4356}
#kadro-intro.ki-light{--ki-bg:#eeedf2;--ki-raised:#e2dfe8;--ki-line:#cdc8d6;--ki-muted:#bdb7c8}
#kadro-intro.ki-out{opacity:0;pointer-events:none}
#kadro-intro .ki-desk{position:absolute;inset:0;background:radial-gradient(130% 110% at 78% 112%,#4f7dff 0%,#2346a8 26%,#13235c 52%,#090d24 80%)}
#kadro-intro .ki-icon{position:absolute;left:9vw;top:18vh;width:96px;padding:6px 0 8px;display:flex;flex-direction:column;align-items:center;gap:7px;animation:ki-icon ${T}s cubic-bezier(.2,.8,.2,1) forwards}
#kadro-intro .ki-icon img{width:60px;height:60px;position:relative;z-index:1;filter:drop-shadow(0 3px 6px rgba(0,0,0,.35))}
#kadro-intro .ki-icon span{position:relative;z-index:1;font:500 12px/1.2 'Segoe UI',system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.7)}
#kadro-intro .ki-sel{position:absolute;inset:0 4px;border-radius:6px;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);opacity:0;animation:ki-sel ${T}s linear forwards}
#kadro-intro .ki-cur{position:absolute;left:calc(9vw + 58px);top:calc(18vh + 46px);width:28px;height:28px;transform-origin:3px 2px;animation:ki-cur ${T}s linear forwards;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
#kadro-intro .ki-win{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--ki-bg);transform-origin:calc(9vw + 48px) calc(18vh + 36px);opacity:0;animation:ki-win ${T}s linear forwards;overflow:hidden}
#kadro-intro .ki-bar{height:40px;display:flex;align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid var(--ki-line)}
#kadro-intro .ki-bar i{display:block;height:10px;border-radius:5px;background:var(--ki-muted)}
#kadro-intro .ki-bar i:first-child{width:18px;height:18px;border-radius:5px;background:var(--ki-accent)}
#kadro-intro .ki-bar i:nth-child(2){width:64px}
#kadro-intro .ki-bar b{margin-left:auto;width:96px;height:24px;border-radius:7px;background:var(--ki-accent)}
#kadro-intro .ki-body{flex:1;display:grid;grid-template-columns:1.6fr 1fr;gap:18px;padding:28px 40px}
#kadro-intro .ki-body div{border-radius:16px;background:var(--ki-raised);border:1px solid var(--ki-line)}
#kadro-intro .ki-side{display:grid;grid-template-rows:1fr 1fr;gap:18px;background:none!important;border:0!important}
#kadro-intro.ki-skip *{animation-duration:0s!important;animation-delay:0s!important}
@keyframes ki-icon{0%{opacity:0;transform:scale(.8)}10%,58%{opacity:1;transform:scale(1)}66%,100%{opacity:0;transform:scale(1.25)}}
@keyframes ki-sel{0%,41%{opacity:0}43%,100%{opacity:1}}
@keyframes ki-cur{
  0%{opacity:0;transform:translate(46vw,58vh)}
  5%{opacity:1;transform:translate(46vw,58vh);animation-timing-function:cubic-bezier(.12,.8,.28,1)}
  38%{transform:translate(0,0) scale(1)}
  42%{transform:translate(0,0) scale(.8)}
  46%{transform:translate(0,0) scale(1)}
  50%{transform:translate(0,0) scale(.8)}
  54%{opacity:1;transform:translate(0,0) scale(1)}
  62%,100%{opacity:0;transform:translate(0,0) scale(1)}}
@keyframes ki-win{
  0%,55%{opacity:0;transform:scale(.05);border-radius:60px}
  58%{opacity:1;transform:scale(.07);border-radius:60px;animation-timing-function:cubic-bezier(.2,.85,.25,1)}
  90%,100%{opacity:1;transform:scale(1);border-radius:0}}
`;

const MARKUP = `<div class="ki-desk"></div>
<div class="ki-icon"><div class="ki-sel"></div><img alt=""><span>Kadro</span></div>
<div class="ki-win"><div class="ki-bar"><i></i><i></i><b></b></div><div class="ki-body"><div></div><div class="ki-side"><div></div><div></div></div></div></div>
<svg class="ki-cur" viewBox="0 0 24 24"><path d="M3 2 L19 11.6 L11.9 13.2 L8.3 20.2 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

/** Показать заставку (если включена и в Windows не выключены анимации). */
export function runIntro(info: IntroInfo): void {
  if (!info.show) return;
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch { /* нет matchMedia — показываем */ }
  const ms = info.ms ?? INTRO_MS;
  const t0 = performance.now();
  let el: HTMLElement | null = null;
  let skipped = false;
  let gone = false;

  const finish = () => {
    if (gone || !el) return;
    gone = true;
    el.classList.add('ki-out');
    document.documentElement.dataset.intro = 'out';
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onPointer, true);
    setTimeout(() => {
      el?.remove();
      document.getElementById('kadro-intro-css')?.remove();
      delete document.documentElement.dataset.intro;
      window.dispatchEvent(new Event('kadro-intro-done'));
    }, FADE_MS);
  };
  /** Окно программы уже нарисовано? */
  const appReady = () => (document.getElementById('root')?.childElementCount ?? 0) > 0;
  const tryFinish = () => {
    if (gone) return;
    if (appReady() && (skipped || performance.now() - t0 >= ms)) finish();
  };
  const skip = () => {
    if (skipped) return;
    skipped = true;
    el?.classList.add('ki-skip');
    tryFinish();
  };
  // щелчок и клавиши, пока идёт заставка, — только «пропустить», до программы они не доходят
  const onKey = (e: KeyboardEvent) => { if (gone) return; e.preventDefault(); e.stopImmediatePropagation(); skip(); };
  const onPointer = (e: PointerEvent) => { if (gone) return; e.preventDefault(); e.stopImmediatePropagation(); skip(); };

  const mount = (): boolean => {
    if (el) return true;
    if (!document.body) return false;
    const st = document.createElement('style');
    st.id = 'kadro-intro-css';
    st.textContent = css(ms / 1000);
    (document.head ?? document.documentElement).appendChild(st);
    el = document.createElement('div');
    el.id = 'kadro-intro';
    el.dataset.testid = 'intro';
    el.setAttribute('aria-hidden', 'true');
    if (!info.dark) el.classList.add('ki-light');
    el.style.setProperty('--ki-accent', info.accent);
    el.innerHTML = MARKUP;
    const img = el.querySelector('img');
    if (img) img.src = info.icon;
    document.body.prepend(el);
    document.documentElement.dataset.intro = 'on';
    document.documentElement.dataset.introPlayed = '1'; // для автотестов: заставка была
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    // окно программы нарисовалось — ждём конца анимации
    const watch = new MutationObserver(() => { if (appReady()) { watch.disconnect(); tryFinish(); } });
    const root = document.getElementById('root');
    if (root) watch.observe(root, { childList: true });
    else watch.observe(document.body, { childList: true, subtree: true });
    setTimeout(tryFinish, ms + 20);
    setTimeout(finish, Math.max(INTRO_GIVE_UP_MS, ms + 5000));
    return true;
  };

  // <body> появляется при разборе страницы — вставляем заставку сразу, до первой отрисовки
  if (!mount()) {
    const mo = new MutationObserver(() => { if (mount()) mo.disconnect(); });
    mo.observe(document, { childList: true, subtree: true });
    document.addEventListener('readystatechange', () => { if (mount()) mo.disconnect(); });
  }
  // анимация доиграла, а окно ещё грузится — проверяем ещё раз, когда страница готова
  window.addEventListener('load', tryFinish);
}
