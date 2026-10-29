// Построение графа FFmpeg для экспорта проекта. Чистая функция — тестируется без Electron.
import { tx } from './i18n';
import { aiSource, audioSource, videoSource } from './ai';
import { hasAnim, kfExpr, maxScale, valueAt } from './anim';
import { animFades, animMaxScale, animMoves, clipAnimAt, clipAnimExpr } from './clipAnim';
import { applyH, focal, hasPerspective, hasTilt, homography, pinQuad, quadSize, tiltExpr } from './perspective';
import { effectiveColor, ffmpegColorFilter } from './color';
import { GRADE_N, gradeActive, gradeTable, haldImage, type CubeLut } from './grade';
import { BLUR_SIGMA_1080, orientedSize, placeOnCanvas, unitScale } from './geometry';
import { clipDuration, mainTrack, projectDuration } from './timeline';
import type { BlendMode, MediaAsset, MediaClip, Project } from './types';
import { maskBytes } from './mask';
import {
  LEAK_PERIOD, SPLIT_EFFECTS, blurSigma, flashDuration, fxGeometryExpr, fxMatrixAt, fxMaxScale, fxMoves, glowOpacity, glowSigma, hueMatrix, leakBytes,
  leakOpacity, letterboxBar, lookKey, lookTable, pixelBlock, rainbowAngle, rgbShiftAt, scanlines, sortedEffects, splitLayout, vignetteBytes,
} from './effects';
import { isGlType } from './gl/glsl';
import { saturateMatrix } from './color';

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
  /** Сохраняет картинку в оттенках серого (маска, виньетка) w × h и возвращает путь к PNG. */
  grayFile?: (name: string, bytes: Uint8Array, w: number, h: number) => string;
  /** Сохраняет цветную картинку (RGB) w × h — таблица цвета Hald CLUT — и возвращает путь к PNG. */
  rgbFile?: (name: string, bytes: Uint8Array, w: number, h: number) => string;
  /** Загруженные файлы LUT (.cube) по пути. */
  luts?: Record<string, CubeLut>;
  /** Прозрачный фон (для группы из наложений): основная дорожка должна быть пустой. */
  transparent?: boolean;
  /** Куски с шейдерами: последовательности PNG W×H (кадры start, start+1/F, …) — поверх всего готового кадра. */
  glSegments?: { start: number; frames: number; pattern: string }[];
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
  if (a.anim?.in || a.anim?.out || b.anim?.in || b.anim?.out) return false;
  // эффекты тоже считаются от начала клипа (вспышка, глитч, тряска)
  if (a.effects?.length || b.effects?.length) return false;
  const extra = (c: MediaClip) => JSON.stringify([c.opacity ?? 1, c.mask ?? null, c.blend ?? 'normal', c.chroma ?? null, c.stab?.path ?? '', c.voice?.path ?? '', c.grade ?? null, c.tilt ?? null, c.pin ?? null]);
  if (extra(a) !== extra(b)) return false;
  return a.assetId === b.assetId && a.speed === b.speed && a.fit === b.fit &&
    JSON.stringify(a.transform) === JSON.stringify(b.transform) &&
    JSON.stringify(a.color) === JSON.stringify(b.color) &&
    a.volume === b.volume && a.muted === b.muted &&
    (videoSource(a)?.path ?? '') === (videoSource(b)?.path ?? '') &&
    (audioSource(a)?.path ?? '') === (audioSource(b)?.path ?? '');
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
  if (total <= 0) throw new Error(tx('Проект пустой — нечего экспортировать'));
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
  function visualChain(src: string, c: MediaClip, asset: MediaAsset, withAlpha: boolean, isMain = false): { label: string; x: number; y: number } {
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
    const fades = animFades(c);
    const opacityPart = () => {
      if (opKfs?.length || fades) {
        // прозрачность меняется во времени (ключи, проявление/растворение): команды фильтру на каждый кадр
        const name = `colorchannelmixer@op${labelN++}`;
        const cmds: string[] = [];
        let prev = NaN;
        const n = Math.ceil(D * F);
        for (let i = 0; i < n; i++) {
          const base = opKfs?.length ? valueAt(opKfs, c.opacity ?? 1, c.in + (i / F) * c.speed) : c.opacity ?? 1;
          const v = Math.min(1, Math.max(0, base * clipAnimAt(c, i / F, D).opacity));
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
      if (!c.mask || !o.grayFile) return;
      const file = o.grayFile(`mask_${c.id}`, maskBytes(c.mask, w, h), w, h);
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

    // 3½) кривые, HSL, свой LUT — одной таблицей (после масштаба: дешевле, а результат тот же)
    const applyGrade = () => {
      const g = c.grade;
      const cube = g?.lut ? o.luts?.[g.lut.path] ?? null : null;
      if (!o.rgbFile || !gradeActive(g, !!cube, c.color)) return;
      const img = haldImage(gradeTable(g ?? {}, cube, GRADE_N, c.color));
      const file = o.rgbFile(`grade_${c.id}`, img.rgb, img.w, img.h);
      const idx = addInput(['-i', file]);
      flush();
      const l = L('gr');
      chains.push(`[${cur}][${idx}:v]haldclut=clut=first:interp=trilinear[${l}]`);
      cur = l;
    };

    // 4) видеоэффекты — на слое нужного размера
    const applyEffects = (w: number, h: number) => {
      const list = sortedEffects(c.effects);
      if (!list.length) return;
      const frames = Math.ceil(D * F);
      const fx = (t: string) => list.find((e) => e.type === t);
      let lookDone = false;
      let matrixDone = false;
      /** Наложение второго потока режимом «экран» (только цвет; прозрачность — как у слоя). */
      const screenOnto = (top: string, op: number) => {
        const out = L('fx');
        const ov = fmt(op);
        chains.push(`[${cur}][${top}]blend=c0_mode=screen:c1_mode=screen:c2_mode=screen:c3_mode=normal:c0_opacity=${ov}:c1_opacity=${ov}:c2_opacity=${ov}:shortest=1,format=rgba[${out}]`);
        cur = out;
      };
      for (const e of list) {
        const a = e.amount;
        switch (e.type) {
          case 'mirrorv': {
            const half = Math.floor(h / 2);
            flush();
            const [x1, x2, tp, bt, out] = [L('fx'), L('fx'), L('fx'), L('fx'), L('fx')];
            chains.push(`[${cur}]split=2[${x1}][${x2}]`);
            chains.push(`[${x1}]crop=${w}:${half}:0:0[${tp}]`);
            chains.push(`[${x2}]crop=${w}:${h - half}:0:0,vflip[${bt}]`);
            chains.push(`[${tp}][${bt}]vstack=inputs=2[${out}]`);
            cur = out;
            break;
          }
          case 'kaleido': {
            const qw = Math.floor(w / 2);
            const qh = Math.floor(h / 2);
            flush();
            const [s1, s2, s3, s4, tl, tr, bl, br, top, bot, out] = Array.from({ length: 11 }, () => L('fx'));
            chains.push(`[${cur}]split=4[${s1}][${s2}][${s3}][${s4}]`);
            chains.push(`[${s1}]crop=${qw}:${qh}:0:0[${tl}]`);
            chains.push(`[${s2}]crop=${w - qw}:${qh}:0:0,hflip[${tr}]`);
            chains.push(`[${s3}]crop=${qw}:${h - qh}:0:0,vflip[${bl}]`);
            chains.push(`[${s4}]crop=${w - qw}:${h - qh}:0:0,hflip,vflip[${br}]`);
            chains.push(`[${tl}][${tr}]hstack=inputs=2[${top}]`);
            chains.push(`[${bl}][${br}]hstack=inputs=2[${bot}]`);
            chains.push(`[${top}][${bot}]vstack=inputs=2[${out}]`);
            cur = out;
            break;
          }
          case 'split2': case 'split3': case 'split4': case 'split9': {
            if (list.some((x) => SPLIT_EFFECTS.includes(x.type) && x !== e && SPLIT_EFFECTS.indexOf(x.type) < SPLIT_EFFECTS.indexOf(e.type))) break;
            const S = splitLayout(e.type, w, h, a);
            const n = S.cols * S.rows;
            flush();
            const tiles = Array.from({ length: n }, () => L('fx'));
            chains.push(`[${cur}]scale=${S.sw}:${S.sh}:flags=bicubic,crop=${S.tw}:${S.th}:${S.cx}:${S.cy},split=${n}${tiles.map((x) => `[${x}]`).join('')}`);
            const layout: string[] = [];
            for (let j = 0; j < S.rows; j++) for (let i = 0; i < S.cols; i++) layout.push(`${i * S.tw}_${j * S.th}`);
            const grid = L('fx');
            chains.push(`${tiles.map((x) => `[${x}]`).join('')}xstack=inputs=${n}:layout=${layout.join('|')}[${grid}]`);
            cur = grid;
            if (S.cols * S.tw !== w || S.rows * S.th !== h) parts.push(`scale=${w}:${h}:flags=bicubic`);
            for (let i = 1; i < S.cols && S.gap > 0; i++) parts.push(`drawbox=x=${i * S.tw - Math.floor(S.gap / 2)}:y=0:w=${S.gap}:h=${h}:color=black:t=fill`);
            for (let j = 1; j < S.rows && S.gap > 0; j++) parts.push(`drawbox=x=0:y=${j * S.th - Math.floor(S.gap / 2)}:w=${w}:h=${S.gap}:color=black:t=fill`);
            break;
          }
          case 'oldfilm': case 'comic': case 'duotone': case 'noir': case 'cyber': case 'thermal': case 'nightvision': case 'solarize': {
            if (lookDone || !o.rgbFile) break;
            lookDone = true;
            const img = haldImage(lookTable(c.effects, GRADE_N));
            const file = o.rgbFile(`look_${c.id}_${lookKey(c.effects).replace(/[^0-9a-z.-]/gi, '_')}`, img.rgb, img.w, img.h);
            const idx = addInput(['-i', file]);
            flush();
            const l = L('fx');
            chains.push(`[${cur}][${idx}:v]haldclut=clut=first:interp=trilinear[${l}]`);
            cur = l;
            break;
          }
          case 'colorpulse': case 'bwflash': case 'strobe': case 'flicker': {
            if (matrixDone) break;
            matrixDone = true;
            const name = `colorchannelmixer@mx${labelN++}`;
            const keys = ['rr', 'rg', 'rb', 'gr', 'gg', 'gb', 'br', 'bg', 'bb'];
            const cmds: string[] = [];
            let prev = '';
            for (let i = 0; i < frames; i++) {
              const m = fxMatrixAt(c.effects, i / F) ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
              const vals = [m[0][0], m[0][1], m[0][2], m[1][0], m[1][1], m[1][2], m[2][0], m[2][1], m[2][2]].map(fmt);
              const key = vals.join(',');
              if (key === prev) continue;
              prev = key;
              cmds.push(`${fmt(i === 0 ? 0 : (i - 0.5) / F)} ${keys.map((k2, j) => `${name} ${k2} ${vals[j]}`).join(', ')}`);
            }
            parts.push(`sendcmd=c='${cmds.join(';')}'`, `${name}=rr=1`);
            break;
          }
          case 'glow': {
            parts.push('format=gbrap');
            flush();
            const [x1, x2, bl] = [L('fx'), L('fx'), L('fx')];
            chains.push(`[${cur}]split=2[${x1}][${x2}]`);
            chains.push(`[${x2}]gblur=sigma=${fmt(glowSigma(w))}[${bl}]`);
            cur = x1;
            screenOnto(bl, glowOpacity(a));
            break;
          }
          case 'lightleak': {
            if (!o.rgbFile) break;
            const file = o.rgbFile(`leak_${w}x${h}`, leakBytes(w, h), 2 * w, h);
            const idx = addInput(['-loop', '1', '-framerate', String(F), '-i', file]);
            parts.push('format=gbrap');
            flush();
            const lk = L('fx');
            chains.push(`[${idx}:v]format=gbrap,crop=w=${w}:h=${h}:x='floor(${w}*(t/${LEAK_PERIOD}-floor(t/${LEAK_PERIOD})))':y=0,setsar=1[${lk}]`);
            screenOnto(lk, leakOpacity(a));
            break;
          }
          case 'letterbox': {
            if (isMain) break; // у клипа основной дорожки полосы — по краям кадра, а не слоя (см. ниже)
            const bar = letterboxBar(h, a);
            parts.push(`drawbox=x=0:y=0:w=${w}:h=${bar}:color=black:t=fill`, `drawbox=x=0:y=${h - bar}:w=${w}:h=${bar}:color=black:t=fill`);
            break;
          }
          case 'mirror': {
            const half = Math.floor(w / 2);
            flush();
            const [x1, x2, l, r, out] = [L('fx'), L('fx'), L('fx'), L('fx'), L('fx')];
            chains.push(`[${cur}]split=2[${x1}][${x2}]`);
            chains.push(`[${x1}]crop=${half}:${h}:0:0[${l}]`);
            chains.push(`[${x2}]crop=${w - half}:${h}:0:0,hflip[${r}]`);
            chains.push(`[${l}][${r}]hstack=inputs=2[${out}]`);
            cur = out;
            break;
          }
          case 'pixelate': { const b = pixelBlock(w, a); parts.push(`pixelize=width=${b}:height=${b}:mode=avg`); break; }
          case 'blur': { const sg = blurSigma(w, a); if (sg > 0.1) parts.push(`gblur=sigma=${fmt(sg)}`); break; }
          case 'invert': { const ex = `'val+(255-2*val)*${fmt(a)}'`; parts.push(`lutrgb=r=${ex}:g=${ex}:b=${ex}`); break; }
          case 'rainbow': {
            const name = `colorchannelmixer@hue${labelN++}`;
            const cmds: string[] = [];
            for (let i = 0; i < frames; i++) {
              const m = hueMatrix(rainbowAngle(e, i / F));
              const keys = ['rr', 'rg', 'rb', 'gr', 'gg', 'gb', 'br', 'bg', 'bb'];
              const vals = [m[0][0], m[0][1], m[0][2], m[1][0], m[1][1], m[1][2], m[2][0], m[2][1], m[2][2]];
              cmds.push(`${fmt(i === 0 ? 0 : (i - 0.5) / F)} ${keys.map((k2, j) => `${name} ${k2} ${fmt(vals[j])}`).join(', ')}`);
            }
            parts.push(`sendcmd=c='${cmds.join(';')}'`, `${name}=rr=1`);
            break;
          }
          case 'vhs': {
            const m = saturateMatrix(1 - 0.35 * a);
            parts.push(`colorchannelmixer=rr=${fmt(m[0][0])}:rg=${fmt(m[0][1])}:rb=${fmt(m[0][2])}:gr=${fmt(m[1][0])}:gg=${fmt(m[1][1])}:gb=${fmt(m[1][2])}:br=${fmt(m[2][0])}:bg=${fmt(m[2][1])}:bb=${fmt(m[2][2])}`);
            const d = Math.max(1, Math.round(w * 0.004 * (0.5 + a)));
            parts.push(`rgbashift=rh=${-d}:bh=${d}:edge=smear`);
            const sl = scanlines(h);
            parts.push(`drawgrid=x=-${sl.thick}:y=0:w=iw+${sl.thick}:h=${sl.period}:t=${sl.thick}:color=black@${fmt(0.3 * a)}`);
            break;
          }
          case 'rgbsplit':
          case 'glitch': {
            if (e.type === 'rgbsplit' && fx('glitch')) break; // вместе — одним фильтром на месте глитча
            if (!fx('glitch')) { const s0 = rgbShiftAt(c.effects, w, 0); parts.push(`rgbashift=rh=${s0.rh}:bh=${s0.bh}:edge=smear`); break; }
            const name = `rgbashift@gl${labelN++}`;
            const cmds: string[] = [];
            let prev = '';
            for (let i = 0; i < frames; i++) {
              const sft = rgbShiftAt(c.effects, w, Math.floor((i / F) * 30 + 1e-6));
              const key = `${sft.rh}|${sft.bh}|${sft.gv}`;
              if (key === prev) continue;
              prev = key;
              cmds.push(`${fmt(i === 0 ? 0 : (i - 0.5) / F)} ${name} rh ${sft.rh}, ${name} bh ${sft.bh}, ${name} gv ${sft.gv}`);
            }
            parts.push(`sendcmd=c='${cmds.join(';')}'`, `${name}=edge=smear`);
            break;
          }
          case 'vignette': {
            if (!o.grayFile) break;
            const file = o.grayFile(`vig_${c.id}_${w}x${h}`, vignetteBytes(w, h, a), w, h);
            const idx = addInput(['-loop', '1', '-framerate', String(F), '-i', file]);
            parts.push('format=gbrap');
            flush();
            const [v, out] = [L('fx'), L('fx')];
            chains.push(`[${idx}:v]format=gbrap,setsar=1[${v}]`);
            chains.push(`[${cur}][${v}]blend=all_mode=multiply:shortest=1,format=rgba[${out}]`);
            cur = out;
            break;
          }
          case 'grain': { const st = Math.max(1, Math.round(18 * a)); parts.push(`noise=c0s=${st}:c1s=${st}:c2s=${st}:c0f=t+u:c1f=t+u:c2f=t+u`); break; }
          case 'flash': parts.push(`fade=t=in:st=0:d=${fmt(flashDuration(a))}:color=white`); break;
        }
      }
    };

    const moving = (['x', 'y', 'scale', 'rotation'] as const).some((pr) => (c.keyframes?.[pr]?.length ?? 0) > 0) || fxMoves(c.effects) || animMoves(c) || hasPerspective(c);
    if (!moving) {
      const pl = placeOnCanvas(W, H, o2.w, o2.h, c.fit, c.transform);
      const sw = Math.max(1, Math.round(pl.w));
      const sh = Math.max(1, Math.round(pl.h));
      parts.push(`scale=${sw}:${sh}:flags=bicubic`);
      applyGrade();
      applyEffects(sw, sh);
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
    const k = c.keyframes ?? {};
    const pl1 = placeOnCanvas(W, H, o2.w, o2.h, c.fit, { x: 0, y: 0, rotation: 0, scale: 1 });
    const tilted = hasTilt(c.tilt);
    const pinQ = c.pin ? pinQuad(c.pin, W, H) : null;
    const big = 3 * Math.max(W, H); // не раздуваем слой больше 3 холстов
    const sm = Math.min(maxScale(c) * fxMaxScale(c.effects) * animMaxScale(c) * (tilted ? 1.35 : 1), big / Math.max(1, pl1.w, pl1.h));
    const plM = placeOnCanvas(W, H, o2.w, o2.h, c.fit, { x: 0, y: 0, rotation: 0, scale: sm });
    const [qw, qh] = pinQ ? quadSize(pinQ) : [plM.w, plM.h];
    const wm = Math.max(2, Math.round(Math.min(qw, big)));
    const hm = Math.max(2, Math.round(Math.min(qh, big)));
    const m = 2;
    const PW = Math.max(W, wm + 2 * m);
    const PH = Math.max(H, hm + 2 * m);
    const T = `((in-1)/${F})`; // in у perspective считается с единицы
    const loc = (t: number) => (t - c.in) / c.speed; // время ключа → время от начала клипа
    const ex = (prop: 'x' | 'y' | 'scale' | 'rotation', base: number) => kfExpr(k[prop], base, T, loc);
    const g0 = fxGeometryExpr(c.effects, T, D);
    const ga = clipAnimExpr(c, T, D);
    const g = { dx: `(${g0.dx}+${ga.dx})`, dy: `(${g0.dy}+${ga.dy})`, drot: `(${g0.drot}+${ga.drot})`, scale: `(${g0.scale}*${ga.scale})` };
    const kk = `((${ex('scale', c.transform.scale)})*${g.scale}/${fmt(sm)})`;
    const X = `(${fmt(W / 2)}+(${ex('x', c.transform.x)}+${g.dx})*${W})`;
    const Y = `(${fmt(H / 2)}+(${ex('y', c.transform.y)}+${g.dy})*${H})`;
    const R = `((${ex('rotation', c.transform.rotation)}+${g.drot})*PI/180)`;
    const f3 = focal(W, H);
    // «Углы»: картинка (без полей) → 4 точки; углы слоя с полями — по тому же проективному преобразованию
    const hPin = pinQ ? homography([[m, m], [m + wm, m], [m, m + hm], [m + wm, m + hm]], pinQ) : null;
    const corner = (u: number, v: number) => {
      if (hPin) { const [px, py] = applyH(hPin, u, v); return [fmt(px), fmt(py)]; }
      let du = `(${fmt(u - m - wm / 2)}*${kk})`;
      let dv = `(${fmt(v - m - hm / 2)}*${kk})`;
      if (tilted) [du, dv] = tiltExpr(du, dv, c.tilt!, f3);
      return [`${X}+${du}*cos(${R})-${dv}*sin(${R})`, `${Y}+${du}*sin(${R})+${dv}*cos(${R})`];
    };
    const [x0, y0] = corner(0, 0);
    const [x1, y1] = corner(PW, 0);
    const [x2, y2] = corner(0, PH);
    const [x3, y3] = corner(PW, PH);
    parts.push(`scale=${wm}:${hm}:flags=bicubic`);
    applyGrade();
    applyEffects(wm, hm);
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
      const vsrc = videoSource(c0);
      const bgr = vsrc?.alpha ? vsrc : null;
      if (g.asset.kind === 'image') {
        const idx = addInput(['-loop', '1', '-framerate', String(F), '-t', fmt(D + 1), '-i', g.asset.path]);
        srcLabel = L('src');
        chains.push(`[${idx}:v]fps=${F},trim=duration=${fmt(D)},setpts=PTS-STARTPTS[${srcLabel}]`);
      } else {
        const path = vsrc ? vsrc.path : g.asset.path;
        const offset = vsrc ? vsrc.offset : 0;
        const lp = vsrc ? null : loopInput(g.asset, g.in);
        const idx = addInput([...thr, ...(bgr ? ['-c:v', 'libvpx-vp9'] : vsrc ? [] : alphaDecoder(g.asset)), ...(lp ? lp.args : []), '-ss', fmt(lp ? lp.ss : g.in - offset), '-t', fmt(g.out - g.in + 0.5), '-i', path]);
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
      const fg = visualChain(fgSrc, c0, g.asset, !!bgr, true);
      const seg = L('seg');
      // кино-полосы клипа основной дорожки — по краям кадра: при заполнении кадра края слоя обрезаны
      const lb = c0.effects?.find((e) => e.type === 'letterbox' && e.amount > 0);
      const bars = lb ? `,drawbox=x=0:y=0:w=${W}:h=${letterboxBar(H, lb.amount)}:color=black:t=fill,drawbox=x=0:y=${H - letterboxBar(H, lb.amount)}:w=${W}:h=${letterboxBar(H, lb.amount)}:color=black:t=fill` : '';
      chains.push(`[${bgLabel}][${fg.label}]overlay=x=${fg.x}:y=${fg.y}:eof_action=repeat:shortest=1${bars},format=yuv420p,setsar=1[${seg}]`);
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
          chains.push(`[${acc}][${segLabels[i]}]xfade=transition=${isGlType(tr.type) ? 'fade' : tr.type}:duration=${fmt(tr.duration)}:offset=${fmt(accDur - tr.duration)}[${nl}]`);
          accDur += groups[i].duration - tr.duration;
        } else {
          // concat отдаёт время в микросекундах, а xfade требует одинаковую шкалу у обоих входов — возвращаем 1/F
          chains.push(`[${acc}][${segLabels[i]}]concat=n=2:v=1:a=0,settb=1/${F}[${nl}]`);
          accDur += groups[i].duration;
        }
        acc = nl;
      }
      mainOut = acc;
    }

    let v = L('v');
    const clear = !!o.transparent && !segLabels.length;
    const ovf = clear ? ':format=auto' : ''; // на прозрачном холсте сохраняем альфу в RGBA
    chains.push(clear
      ? `color=c=black@0:s=${W}x${H}:r=${F}:d=${fmt(total)},format=rgba[${v}]`
      : `color=c=black:s=${W}x${H}:r=${F}:d=${fmt(total)},format=yuv420p[${v}]`);
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
      chains.push(`[${v}][${t}]overlay=x=0:y=0:eof_action=pass${ovf}[${nv}]`);
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
          const vs = videoSource(c);
          const path = vs ? vs.path : asset.path;
          const off = vs ? vs.offset : 0;
          const lp = vs ? null : loopInput(asset, c.in);
          const idx = addInput([...thr, ...(vs?.alpha ? ['-c:v', 'libvpx-vp9'] : vs ? [] : alphaDecoder(asset)), ...(lp ? lp.args : []), '-ss', fmt(lp ? lp.ss : c.in - off), '-t', fmt(c.out - c.in + 0.5), '-i', path]);
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
        chains.push(`[${v}][${shifted}]overlay=x=${fg.x}:y=${fg.y}:eof_action=pass${ovf}:enable='between(t\\,${fmt(c.start)}\\,${fmt(c.start + D)})'[${nv}]`);
        v = nv;
      }
    }

    // ---------- слои текста без привязки к дорожке — поверх всего ----------
    // строки — слои без дорожки; слои частиц (fx:…) — поверх всего, как в плеере
    for (const l of o.textLayers) {
      if (typeof l === 'string') overlayText(l);
      else if (!p.tracks.some((t) => t.id === l.trackId)) overlayText(l.list);
    }
    // ---------- куски с шейдерами: кадр целиком нарисован движком Kadro ----------
    for (const g of o.glSegments ?? []) {
      const idx = addInput(['-framerate', String(F), '-start_number', '0', '-i', g.pattern]);
      const gl = L('gl');
      const end = g.start + g.frames / F;
      chains.push(`[${idx}:v]format=rgba,setpts=PTS-STARTPTS+${fmt(g.start)}/TB[${gl}]`);
      const nv = L('v');
      chains.push(`[${v}][${gl}]overlay=x=0:y=0:eof_action=pass${ovf}:enable='between(t\\,${fmt(g.start)}\\,${fmt(end - 1 / (2 * F))})'[${nv}]`);
      v = nv;
    }
    chains.push(`[${v}]format=${clear ? 'yuva420p' : 'yuv420p'},trim=duration=${fmt(total)},setpts=PTS-STARTPTS[vout]`);

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
      const den = audioSource(c0);
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
      const den = audioSource(c);
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

/** VP8/VP9 с прозрачностью: встроенный декодер FFmpeg альфу теряет, нужен libvpx. */
/** GIF по кругу: вход повторяется бесконечно, начало — внутри первого круга (как остаток в превью). */
function loopInput(a: MediaAsset, inSec: number): { args: string[]; ss: number } | null {
  if (!a.loop || !(a.duration > 0)) return null;
  return { args: ['-stream_loop', '-1'], ss: ((inSec % a.duration) + a.duration) % a.duration };
}

function alphaDecoder(a: MediaAsset): string[] {
  if (!a.alpha) return [];
  return ['-c:v', a.videoCodec === 'vp8' ? 'libvpx' : 'libvpx-vp9'];
}

/** Видео с прозрачностью (группа из наложений): VP9 + Opus в WebM. */
export function alphaEncoderArgs(fps: number, duration: number): string[] {
  return ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', '18', '-b:v', '0', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1',
    '-auto-alt-ref', '0', '-r', String(fps), '-c:a', 'libopus', '-b:a', '192k', '-ar', '48000', '-t', fmt(duration)];
}

export function encoderArgs(enc: 'nvenc' | 'x264', quality: Quality, fps: number, duration: number): string[] {
  const v = enc === 'nvenc'
    ? ['-c:v', 'h264_nvenc', '-preset', quality === 'max' ? 'p7' : quality === 'high' ? 'p5' : 'p4', '-rc', 'vbr',
      '-cq', quality === 'max' ? '18' : quality === 'high' ? '21' : '25', '-b:v', '0']
    : ['-c:v', 'libx264', '-preset', quality === 'max' ? 'slow' : quality === 'high' ? 'medium' : 'veryfast',
      '-crf', quality === 'max' ? '17' : quality === 'high' ? '20' : '23'];
  return [...v, '-pix_fmt', 'yuv420p', '-r', String(fps), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart', '-t', fmt(duration)];
}

/**
 * Полный список аргументов ffmpeg. filterArg — как передать граф: файл (для новых и старых версий FFmpeg).
 * metaFile — файл метаданных FFmpeg с главами (из маркеров): последним входом, главы и название — из него.
 */
export function fullArgs(g: BuiltGraph, filterFile: string, ffmpegMajor: number, enc: 'nvenc' | 'x264' | 'vp9alpha', quality: Quality, fps: number, out: string, metaFile?: string): string[] {
  const filterOpt = ffmpegMajor >= 7 ? ['-/filter_complex', filterFile] : ['-filter_complex_script', filterFile];
  const flat = g.inputs.flat();
  const metaIdx = flat.filter((a) => a === '-i').length;
  return [
    '-hide_banner', '-y', '-nostdin',
    ...flat,
    ...(metaFile ? ['-f', 'ffmetadata', '-i', metaFile] : []),
    ...filterOpt,
    '-map', g.vOut, '-map', g.aOut,
    ...(metaFile ? ['-map_metadata', String(metaIdx), '-map_chapters', String(metaIdx)] : []),
    ...(enc === 'vp9alpha' ? alphaEncoderArgs(fps, g.duration) : encoderArgs(enc, quality, fps, g.duration)),
    '-progress', 'pipe:1', '-nostats',
    out,
  ];
}
