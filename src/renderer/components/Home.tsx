// Главный экран (как «Главная» в Premiere): новый проект нужного формата, демо-ролик и демо-проект,
// мои проекты (как в CapCut), шаблоны с живыми превью. Открывается при запуске и кнопкой «Главная».
import { tx } from '../../shared/i18n';
import { txj } from '../txj';
import { FileText, FolderOpen, Play, Settings, Volume2, VolumeX, WandSparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ASPECTS } from '../../shared/defaults';
import { APP_ICONS, type IconId } from '../../shared/appearance';
import type { HomeInfo } from '../../shared/ipc';
import { BUILTIN_TEMPLATES, templateDuration, type Template } from '../../shared/templates';
import type { AspectKey } from '../../shared/types';
import { newProjectAction, openDemo, openProject, templateFromFiles, tryTemplate } from '../actions';
import { api, getState, useStore } from '../store';
import { fmtDur } from '../util';
import { Seg, Toggle } from './controls';
import { ProjectsSection } from './Projects';

const FORMATS: { aspect: AspectKey; title: string; where: string }[] = [
  { aspect: '9:16', title: tx('Вертикальное'), where: 'TikTok, Reels, Shorts' },
  { aspect: '16:9', title: tx('Горизонтальное'), where: tx('YouTube, ВК Видео') },
  { aspect: '1:1', title: tx('Квадрат'), where: tx('пост в ленту') },
  { aspect: '4:5', title: tx('Портрет'), where: 'Instagram, Telegram' },
];
const HOME_TEMPLATES = ['trip', 'birthday', 'party', 'aesthetic', 'love', 'winter', 'neonnight', 'countdown', 'sport', 'collage'];

/** Рамка формата, вписанная в квадрат 84 px (квадрат чуть меньше, чтобы на глаз был одного «веса» с остальными). */
function shapeSize(aspect: AspectKey): { width: number; height: number } {
  const { w, h } = ASPECTS[aspect];
  const box = w === h ? 70 : 84;
  const k = box / Math.max(w, h);
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

/** Превью шаблона: зацикленный ролик из комплекта (играет при наведении), иначе картинка или цветная плашка. */
export function TemplatePreview({ t, active }: { t: Template; active: boolean }) {
  const src = useStore((s) => s.demo?.previews[t.id]);
  const ref = useRef<HTMLVideoElement>(null);
  const poster = t.poster ?? 1.2;
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active) void v.play().catch(() => undefined);
    else { v.pause(); if (v.readyState >= 1) v.currentTime = poster; }
  }, [active, src]);
  const cls = `tpl-preview a${t.aspect.replace(':', '-')}`;
  if (src) {
    return (
      <div className={cls}>
        <video ref={ref} src={api.mediaUrl(src)} muted loop playsInline preload="metadata"
          onLoadedMetadata={(e) => { if (!active) e.currentTarget.currentTime = Math.min(poster, e.currentTarget.duration / 2); }} />
      </div>
    );
  }
  return <div className={cls} style={t.thumb ? { backgroundImage: `url("${t.thumb}")` } : { background: t.swatch ?? 'var(--raised-2)' }} />;
}

export function Home() {
  const [info, setInfo] = useState<HomeInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const hasClips = useStore((s) => s.project.tracks.some((t) => t.clips.length > 0));
  const currentName = useStore((s) => s.project.name);
  const current = hasClips ? { name: currentName } : null;
  const [showAtStart, setShowAtStart] = useState(true);
  const themePref = useStore((s) => s.themePref);
  const reel = useRef<HTMLVideoElement>(null);

  const load = () => void api.homeInfo().then((i) => { setInfo(i); setShowAtStart(i.show); getState().setDemo(i.demo); });
  useEffect(load, []);
  useEffect(() => api.onCoversReady(load), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && current) getState().setHome(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasClips]);

  const run = async (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const templates = HOME_TEMPLATES.map((id) => BUILTIN_TEMPLATES.find((t) => t.id === id)!).filter(Boolean);
  const reelSrc = info?.demo.reel ?? info?.demo.scenes.sunset ?? null;

  return (
    <div className="home" data-testid="home" role="dialog" aria-label={tx('Главный экран Kadro')}>
      <header className="home-top">
        <div className="logo"><LogoMark />Kadro</div>
        <div className="spacer" />
        <button className="btn ghost home-settings" onClick={() => getState().setSettingsOpen(true)} data-testid="home-settings"><Settings size={15} />{tx('Настройки')}</button>
        {current && (
          <button className="btn" onClick={() => getState().setHome(false)} data-testid="home-close">
            {txj('Вернуться к проекту «{0}»', current.name)}<X size={15} />
          </button>
        )}
      </header>

      <main className="home-main">
        <section className="home-hero">
          <div className="home-start">
            <h1>{tx('Что смонтируем сегодня?')}</h1>
            <p className="home-lead">{tx('Выбери формат — откроется пустой проект нужного размера. Его можно поменять потом.')}</p>
            <div className="home-formats">
              {FORMATS.map((f) => (
                <button key={f.aspect} className="home-format" disabled={busy} data-testid={`home-new-${f.aspect.replace(':', '-')}`}
                  onClick={() => void run(() => newProjectAction(f.aspect))}>
                  <span className="home-shape"><span style={shapeSize(f.aspect)} /></span>
                  <b>{f.title}</b>
                  <span className="home-ratio">{f.aspect}</span>
                  <span className="hint small">{f.where}</span>
                </button>
              ))}
            </div>
            <div className="home-auto">
              <span className="home-auto-icon"><WandSparkles size={20} /></span>
              <span className="home-auto-text">
                <b>{tx('Авто-ролик')}</b>
                <span className="hint">{tx('Выбери видео, фото и музыку — Kadro сам возьмёт лучшие куски и смонтирует их в ритм.')}</span>
              </span>
              <button className="btn primary" disabled={busy} onClick={() => getState().setAutoOpen({ files: [], fresh: true })} data-testid="home-auto">{tx('Собрать')}</button>
            </div>
            <div className="home-auto">
              <span className="home-auto-icon"><FileText size={20} /></span>
              <span className="home-auto-text">
                <b>{tx('Ролик по сценарию')}</b>
                <span className="hint">{tx('Вставь текст — Kadro озвучит его, подберёт кадры из твоих видео и поставит субтитры.')}</span>
              </span>
              <button className="btn" disabled={busy} onClick={() => getState().setScriptOpen(true)} data-testid="home-script">{tx('Написать')}</button>
            </div>
            <div className="home-more">
              <button className="btn" disabled={busy} onClick={() => void run(openProject)} data-testid="home-open"><FolderOpen size={15} />{tx('Открыть проект или видео…')}</button>
            </div>
          </div>

          <figure className="home-reel">
            <div className="home-phone">
              {reelSrc
                ? <video ref={reel} src={api.mediaUrl(reelSrc)} autoPlay muted={!sound} loop playsInline data-testid="home-reel" />
                : <div className="home-phone-empty" />}
              {reelSrc && info?.demo.reel && (
                <button className="home-sound" onClick={() => setSound(!sound)} title={sound ? tx('Выключить звук') : tx('Включить звук')}>
                  {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}{sound ? tx('Звук включён') : tx('Со звуком')}
                </button>
              )}
            </div>
            <figcaption>
              <span>{tx('Этот ролик собран в Kadro из демо-видео. Открой его и посмотри, как он устроен.')}</span>
              <button className="btn primary" disabled={busy || !info || !Object.keys(info.demo.scenes).length} onClick={() => void run(openDemo)} data-testid="home-demo">
                <Play size={14} fill="currentColor" />{tx('Открыть демо-проект')}</button>
            </figcaption>
          </figure>
        </section>

        <ProjectsSection list={info?.recent ?? []} busy={busy} run={run} reload={load} />

        <section className="home-section">
          <div className="home-section-head">
            <h2>{tx('Начни с шаблона')}</h2>
            <span className="hint">{tx('Наведи, чтобы посмотреть. Шаблон соберёт ролик из твоих видео и фото.')}</span>
            <div className="spacer" />
            <button className="btn ghost" onClick={() => { getState().setLeftTab('templates'); getState().setHome(false); }}>{txj('Все шаблоны ({0})', BUILTIN_TEMPLATES.length)}</button>
          </div>
          <div className="home-templates">
            {templates.map((t) => (
              <div key={t.id} className="home-tpl" data-testid={`home-tpl-${t.id}`}
                onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(t.id)} onBlur={() => setHover(null)}>
                <TemplatePreview t={t} active={hover === t.id} />
                <div className="home-tpl-info">
                  <b>{t.name}</b>
                  <span className="hint small">{t.aspect}, {fmtDur(templateDuration(t))}</span>
                </div>
                <div className="home-tpl-actions">
                  <button className="btn primary small" disabled={busy} onClick={() => void run(() => templateFromFiles(t))}>{tx('Свои видео и фото')}</button>
                  <button className="btn ghost small" disabled={busy} onClick={() => void run(() => tryTemplate(t))} data-testid={`home-try-${t.id}`}>{tx('Посмотреть пример')}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="home-foot">
        <Toggle label={tx('Показывать этот экран при запуске')} on={showAtStart} onChange={(v) => { setShowAtStart(v); api.setShowHome(v); }} testId="home-show" />
        <div className="home-theme">
          <span className="hint">{tx('Тема')}</span>
          <Seg value={themePref} onChange={(v) => getState().setThemePref(v)}
            options={[{ value: 'dark', label: tx('Тёмная') }, { value: 'light', label: tx('Светлая') }, { value: 'system', label: tx('Как в Windows') }]} />
        </div>
        <button className="btn ghost small" onClick={() => getState().setSettingsOpen(true)} data-testid="home-settings-foot">{tx('Цвет, значок, своё оформление…')}</button>
        <span className="hint">{tx('Kadro работает без интернета и регистрации, видео сохраняется без водяных знаков.')}</span>
      </footer>
    </div>
  );
}

/** Значок Kadro — того цвета, что выбран в настройках (свой — картинкой). */
export function LogoMark({ icon }: { icon?: IconId } = {}) {
  const a = useStore((s) => s.appearance);
  const id = icon ?? a.icon;
  if (id === 'custom' && a.iconFile) return <img className="logo-mark" src={api.mediaUrl(a.iconFile.replace(/\.ico$/i, '.png'))} alt="" />;
  const c = APP_ICONS.find((x) => x.id === id) ?? APP_ICONS[0];
  const ring = c.id === 'black' ? 'rgba(255,255,255,0.22)' : c.id === 'white' ? 'rgba(0,0,0,0.18)' : 'none';
  return (
    <svg className="logo-mark" viewBox="0 0 64 64" aria-hidden>
      <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="13.5" fill={c.bg} stroke={ring} strokeWidth="1.5" />
      <rect x="12" y="12" width="40" height="4.5" rx="2.25" fill={c.fg} />
      <rect x="12" y="47.5" width="40" height="4.5" rx="2.25" fill={c.fg} />
      <path d="M26 23.5v17l16-8.5z" fill={c.fg} />
    </svg>
  );
}
