import { describe, expect, it } from 'vitest';
import { stickerArgs, stickerShortSide, stickerSize, TG_STICKER } from '../../src/shared/tgSticker';
import { exportSize } from '../../src/shared/geometry';

describe('видеостикер Telegram', () => {
  it('512 по длинной стороне, короткая — по пропорциям; совпадает с размером экспорта', () => {
    expect(stickerSize(1080, 1920)).toEqual({ w: 288, h: 512 });
    expect(stickerSize(1920, 1080)).toEqual({ w: 512, h: 288 });
    expect(stickerSize(1080, 1080)).toEqual({ w: 512, h: 512 });
    for (const [w, h] of [[1080, 1920], [1920, 1080], [1080, 1350], [1080, 1080], [2560, 1080]]) {
      expect(exportSize(w, h, stickerShortSide(w, h))).toEqual(stickerSize(w, h));
    }
  });
  it('VP9 без звука, не длиннее 3 с, прозрачность по желанию', () => {
    const g = { inputs: [['-i', 'a.mp4']], filter: '', vOut: '[vout]', aOut: '[aout]', duration: 7.5 };
    const a = stickerArgs(g, 'g.txt', 7, 'out.webm', 450, true);
    expect(a).toContain('libvpx-vp9');
    expect(a).toContain('-an');
    expect(a[a.indexOf('-pix_fmt') + 1]).toBe('yuva420p');
    expect(a[a.indexOf('-t') + 1]).toBe(TG_STICKER.maxSec.toFixed(3));
    expect(a[a.indexOf('-r') + 1]).toBe('30');
    expect(stickerArgs({ ...g, duration: 2 }, 'g.txt', 7, 'o.webm', 450, false)[stickerArgs({ ...g, duration: 2 }, 'g.txt', 7, 'o.webm', 450, false).indexOf('-pix_fmt') + 1]).toBe('yuv420p');
  });
});
