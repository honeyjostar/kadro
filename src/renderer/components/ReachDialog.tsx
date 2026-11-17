// Окно «Проверка охватов»: что в готовом ролике мешает площадке его показывать, а зрителям — досматривать, и как это
// поправить одной кнопкой. Ролик — только что сохранённый из Kadro или любой другой (хоть из CapCut).
import { CheckCircle2, FolderOpen, Play, ShieldCheck, Upload, Wrench, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { tx } from '../../shared/i18n';
import { platformIssues, sortIssues, type ReachIssue, type ReachLevel, type ReachReport } from '../../shared/reach';
import { PLATFORMS, type Platform } from '../../shared/safezones';
import { ensureFonts, preflight } from '../preflight';
import { applyReachFix, openForFix, reachCheck } from '../reachActions';
import { cancelJob } from '../actions';
import { api, getState, useStore } from '../store';
import { Seg } from './controls';

const LEVELS: { id: ReachLevel; label: () => string }[] = [
  { id: 'cut', label: () => tx('Режут показы') },
  { id: 'worse', label: () => tx('Хуже досматривают') },
  { id: 'tip', label: () => tx('Советы') },
];

const fixLabel = (i: ReachIssue): string => {
  switch (i.fix) {
    case 'hideMark': return tx('Это мой ролик — закрыть знак');
    case 'trimStart': return tx('Начать с {0} с', (i.at ?? 0).toFixed(1));
    case 'trimEnd': return tx('Обрезать с {0} с', (i.at ?? 0).toFixed(1));
    case 'loudnorm': return tx('Выровнять громкость');
    case 'fill': return tx('Растянуть на весь кадр');
    case 'vertical': return tx('Сделать 9:16');
    case 'sharper': return tx('1080p, высокое качество');
    default: return '';
  }
};

/** Маленький кадр с рамкой найденного знака — видно, о каком месте речь. */
function MiniFrame({ box, w, h }: { box: NonNullable<ReachIssue['box']>; w: number; h: number }) {
  const vertical = h >= w;
  return (
    <span className={`reach-mini ${vertical ? 'v' : 'h'}`} aria-hidden="true">
      <i style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }} />
    </span>
  );
}

export function ReachDialog() {
  const open = useStore((s) => s.reachOpen)!;
  const project = useStore((s) => s.project);
  const close = () => getState().setReachOpen(null);
  const [file, setFile] = useState<string | null>(open.file);
  const [inProject, setInProject] = useState(open.project);
  const [platform, setPlatform] = useState<Platform>(open.platform ?? getState().safeZone ?? 'tiktok');
  const [report, setReport] = useState<ReachReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Record<string, string>>({});
  const [noFonts, setNoFonts] = useState<string[]>([]);
  const job = useStore((s) => Object.values(s.jobs).find((j) => j.id.startsWith('reach_')));

  const run = async (f: string) => {
    setBusy(true); setReport(null); setDone({});
    try { setReport(await reachCheck(f, platform)); } finally { setBusy(false); }
  };
  useEffect(() => { if (open.file) void run(open.file); }, []);
  useEffect(() => { if (inProject) void ensureFonts(project).then(setNoFonts); }, [inProject]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);

  const pick = async () => {
    const files: string[] | null = await api.pickMedia();
    const f = files?.find((x) => /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(x)) ?? files?.[0];
    if (!f) return;
    setFile(f); setInProject(false);
    void run(f);
  };

  // надписи под кнопками площадки — из проекта (в файле их не отличить от картинки)
  const textIssues: ReachIssue[] = useMemo(() => {
    if (!inProject || !report) return [];
    return preflight(project, platform, 1080, noFonts)
      .filter((x) => x.id.startsWith('zone-') || x.id === 'captions-zone')
      .map((x) => ({ id: `pf-${x.id}`, kind: 'text' as const, level: 'worse' as const, title: x.text, why: tx('Зритель не прочитает то, что закрывают кнопки и подпись площадки.'), t0: x.t }));
  }, [inProject, report, project, platform, noFonts]);

  const issues = useMemo(() => (report
    ? sortIssues([...report.issues.filter((i) => i.kind !== 'aspect' && i.kind !== 'long'), ...platformIssues(report, platform), ...textIssues])
    : []), [report, platform, textIssues]);
  const pfLabel = PLATFORMS.find((p) => p.id === platform)?.label ?? '';
  const fixable = issues.some((i) => i.fix);

  const fix = async (i: ReachIssue) => {
    const msg = await applyReachFix(i);
    if (msg) { setDone((d) => ({ ...d, [i.id]: msg })); getState().toast(msg, 'ok'); }
  };
  const show = (i: ReachIssue) => {
    if (i.t0 === undefined) return;
    getState().setSafeZone(platform);
    getState().setPlaying(false);
    getState().setPlayhead(i.t0 + 0.05);
    close();
  };
  const openInKadro = async () => {
    if (!file || !report) return;
    if (await openForFix(file, report)) { setInProject(true); getState().toast(tx('Ролик открыт в Kadro — поправь, что нужно, и сохрани заново'), 'ok'); }
  };
  const name = file?.split(/[\\/]/).pop() ?? '';
  const fixedAny = Object.keys(done).length > 0;

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="modal reach-modal" role="dialog" aria-label={tx('Проверка охватов')} data-testid="reach-dialog">
        <div className="modal-head">
          <h3><ShieldCheck size={18} className="reach-ico" />{tx('Проверка охватов')}</h3>
          <button className="icon-btn" onClick={close} title={tx('Закрыть')} disabled={busy}><X size={17} /></button>
        </div>
        <p className="hint">{tx('Что в ролике мешает площадке его показывать, а зрителям — досматривать. Kadro смотрит сам файл: кадры и звук.')}</p>

        <div className="reach-file">
          {file
            ? <span className="reach-name" title={file}>{name}</span>
            : <span className="hint">{tx('Ролик не выбран')}</span>}
          <button className="btn small" onClick={() => void pick()} disabled={busy} data-testid="reach-pick"><FolderOpen size={13} />{file ? tx('Другой ролик…') : tx('Выбрать ролик…')}</button>
        </div>
        <Seg value={platform} onChange={setPlatform} testId="reach-platform" options={PLATFORMS.map((p) => ({ value: p.id, label: p.label }))} />

        {busy && (
          <div className="reach-busy" data-testid="reach-busy">
            <div className="progress"><div style={{ width: `${Math.round((job?.progress ?? 0.02) * 100)}%` }} /></div>
            <div className="reach-busy-line">
              <span className="hint small">{job?.stage || tx('Проверяю…')}</span>
              {job && <button className="btn small ghost" onClick={() => cancelJob(job.id)}>{tx('Отменить')}</button>}
            </div>
          </div>
        )}

        {report && !busy && (
          <div className="reach-result" data-testid="reach-result">
            {issues.length === 0 ? (
              <div className="reach-ok" data-testid="reach-ok">
                <CheckCircle2 size={22} />
                <div><b>{tx('Ничего не мешает показам в {0}', pfLabel)}</b><p className="hint small">{tx('Водяных знаков, рамки, пустого начала и проблем со звуком нет. Дальше решают идея и первые секунды.')}</p></div>
              </div>
            ) : (
              <>
                <p className="reach-sum" data-testid="reach-sum">
                  {LEVELS.map((l) => ({ l, n: issues.filter((i) => i.level === l.id).length })).filter((x) => x.n).map((x) => (
                    <span key={x.l.id} className={`reach-chip ${x.l.id}`}>{x.l.label()}: {x.n}</span>
                  ))}
                </p>
                {LEVELS.map((l) => {
                  const list = issues.filter((i) => i.level === l.id);
                  if (!list.length) return null;
                  return (
                    <section key={l.id} className={`reach-group ${l.id}`}>
                      <div className="section-title">{l.label()}</div>
                      <ul className="reach-list">
                        {list.map((i) => (
                          <li key={i.id} data-testid="reach-issue" data-kind={i.kind}>
                            {i.box && <MiniFrame box={i.box} w={report.width} h={report.height} />}
                            <div className="reach-text">
                              <b>{i.title}</b>
                              <span className="hint small">{done[i.id] ?? i.why}</span>
                            </div>
                            <div className="reach-btns">
                              {inProject && i.fix && !done[i.id] && <button className="btn small" onClick={() => void fix(i)} data-testid={`reach-fix-${i.kind}`}><Wrench size={13} />{fixLabel(i)}</button>}
                              {done[i.id] && <span className="reach-done"><CheckCircle2 size={14} />{tx('Поправлено')}</span>}
                              {inProject && i.t0 !== undefined && <button className="btn small ghost" onClick={() => show(i)}><Play size={12} />{tx('Показать')}</button>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </>
            )}
            <p className="hint small reach-note">{tx('Это проверка файла, а не обещание просмотров: идея и подача решают больше. Но с такими замечаниями площадке проще ролик не показывать.')}</p>
          </div>
        )}

        <div className="actions">
          {report && !busy && !inProject && fixable && (
            <button className="btn" onClick={() => void openInKadro()} data-testid="reach-open"><Wrench size={15} />{tx('Открыть в Kadro и поправить')}</button>
          )}
          <button className="btn" onClick={close} disabled={busy}>{tx('Закрыть')}</button>
          {file && !busy && (fixedAny
            ? <button className="btn primary" onClick={() => { close(); getState().setExportOpen(true); }} data-testid="reach-export"><Upload size={15} />{tx('Сохранить заново')}</button>
            : <button className="btn primary" onClick={() => void run(file)} data-testid="reach-run"><ShieldCheck size={15} />{report ? tx('Проверить снова') : tx('Проверить')}</button>)}
        </div>
      </div>
    </div>
  );
}
