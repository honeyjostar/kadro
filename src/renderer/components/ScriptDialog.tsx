// Окно «Ролик по сценарию»: вставил текст — Kadro делит его на сцены, озвучивает, подбирает к каждой сцене
// лучшие куски из твоих видео и фото, ставит субтитры точно по тексту и музыку тише под голос.
import { tx } from '../../shared/i18n';
import { txj } from '../txj';
import { FileText, Film, FolderOpen, Image as ImageIcon, Music, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { TtsVoiceId, VoiceInfo } from '../../shared/ipc';
import { readingTime, splitScript } from '../../shared/scriptVideo';
import type { AspectKey } from '../../shared/types';
import { buildScriptVideo, cancelAutoEdit, loadDemoFiles, type AutoStage } from '../actions';
import { api, getState, useStore } from '../store';
import { fmtDur } from '../util';
import { Progress, Toggle } from './controls';

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|opus|flac|wma)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|heic)$/i;
const base = (p: string) => p.split(/[\\/]/).pop() ?? p;
const ASPECTS: { value: AspectKey; label: string; where: string }[] = [
  { value: '9:16', label: '9:16', where: 'TikTok, Reels, Shorts' },
  { value: '16:9', label: '16:9', where: 'YouTube' },
  { value: '1:1', label: '1:1', where: tx('пост') },
];
const SPEEDS = [{ value: 0.9, label: tx('Спокойно') }, { value: 1, label: tx('Обычно') }, { value: 1.15, label: tx('Быстро') }];
const EXAMPLE = tx('Это Kadro — бесплатный видеоредактор для Windows.\n\nМонтаж, субтитры, переходы и эффекты работают прямо на твоём компьютере, без подписки и водяного знака.\n\nВставь свой текст, выбери видео — и ролик готов за минуту.');

let draft = '';

export function ScriptDialog() {
  const assets = useStore((s) => s.project.assets);
  const demo = useStore((s) => s.demo);
  const [text, setText] = useState(draft);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voice, setVoice] = useState<TtsVoiceId | null>('irina');
  const [speed, setSpeed] = useState(1);
  const [files, setFiles] = useState<string[]>([]);
  const [music, setMusic] = useState<string | null>(null);
  const [aspect, setAspect] = useState<AspectKey>('9:16');
  const [title, setTitle] = useState('');
  const [captions, setCaptions] = useState(true);
  const [stage, setStage] = useState<AutoStage | null>(null);
  const job = useStore((s) => (stage?.jobId ? s.jobs[stage.jobId] : undefined));
  useEffect(() => { void loadDemoFiles(); void api.ttsVoices().then(setVoices).catch(() => undefined); }, []);
  useEffect(() => { draft = text; }, [text]);
  const close = () => { if (stage) cancelAutoEdit(); else getState().setScriptOpen(false); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const scenes = useMemo(() => splitScript(text), [text]);
  const approx = scenes.reduce((n, s) => n + readingTime(s), 0) / speed;
  const library = assets.filter((a) => !a.derived && !a.missing && (a.kind === 'video' || a.kind === 'image'));
  const demoScenes = Object.values(demo?.scenes ?? {});
  const add = (paths: string[]) => {
    const pics = paths.filter((p) => !AUDIO_EXT.test(p));
    const audio = paths.filter((p) => AUDIO_EXT.test(p));
    setFiles((cur) => [...cur, ...pics.filter((p) => !cur.includes(p))]);
    if (audio.length && !music) setMusic(audio[0]);
  };
  const go = async () => {
    setStage({ label: tx('Готовлю'), step: 0, steps: 1 });
    try {
      const r = await buildScriptVideo({ text, voice, speed, files, music, aspect, title, captions }, setStage);
      if (r) { draft = ''; getState().setScriptOpen(false); }
    } finally {
      setStage(null);
    }
  };
  const busy = !!stage;
  const progress = stage ? Math.min(1, (stage.step + (job?.progress ?? 0)) / Math.max(1, stage.steps)) : 0;
  const nameOf = (p: string) => (p === demo?.beat ? tx('Демо-бит Kadro') : assets.find((a) => a.path === p)?.name ?? base(p));
  const voiceLabel = (v: VoiceInfo) => `${v.label}${v.ready ? '' : tx(' · скачать {0} МБ', v.sizeMb)}`;

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="modal auto-modal script-modal" role="dialog" aria-label={tx('Ролик по сценарию')} data-testid="script-dialog">
        <div className="modal-head">
          <h3><FileText size={17} />{tx('Ролик по сценарию')}</h3>
          <button className="icon-btn" onClick={close} title={busy ? tx('Остановить') : tx('Закрыть')}><X size={17} /></button>
        </div>
        <p className="hint auto-lead">{tx('Вставь текст — Kadro разделит его на сцены, озвучит, подберёт к каждой сцене лучшие куски из твоих видео и фото, поставит субтитры точно по тексту и музыку тише под голос.')}</p>

        <div className="auto-body">
          <div className="auto-col">
            <div className="section-title script-head">
              {tx('Сценарий')}<span className="faint">{scenes.length ? `${scenes.length} ${scenes.length === 1 ? tx('сцена') : scenes.length < 5 ? tx('сцены') : tx('сцен')} · ~${fmtDur(approx)}` : tx('пустая строка — новая сцена')}</span>
            </div>
            <textarea className="input script-text" rows={11} value={text} disabled={busy} data-testid="script-text"
              placeholder={tx('Каждый абзац — отдельная сцена.\n\nНапример:\nЭто наш отпуск в горах.\n\nМы поднялись на перевал на рассвете…')}
              onChange={(e) => setText(e.target.value)} />
            {!text && <button className="btn ghost small" onClick={() => setText(EXAMPLE)} data-testid="script-example">{tx('Вставить пример')}</button>}

            <div className="section-title">{tx('Голос')}</div>
            <div className="chips">
              {voices.map((v) => (
                <button key={v.id} className={voice === v.id ? 'active' : ''} disabled={busy} onClick={() => setVoice(v.id)} title={voiceLabel(v)} data-testid={`script-voice-${v.id}`}>{v.label.split(' ')[0]}</button>
              ))}
              <button className={voice === null ? 'active' : ''} disabled={busy} onClick={() => setVoice(null)} data-testid="script-voice-none">{tx('Без голоса')}</button>
            </div>
            <div className="chips">{SPEEDS.map((x) => <button key={x.value} className={speed === x.value ? 'active' : ''} disabled={busy} onClick={() => setSpeed(x.value)}>{x.label}</button>)}</div>
            {voice && !voices.find((v) => v.id === voice)?.ready && <p className="hint small">{tx('Голос скачается один раз (~64 МБ), дальше работает без интернета.')}</p>}
            {!voice && <p className="hint small">{tx('Без голоса сцена длится столько, сколько её читать глазами, — для роликов с музыкой и субтитрами.')}</p>}
          </div>

          <div className="auto-col">
            <div className="section-title">{tx('Видео и фото — по порядку')}</div>
            <div className="auto-files" data-testid="script-files">
              {files.length === 0 && <div className="auto-empty">{tx('Добавь видео и фото для ролика.')}</div>}
              {files.map((f, i) => (
                <div key={f} className="auto-file" title={f}>
                  {IMAGE_EXT.test(f) ? <ImageIcon size={14} /> : <Film size={14} />}
                  <span className="name">{i + 1}. {nameOf(f)}</span>
                  <button className="icon-btn" disabled={busy} title={tx('Убрать')} onClick={() => setFiles(files.filter((x) => x !== f))}><X size={13} /></button>
                </div>
              ))}
            </div>
            <div className="row-btns auto-file-btns">
              <button className="btn" disabled={busy} onClick={() => void api.pickMedia().then(add)} data-testid="script-add-files"><FolderOpen size={14} />{tx('Добавить файлы…')}</button>
              {library.length > 0 && <button className="btn ghost" disabled={busy} onClick={() => add(library.map((a) => a.path))} data-testid="script-from-library">{txj('Из медиатеки ({0})', library.length)}</button>}
              {!files.length && demoScenes.length > 0 && <button className="btn ghost" disabled={busy} onClick={() => add(demoScenes)} data-testid="script-demo">{tx('Демо-видео')}</button>}
            </div>

            <div className="section-title">{tx('Музыка')}</div>
            <div className="chips">
              <button className={music === null ? 'active' : ''} disabled={busy} onClick={() => setMusic(null)}>{tx('Без музыки')}</button>
              {demo?.beat && <button className={music === demo.beat ? 'active' : ''} disabled={busy} onClick={() => setMusic(demo.beat)}><Music size={12} />{tx('Демо-бит')}</button>}
              {music && music !== demo?.beat && <button className="active"><Music size={12} />{nameOf(music)}</button>}
              <button disabled={busy} onClick={() => void api.pickMusic().then((p) => { if (p) setMusic(p); })} data-testid="script-music-pick"><FolderOpen size={12} />{tx('Выбрать…')}</button>
            </div>

            <div className="section-title">{tx('Формат')}</div>
            <div className="chips">{ASPECTS.map((x) => <button key={x.value} className={aspect === x.value ? 'active' : ''} disabled={busy} onClick={() => setAspect(x.value)} data-testid={`script-aspect-${x.value.replace(':', '-')}`}>{x.label} <span className="faint">{x.where}</span></button>)}</div>
            <Toggle label={tx('Субтитры по тексту')} on={captions} onChange={setCaptions} testId="script-captions" />
            <input className="input auto-title" placeholder={tx('Название проекта (необязательно)')} value={title} maxLength={60} disabled={busy} onChange={(e) => setTitle(e.target.value)} data-testid="script-title" />
          </div>
        </div>

        {!busy && <p className="hint small auto-fresh">{tx('Ролик откроется новым проектом. Текущий, если в нём есть несохранённое, останется в «Моих проектах».')}</p>}
        {stage && (<div className="auto-progress" data-testid="script-progress"><span>{stage.label}…</span><Progress value={progress} /></div>)}
        <div className="actions">
          <button className="btn" onClick={close}>{busy ? tx('Остановить') : tx('Отмена')}</button>
          <button className="btn primary" disabled={busy || !scenes.length || !files.length} onClick={() => void go()} data-testid="script-build"><FileText size={15} />{tx('Собрать ролик')}</button>
        </div>
      </div>
    </div>
  );
}
