// Построение графа FFmpeg для экспорта проекта. Чистая функция — тестируется без Electron.
import { aiSource } from './ai';
import { effectiveColor, ffmpegColorFilter } from './color';
import { BLUR_SIGMA_1080, orientedSize, placeOnCanvas, unitScale } from './geometry';
import { clipDuration, mainTrack, projectDuration } from './timeline';
import type { MediaAsset, MediaClip, Project } from './types';

export interface BuildOpts {
  width: number;
  height: number;
  fps: number;
  /** Слои текста: файлы-списки concat (PNG-кадры W×H, покрывают весь ролик с 0). */
  textLayers: string[];
  /** Только звук (для распознавания речи): видео-цепочки не строятся. */
  audioOnly?: boolean;
  /** Брать ли клипы с аудиодорожек (музыку). По умолчанию да. */
  includeMusic?: boolean;
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

  /** Видеопоток клипа/группы: возвращает метку потока RGBA с картинкой, уже отмасштабированной под холст. */
  function visualChain(src: string, c: MediaClip, asset: MediaAsset, withAlpha: boolean): { label: string; x: number; y: number } {
    const o2 = orientedSize(asset.width, asset.height, 0);
    const pl = placeOnCanvas(W, H, o2.w, o2.h, c.fit, c.transform);
    const sw = Math.max(1, Math.round(pl.w));
    const sh = Math.max(1, Math.round(pl.h));
    const parts: string[] = ['format=rgba'];
    const col = ffmpegColorFilter(effectiveColor(c.color));
    if (col) parts.push(col);
    parts.push(`scale=${sw}:${sh}:flags=bicubic`);
    let ow = sw;
    let oh = sh;
    if (Math.abs(c.transform.rotation) > 0.01) {
      const r = (c.transform.rotation * Math.PI) / 180;
      ow = Math.ceil(Math.abs(sw * Math.cos(r)) + Math.abs(sh * Math.sin(r)));
      oh = Math.ceil(Math.abs(sw * Math.sin(r)) + Math.abs(sh * Math.cos(r)));
      parts.push(`rotate=a=${fmt(r)}:c=none:ow=${ow}:oh=${oh}`);
    }
    void withAlpha;
    const label = L('fg');
    chains.push(`[${src}]${parts.join(',')}[${label}]`);
    return { label, x: Math.round(pl.cx - ow / 2), y: Math.round(pl.cy - oh / 2) };
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
    for (const track of p.tracks) {
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
        const nv = L('v');
        chains.push(`[${v}][${shifted}]overlay=x=${fg.x}:y=${fg.y}:eof_action=pass:enable='between(t\\,${fmt(c.start)}\\,${fmt(c.start + D)})'[${nv}]`);
        v = nv;
      }
    }

    // ---------- текст и субтитры ----------
    for (const list of o.textLayers) {
      const idx = addInput(['-f', 'concat', '-safe', '0', '-i', list]);
      const t = L('t');
      chains.push(`[${idx}:v]fps=${F},format=rgba[${t}]`);
      const nv = L('v');
      chains.push(`[${v}][${t}]overlay=x=0:y=0:eof_action=pass[${nv}]`);
      v = nv;
    }
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
