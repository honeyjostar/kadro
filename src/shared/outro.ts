// Концовка «Сделано в Kadro»: 1,5 секунды в самом конце файла — маскот выскакивает, под ним надпись и адрес сайта.
// Добавляется только в экспорт (копию проекта), проект не меняется.
import { tx } from './i18n';
import { DEFAULT_TRANSFORM, newMediaClip, newTextClip, newTrack } from './defaults';
import { projectDuration } from './timeline';
import type { MediaAsset, MediaClip, Project } from './types';

export const OUTRO_DUR = 1.5;
export const OUTRO_SITE = 'kadro-editor.github.io';

export function withOutro(p: Project, mascot: string): Project {
  const q: Project = structuredClone(p);
  const end = projectDuration(q);
  if (end <= 0) return q;
  const asset: MediaAsset = {
    id: 'kadro_outro', kind: 'image', path: mascot, previewPath: mascot, name: 'Kadro', duration: 0, width: 1080, height: 1080, fps: 30,
    hasVideo: true, hasAudio: false, size: 1, rotation: 0, proxy: 'none', derived: true,
  };
  q.assets.push(asset);
  const vertical = q.settings.height > q.settings.width;
  const pic: MediaClip = newMediaClip(asset, end);
  pic.in = 0;
  pic.out = OUTRO_DUR;
  pic.fit = 'contain';
  pic.transform = { ...DEFAULT_TRANSFORM, scale: vertical ? 0.78 : 0.7, y: vertical ? -0.08 : -0.1 };
  pic.anim = { in: { type: 'pop', dur: 0.3 } };
  const v = newTrack('video');
  v.clips.push(pic);
  const t = newTrack('text');
  const title = newTextClip(end + 0.12, tx('Сделано в Kadro'), { font: 'Unbounded', size: vertical ? 84 : 72, bold: true, color: '#ffffff', strokeWidth: 0, shadow: true, bgOpacity: 0 });
  title.duration = OUTRO_DUR - 0.12;
  title.y = vertical ? 0.7 : 0.8;
  title.anim = { in: { type: 'slideUp', dur: 0.3 } };
  const site = newTextClip(end + 0.3, OUTRO_SITE, { font: 'Onest', size: vertical ? 40 : 34, bold: true, color: '#ff6b9b', strokeWidth: 0, shadow: false, bgOpacity: 0 });
  site.duration = OUTRO_DUR - 0.3;
  site.y = vertical ? 0.76 : 0.89;
  site.anim = { in: { type: 'fade', dur: 0.3 } };
  t.clips.push(title);
  // адрес — своей дорожкой: на одной дорожке клипы не идут одновременно
  const t2 = newTrack('text');
  t2.clips.push(site);
  q.tracks.push(v, t, t2);
  return q;
}
