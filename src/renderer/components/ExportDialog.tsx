import { tx } from '../../shared/i18n';
import { txj } from '../txj';
import { CheckCircle2, ClipboardList, FolderOpen, ImageDown, ScanEye, ShieldCheck, Star, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { exportSize } from '../../shared/geometry';
import { stickerShortSide, TG_STICKER } from '../../shared/tgSticker';
import type { ExportResult } from '../../shared/ipc';
import { encoderLabel, reasonText, type HwInfo } from '../../shared/hw';
import { projectDuration } from '../../shared/timeline';
import type { ExportFormat, ExportOptions } from '../../shared/types';
import { GITHUB_PAGE } from '../../shared/links';
import { checkRetention, copyChapters, staleAiClips } from '../actions';
import { RetentionItem } from './Retention';
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
import { EXTRA_FORMATS, extraPath, sameAsProject, variantProject, type ExtraFormatId } from '../../shared/formats';

type Phase = 'setup' | 'running' | 'done' | 'error';

const QUALITY_MBPS: Record<ExportOptions['quality'], number> = { normal: 0.6, high: 1, max: 1.6 };

function estimateMb(w: number, h: number, fps: number, q: ExportOptions['quality'], seconds: number): number {
  // грубая оценка: ~10 Мбит/с на 1080p30 при «высоком» качестве
  const mbps = 10 * ((w * h) / (1920 * 1080)) * Math.sqrt(fps / 30) * QUALITY_MBPS[q];
  return (mbps * seconds) / 8 + seconds * 0.024;
}

let lastOpts: Omit<ExportOptions, 'outPath'> | null = null;
let lastExtras: ExtraFormatId[] = [];
const FMT = (id: ExtraFormatId) => EXTRA_FORMATS.find((f) => f.id === id)!;

const VIDEO_FPS = [24, 25, 30, 50, 60] as const;
const GIF_FPS = [10, 15, 24] as const;
const GIF_SIZES = [360, 480, 720] as const;
/** GIF длиннее — тяжёлый файл, лучше MP4. */
const GIF_LONG_SEC = 15;

/** Размер и частота под формат: у GIF свои (меньше), у видео — как в проекте. */
function fitFormat(o: Omit<ExportOptions, 'outPath'>, f: ExportFormat, projShort: number, projFps: number, proj?: { width: number; height: number }): Omit<ExportOptions, 'outPath'> {
  // видеостикер Telegram: размер и частота — по правилам Telegram, фон по умолчанию прозрачный
  if (f === 'sticker') return { ...o, format: f, height: stickerShortSide(proj?.width ?? 1080, proj?.height ?? 1920), fps: 30, alpha: o.format === 'sticker' ? o.alpha : true };
  if (f === 'gif') {
    return { ...o, format: f,
      height: (GIF_SIZES as readonly number[]).includes(o.height) ? o.height : 480,
      fps: (GIF_FPS as readonly number[]).includes(o.fps) ? o.fps : 15 };
  }
  return { ...o, format: f, alpha: undefined,
    height: o.height >= 720 && o.format !== 'sticker' ? o.height : (projShort as ExportOptions['height']),
    fps: (VIDEO_FPS as readonly number[]).includes(o.fps) ? o.fps : ((VIDEO_FPS as readonly number[]).includes(projFps) ? projFps : 30) as ExportOptions['fps'] };
}

export function ExportDialog() {
  const project = useStore((s) => s.project);
  const close = () => getState().setExportOpen(false);
  const [hw, setHw] = useState<HwInfo | null>(null);
  // разрешение и частота — из настроек проекта (формат кадра под плеером), качество и кодер — как в прошлый раз
  const [opts, setOpts] = useState<Omit<ExportOptions, 'outPath'>>(() => {
    const base: Omit<ExportOptions, 'outPath'> = {
      quality: 'high', mp3Kbps: 192, ...lastOpts, encoder: lastOpts?.encoder === 'nvenc' ? 'gpu' : lastOpts?.encoder ?? 'auto',
      height: shortSideOf(project.settings) as ExportOptions['height'],
      fps: ([24, 25, 30, 50, 60].includes(project.settings.fps) ? project.settings.fps : 30) as ExportOptions['fps'],
    };
    // GIF помнит свой размер и частоту с прошлого раза
    if (base.format === 'gif' && lastOpts) return fitFormat({ ...base, height: lastOpts.height, fps: lastOpts.fps }, 'gif', shortSideOf(project.settings), project.settings.fps);
    if (base.format === 'sticker') return fitFormat(base, 'sticker', shortSideOf(project.settings), project.settings.fps, project.settings);
    return base;
  });
  const format: ExportFormat = opts.format ?? 'mp4';
  const setFormat = (f: ExportFormat) => setOpts((o) => fitFormat(o, f, shortSideOf(project.settings), project.settings.fps, project.settings));
  const [star, setStar] = useState<'ask' | 'thanks' | 'hidden'>('ask');
  const retention = useStore((s) => s.retention);
  const [retBusy, setRetBusy] = useState(false);
  const title = format === 'gif' ? tx('Экспорт в GIF') : format === 'mp3' ? tx('Экспорт звука') : format === 'sticker' ? tx('Видеостикер Telegram') : tx('Экспорт видео');
  const [phase, setPhase] = useState<Phase>('setup');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState<ExportResult | null>(null);
  const started = useRef(0);
  const cancelled = useRef(false);
  const [eta, setEta] = useState<number | null>(null);
  // ещё форматы: тот же ролик сразу в 9:16 / 16:9 / 1:1 / кружок Telegram — файлами рядом с основным
  const [extras, setExtras] = useState<ExtraFormatId[]>(() => lastExtras.filter((id) => !sameAsProject(project, FMT(id))));
  useEffect(() => { lastExtras = extras; }, [extras]);
  const [extraDone, setExtraDone] = useState<{ label: string; path?: string; error?: string }[]>([]);

  useEffect(() => { void api.hardware().then(setHw); }, []);
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
  // какая видеокарта будет кодировать — или почему не будет
  const bestGpu = hw?.best ? hw.gpus.find((g) => ({ nvenc: 'nvidia', amf: 'amd', qsv: 'intel', mf: '' }[hw.best!] === g.vendor)) ?? hw.gpus[0] : undefined;
  const failed = hw && !hw.best ? hw.encoders.find((e) => e.id !== 'mf') ?? hw.encoders[0] : undefined;
  const hwShort = !hw ? tx('проверяю видеокарту…') : hw.best ? tx('кодирует {0}', bestGpu?.name ?? encoderLabel(hw.best)) : tx('видеокарта не кодирует');
  const hwWhy = hw && !hw.best && failed && hw.gpus.length ? tx('{0}: {1}', hw.gpus[0].name, reasonText(failed, hw.gpus)) : '';

  const start = async () => {
    const outPath = await api.pickExportPath(project.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Kadro', format);
    if (!outPath) return;
    setPhase('running');
    setProgress(0);
    setEta(null);
    started.current = Date.now();
    cancelled.current = false;
    let gl: GlRender | null = null;
    try {
      // только звук: кадры не нужны
      if (format === 'mp3') {
        setStage(tx('Сохраняю звук'));
        const r = await api.startExport({ project, opts: { ...opts, outPath }, textLayers: [], blankPng: new Uint8Array() });
        if (r.ok) getState().markExported();
        setResult(r);
        setPhase(r.ok ? 'done' : 'error');
        return;
      }
      setStage(tx('Готовлю текст'));
      const { layers, blank } = await renderTextLayers(project, size.w, size.h, opts.fps, (p) => setProgress(p * 0.05));
      // переходы и эффекты-шейдеры: эти кадры рисует сам Kadro (FFmpeg шейдеры не умеет)
      gl = await renderGlSegments(project, size.w, size.h, opts.fps, (f, d, n) => { setStage(tx('Рисую шейдеры: кадр {0} из {1}', d, n)); setProgress(f); }, () => cancelled.current);
      setStage(format === 'gif' ? tx('Сохраняю GIF') : format === 'sticker' ? tx('Сохраняю стикер') : tx('Сохраняю видео'));
      setProgress(0);
      const r = await api.startExport({ project, opts: { ...opts, outPath }, textLayers: layers, blankPng: blank, glToken: gl?.token, glSegments: gl?.segments });
      if (r.ok) getState().markExported();
      // ещё форматы — по очереди, теми же настройками
      const done: { label: string; path?: string; error?: string }[] = [];
      if (r.ok && format === 'mp4') {
        const list = extras.filter((id) => !sameAsProject(project, FMT(id)));
        for (let i = 0; i < list.length && !cancelled.current; i++) {
          const f = FMT(list[i]);
          const q = variantProject(project, f, opts.height);
          const short = f.short ?? opts.height;
          const sz = exportSize(q.settings.width, q.settings.height, short);
          setStage(tx('Формат {0} ({1} из {2})', f.label, i + 1, list.length));
          setProgress(0);
          const tl = await renderTextLayers(q, sz.w, sz.h, opts.fps, () => undefined);
          const g2 = await renderGlSegments(q, sz.w, sz.h, opts.fps, (fr) => setProgress(fr), () => cancelled.current);
          setProgress(0);
          const r2 = await api.startExport({ project: q, opts: { ...opts, height: short, maxSec: f.maxSec, outPath: extraPath(outPath, f) }, textLayers: tl.layers, blankPng: tl.blank, glToken: g2?.token, glSegments: g2?.segments });
          done.push({ label: f.label, path: r2.ok ? r2.path : undefined, error: r2.ok ? undefined : r2.error });
        }
      }
      setExtraDone(done);
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
      <div className="modal" role="dialog" aria-label={title} data-testid="export-dialog">
        <div className="modal-head">
          <h3>{title}</h3>
          {phase !== 'running' && <button className="icon-btn" onClick={close} title={tx('Закрыть')}><X size={17} /></button>}
        </div>

        {phase === 'setup' && (
          <>
            <p className="hint">{`${project.name} · ${fmtDur(duration)} · ${format === 'gif' ? tx('GIF без звука, по кругу') : format === 'mp3' ? tx('MP3 — только звук') : format === 'sticker' ? tx('WebM без звука, 512 px, до 3 с') : tx('MP4 (H.264 + AAC), без водяного знака')}`}</p>
            <Field label={tx('Формат')}>
              <Seg value={format} onChange={setFormat} testId="export-format"
                options={[{ value: 'mp4', label: tx('Видео MP4') }, { value: 'gif', label: 'GIF' }, { value: 'mp3', label: tx('Звук MP3') }, { value: 'sticker', label: tx('Стикер ТГ') }]} />
            </Field>
            {format === 'sticker' && (
              <>
                <Field label={tx('Фон')} right={<span className="value">{size.w}×{size.h}</span>}>
                  <Seg value={opts.alpha ? 'clear' : 'frame'} onChange={(v) => setOpts({ ...opts, alpha: v === 'clear' })} testId="export-sticker-bg"
                    options={[{ value: 'clear', label: tx('Прозрачный') }, { value: 'frame', label: tx('Как в ролике') }]} />
                </Field>
                {opts.alpha && <p className="hint small">{tx('Прозрачным будет всё, где нет кадра: вырезанный человек (удаление фона во вкладке «ИИ»), надписи, стикеры и 3D — без фона.')}</p>}
                {duration > TG_STICKER.maxSec + 0.05 && <p className="hint small" data-testid="export-sticker-long">{tx('Ролик длиннее 3 секунд — в стикер войдут первые 3.')}</p>}
                <p className="hint small">{tx('Telegram: 512 px, до 3 секунд, без звука, до 256 КБ — Kadro подгонит сам. Готовый файл отправь боту @Stickers: /newvideo — новый набор, /addsticker — в свой.')}</p>
              </>
            )}
            {format === 'gif' && (
              <>
                <Field label={tx('Размер')} right={<span className="value">{size.w}×{size.h}</span>}>
                  <Seg value={opts.height} onChange={(v) => setOpts({ ...opts, height: v })} testId="export-gif-size"
                    options={GIF_SIZES.map((h) => ({ value: h as ExportOptions['height'], label: `${h}p` }))} />
                </Field>
                <Field label={tx('Кадров в секунду')}>
                  <Seg value={opts.fps} onChange={(v) => setOpts({ ...opts, fps: v })} options={GIF_FPS.map((f) => ({ value: f as ExportOptions['fps'], label: String(f) }))} />
                </Field>
                {duration > GIF_LONG_SEC && <p className="hint small" data-testid="export-gif-long">{tx('GIF длиннее {0} секунд получится тяжёлым — для длинных роликов лучше MP4.', GIF_LONG_SEC)}</p>}
              </>
            )}
            {format === 'mp3' && (
              <Field label={tx('Качество')}>
                <Seg value={opts.mp3Kbps ?? 192} onChange={(v) => setOpts({ ...opts, mp3Kbps: v })} testId="export-mp3-kbps"
                  options={[128, 192, 320].map((k) => ({ value: k as 128 | 192 | 320, label: tx('{0} кбит/с', k) }))} />
              </Field>
            )}
            {format === 'mp4' && (<>
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
            <Field label={tx('Чем кодировать')} right={<span className="hint small" data-testid="export-hw">{hwShort}</span>}>
              <Seg value={opts.encoder === 'nvenc' ? 'gpu' : opts.encoder} onChange={(v) => setOpts({ ...opts, encoder: v })} testId="export-encoder"
                options={[{ value: 'auto', label: tx('Авто') }, { value: 'gpu', label: tx('Видеокарта') }, { value: 'x264', label: tx('Процессор') }]} />
              {hwWhy && <p className="hint small bad" data-testid="export-hw-why">{hwWhy} {tx('Подробнее — в настройках, раздел «Компьютер».')}</p>}
            </Field>
            <Field label={tx('Куда выкладываешь')}>
              <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value as Platform | 'other')} data-testid="export-platform">
                {PLATFORMS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                <option value="other">{tx('Другое')}</option>
              </select>
            </Field>
            <Field label={tx('Ещё форматы — сразу, теми же настройками')}>
              <div className="chips" data-testid="export-extras">
                {EXTRA_FORMATS.map((f) => {
                  const same = sameAsProject(project, f);
                  const on = extras.includes(f.id) && !same;
                  return (
                    <button key={f.id} className={on ? 'active' : ''} disabled={same} data-testid={`extra-${f.id}`}
                      title={same ? tx('Это формат проекта — основной файл') : f.where}
                      onClick={() => setExtras(on ? extras.filter((x) => x !== f.id) : [...extras, f.id])}>{f.label}</button>
                  );
                })}
              </div>
              <p className="hint small">{extras.length
                ? extras.filter((id) => !sameAsProject(project, FMT(id))).map((id) => `${FMT(id).label}: ${FMT(id).where}`).join(' · ')
                : tx('Тот же ролик в другом формате кадра — отдельными файлами рядом с основным. Где видео не заполняет кадр — размытый фон.')}</p>
              {extras.includes('tgcircle') && (
                <p className="hint small" data-testid="extra-circle-note">{tx('Кружок: Telegram показывает кругом видеосообщения. Файл сделан по их правилам — квадрат 640×640, до 60 секунд; отправь его через бота, который делает кружки из видео, или как обычное видео.')}</p>
              )}
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
              <div className="preflight-ret">
                <button className="btn small" disabled={retBusy || duration <= 0} data-testid="export-retention"
                  onClick={() => { setRetBusy(true); void checkRetention().finally(() => setRetBusy(false)); }}>
                  <ScanEye size={13} />{retBusy ? tx('Смотрю ролик…') : tx('Где пролистнут?')}
                </button>
                {!retention && !retBusy && <span className="hint small">{tx('Kadro посмотрит ролик глазами TikTok и покажет, где зритель может смахнуть дальше.')}</span>}
                {retention && !retention.length && <span className="hint small" data-testid="export-retention-ok">{tx('Слабых мест не нашёл: начало цепляет, планы меняются, звук в порядке.')}</span>}
              </div>
              {!!retention?.length && (
                <ul className="preflight-list ret-list" data-testid="export-retention-list">
                  {retention.map((i) => <li key={i.id}><ScanEye size={14} /><RetentionItem i={i} onShow={close} /></li>)}
                </ul>
              )}
            </div>
            <p className="hint small">{txj('Примерный размер файла: {0} МБ{1}', Math.max(1, Math.round(estimateMb(size.w, size.h, opts.fps, opts.quality, duration))), chapters ? tx(' · главы из маркеров: {0}', chapters) : '')}</p>
            </>)}
            {format === 'mp3' && <p className="hint small">{txj('Примерный размер файла: {0} МБ', Math.max(0.1, Math.round(((opts.mp3Kbps ?? 192) * duration) / 8 / 100) / 10))}</p>}
            {format !== 'mp3' && stale.length > 0 && (
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
            <div className="done-line"><CheckCircle2 size={20} /><span>{`${format === 'gif' ? tx('GIF готов') : format === 'mp3' ? tx('Звук готов') : format === 'sticker' ? tx('Стикер готов') : tx('Видео готово')}${result.seconds ? tx(' за {0}', fmtDur(result.seconds)) : ''}${result.encoder ? ` (${encoderLabel(result.encoder)})` : ''}`}</span></div>
            <p className="hint path-line" title={result.path}>{result.path}</p>
            {extraDone.length > 0 && (
              <ul className="extra-done" data-testid="export-extra-done">
                {extraDone.map((x) => (
                  <li key={x.label}>
                    {x.path ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
                    <span>{x.label}</span>
                    {x.path
                      ? <button className="btn small ghost" title={x.path} onClick={() => api.showInFolder(x.path!)}><FolderOpen size={13} />{tx('Показать')}</button>
                      : <span className="hint small">{x.error}</span>}
                  </li>
                ))}
              </ul>
            )}
            {result.askStar && star === 'ask' && (
              <div className="star-ask" data-testid="star-ask">
                <Star size={22} fill="currentColor" className="star-ico" />
                <b>{tx('Нравится Kadro?')}</b>
                <p>{tx('Поставь звезду на GitHub — так Kadro заметят больше людей.')}</p>
                <div className="star-btns">
                  <button className="btn small primary" data-testid="star-yes" onClick={() => { void api.openUrl(GITHUB_PAGE); api.starDone(); setStar('thanks'); }}>
                    <Star size={13} />{tx('Поставить звезду')}
                  </button>
                  <button className="btn small ghost" data-testid="star-later" onClick={() => setStar('hidden')}>{tx('Не сейчас')}</button>
                </div>
              </div>
            )}
            {result.askStar && star === 'thanks' && (
              <div className="star-ask thanks" data-testid="star-thanks">
                <Star size={22} fill="currentColor" className="star-ico" />
                <b>{tx('Спасибо!')}</b>
                <p>{tx('Страница Kadro открылась в браузере — звезда в правом верхнем углу.')}</p>
              </div>
            )}
            {chapters > 0 && (
              <div className="chapters-line" data-testid="export-chapters">
                <span className="hint small">{txj('Главы из маркеров ({0}) уже в файле — их видно в плеере. Для YouTube вставь их в описание.', chapters)}</span>
                <button className="btn small" onClick={() => void copyChapters()} data-testid="export-copy-chapters"><ClipboardList size={13} />{tx('Скопировать главы')}</button>
              </div>
            )}
            <div className="actions">
              {format === 'mp4' && <button className="btn" onClick={() => { close(); getState().setCoverOpen(true); }} data-testid="export-cover"><ImageDown size={15} />{tx('Обложка')}</button>}
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
