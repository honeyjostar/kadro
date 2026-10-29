import { tx } from '../../shared/i18n';
import { txj } from '../txj';
import { CheckCircle2, ClipboardList, FolderOpen, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { exportSize } from '../../shared/geometry';
import type { AppInfo, ExportResult } from '../../shared/ipc';
import { projectDuration } from '../../shared/timeline';
import type { ExportOptions } from '../../shared/types';
import { copyChapters, staleAiClips } from '../actions';
import { chaptersOf } from '../../shared/markers';
import { renderTextLayers } from '../engine/textExport';
import { renderGlSegments, type GlRender } from '../engine/glExport';
import { api, getState, useStore } from '../store';
import { fmtDur } from '../util';
import { Field, Progress, Seg } from './controls';
import { shortSideOf, sizeFor } from '../../shared/defaults';
import { setSettings } from '../../shared/timeline';
import { PLATFORMS, isVertical, type Platform } from '../../shared/safezones';
import { ensureFonts, preflight, type Issue } from '../preflight';

type Phase = 'setup' | 'running' | 'done' | 'error';

const QUALITY_MBPS: Record<ExportOptions['quality'], number> = { normal: 0.6, high: 1, max: 1.6 };

function estimateMb(w: number, h: number, fps: number, q: ExportOptions['quality'], seconds: number): number {
  // грубая оценка: ~10 Мбит/с на 1080p30 при «высоком» качестве
  const mbps = 10 * ((w * h) / (1920 * 1080)) * Math.sqrt(fps / 30) * QUALITY_MBPS[q];
  return (mbps * seconds) / 8 + seconds * 0.024;
}

let lastOpts: Omit<ExportOptions, 'outPath'> | null = null;

export function ExportDialog() {
  const project = useStore((s) => s.project);
  const close = () => getState().setExportOpen(false);
  const [info, setInfo] = useState<AppInfo | null>(null);
  // разрешение и частота — из настроек проекта (формат кадра под плеером), качество и кодер — как в прошлый раз
  const [opts, setOpts] = useState<Omit<ExportOptions, 'outPath'>>(() => ({
    quality: 'high', encoder: 'auto', ...lastOpts,
    height: shortSideOf(project.settings) as ExportOptions['height'],
    fps: ([24, 25, 30, 50, 60].includes(project.settings.fps) ? project.settings.fps : 30) as ExportOptions['fps'],
  }));
  const [phase, setPhase] = useState<Phase>('setup');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState<ExportResult | null>(null);
  const started = useRef(0);
  const cancelled = useRef(false);
  const [eta, setEta] = useState<number | null>(null);

  useEffect(() => { void api.info().then(setInfo); }, []);
  useEffect(() => { lastOpts = opts; }, [opts]);
  useEffect(() => api.onExportProgress((p) => {
    setProgress(p);
    const el = (Date.now() - started.current) / 1000;
    if (p > 0.03 && el > 2) setEta(Math.max(0, (el / p) * (1 - p)));
  }), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase !== 'running') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  const [platform, setPlatform] = useState<Platform | 'other'>(() => getState().safeZone ?? (isVertical(project.settings.width, project.settings.height) ? 'tiktok' : 'other'));
  const [fontsTick, setFontsTick] = useState(0);
  const [noFonts, setNoFonts] = useState<string[]>([]);
  useEffect(() => { void ensureFonts(project).then((m) => { setNoFonts(m); setFontsTick((x) => x + 1); }); }, [project]);
  const chapters = useMemo(() => chaptersOf(project).length, [project]);
  const issues = useMemo(() => preflight(project, platform === 'other' ? null : platform, opts.height, noFonts), [project, platform, opts.height, fontsTick, noFonts]);
  const showIssue = (i: Issue) => {
    close();
    if (platform !== 'other') getState().setSafeZone(platform);
    if (i.t !== undefined) { getState().setPlaying(false); getState().setPlayhead(i.t); }
    if (i.clipId) getState().select([i.clipId]);
  };
  const fixIssue = (i: Issue) => {
    if (i.fix === 'aspect916') getState().commit((p) => setSettings(p, { aspect: '9:16', ...sizeFor('9:16', shortSideOf(p.settings)) }));
  };
  const duration = projectDuration(project);
  const size = exportSize(project.settings.width, project.settings.height, opts.height);
  const stale = staleAiClips(project);
  const nvenc = info?.nvenc ?? false;

  const start = async () => {
    const outPath = await api.pickExportPath(project.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Kadro');
    if (!outPath) return;
    setPhase('running');
    setProgress(0);
    setEta(null);
    started.current = Date.now();
    cancelled.current = false;
    let gl: GlRender | null = null;
    try {
      setStage(tx('Готовлю текст'));
      const { layers, blank } = await renderTextLayers(project, size.w, size.h, opts.fps, (p) => setProgress(p * 0.05));
      // переходы и эффекты-шейдеры: эти кадры рисует сам Kadro (FFmpeg шейдеры не умеет)
      gl = await renderGlSegments(project, size.w, size.h, opts.fps, (f, d, n) => { setStage(tx('Рисую шейдеры: кадр {0} из {1}', d, n)); setProgress(f); }, () => cancelled.current);
      setStage(tx('Сохраняю видео'));
      setProgress(0);
      const r = await api.startExport({ project, opts: { ...opts, outPath }, textLayers: layers, blankPng: blank, glToken: gl?.token, glSegments: gl?.segments });
      setResult(r);
      setPhase(r.ok ? 'done' : 'error');
    } catch (e) {
      if (gl) api.glFramesDrop(gl.token);
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      setResult({ ok: false, error: aborted ? tx('Экспорт отменён') : e instanceof Error ? e.message : String(e) });
      setPhase('error');
    }
  };

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget && phase !== 'running') close(); }}>
      <div className="modal" role="dialog" aria-label={tx('Экспорт видео')} data-testid="export-dialog">
        <div className="modal-head">
          <h3>{tx('Экспорт видео')}</h3>
          {phase !== 'running' && <button className="icon-btn" onClick={close} title={tx('Закрыть')}><X size={17} /></button>}
        </div>

        {phase === 'setup' && (
          <>
            <p className="hint">{txj('{0} · {1} · MP4 (H.264 + AAC), без водяного знака', project.name, fmtDur(duration))}</p>
            <Field label={tx('Разрешение')} right={<span className="value">{size.w}×{size.h}</span>}>
              <Seg value={opts.height} onChange={(v) => setOpts({ ...opts, height: v })}
                options={[{ value: 720, label: '720p' }, { value: 1080, label: '1080p' }, { value: 1440, label: '2K' }, { value: 2160, label: '4K' }]} />
            </Field>
            <Field label={tx('Кадров в секунду')}>
              <Seg value={opts.fps} onChange={(v) => setOpts({ ...opts, fps: v })} options={[24, 25, 30, 50, 60].map((f) => ({ value: f as ExportOptions['fps'], label: String(f) }))} />
            </Field>
            <Field label={tx('Качество')}>
              <Seg value={opts.quality} onChange={(v) => setOpts({ ...opts, quality: v })}
                options={[{ value: 'normal', label: tx('Обычное') }, { value: 'high', label: tx('Высокое') }, { value: 'max', label: tx('Максимум') }]} />
            </Field>
            <Field label={tx('Чем кодировать')} right={<span className="hint small">{info ? (nvenc ? tx('видеокарта NVIDIA найдена') : tx('видеокарта NVIDIA не найдена')) : tx('проверяю…')}</span>}>
              <Seg value={opts.encoder} onChange={(v) => setOpts({ ...opts, encoder: v })}
                options={[{ value: 'auto', label: tx('Авто') }, { value: 'nvenc', label: tx('Видеокарта') }, { value: 'x264', label: tx('Процессор') }]} />
            </Field>
            <Field label={tx('Куда выкладываешь')}>
              <Seg value={platform} onChange={setPlatform}
                options={[...PLATFORMS.map((x) => ({ value: x.id as Platform | 'other', label: x.label })), { value: 'other', label: tx('Другое') }]} />
            </Field>
            <div className="preflight" data-testid="preflight">
              <div className="preflight-head"><ShieldCheck size={15} />{tx('Проверка перед публикацией')}</div>
              {issues.length === 0
                ? <p className="hint small" data-testid="preflight-ok">{platform === 'other'
                  ? tx('Надписи в кадре, текст читаемый, разрешение файлов подходит.')
                  : tx('Всё в порядке: надписи не попадут под кнопки {0}, формат и длина подходят.', PLATFORMS.find((x) => x.id === platform)!.label)}</p>
                : (
                  <ul className="preflight-list">
                    {issues.map((i) => (
                      <li key={i.id} data-testid="preflight-issue">
                        <TriangleAlert size={14} />
                        <span>{i.text}</span>
                        {i.fix === 'aspect916' && <button className="btn small" onClick={() => fixIssue(i)}>{tx('Сделать 9:16')}</button>}
                        {i.clipId && <button className="btn small" onClick={() => showIssue(i)}>{tx('Показать')}</button>}
                      </li>
                    ))}
                  </ul>
                )}
            </div>
            <p className="hint small">{txj('Примерный размер файла: {0} МБ{1}', Math.max(1, Math.round(estimateMb(size.w, size.h, opts.fps, opts.quality, duration))), chapters ? tx(' · главы из маркеров: {0}', chapters) : '')}</p>
            {stale.length > 0 && (
              <div className="warn"><TriangleAlert size={15} />
                <span>{txj('{0} ИИ-обработка не совпадает с обрезкой — они выйдут без неё. Обработай заново во вкладке «ИИ».', stale.length === 1 ? tx('У одного клипа') : tx('У {0} клипов', stale.length))}</span>
              </div>
            )}
            <div className="actions">
              <button className="btn" onClick={close}>{tx('Отмена')}</button>
              <button className="btn primary" onClick={() => void start()} disabled={duration <= 0} data-testid="export-start">{tx('Экспортировать')}</button>
            </div>
          </>
        )}

        {phase === 'running' && (
          <>
            <p className="hint">{stage}… {Math.round(progress * 100)}%{eta !== null ? tx(' · осталось ~{0}', fmtDur(eta)) : ''}</p>
            <Progress value={progress} />
            <div className="actions">
              <button className="btn" onClick={() => { cancelled.current = true; api.cancelExport(); }} data-testid="export-cancel">{tx('Остановить')}</button>
            </div>
          </>
        )}

        {phase === 'done' && result?.path && (
          <>
            <div className="done-line"><CheckCircle2 size={20} /><span>{txj('Видео готово{0}{1}', result.seconds ? tx(' за {0}', fmtDur(result.seconds)) : '', result.encoder ? ` (${result.encoder === 'nvenc' ? tx('видеокарта') : tx('процессор')})` : '')}</span></div>
            <p className="hint path-line" title={result.path}>{result.path}</p>
            {chapters > 0 && (
              <div className="chapters-line" data-testid="export-chapters">
                <span className="hint small">{txj('Главы из маркеров ({0}) уже в файле — их видно в плеере. Для YouTube вставь их в описание.', chapters)}</span>
                <button className="btn small" onClick={() => void copyChapters()} data-testid="export-copy-chapters"><ClipboardList size={13} />{tx('Скопировать главы')}</button>
              </div>
            )}
            <div className="actions">
              <button className="btn" onClick={close}>{tx('Закрыть')}</button>
              <button className="btn primary" onClick={() => api.showInFolder(result.path!)} data-testid="export-show"><FolderOpen size={15} />{tx('Показать в папке')}</button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="warn"><TriangleAlert size={15} /><span>{result?.error === tx('Экспорт отменён') ? tx('Экспорт остановлен — файл не сохранён.') : tx('Не получилось: {0}', result?.error ?? tx('неизвестная ошибка'))}</span></div>
            <div className="actions">
              <button className="btn" onClick={close}>{tx('Закрыть')}</button>
              <button className="btn primary" onClick={() => setPhase('setup')}>{tx('Попробовать снова')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
