// «Проверка охватов»: готовый ролик глазами площадки — что режет показы (чужой водяной знак, заставка другого
// приложения в конце, видео в чёрной рамке как у записи с экрана) и что портит досмотры (пустое начало, тишина,
// перегруз или слишком тихий звук, мыло, мало кадров, не тот формат). Только по самому файлу: кадрам и звуку.
// Оценки «вирусности» нет намеренно — честно говорим только о том, что видно в файле.
import { tx } from './i18n';
import { PLATFORMS, type Platform } from './safezones';

/** cut — площадка урезает показы; worse — хуже досматривают; tip — совет. */
export type ReachLevel = 'cut' | 'worse' | 'tip';
export type ReachFix = 'hideMark' | 'trimStart' | 'trimEnd' | 'loudnorm' | 'fill' | 'vertical' | 'sharper';
export type ReachKind = 'mark' | 'text' | 'endcard' | 'frame' | 'deadStart' | 'blackStart' | 'silence' | 'quiet' | 'loud' | 'clip' | 'noAudio' | 'lowRes' | 'bitrate' | 'fps' | 'aspect' | 'long';
export interface Box { x: number; y: number; w: number; h: number }
export interface ReachIssue {
  id: string;
  kind: ReachKind;
  level: ReachLevel;
  title: string;
  why: string;
  /** где в ролике (сек) */
  t0?: number;
  t1?: number;
  /** область кадра (доли) — для водяного знака */
  box?: Box;
  fix?: ReachFix;
  /** для trimStart/trimEnd: до какой секунды (с какой) резать; для fill — доля полей */
  at?: number;
}
export interface ReachMeta { duration: number; width: number; height: number; fps: number; mbps: number; hasAudio: boolean }
export interface ReachInput extends ReachMeta {
  /** кадры в градациях серого fw×fh, через step секунд */
  frames: Uint8Array[];
  fw: number;
  fh: number;
  step: number;
  /** громкость (RMS 0…1) через rmsStep секунд */
  rms: number[];
  rmsStep: number;
  /** EBU R128: интегральная громкость, LUFS, и истинный пик, дБ */
  lufs: number | null;
  peak: number | null;
}
export interface ReachReport extends ReachMeta {
  lufs: number | null;
  peak: number | null;
  issues: ReachIssue[];
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const secs = (t: number) => (t < 60 ? tx('{0} с', (Math.round(t * 10) / 10).toString()) : `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`);

// ---------- водяные знаки и логотипы ----------
/** Порог «пиксель изменился» между соседними кадрами (уровни серого). */
const CHANGED = 10;

/**
 * Неподвижные островки с рисунком (логотип, надпись) поверх меняющейся картинки: пиксель почти не меняется весь отрезок,
 * у него чёткие края, а клетки вокруг меняются. Неподвижный фон со штатива не считается — вокруг него тоже ничего не меняется.
 */
export function staticIslands(frames: Uint8Array[], fw: number, fh: number): Box[] {
  const n = frames.length;
  if (n < 4) return [];
  const N = fw * fh;
  const moving = new Uint8Array(N); // сколько раз пиксель заметно изменился
  const mean = new Float32Array(N);
  for (let k = 0; k < n; k++) {
    const f = frames[k];
    for (let i = 0; i < N; i++) mean[i] += f[i];
    if (k) { const p = frames[k - 1]; for (let i = 0; i < N; i++) if (Math.abs(f[i] - p[i]) > CHANGED) moving[i]++; }
  }
  for (let i = 0; i < N; i++) mean[i] /= n;
  const steps = n - 1;
  const cs = Math.max(6, Math.round(Math.min(fw, fh) / 14)); // клетка ≈ 1/14 короткой стороны
  const gx = Math.floor(fw / cs), gy = Math.floor(fh / cs);
  if (gx < 4 || gy < 4) return [];
  const stillCell = new Float32Array(gx * gy); // доля неподвижных пикселей с краями
  const dynCell = new Float32Array(gx * gy);   // доля меняющихся пикселей
  for (let cy = 0; cy < gy; cy++) for (let cx = 0; cx < gx; cx++) {
    let still = 0, dyn = 0, cnt = 0;
    for (let y = cy * cs; y < (cy + 1) * cs; y++) for (let x = cx * cs; x < (cx + 1) * cs; x++) {
      const i = y * fw + x;
      cnt++;
      const mv = moving[i] / steps;
      if (mv > 0.45) dyn++;
      if (mv <= 0.12 && x > 0 && y > 0 && x < fw - 1 && y < fh - 1) {
        const g = Math.abs(mean[i + 1] - mean[i - 1]) + Math.abs(mean[i + fw] - mean[i - fw]);
        if (g > 28) still++;
      }
    }
    stillCell[cy * gx + cx] = still / cnt;
    dynCell[cy * gx + cx] = dyn / cnt;
  }
  // всё кругом стоит — сцена неподвижна, отличить логотип от фона нельзя
  let dynAll = 0;
  for (let i = 0; i < dynCell.length; i++) dynAll += dynCell[i];
  if (dynAll / dynCell.length < 0.12) return [];
  const mark = new Uint8Array(gx * gy);
  for (let cy = 0; cy < gy; cy++) for (let cx = 0; cx < gx; cx++) {
    const k = cy * gx + cx;
    if (stillCell[k] < 0.1 || dynCell[k] > 0.6) continue;
    // знаки — у краёв кадра (внешние 30% по ширине или высоте)
    const fx = (cx + 0.5) / gx, fy = (cy + 0.5) / gy;
    if (fx > 0.3 && fx < 0.7 && fy > 0.3 && fy < 0.7) continue;
    let ring = 0, dynRing = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= gx || y >= gy) continue;
      ring++;
      if (dynCell[y * gx + x] > 0.35) dynRing++;
    }
    if (ring && dynRing / ring >= 0.5) mark[k] = 1;
  }
  // соседние клетки — в одну рамку
  const seen = new Uint8Array(gx * gy);
  const out: Box[] = [];
  for (let k = 0; k < mark.length; k++) {
    if (!mark[k] || seen[k]) continue;
    const st = [k]; seen[k] = 1;
    let x0 = gx, y0 = gy, x1 = -1, y1 = -1, cells = 0;
    while (st.length) {
      const c = st.pop()!;
      const cx = c % gx, cy = Math.floor(c / gx);
      cells++;
      x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= gx || y >= gy) continue;
        const q = y * gx + x;
        if (mark[q] && !seen[q]) { seen[q] = 1; st.push(q); }
      }
    }
    const w = (x1 - x0 + 1) / gx, h = (y1 - y0 + 1) / gy;
    if (cells < 2 || w * h > 0.15) continue;
    // запас по краю: клетка грубее самого знака
    const pad = 0.5 / Math.max(gx, gy);
    out.push({ x: clamp(x0 / gx - pad, 0, 1), y: clamp(y0 / gy - pad, 0, 1), w: Math.min(1, w + 2 * pad), h: Math.min(1, h + 2 * pad) });
  }
  return out;
}

const iou = (a: Box, b: Box) => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return i / Math.max(1e-9, a.w * a.h + b.w * b.h - i);
};

/** Водяные знаки по всему ролику: окна по 6 с с шагом 3 с, одинаковые рамки соседних окон — в один знак со временем. */
export function findMarks(frames: Uint8Array[], fw: number, fh: number, step: number, duration: number): { box: Box; t0: number; t1: number }[] {
  const win = Math.max(4, Math.round(6 / step));
  const hop = Math.max(2, Math.round(win / 2));
  const tracks: { box: Box; t0: number; t1: number; hits: number }[] = [];
  for (let s = 0; s < frames.length; s += hop) {
    const part = frames.slice(s, Math.min(frames.length, s + win));
    if (part.length < 4) break;
    const t0 = s * step, t1 = Math.min(duration, (s + part.length) * step);
    for (const b of staticIslands(part, fw, fh)) {
      const tr = tracks.find((x) => x.t1 >= t0 - 0.01 && iou(x.box, b) > 0.3);
      if (tr) {
        tr.t1 = Math.max(tr.t1, t1); tr.hits++;
        // рамка — общая на всё время (знак может чуть «дышать»)
        const x0 = Math.min(tr.box.x, b.x), y0 = Math.min(tr.box.y, b.y);
        tr.box = { x: x0, y: y0, w: Math.max(tr.box.x + tr.box.w, b.x + b.w) - x0, h: Math.max(tr.box.y + tr.box.h, b.y + b.h) - y0 };
      } else tracks.push({ box: b, t0, t1, hits: 1 });
    }
    if (s + win >= frames.length) break;
  }
  // знак держится: минимум 5 секунд или почти весь короткий ролик
  return tracks.filter((x) => x.t1 - x.t0 >= Math.min(5, duration * 0.6)).map(({ box, t0, t1 }) => ({ box, t0: r2(t0), t1: r2(t1) }));
}

// ---------- кадр целиком ----------
const meanOf = (f: Uint8Array) => { let s = 0; for (let i = 0; i < f.length; i++) s += f[i]; return s / f.length; };
const diffOf = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

/** Тёмный кадр: почти всё темнее 30. */
function darkShare(f: Uint8Array): number { let d = 0; for (let i = 0; i < f.length; i++) if (f[i] < 30) d++; return d / f.length; }

/** Чёрные поля сверху+снизу или слева+справа (доля кадра), если они есть в этом кадре. */
export function barsOf(f: Uint8Array, fw: number, fh: number): number {
  const rowDark = (y: number) => { let s = 0, mx = 0; for (let x = 0; x < fw; x++) { const v = f[y * fw + x]; s += v; if (v > mx) mx = v; } return s / fw < 16 && mx < 40; };
  const colDark = (x: number) => { let s = 0, mx = 0; for (let y = 0; y < fh; y++) { const v = f[y * fw + x]; s += v; if (v > mx) mx = v; } return s / fh < 16 && mx < 40; };
  let top = 0; while (top < fh / 2 && rowDark(top)) top++;
  let bot = 0; while (bot < fh / 2 && rowDark(fh - 1 - bot)) bot++;
  let left = 0; while (left < fw / 2 && colDark(left)) left++;
  let right = 0; while (right < fw / 2 && colDark(fw - 1 - right)) right++;
  // кадр целиком тёмный — это не рамка
  if (top >= fh / 2 || left >= fw / 2) return 0;
  const v = top > 1 && bot > 1 ? (top + bot) / fh : 0;
  const h = left > 1 && right > 1 ? (left + right) / fw : 0;
  return Math.max(v, h);
}

// ---------- проверка ----------
export function analyzeReach(inp: ReachInput, platform: Platform | null): ReachReport {
  const { frames, fw, fh, step, duration: D } = inp;
  const out: ReachIssue[] = [];

  // чужие водяные знаки
  const marks = findMarks(frames, fw, fh, step, D);
  marks.slice(0, 3).forEach((m, i) => {
    const corner = `${m.box.y + m.box.h / 2 < 0.5 ? tx('сверху') : tx('снизу')} ${m.box.x + m.box.w / 2 < 0.5 ? tx('слева') : tx('справа')}`;
    out.push({
      id: `mark-${i}`, kind: 'mark', level: 'cut', t0: m.t0, t1: m.t1, box: m.box, fix: 'hideMark',
      title: tx('Похоже на водяной знак или логотип: {0}, {1}–{2}', corner, secs(m.t0), secs(m.t1)),
      why: tx('Площадки меньше показывают ролики со знаками других приложений и площадок (TikTok, CapCut): это признак перезалива. Если ролик твой — лучше выгрузи исходник без знака или закрой знак.'),
    });
  });

  // заставка другого приложения в конце: тёмный кадр с небольшим светлым рисунком после обычной картинки
  if (frames.length >= 6) {
    let k = frames.length;
    while (k > 0 && darkShare(frames[k - 1]) > 0.82) k--;
    const tail = (frames.length - k) * step;
    const lit = frames.slice(k).some((f) => { let b = 0; for (let i = 0; i < f.length; i++) if (f[i] > 140) b++; return b / f.length > 0.004; });
    if (k > 2 && tail >= 1 && tail <= 6 && lit) {
      out.push({
        id: 'endcard', kind: 'endcard', level: 'cut', t0: r2(k * step), t1: r2(D), fix: 'trimEnd', at: r2(k * step),
        title: tx('В конце — тёмная заставка с логотипом ({0})', secs(tail)),
        why: tx('Так заканчиваются ролики, сохранённые из CapCut или скачанные из TikTok. Площадки видят в этом перезалив, а зрители уходят раньше конца — досмотров меньше.'),
      });
    }
  }

  // видео в чёрной рамке
  if (frames.length) {
    const bars = frames.map((f) => barsOf(f, fw, fh));
    const framed = bars.filter((b) => b > 0.12);
    if (framed.length / frames.length > 0.6) {
      const share = framed.reduce((a, b) => a + b, 0) / framed.length;
      out.push({
        id: 'frame', kind: 'frame', level: 'cut', fix: 'fill', at: r2(share),
        title: tx('Видео в чёрной рамке: поля занимают {0}% кадра', Math.round(share * 100)),
        why: tx('Так выглядят записи чужого видео с экрана — площадки считают это перезаливом. И картинка на телефоне выходит мелкой. Растяни видео на весь кадр.'),
      });
    }
  }

  // начало: чёрный экран и «ничего не происходит» в первые 2 секунды
  const at = (t: number) => clamp(Math.round(t / step), 0, Math.max(0, frames.length - 1));
  if (frames.length >= 3) {
    let b = 0;
    while (b < frames.length && meanOf(frames[b]) < 14) b++;
    const black = b * step;
    if (b > 0 && black >= 0.5 && b < frames.length) {
      out.push({
        id: 'blackStart', kind: 'blackStart', level: 'worse', t0: 0, t1: r2(black), fix: 'trimStart', at: r2(black),
        title: tx('Ролик начинается с чёрного экрана ({0})', secs(black)),
        why: tx('Первую секунду зритель решает, листать или нет. Чёрный экран в начале — самый частый повод пролистать.'),
      });
    } else {
      const hasSound = inp.hasAudio && inp.rms.length > 0;
      const med = hasSound ? [...inp.rms].sort((x, y) => x - y)[Math.floor(inp.rms.length / 2)] : 0;
      const loudAt = (t: number) => hasSound && (inp.rms[clamp(Math.round(t / inp.rmsStep), 0, inp.rms.length - 1)] ?? 0) > Math.max(0.01, 0.5 * med);
      const moveAt = (k: number) => k > 0 && diffOf(frames[k], frames[k - 1]) > 4;
      const e2 = at(Math.min(2, D));
      let motion = 0;
      for (let k = 1; k <= e2; k++) motion = Math.max(motion, diffOf(frames[k], frames[k - 1]));
      let sound = false;
      for (let t = 0; t < Math.min(2, D); t += inp.rmsStep) if (loudAt(t)) { sound = true; break; }
      if (D > 4 && motion < 4 && !sound) {
        // где начинается действие: движение или звук
        let first = -1;
        for (let k = 1; k < frames.length; k++) if (moveAt(k) || loudAt(k * step)) { first = (k - 1) * step; break; }
        const can = first >= 1 && first <= Math.min(8, D / 3);
        out.push({
          id: 'deadStart', kind: 'deadStart', level: 'worse', t0: 0, t1: 2, ...(can ? { fix: 'trimStart' as const, at: r2(first) } : {}),
          title: can ? tx('Первые {0} почти ничего не происходит', secs(first)) : tx('Первые 2 секунды почти ничего не происходит'),
          why: tx('Ни движения, ни звука — первые секунды решают, досмотрят ли ролик. Начни сразу с действия, фразы или самого яркого момента.'),
        });
      }
    }
  }

  // звук
  if (!inp.hasAudio) {
    out.push({ id: 'noAudio', kind: 'noAudio', level: 'worse', title: tx('В ролике нет звука'), why: tx('Ролики без звука выглядят недоделанными и досматриваются хуже. Добавь музыку или голос.') });
  } else {
    if (inp.lufs !== null && inp.lufs < -20) {
      out.push({ id: 'quiet', kind: 'quiet', level: 'worse', fix: 'loudnorm', title: tx('Ролик тихий: {0} LUFS', inp.lufs.toFixed(1)), why: tx('Соседние ролики в ленте звучат громче, около −14 LUFS. Включи «Выровнять громкость для соцсетей» и сохрани заново.') });
    } else if (inp.lufs !== null && inp.lufs > -9) {
      out.push({ id: 'loud', kind: 'loud', level: 'worse', fix: 'loudnorm', title: tx('Ролик слишком громкий: {0} LUFS', inp.lufs.toFixed(1)), why: tx('Площадка сама приглушит его, а звук станет плоским. Выровняй громкость для соцсетей — около −14 LUFS.') });
    }
    if (inp.peak !== null && inp.peak > -0.3) {
      out.push({ id: 'clip', kind: 'clip', level: 'worse', fix: 'loudnorm', title: tx('Перегруз звука: пики {0} дБ', inp.peak.toFixed(1)), why: tx('Пики выше 0 дБ на телефоне хрипят, особенно после сжатия площадкой. Выравнивание громкости держит пики не выше −1,5 дБ.') });
    }
    // долгая тишина внутри ролика (не в первые 2 секунды — про них выше)
    const quiet = 0.004;
    let run = -1, best: [number, number] | null = null;
    for (let i = 0; i <= inp.rms.length; i++) {
      const silent = i < inp.rms.length && inp.rms[i] < quiet;
      if (silent && run < 0) run = i;
      if (!silent && run >= 0) {
        const a = run * inp.rmsStep, b = i * inp.rmsStep;
        if (a >= 2 && b - a >= 3 && (!best || b - a > best[1] - best[0])) best = [a, b];
        run = -1;
      }
    }
    if (best) out.push({ id: 'silence', kind: 'silence', level: 'worse', t0: r2(best[0]), t1: r2(best[1]), title: tx('Тишина {0} с на {1}', Math.round(best[1] - best[0]), secs(best[0])), why: tx('На паузах без звука зрители листают дальше. Убери паузу или подложи музыку.') });
  }

  // картинка и формат
  const short = Math.min(inp.width, inp.height);
  if (short && short < 720) {
    out.push({ id: 'lowRes', kind: 'lowRes', level: 'worse', fix: 'sharper', title: tx('Низкое разрешение: {0}×{1}', inp.width, inp.height), why: tx('Площадки охотнее показывают чёткие ролики, а после их сжатия 480p превращается в мыло. Сохрани в 1080p.') });
  }
  const bpp = inp.width && inp.height && inp.fps ? (inp.mbps * 1e6) / (inp.width * inp.height * inp.fps) : 1;
  if (inp.mbps > 0 && bpp < 0.03) {
    out.push({ id: 'bitrate', kind: 'bitrate', level: 'worse', fix: 'sharper', title: tx('Видео сильно сжато: {0} Мбит/с', inp.mbps.toFixed(1)), why: tx('Площадка сожмёт его ещё раз — появятся квадраты и мыло. Сохрани с качеством «Высокое».') });
  }
  if (inp.fps && inp.fps < 23.5) {
    out.push({ id: 'fps', kind: 'fps', level: 'tip', title: tx('Мало кадров в секунду: {0}', Math.round(inp.fps)), why: tx('Движение будет дёрганым. Для соцсетей — 30 кадров в секунду.') });
  }
  const meta: ReachMeta = { duration: D, width: inp.width, height: inp.height, fps: inp.fps, mbps: inp.mbps, hasAudio: inp.hasAudio };
  return {
    ...meta, lufs: inp.lufs, peak: inp.peak, issues: sortIssues([...out, ...platformIssues(meta, platform)]),
  };
}

const RANK: Record<ReachLevel, number> = { cut: 0, worse: 1, tip: 2 };
/** Сначала то, что режет показы, потом — досмотры, потом — советы. */
export const sortIssues = (xs: ReachIssue[]) => [...xs].sort((a, b) => RANK[a.level] - RANK[b.level]);

/** Замечания, которые зависят от площадки: формат кадра и длина (площадку можно сменить без новой проверки). */
export function platformIssues(m: ReachMeta, platform: Platform | null): ReachIssue[] {
  const pf = platform ? PLATFORMS.find((x) => x.id === platform) ?? null : null;
  if (!pf) return [];
  const out: ReachIssue[] = [];
  if (m.width > m.height * 1.05) {
    out.push({ id: 'aspect', kind: 'aspect', level: 'worse', fix: 'vertical', title: tx('Горизонтальное видео для {0}', pf.label), why: tx('В ленте оно выйдет маленьким с полями сверху и снизу. Сделай кадр 9:16.') });
  }
  if (m.duration > pf.maxSec) out.push({ id: 'long', kind: 'long', level: 'cut', title: tx('Ролик длится {0}', secs(m.duration)), why: `${pf.maxNote}.` });
  return out;
}

/** Размер кадров для разбора: короткая сторона 144 (знак в углу — не меньше 20 точек), чётные стороны. */
export function scanSize(w: number, h: number): { fw: number; fh: number } {
  const s = 144;
  if (!w || !h) return { fw: s, fh: s };
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  return w <= h ? { fw: s, fh: even((s * h) / w) } : { fw: even((s * w) / h), fh: s };
}

/** Сколько кадров в секунду брать: 2, но не больше ~360 кадров на весь ролик. */
export const scanFps = (duration: number) => clamp(360 / Math.max(1, duration), 0.25, 2);
