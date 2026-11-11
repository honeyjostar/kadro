// Сайт Kadro: свежий установщик и звёзды с GitHub, появление блоков, главы с «прилипшим» кадром, плёнка шаблонов.
(() => {
  const REPO = 'honeyjostar/kadro';
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // прямая ссылка на установщик последней версии и его размер; звёзды
  const mb = (b) => Math.round(b / 1048576);
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`).then((r) => (r.ok ? r.json() : null)).then((rel) => {
    const a = rel?.assets?.find((x) => /Setup.*\.exe$/i.test(x.name));
    if (!a) return;
    document.querySelectorAll('[data-dl]').forEach((el) => { el.href = a.browser_download_url; });
    document.querySelectorAll('[data-size]').forEach((el) => { el.textContent = el.dataset.size.replace('{mb}', mb(a.size)); });
  }).catch(() => undefined);
  fetch(`https://api.github.com/repos/${REPO}`).then((r) => (r.ok ? r.json() : null)).then((repo) => {
    if (!repo) return;
    document.querySelectorAll('[data-stars]').forEach((el) => { el.textContent = el.dataset.stars.replace('{n}', repo.stargazers_count); });
  }).catch(() => undefined);

  // блоки появляются при прокрутке
  const rise = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); rise.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
  document.querySelectorAll('.rise').forEach((el) => rise.observe(el));

  // главы: какая глава посередине экрана — тот кадр и показываем
  const shots = [...document.querySelectorAll('.stage img')];
  const chapters = [...document.querySelectorAll('.chapter')];
  const pick = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const i = chapters.indexOf(e.target);
    chapters.forEach((c, k) => c.classList.toggle('on', k === i));
    shots.forEach((s, k) => s.classList.toggle('on', k === i));
  }), { rootMargin: '-45% 0px -45% 0px' });
  chapters.forEach((c) => pick.observe(c));

  // ролики играют, только пока их видно
  const play = new IntersectionObserver((es) => es.forEach((e) => {
    const vids = e.target.tagName === 'VIDEO' ? [e.target] : [...e.target.querySelectorAll('video')];
    vids.forEach((v) => { if (e.isIntersecting && !calm) v.play().catch(() => undefined); else v.pause(); });
  }), { threshold: 0.15 });
  document.querySelectorAll('.film video, .reel').forEach((el) => play.observe(el));
  if (calm) document.querySelectorAll('.film video').forEach((v) => { v.controls = true; });
})();
