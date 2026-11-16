// Виджет «Нагрузка ПК»: процессор, память, видеокарта (3D, кодировщик, декодер, видеопамять) и температуры
// с графиками за минуту, что Kadro делает сейчас, что упирается, и пики нагрузки по каждому делу (экспорт, разбор видео…).
import { tx } from '../../shared/i18n';
import { Activity, ChevronDown, ChevronUp, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { addPeaks, bottleneck, type ActivityPeak, type SysSample } from '../../shared/sysmon';
import { api, getState, useStore } from '../store';
import { fmtDur } from '../util';

const N = 60;
const gb = (mb: number) => (mb / 1024).toFixed(mb >= 10240 ? 0 : 1);
const IDLE = () => tx('Без дела');

function Spark({ values, max = 100, color }: { values: (number | null)[]; max?: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const w = cv.width; const h = cv.height;
    ctx.clearRect(0, 0, w, h);
    const pts = values.map((v, i) => [(i / (N - 1)) * w, v === null ? null : h - (Math.min(max, v) / max) * (h - 2) - 1] as const);
    ctx.beginPath();
    let started = false;
    for (const [x, y] of pts) { if (y === null) continue; if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); }
    if (!started) return;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    const last = [...pts].reverse().find((p) => p[1] !== null);
    const first = pts.find((p) => p[1] !== null);
    if (last && first) { ctx.lineTo(last[0], h); ctx.lineTo(first[0], h); ctx.closePath(); ctx.globalAlpha = 0.16; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1; }
  }, [values, max, color]);
  return <canvas ref={ref} className="mon-spark" width={240} height={44} aria-hidden="true" />;
}

const temp = (t: number | null) => (t === null ? '' : ` · ${t}°C`);
const hot = (t: number | null, lim: number) => t !== null && t >= lim;

export function SysMon() {
  const open = useStore((s) => s.monOpen);
  const [hist, setHist] = useState<SysSample[]>([]);
  const [peaks, setPeaks] = useState<ActivityPeak[]>([]);
  const [small, setSmall] = useState(false);
  useEffect(() => {
    if (!open) return;
    api.sysmon(true);
    const off = api.onSysmon((s) => {
      setHist((h) => [...h.slice(-(N - 1)), s]);
      setPeaks((p) => addPeaks(p, s, IDLE()));
    });
    return () => { off(); api.sysmon(false); };
  }, [open]);
  if (!open) return null;
  const s = hist[hist.length - 1];
  const pad = <T,>(xs: T[]) => [...new Array<null>(Math.max(0, N - xs.length)).fill(null), ...xs];
  const neck = s ? bottleneck(s) : null;
  const advice: Record<NonNullable<ReturnType<typeof bottleneck>>, string> = {
    cpu: tx('Процессор загружен полностью. Помогут «Превью: авто», лёгкие копии для 2K/4K и экспорт видеокартой.'),
    ram: tx('Память почти кончилась: закрой браузер и другие программы, для 4K лучше 16 ГБ.'),
    gpu: tx('Видеокарта загружена полностью — шейдерные эффекты и фоны тяжёлые; на превью их можно выключить.'),
    hot: tx('Компьютер сильно греется. Проверь охлаждение; при перегреве он сам снижает скорость.'),
  };
  return (
    <aside className={`sysmon ${small ? 'small' : ''}`} data-testid="sysmon" aria-label={tx('Нагрузка ПК')}>
      <header>
        <Activity size={14} />
        <b>{tx('Нагрузка ПК')}</b>
        <span className={`mon-act ${s?.activity.length ? 'busy' : ''}`} data-testid="sysmon-activity">{s ? (s.activity.length ? s.activity.join(', ') : IDLE()) : tx('Замеряю…')}</span>
        <button className="icon-btn" onClick={() => setSmall(!small)} title={small ? tx('Подробнее') : tx('Свернуть')}>{small ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
        <button className="icon-btn" onClick={() => getState().setMonOpen(false)} title={tx('Закрыть')} data-testid="sysmon-close"><X size={14} /></button>
      </header>
      {s && (
        <>
          <div className="mon-rows">
            <div className="mon-row">
              <span className="k">{tx('Процессор')}</span>
              <span className={`v ${s.cpu >= 95 || hot(s.cpuTemp, 90) ? 'warn' : ''}`} data-testid="sysmon-cpu">{s.cpu}%{temp(s.cpuTemp)}</span>
              {!small && <Spark values={pad(hist.map((x) => x.cpu))} color="#5ab0ff" />}
            </div>
            <div className="mon-row">
              <span className="k">{tx('Память')}</span>
              <span className={`v ${s.ram / s.ramTotal > 0.92 ? 'warn' : ''}`} data-testid="sysmon-ram">{gb(s.ram)} / {gb(s.ramTotal)} {tx('ГБ')}</span>
              {!small && <Spark values={pad(hist.map((x) => x.ram))} max={s.ramTotal} color="#b98cff" />}
            </div>
            <div className="mon-row">
              <span className="k" title={s.gpuName ?? undefined}>{tx('Видеокарта')}</span>
              <span className={`v ${hot(s.gpuTemp, 85) ? 'warn' : ''}`} data-testid="sysmon-gpu">{s.gpu === null ? tx('нет данных') : `${s.gpu}%${temp(s.gpuTemp)}`}</span>
              {!small && s.gpu !== null && <Spark values={pad(hist.map((x) => x.gpu))} color="#4fe0a2" />}
            </div>
            {!small && (s.gpuEnc !== null || s.gpuDec !== null) && (
              <div className="mon-row">
                <span className="k">{tx('Кодировщик / декодер')}</span>
                <span className="v">{s.gpuEnc ?? 0}% / {s.gpuDec ?? 0}%</span>
                <Spark values={pad(hist.map((x) => x.gpuEnc))} color="#ffb547" />
              </div>
            )}
            {!small && s.gpuMem !== null && (
              <div className="mon-row">
                <span className="k">{tx('Видеопамять')}</span>
                <span className="v">{gb(s.gpuMem)}{s.gpuMemTotal ? ` / ${gb(s.gpuMemTotal)}` : ''} {tx('ГБ')}</span>
              </div>
            )}
            {!small && (
              <div className="mon-row">
                <span className="k">{tx('Сам Kadro')}</span>
                <span className="v">{tx('{0}% процессора · {1} ГБ', s.appCpu, gb(s.appRam))}</span>
              </div>
            )}
          </div>
          {neck && <p className="mon-advice" data-testid="sysmon-advice">{advice[neck]}</p>}
          {!small && peaks.length > 0 && (
            <div className="mon-peaks">
              <div className="mon-peaks-head"><span>{tx('Пики по делам')}</span><button className="icon-btn" onClick={() => setPeaks([])} title={tx('Сбросить')}><Trash2 size={13} /></button></div>
              <table data-testid="sysmon-peaks">
                <thead><tr><th>{tx('Дело')}</th><th>{tx('ЦП')}</th><th>{tx('Память')}</th><th>{tx('ГП')}</th><th>{tx('Время')}</th></tr></thead>
                <tbody>
                  {peaks.map((p) => (
                    <tr key={p.label}>
                      <td>{p.label}</td>
                      <td>{p.cpu}%{p.cpuTemp !== null ? ` · ${p.cpuTemp}°` : ''}</td>
                      <td>{gb(p.ram)}</td>
                      <td>{p.gpu === null ? '—' : `${p.gpu}%`}{p.gpuEnc ? ` (${tx('код.')} ${p.gpuEnc}%)` : ''}{p.gpuTemp !== null ? ` · ${p.gpuTemp}°` : ''}</td>
                      <td>{fmtDur(p.secs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!small && s.cpuTemp === null && <p className="hint small mon-note">{tx('Температуру процессора Windows обычно отдаёт только администратору — поэтому её может не быть.')}</p>}
        </>
      )}
    </aside>
  );
}
