# Шрифты веб-установщика: Onest (текст) и Unbounded (заголовки) — те же, что в Kadro. Fontsource хранит их
# кусками (латиница и кириллица отдельно, WOFF2), а установщику (GDI+) нужен один TTF на начертание:
# склеиваем куски и сохраняем TTF. Запуск: python3 scripts/make-installer-fonts.py (нужен fonttools с brotli)
import os
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'resources', 'installer', 'fonts')
os.makedirs(OUT, exist_ok=True)
for family, weight in [('onest', 400), ('onest', 600), ('unbounded', 700)]:
    parts = []
    for sub in ('latin', 'cyrillic'):
        src = os.path.join(ROOT, 'node_modules', '@fontsource', family, 'files', f'{family}-{sub}-{weight}-normal.woff2')
        f = TTFont(src)
        f.flavor = None
        tmp = os.path.join(OUT, f'_{sub}.ttf')
        f.save(tmp)
        parts.append(tmp)
    merged = Merger().merge(parts)
    # одно семейство на всё: GDI+ различает начертания по имени
    name = f'{family.capitalize()} {weight}'
    for rec in merged['name'].names:
        if rec.nameID in (1, 16):
            rec.string = name
        elif rec.nameID in (2, 17):
            rec.string = 'Regular'
        elif rec.nameID in (4,):
            rec.string = name
        elif rec.nameID == 6:
            rec.string = name.replace(' ', '-')
    merged['OS/2'].usWeightClass = 400
    merged['OS/2'].fsSelection = (merged['OS/2'].fsSelection & ~0b1100001) | 0b1000000
    merged['head'].macStyle = 0
    out = os.path.join(OUT, f'{family}-{weight}.ttf')
    merged.save(out)
    for p in parts:
        os.remove(p)
    print(out, os.path.getsize(out))
