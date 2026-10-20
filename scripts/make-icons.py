# Значки Kadro разных цветов: resources/icons/kadro-<цвет>.png (256) и .ico (16–256).
# Рисунок как в docs/brand/logo.svg: квадрат со скруглением, две полосы и треугольник «пуск».
# python3 scripts/make-icons.py   (нужен Pillow)
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'resources', 'icons')
ICONS = {  # фон, рисунок, обводка (для светлого значка — чтобы не терялся на белом)
    'black': ('#000000', '#ffffff', None),
    'white': ('#ffffff', '#000000', (0, 0, 0, 40)),
    'pink': ('#ff3d7f', '#ffffff', None),
    'violet': ('#7c4dff', '#ffffff', None),
    'blue': ('#2f7bff', '#ffffff', None),
}
SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]


def draw(bg, fg, ring, size=1024):
    k = size / 64
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([2 * k, 2 * k, 62 * k, 62 * k], radius=14 * k, fill=bg, outline=ring, width=int(round(1.2 * k)) if ring else 0)
    d.rounded_rectangle([12 * k, 12 * k, 52 * k, 16.5 * k], radius=2.25 * k, fill=fg)
    d.rounded_rectangle([12 * k, 47.5 * k, 52 * k, 52 * k], radius=2.25 * k, fill=fg)
    d.polygon([(26 * k, 23.5 * k), (26 * k, 40.5 * k), (42 * k, 32 * k)], fill=fg)
    return im


os.makedirs(OUT, exist_ok=True)
for name, (bg, fg, ring) in ICONS.items():
    big = draw(bg, fg, ring)
    png = big.resize((256, 256), Image.LANCZOS)
    png.save(os.path.join(OUT, f'kadro-{name}.png'), optimize=True)
    png.save(os.path.join(OUT, f'kadro-{name}.ico'), sizes=[(s, s) for s in SIZES])
    print('готово:', name)
