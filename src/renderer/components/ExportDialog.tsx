import { CheckCircle2, FolderOpen, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { exportSize } from '../../shared/geometry';
import type { AppInfo, ExportResult } from '../../shared/ipc';
import { projectDuration } from '../../shared/timeline';
import type { ExportOptions } from '../../shared/types';
import { staleAiClips } from '../actions';
import { renderTextLayers } from '../engine/textExport';
import { api, getState, useStore } from '../store';
import { fmtDur } from '../util';
import { Field, Progress, Seg } from './controls';

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
  const [opts, setOpts] = useState<Omit<ExportOptions, 'outPath'>>(() => lastOpts ?? {
    height: 1080, fps: ([24, 25, 30, 50, 60].includes(project.settings.fps) ? project.settings.fps : 30) as ExportOptions['fps'], quality: 'high', encoder: 'auto',
  });
  const [phase, setPhase] = useState<Phase>('setup');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState<ExportResult | null>(null);
  const started = useRef(0);
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
    try {
      setStage('Готовлю текст');
      const { layers, blank } = await renderTextLayers(project, size.w, size.h, opts.fps, (p) => setProgress(p * 0.05));
      setStage('Сохраняю видео');
      const r = await api.startExport({ project, opts: { ...opts, outPath }, textLayers: layers, blankPng: blank });
      setResult(r);
      setPhase(r.ok ? 'done' : 'error');
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
      setPhase('error');
    }
  };

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget && phase !== 'running') close(); }}>
      <div className="modal" role="dialog" aria-label="Экспорт видео" data-testid="export-dialog">
        <div className="modal-head">
          <h3>Экспорт видео</h3>
          {phase !== 'running' && <button className="icon-btn" onClick={close} title="Закрыть"><X size={17} /></button>}
        </div>

        {phase === 'setup' && (
          <>
            <p className="hint">{project.name} · {fmtDur(duration)} · MP4 (H.264 + AAC), без водяного знака</p>
            <Field label="Разрешение" right={<span className="value">{size.w}×{size.h}</span>}>
              <Seg value={opts.height} onChange={(v) => setOpts({ ...opts, height: v })}
                options={[{ value: 720, label: '720p' }, { value: 1080, label: '1080p' }, { value: 1440, label: '2K' }, { value: 2160, label: '4K' }]} />
            </Field>
            <Field label="Кадров в секунду">
              <Seg value={opts.fps} onChange={(v) => setOpts({ ...opts, fps: v })} options={[24, 25, 30, 50, 60].map((f) => ({ value: f as ExportOptions['fps'], label: String(f) }))} />
            </Field>
            <Field label="Качество">
              <Seg value={opts.quality} onChange={(v) => setOpts({ ...opts, quality: v })}
                options={[{ value: 'normal', label: 'Обычное' }, { value: 'high', label: 'Высокое' }, { value: 'max', label: 'Максимум' }]} />
            </Field>
            <Field label="Чем кодировать" right={<span className="hint small">{info ? (nvenc ? 'видеокарта NVIDIA найдена' : 'видеокарта NVIDIA не найдена') : 'проверяю…'}</span>}>
              <Seg value={opts.encoder} onChange={(v) => setOpts({ ...opts, encoder: v })}
                options={[{ value: 'auto', label: 'Авто' }, { value: 'nvenc', label: 'Видеокарта' }, { value: 'x264', label: 'Процессор' }]} />
            </Field>
            <p className="hint small">Примерный размер файла: {Math.max(1, Math.round(estimateMb(size.w, size.h, opts.fps, opts.quality, duration)))} МБ</p>
            {stale.length > 0 && (
              <div className="warn"><TriangleAlert size={15} />
                <span>{stale.length === 1 ? 'У одного клипа' : `У ${stale.length} клипов`} ИИ-обработка не совпадает с обрезкой — они выйдут без неё. Обработай заново во вкладке «ИИ».</span>
              </div>
            )}
            <div className="actions">
              <button className="btn" onClick={close}>Отмена</button>
              <button className="btn primary" onClick={() => void start()} disabled={duration <= 0} data-testid="export-start">Экспортировать</button>
            </div>
          </>
        )}

        {phase === 'running' && (
          <>
            <p className="hint">{stage}… {Math.round(progress * 100)}%{eta !== null ? ` · осталось ~${fmtDur(eta)}` : ''}</p>
            <Progress value={progress} />
            <div className="actions">
              <button className="btn" onClick={() => api.cancelExport()} data-testid="export-cancel">Остановить</button>
            </div>
          </>
        )}

        {phase === 'done' && result?.path && (
          <>
            <div className="done-line"><CheckCircle2 size={20} /><span>Видео готово{result.seconds ? ` за ${fmtDur(result.seconds)}` : ''}{result.encoder ? ` (${result.encoder === 'nvenc' ? 'видеокарта' : 'процессор'})` : ''}</span></div>
            <p className="hint path-line" title={result.path}>{result.path}</p>
            <div className="actions">
              <button className="btn" onClick={close}>Закрыть</button>
              <button className="btn primary" onClick={() => api.showInFolder(result.path!)} data-testid="export-show"><FolderOpen size={15} />Показать в папке</button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="warn"><TriangleAlert size={15} /><span>{result?.error === 'Экспорт отменён' ? 'Экспорт остановлен — файл не сохранён.' : `Не получилось: ${result?.error ?? 'неизвестная ошибка'}`}</span></div>
            <div className="actions">
              <button className="btn" onClick={close}>Закрыть</button>
              <button className="btn primary" onClick={() => setPhase('setup')}>Попробовать снова</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
