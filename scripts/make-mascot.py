# Маскот Kadro: лист с 12 позами (тёмный фон) → отдельные PNG с прозрачностью в resources/mascot.
#   python3 scripts/make-mascot.py путь/к/листу.png        (нужны numpy, scipy, Pillow; потом pngquant, если есть)
# Фон листа — почти чёрный: всё, что связано с краем листа и близко к цвету фона, — прозрачное; тёмные места внутри
# фигуры (голова-экран, перчатки) остаются. Мягкое свечение вокруг сохраняется — позы рассчитаны на тёмный фон.
import os, shutil, subprocess, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'resources', 'mascot')
NAMES = ['stand', 'point', 'lean', 'sit', 'shrug', 'crouch', 'laptop', 'crossed', 'lie', 'back', 'wave', 'peek']

im = np.array(Image.open(sys.argv[1]).convert('RGB')).astype(float)
B = np.median(np.concatenate([im[:4].reshape(-1, 3), im[:, :4].reshape(-1, 3)]), axis=0)
d = np.abs(im - B).max(axis=2)
lab, _ = ndimage.label(d <= 5)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
fg = ~np.isin(lab, list(border))
# крупинки шума — прочь (мелкие детали рисунка вроде точек «…» яркие — остаются)
fl, fn = ndimage.label(fg)
idx = np.arange(1, fn + 1)
keep = np.zeros(fn + 1, bool)
keep[1:] = (ndimage.maximum(d, fl, idx) >= 25) | (ndimage.sum(np.ones_like(d), fl, idx) >= 400)
fg = keep[fl]
# позы: близкие куски (знак вопроса, сердечко) — к своей фигуре
rl, _ = ndimage.label(ndimage.binary_dilation(fg, iterations=14))
boxes = []
for i, sl in enumerate(ndimage.find_objects(rl)):
    if (sl[0].stop - sl[0].start) * (sl[1].stop - sl[1].start) > 20000:
        boxes.append((sl[0].start, sl[1].start, sl[0].stop, sl[1].stop, i + 1))
boxes.sort(key=lambda b: (round(b[0] / 300), b[1]))
assert len(boxes) == len(NAMES), f'нашлось поз: {len(boxes)}'
os.makedirs(OUT, exist_ok=True)
for name, (y0, x0, y1, x1, L) in zip(NAMES, boxes):
    m = (fg & (rl == L))[y0:y1, x0:x1]
    a = np.array(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))).astype(float) / 255
    a = np.where(m, a, a * 0.6)
    a = np.where(m & (a < 1), np.maximum(a, np.clip((d[y0:y1, x0:x1] - 3) / 10, 0, 1)), a)
    a = np.where(ndimage.binary_erosion(m, iterations=1), 1.0, a)
    aa = np.clip(a, 1e-3, 1)[..., None]
    rgb = np.clip((im[y0:y1, x0:x1] - (1 - aa) * B) / aa, 0, 255)
    img = Image.fromarray(np.dstack([rgb, a * 255]).round().astype(np.uint8), 'RGBA')
    img = img.crop(img.getbbox())
    path = os.path.join(OUT, f'{name}.png')
    img.save(path, optimize=True)
    if shutil.which('pngquant'):
        subprocess.run(['pngquant', '--quality', '80-95', '--speed', '1', '--force', '--ext', '.png', path], check=True)
    print(name, img.size, os.path.getsize(path))
