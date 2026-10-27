// Проверка перед публикацией: то, что CapCut и Premiere не подсказывают, а зрители замечают сразу —
// надписи под кнопками TikTok/Reels/Shorts, мелкий текст, текст за краем, не тот формат, слишком длинный ролик,
// видео с низким разрешением, растянутое на большой экспорт.
import { isGlType } from '../shared/gl/glsl';
import { glCatalogLoaded, glDef } from './glRegistry';
import { exportSize } from '../shared/geometry';
import { PLATFORMS, isVertical, zonesHit, type Platform } from '../shared/safezones';
import { textBounds } from '../shared/textRender';
import { clipDuration, projectDuration } from '../shared/timeline';
import type { MediaClip, Project, TextClip } from '../shared/types';
import { fmtDur } from './util';

export interface Issue {
  id: string;
  text: string;
  /** Что показать по кнопке «Показать»: клип и момент. */
  clipId?: string;
  t?: number;
  /** Поправить одной кнопкой. */
  fix?: 'aspect916';
}

let measure: OffscreenCanvasRenderingContext2D | null = null;
function ctx(): OffscreenCanvasRenderingContext2D {
  measure ??= new OffscreenCanvas(8, 8).getContext('2d')!;
  return measure;
}

const short = (s: string) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > 28 ? `${one.slice(0, 26)}…` : one;
};

/** Загрузить шрифты всех надписей проекта: без них ширина текста считается по запасному шрифту. */
export async function ensureFonts(p: Project): Promise<void> {
  const specs = new Set<string>();
  for (const t of p.tracks) for (const c of t.clips) {
    if (c.type !== 'text') continue;
    specs.add(`${c.style.italic ? 'italic ' : ''}${c.style.bold ? 700 : 400} 40px "${c.style.font}"`);
  }
  try { await Promise.all([...specs].map((s) => document.fonts.load(s))); } catch { /* шрифт не нашёлся — считаем по запасному */ }
}

export function preflight(p: Project, platform: Platform | null, exportShort: number): Issue[] {
  const out: Issue[] = [];
  const { width: W, height: H } = p.settings;
  const dur = projectDuration(p);
  const texts = p.tracks.filter((t) => t.kind === 'text' && !t.hidden).flatMap((t) => t.clips) as TextClip[];
  const pf = platform ? PLATFORMS.find((x) => x.id === platform)! : null;

  // формат и длина
  if (pf && !isVertical(W, H)) {
    out.push({ id: 'aspect', text: `Для ${pf.label} нужен вертикальный кадр 9:16, а у проекта ${p.settings.aspect}. По бокам будут чёрные полосы.`, fix: 'aspect916' });
  }
  if (pf && dur > pf.maxSec) out.push({ id: 'long', text: `Ролик длится ${fmtDur(dur)}. ${pf.maxNote}.` });

  // плагины-шейдеры, которых нет на этом компьютере (проект открыли на другом)
  const lost = new Map<string, { clipId: string; t: number }>();
  for (const t of p.tracks) for (const c of t.clips) {
    if (c.type !== 'media') continue;
    const types = [...(c.effects ?? []).map((e) => e.type), ...(c.transitionOut ? [c.transitionOut.type] : [])];
    for (const ty of types) if (isGlType(ty) && (ty.startsWith('plug:') || glCatalogLoaded()) && !glDef(ty) && !lost.has(ty)) lost.set(ty, { clipId: c.id, t: c.start + 0.1 });
  }
  for (const [ty, at] of lost) {
    const name = ty.replace(/^plug:[te]\//, '').replace(/^gl:/, '');
    out.push({ id: `plug-${ty}`, text: `Плагин «${name}» не найден на этом компьютере — ${ty.startsWith('plug:t/') ? 'вместо перехода будет растворение' : 'эффект не попадёт в видео'}. Положи файл плагина в папку плагинов (Настройки → Плагины).`, clipId: at.clipId, t: at.t });
  }

  // надписи
  const cap = { hit: 0, total: 0, first: undefined as TextClip | undefined, zone: '' };
  let titlesShown = 0;
  for (const c of texts) {
    if (!c.text.trim()) continue;
    const b = textBounds(ctx(), c, W, H);
    const r = { x: (b.cx - b.w / 2) / W, y: (b.cy - b.h / 2) / H, w: b.w / W, h: b.h / H };
    const at = c.start + Math.min(0.5, c.duration / 2);
    const isCaption = c.role === 'caption';
    if (pf && isVertical(W, H)) {
      const hits = zonesHit(pf.id, r);
      if (isCaption) {
        cap.total++;
        if (hits.length) { cap.hit++; cap.first ??= c; cap.zone ||= hits[0].label.toLowerCase(); }
      } else if (hits.length && titlesShown < 6) {
        titlesShown++;
        out.push({ id: `zone-${c.id}`, text: `Надпись «${short(c.text)}» (${fmtDur(c.start)}) закроет ${pf.label}: ${hits.map((z) => z.label.toLowerCase()).join(', ')}.`, clipId: c.id, t: at });
      }
    }
    if (!isCaption && (r.x < -0.01 || r.y < -0.01 || r.x + r.w > 1.01 || r.y + r.h > 1.01)) {
      out.push({ id: `edge-${c.id}`, text: `Надпись «${short(c.text)}» (${fmtDur(c.start)}) выходит за край кадра.`, clipId: c.id, t: at });
    }
    const size1080 = c.style.size * (c.scale ?? 1);
    if (!isCaption && size1080 < 34) {
      out.push({ id: `small-${c.id}`, text: `Надпись «${short(c.text)}» мелкая — на телефоне её трудно прочитать. Сделай размер больше 40.`, clipId: c.id, t: at });
    }
  }
  if (cap.hit > 0 && cap.first) {
    out.push({
      id: 'captions-zone',
      text: `Субтитры (${cap.hit} из ${cap.total}) попадают под ${pf!.label}: ${cap.zone}. Подними их выше во вкладке «Субтитры».`,
      clipId: cap.first.id, t: cap.first.start + 0.1,
    });
  }

  // видео с низким разрешением на большом экспорте
  const ex = exportSize(W, H, exportShort);
  const need = Math.min(ex.w, ex.h);
  const seen = new Set<string>();
  for (const t of p.tracks) {
    if (t.hidden || t.kind === 'audio' || t.kind === 'text') continue;
    for (const c of t.clips as MediaClip[]) {
      const a = p.assets.find((x) => x.id === c.assetId);
      if (!a || a.kind === 'audio' || a.derived || seen.has(a.id) || !a.width || !a.height) continue;
      const scale = c.transform.scale;
      const has = Math.min(a.width, a.height);
      // наложение в маленьком окошке может быть мельче — считаем с его масштабом
      if (has * 1.6 < need * Math.min(1, scale) && clipDuration(c) > 0.5) {
        seen.add(a.id);
        out.push({ id: `res-${a.id}`, text: `«${short(a.name)}» — ${has}p, а экспорт ${need}p: картинка будет нечёткой. Выбери разрешение ниже или замени файл.`, clipId: c.id, t: c.start + 0.1 });
      }
    }
  }
  return out;
}
