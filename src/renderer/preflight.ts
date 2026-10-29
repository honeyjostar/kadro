// Проверка перед публикацией: то, что CapCut и Premiere не подсказывают, а зрители замечают сразу —
// надписи под кнопками TikTok/Reels/Shorts, мелкий текст, текст за краем, не тот формат, слишком длинный ролик,
// видео с низким разрешением, растянутое на большой экспорт.
import { tx } from '../shared/i18n';
import { isGlType } from '../shared/gl/glsl';
import { glCatalogLoaded, glDef } from './glRegistry';
import { exportSize } from '../shared/geometry';
import { PLATFORMS, isVertical, zonesHit, type Platform } from '../shared/safezones';
import { textBounds } from '../shared/textRender';
import { clipDuration, projectDuration } from '../shared/timeline';
import type { MediaClip, Project, TextClip } from '../shared/types';
import { fmtDur } from './util';
import { missingFonts } from './userFonts';

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
export async function ensureFonts(p: Project): Promise<string[]> {
  const missing = await missingFonts(p).catch(() => [] as string[]); // свои и системные — подключить к окну
  const specs = new Set<string>();
  for (const t of p.tracks) for (const c of t.clips) {
    if (c.type !== 'text') continue;
    specs.add(`${c.style.italic ? 'italic ' : ''}${c.style.bold ? 700 : 400} 40px "${c.style.font}"`);
  }
  try { await Promise.all([...specs].map((s) => document.fonts.load(s))); } catch { /* шрифт не нашёлся — считаем по запасному */ }
  return missing;
}

export function preflight(p: Project, platform: Platform | null, exportShort: number, noFonts: string[] = []): Issue[] {
  const out: Issue[] = [];
  const { width: W, height: H } = p.settings;
  const dur = projectDuration(p);
  const texts = p.tracks.filter((t) => t.kind === 'text' && !t.hidden).flatMap((t) => t.clips) as TextClip[];

  // шрифты, которых нет ни в Kadro, ни на компьютере (проект с другого компьютера)
  for (const fam of noFonts) {
    const c = texts.find((x) => x.style.font === fam);
    if (!c) continue;
    out.push({ id: `font-${fam}`, clipId: c.id, t: c.start + 0.01, text: tx('Шрифта «{0}» нет на этом компьютере — надпись «{1}» выйдет шрифтом Onest. Перетащи файл шрифта (.ttf, .otf) в окно Kadro — он установится, или выбери другой шрифт.', fam, short(c.text)) });
  }
  const pf = platform ? PLATFORMS.find((x) => x.id === platform)! : null;

  // формат и длина
  if (pf && !isVertical(W, H)) {
    out.push({ id: 'aspect', text: tx('Для {0} нужен вертикальный кадр 9:16, а у проекта {1}. По бокам будут чёрные полосы.', pf.label, p.settings.aspect), fix: 'aspect916' });
  }
  if (pf && dur > pf.maxSec) out.push({ id: 'long', text: tx('Ролик длится {0}. {1}.', fmtDur(dur), pf.maxNote) });

  // плагины-шейдеры, которых нет на этом компьютере (проект открыли на другом)
  const lost = new Map<string, { clipId: string; t: number }>();
  for (const t of p.tracks) for (const c of t.clips) {
    if (c.type !== 'media') continue;
    const types = [...(c.effects ?? []).map((e) => e.type), ...(c.transitionOut ? [c.transitionOut.type] : [])];
    for (const ty of types) if (isGlType(ty) && (ty.startsWith('plug:') || glCatalogLoaded()) && !glDef(ty) && !lost.has(ty)) lost.set(ty, { clipId: c.id, t: c.start + 0.1 });
  }
  for (const [ty, at] of lost) {
    const name = ty.replace(/^plug:[te]\//, '').replace(/^gl:/, '');
    out.push({ id: `plug-${ty}`, text: tx('Плагин «{0}» не найден на этом компьютере — {1}. Положи файл плагина в папку плагинов (Настройки → Плагины).', name, ty.startsWith('plug:t/') ? tx('вместо перехода будет растворение') : tx('эффект не попадёт в видео')), clipId: at.clipId, t: at.t });
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
        out.push({ id: `zone-${c.id}`, text: tx('Надпись «{0}» ({1}) закроет {2}: {3}.', short(c.text), fmtDur(c.start), pf.label, hits.map((z) => z.label.toLowerCase()).join(', ')), clipId: c.id, t: at });
      }
    }
    if (!isCaption && (r.x < -0.01 || r.y < -0.01 || r.x + r.w > 1.01 || r.y + r.h > 1.01)) {
      out.push({ id: `edge-${c.id}`, text: tx('Надпись «{0}» ({1}) выходит за край кадра.', short(c.text), fmtDur(c.start)), clipId: c.id, t: at });
    }
    const size1080 = c.style.size * (c.scale ?? 1);
    if (!isCaption && size1080 < 34) {
      out.push({ id: `small-${c.id}`, text: tx('Надпись «{0}» мелкая — на телефоне её трудно прочитать. Сделай размер больше 40.', short(c.text)), clipId: c.id, t: at });
    }
  }
  if (cap.hit > 0 && cap.first) {
    out.push({
      id: 'captions-zone',
      text: tx('Субтитры ({0} из {1}) попадают под {2}: {3}. Подними их выше во вкладке «Субтитры».', cap.hit, cap.total, pf!.label, cap.zone),
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
        out.push({ id: `res-${a.id}`, text: tx('«{0}» — {1}p, а экспорт {2}p: картинка будет нечёткой. Выбери разрешение ниже или замени файл.', short(a.name), has, need), clipId: c.id, t: c.start + 0.1 });
      }
    }
  }
  return out;
}
