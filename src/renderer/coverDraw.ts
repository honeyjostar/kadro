// Рисование обложки: кадр на весь холст, затемнение под текстом, заголовок крупно, одно слово — цветом.
import { accentWord, COVER_SIZES, layoutTitle, type CoverFormat, type CoverStyle } from '../shared/cover';

export interface CoverLook { title: string; format: CoverFormat; style: CoverStyle }

const FONT: Record<CoverStyle, { family: string; weight: number }> = {
  bright: { family: 'Russo One', weight: 400 },
  clean: { family: 'Unbounded', weight: 700 },
  plate: { family: 'Russo One', weight: 400 },
};
const YELLOW = '#ffd400';
const PINK = '#ff3d7f';

/** Шрифты заголовков загружены (иначе первый кадр нарисуется запасным шрифтом). */
export async function coverFontsReady(): Promise<void> {
  await Promise.all(Object.values(FONT).map((f) => document.fonts.load(`${f.weight} 100px "${f.family}"`, 'АБВ ABC').catch(() => undefined))); // i18n-data: образец букв
}

export function drawCover(canvas: HTMLCanvasElement, img: HTMLImageElement | null, look: CoverLook): void {
  const { w, h } = COVER_SIZES[look.format];
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#111';
  c.fillRect(0, 0, w, h);
  if (img && img.naturalWidth) {
    // кадр на весь холст; вертикальная обложка из горизонтального кадра — по центру
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
    c.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
  }
  const vertical = look.format === 'vertical';
  // текст: у YouTube — нижняя часть, у вертикальной — середина (низ закрывают кнопки и подпись)
  const box = vertical
    ? { x: w * 0.07, y: h * 0.36, w: w * 0.86, h: h * 0.34, lines: 4 }
    : { x: w * 0.05, y: h * 0.5, w: w * 0.9, h: h * 0.42, lines: 3 };
  if (look.style !== 'plate') {
    const g = vertical ? c.createLinearGradient(0, h * 0.25, 0, h * 0.85) : c.createLinearGradient(0, h * 0.35, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(vertical ? 0.5 : 0.6, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, vertical ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.8)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
  const { words, accent } = accentWord(look.title || ' ');
  if (!words.length) return;
  const up = words.map((x) => x.toUpperCase());
  const f = FONT[look.style];
  const font = (size: number) => `${f.weight} ${size}px "${f.family}", "Onest", sans-serif`;
  const measure = (t: string, size: number) => { c.font = font(size); return c.measureText(t).width + (look.style === 'plate' ? size * 0.5 : 0); };
  const { lines, size } = layoutTitle(up, box.w, box.h, box.lines, measure, vertical ? 200 : 150);
  const lh = size * 1.08;
  const blockH = lines.length * lh;
  // YouTube — прижато к низу блока, вертикальная — по центру блока
  let y = vertical ? box.y + (box.h - blockH) / 2 : box.y + box.h - blockH;
  c.textBaseline = 'alphabetic';
  c.lineJoin = 'round';
  for (const line of lines) {
    c.font = font(size);
    const parts = line.map((i) => up[i]);
    const space = c.measureText(' ').width;
    const lw = parts.reduce((a, p) => a + c.measureText(p).width, 0) + space * (parts.length - 1);
    let x = vertical ? (w - lw) / 2 : box.x;
    const base = y + size * 0.86;
    if (look.style === 'plate') {
      const padX = size * 0.25;
      c.fillStyle = '#111';
      c.fillRect(x - padX, y + size * 0.02, lw + 2 * padX, lh * 0.98);
    }
    line.forEach((i, k) => {
      const word = up[i];
      const isAccent = i === accent;
      const color = look.style === 'bright' ? (isAccent ? YELLOW : '#fff') : look.style === 'clean' ? (isAccent ? PINK : '#fff') : (isAccent ? YELLOW : '#fff');
      if (look.style === 'bright') {
        c.lineWidth = size * 0.14;
        c.strokeStyle = '#000';
        c.strokeText(word, x, base);
      }
      c.save();
      if (look.style !== 'plate') { c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = size * 0.25; c.shadowOffsetY = size * 0.05; }
      c.fillStyle = color;
      c.fillText(word, x, base);
      c.restore();
      x += c.measureText(word).width + (k < line.length - 1 ? space : 0);
    });
    y += lh;
  }
}

export function coverBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((r) => canvas.toBlob(r, 'image/png'));
}
