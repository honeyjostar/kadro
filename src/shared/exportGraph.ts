// Построение графа FFmpeg для экспорта проекта. Чистая функция — тестируется без Electron.
import { aiSource } from './ai';
import { hasAnim, kfExpr, maxScale, valueAt } from './anim';
import { effectiveColor, ffmpegColorFilter } from './color';
import { BLUR_SIGMA_1080, orientedSize, placeOnCanvas, unitScale } from './geometry';
import { clipDuration, mainTrack, projectDuration } from './timeline';
import type { BlendMode, MediaAsset, MediaClip, Mask, Project } from './types';

export interface BuildOpts {
  width: number;
  height: number;
  fps: number;
  /** Слои текста: файлы-списки concat (PNG-кадры W×H, покрывают весь ролик с 0).
   *  С trackId — накладываются в порядке дорожек (как в превью); просто строка — поверх всего. */
  textLayers: (string | { trackId: string; list: string })[];
  /** Только звук (для распознавания речи): видео-цепочки не строятся. */
  audioOnly?: boolean;
  /** Брать ли клипы с аудиодорожек (музыку). По умолчанию да. */
  includeMusic?: boolean;
  /** Создаёт PNG-маску клипа размера w × h и возвращает путь (нужен, если в проекте есть маски). */
  maskFile?: (clipId: string, mask: Mask, w: number, h: number) => string;
}

export interface BuiltGraph {
  inputs: string[][];  // для каждого входа: [...опции входа, '-i', путь]
  filter: string;      // filter_complex
  vOut: string;        // метка видеовыхода, например [vout]
  aOut: string;
  duration: number;
}

export const fmt = (n: number): string => {
  const s = (Math.round(n * 1e6) / 1e6).toFixed(6);
  return s.replace(/\.?0+$/, '') || '0';
};

/** Цепочка atempo для скорости 0.25..4 (каждое звено в пределах 0.5..2). */
export function atempoChain(speed: number): string[] {
  const out: string[] = [];
  let s = speed;
  while (s < 0.5 - 1e-9) { out.push('atempo=0.5'); s /= 0.5; }
  while (s > 2 + 1e-9) { out.push('atempo=2'); s /= 2; }
  if (Math.abs(s - 1) > 1e-6) out.push(`atempo=${fmt(s)}`);
  return out;
}

/** Экранирование значения для опций фильтра внутри одинарных кавычек. */
const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "'\\\\''")}'`;

interface Group {
  clips: MediaClip[];
  asset: MediaAsset;
  start: number;    // позиция группы на таймлайне
  duration: number; // длина группы на таймлайне
  in: number;       // начало в исходнике
  out: number;      // конец в исходнике
}

function sameLook(a: MediaClip, b: MediaClip): boolean {
  // анимация привязана ко времени клипа — такие куски не склеиваем в одну группу
  if (hasAnim(a.keyframes) || hasAnim(b.keyframes)) return false;
  const extra = (c: MediaClip) => JSON.stringify([c.opacity ?? 1, c.mask ?? null, c.blend ?? 'normal', c.chroma ?? null, c.stab?.path ?? '', c.voice?.path ?? '']);
  if (extra(a) !== extra(b)) return false;
  return a.assetId === b.assetId && a.speed === b.speed && a.fit === b.fit &&
    JSON.stringify(a.transform) === JSON.stringify(b.transform) &&
    JSON.stringify(a.color) === JSON.stringify(b.color) &&
    a.volume === b.volume && a.muted === b.muted &&
    (aiSource(a, 'removeBg')?.path ?? '') === (aiSource(b, 'removeBg')?.path ?? '') &&
    (aiSource(a, 'denoise')?.path ?? '') === (aiSource(b, 'denoise')?.path ?? '');
}

/** Объединяет соседние куски одного файла (после вырезания пауз) в группы с одним входом FFmpeg. */
export function groupMain(p: Project): Group[] {
  const t = mainTrack(p);
  const groups: Group[] = [];
  for (const c of t.clips) {
    if (c.type !== 'media') continue;
    const asset = p.assets.find((a) => a.id === c.assetId);
    if (!asset) continue;
    const g = groups[groups.length - 1];
    const prev = g?.clips[g.clips.length - 1];
    const canMerge = g && prev && !prev.transitionOut && asset.kind === 'video' && g.asset.kind === 'video' &&
      sameLook(prev, c) && c.in >= prev.out - 1e-4 && prev.fadeOut === 0 && c.fadeIn === 0;
    if (canMerge) {
      g.clips.push(c);
      g.out = c.out;
      g.duration += clipDuration(c);
    } else {
      groups.push({ clips: [c], asset, start: c.start, duration: clipDuration(c), in: c.in, out: c.out });
    }
  }
  return groups;
}

export function buildGraph(p: Project, o: BuildOpts): BuiltGraph {
  const total = projectDuration(p);
  if (total <= 0) throw new Error('Проект пустой — нечего экспортировать');
  const W = o.width;
  const H = o.height;
  const F = o.fps;
  const k = unitScale(W, H);
  const inputs: string[][] = [];
  const chains: string[] = [];
  let labelN = 0;
  const L = (prefix: string) => `${prefix}${labelN++}`;
  const addInput = (args: string[]) => { inputs.push(args); return inputs.length - 1; };
  const many = p.tracks.reduce((n, t) => n + t.clips.length, 0) > 8;
  const thr = many ? ['-threads', '2'] : [];

  const assetOf = (c: MediaClip) => p.assets.find((a) => a.id === c.assetId) as MediaAsset;

  /** Видеопоток клипа/группы: возвращает метку потока RGBA, уже размещённого на холсте (или картинку и место для overlay). */
  function visualChain(src: string, c: MediaClip, asset: MediaAsset, withAlpha: boolean): { label: string; x: number; y: number } {
    void withAlpha;
    const o2 = orientedSize(asset.width, asset.height, 0);
    let cur = src;
    let parts: string[] = ['format=rgba'];
    const flush = () => { const l = L('vc'); chains.push(`[${cur}]${parts.join(',')}[${l}]`); cur = l; parts = []; };
    // 1) хромакей — по исходным цветам
    if (c.chroma) {
      const hex = c.chroma.color.replace('#', '0x');
      parts.push('format=yuva444p', `chromakey=color=${hex}:similarity=${fmt(Math.max(0.01, c.chroma.similarity))}:blend=${fmt(Math.max(0, c.chroma.smoothness))}`, 'format=rgba');
    }
    // 2) цвет
    const col = ffmpegColorFilter(effectiveColor(c.color));
    if (col) parts.push(col);
    const D = clipDuration(c);
    const opKfs = c.keyframes?.opacity;
    const opacityPart = () => {
      if (opKfs?.length) {
        // прозрачность меняется во времени: команды фильтру на каждый кадр анимации
        const name = `colorchannelmixer@op${labelN++}`;
        const cmds: string[] = [];
        let prev = NaN;
        const n = Math.ceil(D * F);
        for (let i = 0; i < n; i++) {
          const v = Math.min(1, Math.max(0, valueAt(opKfs, c.opacity ?? 1, c.in + (i / F) * c.speed)));
          if (Math.abs(v - prev) < 0.002) continue;
          prev = v;
          cmds.push(`${fmt(i === 0 ? 0 : (i - 0.5) / F)} ${name} aa ${fmt(v)}`);
        }
        parts.push(`sendcmd=c='${cmds.join(';')}'`, `${name}=aa=1`);
      } else if ((c.opacity ?? 1) < 0.999) {
        parts.push(`colorchannelmixer=aa=${fmt(c.opacity ?? 1)}`);
      }
    };
    // 3) маска — в рамке клипа нужного размера (умножаем на уже имеющуюся прозрачность)
    const applyMask = (w: number, h: number) => {
      if (!c.mask || !o.maskFile) return;
      const file = o.maskFile(c.id, c.mask, w, h);
      const idx = addInput(['-loop', '1', '-framerate', String(F), '-i', file]);
      parts.push(`fps=${F}`);
      flush();
      const [a, b] = [L('mk'), L('mk')];
      const [al, ml, a2] = [L('mk'), L('mk'), L('mk')];
      chains.push(`[${cur}]split=2[${a}][${b}]`);
      chains.push(`[${b}]alphaextract[${al}]`);
      chains.push(`[${idx}:v]format=gray,scale=${w}:${h},setsar=1[${ml}]`);
      chains.push(`[${al}][${ml}]blend=all_mode=multiply:shortest=1[${a2}]`);
      const out = L('mk');
      chains.push(`[${a}][${a2}]alphamerge[${out}]`);
      cur = out;
    };

    const moving = (['x', 'y', 'scale', 'rotation'] as const).some((pr) => (c.keyframes?.[pr]?.length ?? 0) > 0);
    if (!moving) {
      const pl = placeOnCanvas(W, H, o2.w, o2.h, c.fit, c.transform);
      const sw = Math.max(1, Math.round(pl.w));
      const sh = Math.max(1, Math.round(pl.h));
      parts.push(`scale=${sw}:${sh}:flags=bicubic`);
      applyMask(sw, sh);
      let ow = sw;
      let oh = sh;
      if (Math.abs(c.transform.rotation) > 0.01) {
        const r = (c.transform.rotation * Math.PI) / 180;
        ow = Math.ceil(Math.abs(sw * Math.cos(r)) + Math.abs(sh * Math.sin(r)));
        oh = Math.ceil(Math.abs(sw * Math.sin(r)) + Math.abs(sh * Math.cos(r)));
        parts.push(`rotate=a=${fmt(r)}:c=none:ow=${ow}:oh=${oh}`);
      }
      opacityPart();
      if (!parts.length) parts.push('null');
      const label = L('fg');
      chains.push(`[${cur}]${parts.join(',')}[${label}]`);
      return { label, x: Math.round(pl.cx - ow / 2), y: Math.round(pl.cy - oh / 2) };
    }

    // ---- ключевые кадры: слой в наибольшем масштабе, дальше — перспектива по кадрам ----
    const k = c.keyframes!;
    const pl1 = placeOnCanvas(W, H, o2.w, o2.h, c.fit, { x: 0, y: 0, rotation: 0, scale: 1 });
    const sm = Math.min(maxScale(c), (3 * Math.max(W, H)) / Math.max(1, pl1.w, pl1.h)); // не раздуваем слой больше 3 холстов
    const plM = placeOnCanvas(W, H, o2.w, o2.h, c.fit, { x: 0, y: 0, rotation: 0, scale: sm });
    const wm = Math.max(2, Math.round(plM.w));
    const hm = Math.max(2, Math.round(plM.h));
    const m = 2;
    const PW = Math.max(W, wm + 2 * m);
    const PH = Math.max(H, hm + 2 * m);
    const T = `((in-1)/${F})`; // in у perspective считается с единицы
    const loc = (t: number) => (t - c.in) / c.speed; // время ключа → время от начала клипа
    const ex = (prop: 'x' | 'y' | 'scale' | 'rotation', base: number) => kfExpr(k[prop], base, T, loc);
    const kk = `((${ex('scale', c.transform.scale)})/${fmt(sm)})`;
    const X = `(${fmt(W / 2)}+(${ex('x', c.transform.x)})*${W})`;
    const Y = `(${fmt(H / 2)}+(${ex('y', c.transform.y)})*${H})`;
    const R = `((${ex('rotation', c.transform.rotation)})*PI/180)`;
    const corner = (u: number, v: number) => {
      const du = `(${fmt(u - m - wm / 2)}*${kk})`;
      const dv = `(${fmt(v - m - hm / 2)}*${kk})`;
      return [`${X}+${du}*cos(${R})-${dv}*sin(${R})`, `${Y}+${du}*sin(${R})+${dv}*cos(${R})`];
    };
    const [x0, y0] = corner(0, 0);
    const [x1, y1] = corner(PW, 0);
    const [x2, y2] = corner(0, PH);
    const [x3, y3] = corner(PW, PH);
    parts.push(`scale=${wm}:${hm}:flags=bicubic`);
    applyMask(wm, hm);
    parts.push(
      `pad=${wm + 2 * m}:${hm + 2 * m}:${m}:${m}:color=black@0`,
      `pad=${PW}:${PH}:0:0:color=black@0`,
      `perspective=sense=destination:eval=frame:interpolation=linear:x0='${x0}':y0='${y0}':x1='${x1}':y1='${y1}':x2='${x2}':y2='${y2}':x3='${x3}':y3='${y3}'`,
      `crop=${W}:${H}:0:0`,
    );
    opacityPart();
    const label = L('fg');
    chains.push(`[${cur}]${parts.join(',')}[${label}]`);
    return { label, x: 0, y: 0 };
  }

  /** Режим наложения слоя на то, что под ним (как globalCompositeOperation в превью). */
  const BLEND_FF: Record<Exclude<BlendMode, 'normal'>, string> = {
    multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', add: 'addition',
  };
  function blendOnto(base: string, layer: string, x: number, y: number, mode: Exclude<BlendMode, 'normal'>, start: number, end: number): string {
    // слой на прозрачном холсте во весь ролик, чтобы кадры совпадали с основой один к одному
    const [canvas, full, l1, l2, b1, b2, bg, lg, bl, bla, la, mix, out] = Array.from({ length: 13 }, () => L('bm'));
    chains.push(`color=c=black@0:s=${W}x${H}:r=${F}:d=${fmt(total)},format=rgba[${canvas}]`);
    chains.push(`[${canvas}][${layer}]overlay=x=${x}:y=${y}:eof_action=pass:format=auto:enable='between(t\\,${fmt(start)}\\,${fmt(end)})'[${full}]`);
    chains.push(`[${full}]split=2[${l1}][${l2}]`);
    chains.push(`[${base}]split=2[${b1}][${b2}]`);
    chains.push(`[${b1}]format=gbrp[${bg}]`);
    chains.push(`[${l1}]format=gbrp[${lg}]`);
    chains.push(`[${bg}][${lg}]blend=all_mode=${BLEND_FF[mode]}[${bl}]`);
    chains.push(`[${bl}]format=gbrap[${bla}]`);
    chains.push(`[${l2}]alphaextract[${la}]`);
    chains.push(`[${bla}][${la}]alphamerge[${mix}]`);
    chains.push(`[${b2}][${mix}]overlay=x=0:y=0:eof_action=pass[${out}]`);
    return out;
  }

  // ---------- основная дорожка ----------
  const main = mainTrack(p);
  const groups = main.hidden ? [] : groupMain(p);
  if (!o.audioOnly) {
    const segLabels: string[] = [];
    for (const g of groups) {
      const c0 = g.clips[0];
      const D = g.duration;
      let srcLabel: string;
      const bgr = aiSource(c0, 'removeBg');
      if (g.asset.kind === 'image') {
        const idx = addInput(['-loop', '1', '-framerate', String(F), '-t', fmt(D + 1), '-i', g.asset.path]);
        srcLabel = L('src');
        chains.push(`[${idx}:v]fps=${F},trim=duration=${fmt(D)},setpts=PTS-STARTPTS[${srcLabel}]`);
      } else {
        const path = bgr ? bgr.path : g.asset.path;
        const offset = bgr ? bgr.offset : 0;
        const idx = addInput([...thr, ...(bgr ? ['-c:v', 'libvpx-vp9'] : []), '-ss', fmt(g.in - offset), '-t', fmt(g.out - g.in + 0.5), '-i', path]);
        srcLabel = L('src');
        const half = 0.5 / F;
        const sel = g.clips
          .map((c) => `between(t\\,${fmt(c.in - g.in - half)}\\,${fmt(c.out - g.in - half)})`)
          .join('+');
        const sp = c0.speed;
        chains.push(
          `[${idx}:v]setpts=PTS-STARTPTS,fps=${F},select='${sel}',setpts=N/(${F}*${fmt(sp)})/TB,fps=${F},` +
          `tpad=stop_mode=clone:stop_duration=2,trim=duration=${fmt(D)},setpts=PTS-STARTPTS[${srcLabel}]`,
        );
      }
      // фон под картинкой: цвет проекта или размытая копия
      const bgLabel = L('bg');
      const bgColor = p.settings.background === 'white' ? 'white' : 'black';
      let fgSrc = srcLabel;
      if (p.settings.background === 'blur' && !bgr) {
        const a = L('s');
        const b = L('s');
        chains.push(`[${srcLabel}]split=2[${a}][${b}]`);
        const o2 = orientedSize(g.asset.width, g.asset.height, 0);
        const cov = Math.max(W / o2.w, H / o2.h);
        const cw = Math.ceil(o2.w * cov / 2) * 2;
        const ch = Math.ceil(o2.h * cov / 2) * 2;
        chains.push(`[${a}]scale=${cw}:${ch},crop=${W}:${H},gblur=sigma=${fmt(BLUR_SIGMA_1080 * k)},format=yuv420p[${bgLabel}]`);
        fgSrc = b;
      } else {
        chains.push(`color=c=${bgColor}:s=${W}x${H}:r=${F}:d=${fmt(D)},format=yuv420p[${bgLabel}]`);
      }
      const fg = visualChain(fgSrc, c0, g.asset, !!bgr);
      const seg = L('seg');
      chains.push(`[${bgLabel}][${fg.label}]overlay=x=${fg.x}:y=${fg.y}:eof_action=repeat:shortest=1,format=yuv420p,setsar=1[${seg}]`);
      segLabels.push(seg);
    }

    let mainOut: string | null = null;
    if (segLabels.length) {
      let acc = segLabels[0];
      let accDur = groups[0].duration;
      for (let i = 1; i < segLabels.length; i++) {
        const tr = groups[i - 1].clips[groups[i - 1].clips.length - 1].transitionOut;
        const nl = L('m');
        if (tr && tr.duration > 0) {
          chains.push(`[${acc}][${segLabels[i]}]xfade=transition=${tr.type}:duration=${fmt(tr.duration)}:offset=${fmt(accDur - tr.duration)}[${nl}]`);
          accDur += groups[i].duration - tr.duration;
        } else {
          chains.push(`[${acc}][${segLabels[i]}]concat=n=2:v=1:a=0[${nl}]`);
          accDur += groups[i].duration;
        }
        acc = nl;
      }
      mainOut = acc;
    }

    let v = L('v');
    chains.push(`color=c=black:s=${W}x${H}:r=${F}:d=${fmt(total)},format=yuv420p[${v}]`);
    if (mainOut) {
      const nv = L('v');
      chains.push(`[${v}][${mainOut}]overlay=x=0:y=0:eof_action=pass[${nv}]`);
      v = nv;
    }

    // ---------- наложения (картинка в картинке) ----------
    const overlayText = (list: string) => {
      const idx = addInput(['-f', 'concat', '-safe', '0', '-i', list]);
      const t = L('t');
      chains.push(`[${idx}:v]fps=${F},format=rgba[${t}]`);
      const nv = L('v');
      chains.push(`[${v}][${t}]overlay=x=0:y=0:eof_action=pass[${nv}]`);
      v = nv;
    };
    for (const track of p.tracks) {
      if (track.kind === 'text' && !track.hidden) {
        const layer = o.textLayers.find((l) => typeof l !== 'string' && l.trackId === track.id);
        if (layer && typeof layer !== 'string') overlayText(layer.list);
        continue;
      }
      if (track.kind !== 'video' || track.hidden) continue;
      for (const c of track.clips) {
        if (c.type !== 'media') continue;
        const asset = assetOf(c);
        if (!asset || asset.kind === 'audio') continue;
        const D = clipDuration(c);
        let src: string;
        if (asset.kind === 'image') {
          const idx = addInput(['-loop', '1', '-framerate', String(F), '-t', fmt(D + 1), '-i', asset.path]);
          src = L('o');
          chains.push(`[${idx}:v]fps=${F},trim=duration=${fmt(D)},setpts=PTS-STARTPTS[${src}]`);
        } else {
          const bgr = aiSource(c, 'removeBg');
          const path = bgr ? bgr.path : asset.path;
          const off = bgr ? bgr.offset : 0;
          const idx = addInput([...thr, ...(bgr ? ['-c:v', 'libvpx-vp9'] : []), '-ss', fmt(c.in - off), '-t', fmt(c.out - c.in + 0.5), '-i', path]);
          src = L('o');
          chains.push(`[${idx}:v]setpts=(PTS-STARTPTS)/${fmt(c.speed)},fps=${F},tpad=stop_mode=clone:stop_duration=2,trim=duration=${fmt(D)},setpts=PTS-STARTPTS[${src}]`);
        }
        const fg = visualChain(src, c, asset, true);
        const shifted = L('sh');
        chains.push(`[${fg.label}]setpts=PTS-STARTPTS+${fmt(c.start)}/TB[${shifted}]`);
        if (c.blend && c.blend !== 'normal') {
          v = blendOnto(v, shifted, fg.x, fg.y, c.blend, c.start, c.start + D);
          continue;
        }
        const nv = L('v');
        chains.push(`[${v}][${shifted}]overlay=x=${fg.x}:y=${fg.y}:eof_action=pass:enable='between(t\\,${fmt(c.start)}\\,${fmt(c.start + D)})'[${nv}]`);
        v = nv;
      }
    }

    // ---------- слои текста без привязки к дорожке — поверх всего ----------
    for (const l of o.textLayers) if (typeof l === 'string') overlayText(l);
    chains.push(`[${v}]format=yuv420p,trim=duration=${fmt(total)},setpts=PTS-STARTPTS[vout]`);

  }

  // ---------- звук ----------
  const aLabels: string[] = [];
  const audioChain = (idx: number, sel: string | null, c: MediaClip, D: number, start: number, fadeIn: number, fadeOut: number) => {
    const parts = ['aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo', 'asetpts=PTS-STARTPTS'];
    if (sel) parts.push(`aselect='${sel}'`, 'asetpts=N/SR/TB');
    parts.push(...atempoChain(c.speed));
    if (Math.abs(c.volume - 1) > 1e-6) parts.push(`volume=${fmt(c.volume)}`);
    if (fadeIn > 0.001) parts.push(`afade=t=in:st=0:d=${fmt(fadeIn)}`);
    if (fadeOut > 0.001) parts.push(`afade=t=out:st=${fmt(Math.max(0, D - fadeOut))}:d=${fmt(fadeOut)}`);
    parts.push(`apad=whole_dur=${fmt(D)}`, `atrim=0:${fmt(D)}`, 'asetpts=PTS-STARTPTS');
    const ms = Math.round(start * 1000);
    if (ms > 0) parts.push(`adelay=delays=${ms}:all=1`);
    const lab = L('a');
    chains.push(`[${idx}:a]${parts.join(',')}[${lab}]`);
    aLabels.push(lab);
  };

  if (!main.muted) {
    groups.forEach((g, gi) => {
      const c0 = g.clips[0];
      if (c0.muted || c0.volume <= 0) return;
      const den = aiSource(c0, 'denoise');
      if (!den && !g.asset.hasAudio) return;
      const path = den ? den.path : g.asset.path;
      const off = den ? den.offset : 0;
      const idx = addInput([...thr, '-ss', fmt(g.in - off), '-t', fmt(g.out - g.in + 0.5), '-i', path]);
      const sel = g.clips.map((c) => `between(t\\,${fmt(c.in - g.in)}\\,${fmt(c.out - g.in)})`).join('+');
      const prevTr = gi > 0 ? groups[gi - 1].clips[groups[gi - 1].clips.length - 1].transitionOut : undefined;
      const last = g.clips[g.clips.length - 1];
      const fi = Math.max(c0.fadeIn, prevTr?.duration ?? 0);
      const fo = Math.max(last.fadeOut, last.transitionOut?.duration ?? 0);
      audioChain(idx, g.clips.length > 1 ? sel : null, c0, g.duration, g.start, fi, fo);
    });
  }
  for (const track of p.tracks) {
    if ((track.kind !== 'video' && track.kind !== 'audio') || track.muted) continue;
    if (track.kind === 'audio' && o.includeMusic === false) continue;
    for (const c of track.clips) {
      if (c.type !== 'media' || c.muted || c.volume <= 0) continue;
      const asset = assetOf(c);
      if (!asset || asset.kind === 'image') continue;
      const den = aiSource(c, 'denoise');
      if (!den && !asset.hasAudio) continue;
      const path = den ? den.path : asset.path;
      const off = den ? den.offset : 0;
      const idx = addInput([...thr, '-ss', fmt(c.in - off), '-t', fmt(c.out - c.in + 0.5), '-i', path]);
      audioChain(idx, null, c, clipDuration(c), c.start, c.fadeIn, c.fadeOut);
    }
  }
  if (aLabels.length === 0) {
    chains.push(`anullsrc=r=48000:cl=stereo,atrim=0:${fmt(total)}[aout]`);
  } else if (aLabels.length === 1) {
    chains.push(`[${aLabels[0]}]apad=whole_dur=${fmt(total)},atrim=0:${fmt(total)}[aout]`);
  } else {
    chains.push(`${aLabels.map((l) => `[${l}]`).join('')}amix=inputs=${aLabels.length}:normalize=0:dropout_transition=0:duration=longest,apad=whole_dur=${fmt(total)},atrim=0:${fmt(total)}[aout]`);
  }

  void q;
  return { inputs, filter: chains.join(';\n'), vOut: o.audioOnly ? '' : '[vout]', aOut: '[aout]', duration: total };
}

export type Quality = 'normal' | 'high' | 'max';

export function encoderArgs(enc: 'nvenc' | 'x264', quality: Quality, fps: number, duration: number): string[] {
  const v = enc === 'nvenc'
    ? ['-c:v', 'h264_nvenc', '-preset', quality === 'max' ? 'p7' : quality === 'high' ? 'p5' : 'p4', '-rc', 'vbr',
      '-cq', quality === 'max' ? '18' : quality === 'high' ? '21' : '25', '-b:v', '0']
    : ['-c:v', 'libx264', '-preset', quality === 'max' ? 'slow' : quality === 'high' ? 'medium' : 'veryfast',
      '-crf', quality === 'max' ? '17' : quality === 'high' ? '20' : '23'];
  return [...v, '-pix_fmt', 'yuv420p', '-r', String(fps), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart', '-t', fmt(duration)];
}

/** Полный список аргументов ffmpeg. filterArg — как передать граф: файл (для новых и старых версий FFmpeg). */
export function fullArgs(g: BuiltGraph, filterFile: string, ffmpegMajor: number, enc: 'nvenc' | 'x264', quality: Quality, fps: number, out: string): string[] {
  const filterOpt = ffmpegMajor >= 7 ? ['-/filter_complex', filterFile] : ['-filter_complex_script', filterFile];
  return [
    '-hide_banner', '-y', '-nostdin',
    ...g.inputs.flat(),
    ...filterOpt,
    '-map', g.vOut, '-map', g.aOut,
    ...encoderArgs(enc, quality, fps, g.duration),
    '-progress', 'pipe:1', '-nostats',
    out,
  ];
}
