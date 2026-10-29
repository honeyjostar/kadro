// Окно «Повторить монтаж по ролику» (как шаблоны CapCut в TikTok): выбрать ролик-образец — Kadro найдёт в нём
// склейки, вспышки, наезды и возьмёт музыку; потом свои видео и фото встают в те же окошки, в ту же музыку.
// Образец сохраняется шаблоном в «Моих шаблонах» — его можно применять снова.
import { Clapperboard, Film, FolderOpen, Image as ImageIcon, Music, X, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { tx } from '../../shared/i18n';
import { templateDuration, type Template } from '../../shared/templates';
import { analyzeReference, buildFromReference, cancelAutoEdit, type AutoStage, type RefInfo } from '../actions';
import { api, getState, useStore } from '../store';
import { txj } from '../txj';
import { fmtDur } from '../util';
import { Progress, Toggle } from './controls';

const VIDEO_EXT = /\.(mp4|mov|m4v|mkv|webm|avi|wmv|mts|m2ts|3gp)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|heic|gif)$/i;
const base = (p: string) => p.split(/[\\/]/).pop() ?? p;
const SOUNDS: { value: 'off' | 'quiet' | 'on'; label: string }[] = [
  { value: 'off', label: tx('Только музыка') }, { value: 'quiet', label: tx('Видео тихо под музыкой') }, { value: 'on', label: tx('Видео и музыка') },
];

export function RefEditDialog() {
  const open = useStore((s) => s.refOpen)!;
  const assets = useStore((s) => s.project.assets);
  const [ref, setRef] = useState<string | null>(null);
  const [info, setInfo] = useState<RefInfo | null>(null);
  const [files, setFiles] = useState<string[]>(open.files ?? []);
  const [useMusic, setUseMusic] = useState(true);
  const [sound, setSound] = useState<'off' | 'quiet' | 'on'>('off');
  const [stage, setStage] = useState<AutoStage | null>(null);
  const job = useStore((s) => (stage?.jobId ? s.jobs[stage.jobId] : undefined));
  const busy = !!stage;
  const library = assets.filter((a) => !a.derived && !a.missing && (a.kind === 'video' || a.kind === 'image'));
  const close = () => { if (busy) cancelAutoEdit(); getState().setRefOpen(null); };

  const runAnalysis = async (path: string) => {
    setRef(path);
    setInfo(null);
    setStage({ label: tx('Разбираю ролик-образец'), step: 0, steps: 1 });
    try { setInfo(await analyzeReference(path, setStage)); } finally { setStage(null); }
  };
  useEffect(() => { if (open.ref) void runAnalysis(open.ref); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const pickRef = async () => {
    const paths = await api.pickMedia();
    const v = paths.find((p) => VIDEO_EXT.test(p));
    if (!v) { if (paths.length) getState().toast(tx('Образец — это видеоролик (MP4, MOV, WEBM…)'), 'err'); return; }
    await runAnalysis(v);
  };
  const addFiles = (paths: string[]) => setFiles((cur) => [...cur, ...paths.filter((p) => (VIDEO_EXT.test(p) || IMAGE_EXT.test(p)) && !cur.includes(p))]);
  const pickFiles = async () => addFiles(await api.pickMedia());
  const onDropRef = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const p = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).find((x) => VIDEO_EXT.test(x));
    if (p) void runAnalysis(p);
  };
  const onDropFiles = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    addFiles([...e.dataTransfer.files].map((f) => api.pathForFile(f)));
  };

  const t: Template | null = info?.template ?? null;
  const go = async () => {
    if (!t || !files.length) return;
    setStage({ label: tx('Готовлю'), step: 0, steps: 1 });
    try {
      const ok = await buildFromReference(t, files, { fresh: open.fresh, useMusic: useMusic && !!t.music, videoSound: useMusic && t.music ? sound : 'on', onStage: setStage });
      if (ok) getState().setRefOpen(null);
    } finally { setStage(null); }
  };
  const nameOf = (p: string) => assets.find((a) => a.path === p)?.name ?? base(p);
  const progress = stage ? Math.min(1, (stage.step + (job?.progress ?? 0)) / Math.max(1, stage.steps)) : 0;
  const total = t ? templateDuration(t) : 0;

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="modal auto-modal ref-modal" role="dialog" aria-label={tx('Повторить монтаж по ролику')} data-testid="ref-dialog">
        <div className="modal-head">
          <h3><Clapperboard size={17} />{tx('Повторить монтаж по ролику')}</h3>
          <button className="icon-btn" onClick={close} title={busy ? tx('Остановить') : tx('Закрыть')}><X size={17} /></button>
        </div>
        <p className="hint auto-lead">{tx('Понравился монтаж в TikTok или Reels? Сохрани этот ролик (в TikTok: «Поделиться» → «Сохранить видео») и выбери его здесь. Kadro найдёт склейки, вспышки и наезды, возьмёт музыку — и соберёт такой же монтаж из твоих видео и фото.')}</p>

        <div className="auto-body">
          <div className="auto-col">
            <div className="section-title">{tx('Ролик-образец')}</div>
            <div className={`ref-drop ${info ? 'has' : ''}`} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={onDropRef} data-testid="ref-drop">
              {!ref && <span className="hint">{tx('Перетащи ролик сюда или выбери файл.')}</span>}
              {ref && !info && busy && <span className="hint">{tx('Разбираю «{0}»…', base(ref))}</span>}
              {ref && !info && !busy && <span className="hint">{tx('Не получилось разобрать — попробуй другой ролик.')}</span>}
              {info && t && (
                <div className="ref-info" data-testid="ref-info">
                  {t.thumb ? <img src={t.thumb} alt="" /> : <span className="ref-thumb-empty"><Film size={20} /></span>}
                  <div>
                    <b title={ref ?? ''}>{base(ref ?? '')}</b>
                    <span className="hint small" data-testid="ref-summary">
                      {txj('{0} · кадров: {1}', fmtDur(info.duration), info.shots)}
                      {info.flashes ? tx(' · вспышек: {0}', info.flashes) : ''}
                      {info.zooms ? tx(' · наездов: {0}', info.zooms) : ''}
                    </span>
                    <span className="hint small">{info.music ? <><Music size={11} /> {tx('музыка из ролика')}</> : tx('без звука')}</span>
                  </div>
                </div>
              )}
            </div>
            {t && (
              <div className="ref-strip" aria-label={tx('Окошки шаблона')} data-testid="ref-strip">
                {t.slots.map((s, i) => (
                  <i key={i} style={{ flexGrow: s.duration }} className={s.effects?.some((e) => e.type === 'flash') ? 'flash' : s.zoom ? 'zoom' : ''}
                    title={tx('Окошко {0}: {1} с', i + 1, s.duration.toFixed(2))} />
                ))}
              </div>
            )}
            <div className="row-btns">
              <button className="btn" disabled={busy} onClick={() => void pickRef()} data-testid="ref-pick"><FolderOpen size={14} />{ref ? tx('Другой ролик…') : tx('Выбрать ролик…')}</button>
            </div>
            {t && <p className="hint small">{tx('Шаблон «{0}» сохранён в «Шаблоны» → «Мои шаблоны» — его можно применять снова.', t.name)}</p>}
          </div>

          <div className="auto-col">
            <div className="section-title">{tx('Твои видео и фото — встанут в окошки по порядку')}</div>
            <div className="auto-files" onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={onDropFiles} data-testid="ref-files">
              {files.length === 0 && <div className="auto-empty">{tx('Добавь видео и фото для монтажа.')}</div>}
              {files.map((f, i) => (
                <div key={f} className="auto-file" title={f} data-testid="ref-file">
                  {IMAGE_EXT.test(f) ? <ImageIcon size={14} /> : <Film size={14} />}
                  <span className="name">{i + 1}. {nameOf(f)}</span>
                  <button className="icon-btn" disabled={busy} title={tx('Убрать')} aria-label={tx('Убрать {0}', base(f))} onClick={() => setFiles(files.filter((x) => x !== f))}><X size={13} /></button>
                </div>
              ))}
            </div>
            <div className="row-btns auto-file-btns">
              <button className="btn" disabled={busy} onClick={() => void pickFiles()} data-testid="ref-add-files"><FolderOpen size={14} />{tx('Добавить файлы…')}</button>
              {!open.fresh && library.length > 0 && (
                <button className="btn ghost" disabled={busy} onClick={() => addFiles(library.map((a) => a.path))} data-testid="ref-from-library">{txj('Из медиатеки ({0})', library.length)}</button>
              )}
            </div>
            {t && files.length > 0 && (
              <p className="hint small" data-testid="ref-fit">
                {files.length < t.slots.length
                  ? tx('Окошек {0}, файлов {1} — файлы пойдут по кругу, из видео возьмутся разные куски.', t.slots.length, files.length)
                  : tx('Окошек {0}, файлов {1}.', t.slots.length, files.length)}
                {' '}{tx('Ролик — {0}.', fmtDur(total))}
              </p>
            )}
            {t?.music && (
              <>
                <Toggle label={tx('Музыка из образца')} hint={tx('Склейки встанут точно в её ритм')} on={useMusic} onChange={setUseMusic} testId="ref-music" />
                {useMusic && <div className="chips">{SOUNDS.map((x) => <button key={x.value} className={sound === x.value ? 'active' : ''} disabled={busy} onClick={() => setSound(x.value)} data-testid={`ref-sound-${x.value}`}>{x.label}</button>)}</div>}
              </>
            )}
          </div>
        </div>

        {open.fresh && !busy && <p className="hint small auto-fresh">{tx('Ролик откроется новым проектом. Текущий, если в нём есть несохранённое, останется в «Моих проектах».')}</p>}
        {stage && (<div className="auto-progress" data-testid="ref-progress"><span>{stage.label}…</span><Progress value={progress} /></div>)}
        <div className="actions">
          <button className="btn" onClick={close}>{busy ? tx('Остановить') : tx('Отмена')}</button>
          <button className="btn primary" disabled={busy || !t || !files.length} onClick={() => void go()} data-testid="ref-build"><Zap size={15} />{tx('Собрать ролик')}</button>
        </div>
      </div>
    </div>
  );
}
