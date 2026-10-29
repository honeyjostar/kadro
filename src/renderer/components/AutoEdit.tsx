// Окно «Авто-ролик»: выбрать видео, фото и музыку, стиль, формат и длину — Kadro сам смонтирует ролик
// (лучшие куски видео, склейки в ритм музыки, переходы, цвет, надпись). Дальше его можно править как обычно.
import { tx } from '../../shared/i18n';
import { txj } from '../txj';
import { Film, FolderOpen, Image as ImageIcon, Music, TriangleAlert, WandSparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AUTO_STYLES, type AutoStyle } from '../../shared/autoEdit';
import type { AspectKey } from '../../shared/types';
import { buildAutoEdit, cancelAutoEdit, loadDemoFiles, type AutoStage } from '../actions';
import { api, getState, useStore } from '../store';
import { Progress } from './controls';

const VIDEO_EXT = /\.(mp4|mov|m4v|mkv|webm|avi|wmv|mts|m2ts|3gp|gif)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|heic)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|opus|flac|wma)$/i;
const base = (p: string) => p.split(/[\\/]/).pop() ?? p;

const ASPECTS: { value: AspectKey; label: string; where: string }[] = [
  { value: '9:16', label: '9:16', where: 'TikTok, Reels, Shorts' },
  { value: '16:9', label: '16:9', where: 'YouTube' },
  { value: '1:1', label: '1:1', where: tx('пост') },
  { value: '4:5', label: '4:5', where: 'Instagram' },
];
const LENGTHS: { value: number | 'auto'; label: string }[] = [
  { value: 'auto', label: tx('Сколько получится') }, { value: 15, label: tx('15 с') }, { value: 30, label: tx('30 с') }, { value: 60, label: tx('1 мин') },
];
const SOUNDS: { value: 'off' | 'quiet' | 'on'; label: string }[] = [
  { value: 'off', label: tx('Только музыка') }, { value: 'quiet', label: tx('Видео тихо под музыкой') }, { value: 'on', label: tx('Видео и музыка') },
];

export function AutoEditDialog() {
  const open = useStore((s) => s.autoOpen);
  const last = useStore((s) => s.autoLast);
  const projAspect = useStore((s) => s.project.settings.aspect);
  const assets = useStore((s) => s.project.assets);
  const demoBeat = useStore((s) => s.demo?.beat ?? null);
  const [files, setFiles] = useState<string[]>(open?.files ?? []);
  const [music, setMusic] = useState<string | null>(open?.music !== undefined ? open.music : last?.music ?? null);
  const [style, setStyle] = useState<AutoStyle>(last?.style ?? 'energy');
  const [aspect, setAspect] = useState<AspectKey>(open?.fresh ? last?.aspect ?? '9:16' : projAspect);
  const [length, setLength] = useState<number | 'auto'>(last?.length ?? 'auto');
  const [title, setTitle] = useState('');
  const [sound, setSound] = useState<'off' | 'quiet' | 'on'>(last?.videoSound ?? 'off');
  const [stage, setStage] = useState<AutoStage | null>(null);
  const [note, setNote] = useState('');
  const job = useStore((s) => (stage?.jobId ? s.jobs[stage.jobId] : undefined));

  useEffect(() => { void loadDemoFiles(); }, []);
  const close = () => { if (stage) cancelAutoEdit(); else getState().setAutoOpen(null); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!open) return null;

  const library = assets.filter((a) => !a.derived && !a.missing && (a.kind === 'video' || a.kind === 'image'));
  const songs = assets.filter((a) => !a.derived && !a.missing && a.kind === 'audio');
  const musicChoices = [...new Set([...(demoBeat ? [demoBeat] : []), ...songs.map((a) => a.path), ...(music ? [music] : [])])];
  const add = (paths: string[]) => {
    const pics = paths.filter((p) => !AUDIO_EXT.test(p));
    const audio = paths.filter((p) => AUDIO_EXT.test(p));
    setFiles((cur) => [...cur, ...pics.filter((p) => !cur.includes(p))]);
    if (audio.length && !music) setMusic(audio[0]);
    setNote(audio.length > (music ? 0 : 1) ? tx('Звуковые файлы не идут в кадр — музыку выбери ниже.') : '');
  };
  const pick = async () => add(await api.pickMedia());
  const pickMusic = async () => { const p = await api.pickMusic(); if (p) setMusic(p); };
  const go = async () => {
    setNote('');
    setStage({ label: tx('Готовлю'), step: 0, steps: 1 });
    try {
      const r = await buildAutoEdit({ files, music, style, aspect, length, title, videoSound: music ? sound : 'on' }, { fresh: open.fresh, onStage: setStage });
      if (r) getState().setAutoOpen(null);
    } finally {
      setStage(null);
    }
  };
  const nameOf = (p: string) => (p === demoBeat ? tx('Демо-бит Kadro') : assets.find((a) => a.path === p)?.name ?? base(p));
  const progress = stage ? Math.min(1, (stage.step + (job?.progress ?? 0)) / Math.max(1, stage.steps)) : 0;
  const busy = !!stage;

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="modal auto-modal" role="dialog" aria-label={tx('Авто-ролик')} data-testid="auto-dialog">
        <div className="modal-head">
          <h3><WandSparkles size={17} />{tx('Авто-ролик')}</h3>
          <button className="icon-btn" onClick={close} title={busy ? tx('Остановить') : tx('Закрыть')}><X size={17} /></button>
        </div>
        <p className="hint auto-lead">{tx('Kadro выберет в видео лучшие куски — резкие, светлые, с движением, — поставит склейки в ритм музыки, добавит переходы, цвет и надпись. Готовый ролик можно править как обычно.')}</p>

        <div className="auto-body">
          <div className="auto-col">
            <div className="section-title">{tx('Видео и фото — в ролике будут по порядку')}</div>
            <div className="auto-files" data-testid="auto-files">
              {files.length === 0 && <div className="auto-empty">{tx('Добавь видео и фото, из которых собрать ролик.')}</div>}
              {files.map((f, i) => (
                <div key={f} className="auto-file" title={f} data-testid="auto-file">
                  {IMAGE_EXT.test(f) ? <ImageIcon size={14} /> : <Film size={14} />}
                  <span className="name">{i + 1}. {nameOf(f)}</span>
                  <button className="icon-btn" disabled={busy} title={tx('Убрать')} aria-label={tx('Убрать {0}', base(f))} onClick={() => setFiles(files.filter((x) => x !== f))}><X size={13} /></button>
                </div>
              ))}
            </div>
            <div className="row-btns auto-file-btns">
              <button className="btn" disabled={busy} onClick={() => void pick()} data-testid="auto-add-files"><FolderOpen size={14} />{tx('Добавить файлы…')}</button>
              {!open.fresh && library.length > 0 && (
                <button className="btn ghost" disabled={busy} onClick={() => add(library.map((a) => a.path))} data-testid="auto-from-library">{txj('Из медиатеки ({0})', library.length)}</button>
              )}
              {files.length > 0 && <button className="btn ghost" disabled={busy} onClick={() => setFiles([])}>{tx('Очистить')}</button>}
            </div>

            <div className="section-title">{tx('Музыка')}</div>
            <div className="chips auto-music">
              <button className={music === null ? 'active' : ''} disabled={busy} onClick={() => setMusic(null)} data-testid="auto-music-none">{tx('Без музыки')}</button>
              {musicChoices.map((p) => (
                <button key={p} className={music === p ? 'active' : ''} disabled={busy} onClick={() => setMusic(p)} title={p}
                  data-testid={p === demoBeat ? 'auto-music-demo' : 'auto-music-file'}><Music size={12} />{nameOf(p)}</button>
              ))}
              <button disabled={busy} onClick={() => void pickMusic()} data-testid="auto-music-pick"><FolderOpen size={12} />{tx('Выбрать…')}</button>
            </div>
            {music
              ? (<>
                <div className="section-title">{tx('Звук из видео')}</div>
                <div className="chips">{SOUNDS.map((x) => <button key={x.value} className={sound === x.value ? 'active' : ''} disabled={busy} onClick={() => setSound(x.value)} data-testid={`auto-sound-${x.value}`}>{x.label}</button>)}</div>
              </>)
              : <p className="hint small">{tx('Без музыки склейки идут ровно по темпу стиля, звук видео остаётся.')}</p>}
          </div>

          <div className="auto-col">
            <div className="section-title">{tx('Стиль')}</div>
            <div className="auto-styles">
              {AUTO_STYLES.map((s) => (
                <button key={s.id} className={`auto-style ${style === s.id ? 'active' : ''}`} disabled={busy} onClick={() => setStyle(s.id)} data-testid={`auto-style-${s.id}`}>
                  <span className="sw" style={{ background: s.swatch }} />
                  <b>{s.label}</b>
                  <span className="hint small">{s.hint}</span>
                </button>
              ))}
            </div>
            <div className="section-title">{tx('Формат')}</div>
            <div className="chips">{ASPECTS.map((x) => <button key={x.value} className={aspect === x.value ? 'active' : ''} disabled={busy} title={x.where} onClick={() => setAspect(x.value)} data-testid={`auto-aspect-${x.value.replace(':', '-')}`}>{x.label} <span className="faint">{x.where}</span></button>)}</div>
            <div className="section-title">{tx('Длина')}</div>
            <div className="chips">{LENGTHS.map((x) => <button key={String(x.value)} className={length === x.value ? 'active' : ''} disabled={busy} onClick={() => setLength(x.value)} data-testid={`auto-len-${x.value}`}>{x.label}</button>)}</div>
            <div className="section-title">{tx('Надпись в начале')}</div>
            <input className="input auto-title" placeholder={tx('Например: Лето на море. Пусто — без надписи')} value={title} maxLength={60} disabled={busy}
              onChange={(e) => setTitle(e.target.value)} data-testid="auto-title" />
          </div>
        </div>

        {note && <div className="warn"><TriangleAlert size={15} /><span>{note}</span></div>}
        {open.fresh && !busy && <p className="hint small auto-fresh">{tx('Ролик откроется новым проектом. Текущий, если в нём есть несохранённое, останется в «Моих проектах».')}</p>}
        {stage && (<div className="auto-progress" data-testid="auto-progress"><span>{stage.label}…</span><Progress value={progress} /></div>)}
        <div className="actions">
          <button className="btn" onClick={close} data-testid="auto-cancel">{busy ? tx('Остановить') : tx('Отмена')}</button>
          <button className="btn primary" disabled={busy || !files.length} onClick={() => void go()} data-testid="auto-build"><WandSparkles size={15} />{tx('Собрать ролик')}</button>
        </div>
      </div>
    </div>
  );
}
