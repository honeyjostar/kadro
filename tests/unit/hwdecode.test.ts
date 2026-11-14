// Экспорт: большие видео (2K/4K, H.264/HEVC) декодирует видеокарта — не больше 4 входов; маленькие, с прозрачностью
// и обработанные ИИ — как раньше, процессором.
import { describe, expect, it } from 'vitest';
import { newProject } from '../../src/shared/defaults';
import { buildGraph } from '../../src/shared/exportGraph';
import { addAsset, addToMain } from '../../src/shared/timeline';
import type { MediaAsset, Project } from '../../src/shared/types';

const asset = (id: string, w: number, h: number, codec: string): MediaAsset => ({ id, kind: 'video', path: `/${id}.mp4`, previewPath: `/${id}.mp4`, name: id, duration: 3,
  width: w, height: h, fps: 30, hasVideo: true, hasAudio: false, size: 1, proxy: 'none', videoCodec: codec } as MediaAsset);

function project(list: MediaAsset[]): Project {
  let p = newProject('t', '16:9');
  for (const a of list) p = addToMain(addAsset(p, a), a.id, 99).project;
  return p;
}
const hwInputs = (p: Project, hwDecode: boolean) => buildGraph(p, { width: 1920, height: 1080, fps: 30, textLayers: [], hwDecode }).inputs.filter((x) => x.includes('-hwaccel')).map((x) => x[x.length - 1]);

describe('экспорт: декодирование видеокартой', () => {
  it('2K H.264 и 4K HEVC — видеокартой; 1080p и VP9 — процессором', () => {
    const p = project([asset('qhd', 2560, 1440, 'h264'), asset('uhd', 3840, 2160, 'hevc'), asset('fhd', 1920, 1080, 'h264'), asset('vp9', 3840, 2160, 'vp9')]);
    expect(hwInputs(p, true)).toEqual(['/qhd.mp4', '/uhd.mp4']);
    expect(hwInputs(p, false)).toEqual([]);
  });
  it('не больше 4 входов', () => {
    const p = project(Array.from({ length: 6 }, (_, i) => asset(`u${i}`, 3840, 2160, 'h264')));
    expect(hwInputs(p, true)).toHaveLength(4);
  });
  it('-hwaccel стоит до -i своего входа', () => {
    const g = buildGraph(project([asset('qhd', 2560, 1440, 'h264')]), { width: 1920, height: 1080, fps: 30, textLayers: [], hwDecode: true });
    const inp = g.inputs.find((x) => x.includes('-hwaccel'))!;
    expect(inp.indexOf('-hwaccel')).toBeLessThan(inp.indexOf('-i'));
    expect(inp[inp.indexOf('-hwaccel') + 1]).toBe('auto');
  });
});
