# Маскот Kadro: листы с позами → отдельные PNG с прозрачностью в resources/mascot (позы рассчитаны на тёмный фон).
#   python3 scripts/make-mascot.py dark    лист.png            — первый лист: почти чёрный фон, 12 поз (имена — NAMES ниже)
#   python3 scripts/make-mascot.py alpha   лист.png имя,имя,…   — лист с настоящей прозрачностью
#   python3 scripts/make-mascot.py checker лист.png имя,имя,…   — лист со светлой «шахматкой» вместо прозрачности
# Нужны numpy, scipy, Pillow; потом pngquant, если есть. Имена — по рядам слева направо.
# Листы: 1) stand point lean sit shrug crouch laptop crossed lie back wave peek;
#        2) pointdown fingerup pointleft pointright paper present open clipboard thumbsup hello think cheer;
#        3) you offer wonder chart cool huh sad dream please jump dab back2.
import os, shutil, subprocess, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

def boxes_of(fg, dil, min_area=6000, rows=300):
    """Фигуры — крупные связные куски; мелкие (знак вопроса, искры) — к ближайшей фигуре."""
    fl, fn = ndimage.label(fg)
    idx = np.arange(1, fn + 1)
    area = ndimage.sum(fg, fl, idx)
    big = np.zeros(fn + 1, bool); big[1:] = area >= min_area
    bigmask = big[fl]
    _, (iy, ix) = ndimage.distance_transform_edt(~bigmask, return_indices=True)
    owner = fl[iy, ix]                      # ближайшая крупная фигура для каждой точки
    rl = np.where(fg, owner, 0)
    # мелкий кусок целиком уходит одной фигуре (по своему центру)
    for i in idx[~big[1:]]:
        ys, xs = np.nonzero(fl == i)
        rl[ys, xs] = owner[int(ys.mean()), int(xs.mean())]
    out = []
    for L in idx[big[1:]]:
        ys, xs = np.nonzero(rl == L)
        out.append((ys.min(), xs.min(), ys.max() + 1, xs.max() + 1, L))
    cy = lambda b: np.nonzero(fl == b[4])[0].mean()
    out.sort(key=lambda b: (int(cy(b) // rows), b[1]))
    return rl, out

def save(rgba, name, outdir):
    img = Image.fromarray(rgba, 'RGBA')
    img = img.crop(img.getbbox())
    path = os.path.join(outdir, name + '.png')
    img.save(path, optimize=True)
    if shutil.which('pngquant'):
        subprocess.run(['pngquant', '--quality', '80-95', '--speed', '1', '--force', '--ext', '.png', path], check=True)
    return img.size

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = outdir = os.path.join(ROOT, 'resources', 'mascot')
NAMES = ['stand', 'point', 'lean', 'sit', 'shrug', 'crouch', 'laptop', 'crossed', 'lie', 'back', 'wave', 'peek']
mode, src = sys.argv[1], sys.argv[2]
names = sys.argv[3].split(',') if len(sys.argv) > 3 else NAMES
os.makedirs(outdir, exist_ok=True)
if mode == 'dark':
    im = np.array(Image.open(src).convert('RGB')).astype(float)
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
elif mode == 'alpha':
    im = np.array(Image.open(src).convert('RGBA'))
    fg = im[..., 3] > 40
    # мелкий мусор прочь
    fl, fn = ndimage.label(fg); area = ndimage.sum(fg, fl, np.arange(1, fn + 1)); keep = np.zeros(fn + 1, bool); keep[1:] = area >= 30; fg = keep[fl]
    rl, boxes = boxes_of(fg, 10, rows=427)
    print(len(boxes))
    for name, (y0, x0, y1, x1, L) in zip(names, boxes):
        c = im[y0:y1, x0:x1].copy(); m = (rl == L)[y0:y1, x0:x1] & fg[y0:y1, x0:x1]
        c[..., 3] = np.where(m, c[..., 3], 0)
        print(name, save(c, name, outdir))
elif mode == 'checker':  # checker: светлая «шахматка» вместо прозрачности
    im = np.array(Image.open(src).convert('RGB')).astype(int)
    lum = im.mean(2); sat = im.max(2) - im.min(2)
    bgc = (lum >= 200) & (sat <= 8)
    barrier = ndimage.binary_closing(~bgc, iterations=2)
    lab, _ = ndimage.label(~barrier)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fg = ~np.isin(lab, list(border))
    fl, fn = ndimage.label(fg); idx = np.arange(1, fn + 1)
    keep = np.zeros(fn + 1, bool); keep[1:] = ndimage.sum(fg, fl, idx) >= 60; fg = keep[fl]
    rl, boxes = boxes_of(fg, 9, rows=512)
    print(len(boxes))
    for name, (y0, x0, y1, x1, L) in zip(names, boxes):
        m = (fg & (rl == L))[y0:y1, x0:x1]
        m = ndimage.binary_erosion(m, iterations=1)   # светлая кайма от фона
        a = np.array(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(float) / 255
        a = np.where(ndimage.binary_erosion(m, iterations=1), 1.0, a * m)
        c = im[y0:y1, x0:x1].astype(float)
        # край: убираем примесь светлого фона — тянем к тёмному
        edge = m & ~ndimage.binary_erosion(m, iterations=2)
        lumc = c.mean(2)
        dark = np.clip((lumc - 60) / 140, 0, 1)[..., None]
        c = np.where(edge[..., None], c * (1 - 0.75 * dark), c)
        print(name, save(np.dstack([c, a * 255]).round().astype(np.uint8), name, outdir))
