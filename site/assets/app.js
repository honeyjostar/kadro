// Сайт Kadro: свежий установщик и звёзды с GitHub, появление блоков, главы с «прилипшим» кадром, плёнка шаблонов.
// старый адрес сайта (honeyjostar.github.io/kadro) — сразу на новый
if (location.hostname === 'honeyjostar.github.io') {
  location.replace(`https://kadro-editor.github.io${location.pathname.replace(/^\/kadro/, '') || '/'}${location.search}${location.hash}`);
}
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

// «Покрути сам»: вкладки и кнопки меняют настоящий ролик Kadro; фильтры — ползунок «до / после»
(() => {
  const box = document.querySelector('.try');
  if (!box) return;
  const base = box.dataset.base;
  const video = box.querySelector('.device video');
  const ba = box.querySelector('.ba');
  const top = box.querySelector('.ba-top');
  const range = box.querySelector('.ba-range');
  const sound = box.querySelector('.sound');
  const tabs = [...box.querySelectorAll('[role=tab]')];
  let visible = false;
  const setSound = (on) => { video.muted = !on; sound.textContent = on ? sound.dataset.off : sound.dataset.on; };
  const show = (kind, id) => {
    if (kind === 'filt') {
      video.pause(); video.hidden = true; ba.hidden = false; sound.hidden = true;
      top.src = `${base}/filt/${id}.webp`;
      return;
    }
    ba.hidden = true; video.hidden = false;
    sound.hidden = kind !== 'meme';
    if (kind !== 'meme') setSound(false);
    video.poster = `${base}/${kind}/${id}.jpg`;
    video.innerHTML = `<source src="${base}/${kind}/${id}.webm" type="video/webm"><source src="${base}/${kind}/${id}.mp4" type="video/mp4">`;
    video.load();
    video.play().catch(() => undefined); // показ — по нажатию человека, ролик точно на экране
  };
  tabs.forEach((t) => t.addEventListener('click', () => {
    tabs.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
    box.querySelectorAll('.pane').forEach((p) => { p.hidden = p.id !== `pane-${t.dataset.tab}`; });
    const first = box.querySelector(`#pane-${t.dataset.tab} .opt`);
    first?.click();
  }));
  box.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
    b.parentElement.querySelectorAll('.opt').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    show(b.dataset.kind, b.dataset.id);
  }));
  range.addEventListener('input', () => { ba.style.setProperty('--cut', `${range.value}%`); });
  sound.addEventListener('click', () => setSound(video.muted));
  new IntersectionObserver((es) => es.forEach((e) => {
    visible = e.isIntersecting;
    if (visible && !video.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) video.play().catch(() => undefined);
    else video.pause();
  }), { threshold: 0.3 }).observe(video.parentElement);
})();
