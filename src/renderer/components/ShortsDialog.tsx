// Окно «Нарезать в шортсы»: длинное видео (стрим, подкаст, влог) → распознавание речи → лучшие моменты
// с таймкодами → выбранные — отдельными вертикальными проектами с субтитрами «как у блогеров» и крючком сверху.
import { tx, uiLang } from '../../shared/i18n';
import { txj } from '../txj';
import { Check, Film, FolderOpen, Scissors, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BLOG_STYLES } from '../../shared/blogCaptions';
import { REASON_LABEL, SHORT_LENS, type ShortLen, type ShortMoment } from '../../shared/shorts';
import type { MediaAsset } from '../../shared/types';
import { cancelJob, createShorts, findShortMoments, openRecent, shortsAsset, type ShortsStage } from '../actions';
import { api, getState, useStore } from '../store';
import { fmtDur, fmtTime, plural } from '../util';
import { Progress, Toggle } from './controls';

type Phase = 'setup' | 'pick' | 'done';
const COUNTS = [3, 5, 8];
const base = (p: string) => p.split(/[\\/]/).pop() ?? p;
const nShorts = (n: number) => `${n} ${plural(n, tx('шортс'), tx('шортса'), tx('шортсов'))}`;
const nMoments = (n: number) => `${n} ${plural(n, tx('момент'), tx('момента'), tx('моментов'))}`;

export function ShortsDialog() {
  const assets = useStore((s) => s.project.assets);
  const videos = useMemo(() => assets.filter((a) => a.kind === 'video' && a.hasAudio && !a.derived && !a.missing).sort((a, b) => b.duration - a.duration), [assets]);
  const [src, setSrc] = useState<MediaAsset | null>(videos[0] ?? null);
  const [len, setLen] = useState<ShortLen>('mid');
  const [count, setCount] = useState(5);
  const [model, setModel] = useState<'ru' | 'multi'>(uiLang() === 'en' ? 'multi' : 'ru');
  const [style, setStyle] = useState(BLOG_STYLES[0].id);
  const [reframe, setReframe] = useState(true);
  const [phase, setPhase] = useState<Phase>('setup');
  const [moments, setMoments] = useState<ShortMoment[]>([]);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [files, setFiles] = useState<string[]>([]);
  const [stage, setStage] = useState<ShortsStage | null>(null);
  const stopped = useRef(false);
  const job = useStore((s) => (stage?.jobId ? s.jobs[stage.jobId] : undefined));
  const busy = !!stage;
  const close = () => {
    if (busy) { stopped.current = true; if (stage?.jobId) cancelJob(stage.jobId); return; }
    getState().setShortsOpen(false);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pickFile = async () => {
    const paths = await api.pickMedia();
    const v = paths.find((p) => !/\.(png|jpe?g|webp|bmp|heic|gif|mp3|wav|m4a|aac|ogg|opus|flac|wma)$/i.test(p));
    if (!v) return;
    setStage({ label: tx('Открываю видео'), step: 0, steps: 1 });
    try { const a = await shortsAsset(v); if (a) setSrc(a); } finally { setStage(null); }
  };
  const find = async () => {
    if (!src) return;
    stopped.current = false;
    setStage({ label: tx('Готовлю'), step: 0, steps: 2 });
    try {
      const ms = await findShortMoments(src, { len, count, model }, setStage);
      if (ms && ms.length && !stopped.current) {
        setMoments(ms);
        setChosen(new Set(ms.map((_, i) => i)));
        setPhase('pick');
      }
    } finally { setStage(null); }
  };
  const make = async () => {
    if (!src) return;
    stopped.current = false;
    const list = moments.filter((_, i) => chosen.has(i)).sort((a, b) => a.start - b.start);
    setStage({ label: tx('Собираю шортсы'), step: 0, steps: list.length });
    try {
      const out = await createShorts(src, list, BLOG_STYLES.find((b) => b.id === style) ?? BLOG_STYLES[0], reframe, setStage);
      if (out && !stopped.current) { setFiles(out); setPhase('done'); }
    } finally { setStage(null); }
  };
  const open = async (f: string) => { if (await openRecent(f)) getState().setShortsOpen(false); };
  const progress = stage ? Math.min(1, (stage.step - 1 + (job?.progress ?? 0)) / Math.max(1, stage.steps)) : 0;
  const toggle = (i: number) => setChosen((c) => { const n = new Set(c); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="modal auto-modal shorts-modal" role="dialog" aria-label={tx('Нарезать в шортсы')} data-testid="shorts-dialog">
        <div className="modal-head">
          <h3><Scissors size={17} />{tx('Нарезать в шортсы')}</h3>
          <button className="icon-btn" onClick={close} title={busy ? tx('Остановить') : tx('Закрыть')}><X size={17} /></button>
        </div>

        {phase === 'setup' && (
          <>
            <p className="hint auto-lead">{tx('Стрим, подкаст или влог → Kadro послушает речь, найдёт самые цепляющие моменты и сделает из каждого вертикальный ролик: кадр следует за человеком, субтитры как у блогеров, заголовок-крючок сверху.')}</p>
            <div className="section-title">{tx('Длинное видео')}</div>
            <div className="shorts-src" data-testid="shorts-src">
              {src ? <><Film size={15} /><span className="name" title={src.path}>{src.name}</span><span className="faint">{fmtDur(src.duration)}</span></>
                : <span className="hint">{tx('Выбери видео со звуком — минимум пара минут речи.')}</span>}
            </div>
            <div className="chips">
              {videos.filter((v) => v.id !== src?.id).slice(0, 4).map((v) => (
                <button key={v.id} disabled={busy} onClick={() => setSrc(v)} title={v.path}>{v.name} <span className="faint">{fmtDur(v.duration)}</span></button>
              ))}
              <button disabled={busy} onClick={() => void pickFile()} data-testid="shorts-pick"><FolderOpen size={12} />{tx('Выбрать файл…')}</button>
            </div>
            <div className="shorts-opts">
              <div>
                <div className="section-title">{tx('Длина шортса')}</div>
                <div className="chips">{(Object.keys(SHORT_LENS) as ShortLen[]).map((k) => <button key={k} className={len === k ? 'active' : ''} disabled={busy} onClick={() => setLen(k)} data-testid={`shorts-len-${k}`}>{SHORT_LENS[k].label}</button>)}</div>
                <div className="section-title">{tx('Сколько найти')}</div>
                <div className="chips">{COUNTS.map((n) => <button key={n} className={count === n ? 'active' : ''} disabled={busy} onClick={() => setCount(n)} data-testid={`shorts-count-${n}`}>{n}</button>)}</div>
                <div className="section-title">{tx('Язык речи')}</div>
                <div className="chips">
                  <button className={model === 'ru' ? 'active' : ''} disabled={busy} onClick={() => setModel('ru')} data-testid="shorts-lang-ru">{tx('Русский')}</button>
                  <button className={model === 'multi' ? 'active' : ''} disabled={busy} onClick={() => setModel('multi')} data-testid="shorts-lang-multi">{tx('Английский и другие')}</button>
                </div>
              </div>
              <div>
                <div className="section-title">{tx('Субтитры')}</div>
                <div className="chips">{BLOG_STYLES.map((b) => <button key={b.id} className={style === b.id ? 'active' : ''} disabled={busy} onClick={() => setStyle(b.id)} data-testid={`shorts-style-${b.id}`}>{b.label}</button>)}</div>
                <Toggle label={tx('Кадр следует за человеком')} hint={tx('Дольше: Kadro ищет человека в каждом шортсе')} on={reframe} onChange={setReframe} testId="shorts-reframe" />
              </div>
            </div>
          </>
        )}

        {phase === 'pick' && (
          <>
            <p className="hint auto-lead">{txj('Нашёл {0}. Отметь, какие собрать, — каждый станет отдельным проектом в «Моих проектах».', nMoments(moments.length))}</p>
            <div className="shorts-list" data-testid="shorts-list">
              {moments.map((m, i) => (
                <label key={i} className={`shorts-item ${chosen.has(i) ? 'on' : ''}`} data-testid="shorts-item">
                  <input type="checkbox" checked={chosen.has(i)} disabled={busy} onChange={() => toggle(i)} />
                  <span className="shorts-rank">{i + 1}</span>
                  <span className="shorts-body">
                    <b>«{m.hook}»</b>
                    <span className="hint small">{fmtTime(m.start, 30)} – {fmtTime(m.end, 30)} · {fmtDur(m.end - m.start)}{m.reasons.length ? ` · ${m.reasons.map((r) => REASON_LABEL[r]).join(', ')}` : ''}</span>
                  </span>
                </label>
              ))}
            </div>
            <Toggle label={tx('Кадр следует за человеком')} hint={tx('Дольше: Kadro ищет человека в каждом шортсе')} on={reframe} onChange={setReframe} />
          </>
        )}

        {phase === 'done' && (
          <>
            <div className="done-line"><Check size={20} /><span>{txj('Готово: {0} в «Моих проектах»', nShorts(files.length))}</span></div>
            <div className="shorts-list" data-testid="shorts-done">
              {files.map((f) => (
                <div key={f} className="shorts-item on">
                  <Film size={15} />
                  <span className="shorts-body"><b>{base(f).replace(/\.kadro$/, '')}</b></span>
                  <button className="btn small" onClick={() => void open(f)} data-testid="shorts-open">{tx('Открыть')}</button>
                </div>
              ))}
            </div>
            <p className="hint small">{tx('Проекты лежат в «Документы → Kadro → Шортсы». Открой любой, поправь и экспортируй.')}</p>
          </>
        )}

        {stage && (<div className="auto-progress" data-testid="shorts-progress"><span>{stage.label}…</span><Progress value={progress} /></div>)}
        <div className="actions">
          {phase === 'pick' && !busy && <button className="btn ghost" onClick={() => setPhase('setup')}>{tx('Назад')}</button>}
          <button className="btn" onClick={close}>{busy ? tx('Остановить') : tx('Закрыть')}</button>
          {phase === 'setup' && <button className="btn primary" disabled={busy || !src} onClick={() => void find()} data-testid="shorts-find"><Scissors size={15} />{tx('Найти моменты')}</button>}
          {phase === 'pick' && <button className="btn primary" disabled={busy || !chosen.size} onClick={() => void make()} data-testid="shorts-make">{txj('Собрать {0}', nShorts(chosen.size))}</button>}
          {phase === 'done' && files[0] && <button className="btn primary" onClick={() => void open(files[0])} data-testid="shorts-open-first">{tx('Открыть первый')}</button>}
        </div>
      </div>
    </div>
  );
}
