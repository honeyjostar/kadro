// Плейхед с таймкодом (где ты на странице), прямая ссылка на свежий установщик и звёзды с GitHub.
(() => {
  const REPO = 'honeyjostar/kadro';
  const FPS = 30, TOTAL = 90; // вся страница — как ролик на полторы минуты

  const head = document.querySelector('.playhead');
  const tc = document.querySelector('.playhead .tc');
  const pad = (n) => String(n).padStart(2, '0');
  let ticking = false;
  const draw = () => {
    ticking = false;
    if (!head) return;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const p = Math.min(1, Math.max(0, scrollY / max));
    head.style.setProperty('--y', `${Math.round(p * (innerHeight - 84))}px`);
    const f = Math.round(p * TOTAL * FPS);
    tc.textContent = `${pad(Math.floor(f / FPS / 3600))}:${pad(Math.floor(f / FPS / 60) % 60)}:${pad(Math.floor(f / FPS) % 60)}:${pad(f % FPS)}`;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(draw); } }, { passive: true });
  addEventListener('resize', draw);
  draw();

  // ролик: при «уменьшить движение» — не запускать сам, дать кнопки
  const v = document.querySelector('.phone video');
  if (v && matchMedia('(prefers-reduced-motion: reduce)').matches) { v.removeAttribute('autoplay'); v.pause(); v.controls = true; }

  const mb = (b) => Math.round(b / 1048576);
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`).then((r) => (r.ok ? r.json() : null)).then((rel) => {
    const a = rel?.assets?.find((x) => /Setup.*\.exe$/i.test(x.name));
    if (!a) return;
    document.querySelectorAll('[data-dl]').forEach((el) => { el.href = a.browser_download_url; });
    document.querySelectorAll('[data-size]').forEach((el) => { el.textContent = el.dataset.size.replace('{mb}', mb(a.size)); });
    document.querySelectorAll('[data-ver]').forEach((el) => { el.textContent = rel.tag_name.replace(/^v/, ''); });
  }).catch(() => undefined);
  fetch(`https://api.github.com/repos/${REPO}`).then((r) => (r.ok ? r.json() : null)).then((repo) => {
    if (!repo) return;
    document.querySelectorAll('[data-stars]').forEach((el) => { el.textContent = `★ ${repo.stargazers_count}`; el.hidden = false; });
  }).catch(() => undefined);
})();
