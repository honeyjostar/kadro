# Маленькие тестовые шрифты для автотестов (python3 make.py; нужен fontTools и brotli).
# Каждая буква — сплошной прямоугольник шириной в 1 em: надпись этим шрифтом легко отличить от запасного.
import os
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.ttLib import TTCollection, TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
CHARS = [chr(c) for c in range(0x21, 0x7f)] + [chr(c) for c in range(0x410, 0x450)] + ['ё', 'Ё', '…', '—', '«', '»']

def box(pen, w, h):
    pen.moveTo((60, 0)); pen.lineTo((60, h)); pen.lineTo((w - 60, h)); pen.lineTo((w - 60, 0)); pen.closePath()

def build(family, sub, weight, cff=False):
    names = ['.notdef', 'space'] + ['g%04x' % ord(c) for c in CHARS]
    fb = FontBuilder(1000, isTTF=not cff)
    fb.setupGlyphOrder(names)
    cmap = {0x20: 'space'}
    cmap.update({ord(c): 'g%04x' % ord(c) for c in CHARS})
    fb.setupCharacterMap(cmap)
    h = 760 if weight < 600 else 820
    if cff:
        cs = {}
        for n in names:
            pen = T2CharStringPen(1000, None)
            if n != 'space': box(pen, 1000, h)
            cs[n] = pen.getCharString()
        fb.setupCFF(f'{family.replace(" ", "")}-{sub}', {'FullName': f'{family} {sub}'}, cs, {})
    else:
        glyphs = {}
        for n in names:
            pen = TTGlyphPen(None)
            if n != 'space': box(pen, 1000, h)
            glyphs[n] = pen.glyph()
        fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({n: (1000, 60) for n in names})
    fb.setupHorizontalHeader(ascent=900, descent=-200)
    fb.setupNameTable({'familyName': family, 'styleName': sub, 'uniqueFontIdentifier': f'{family} {sub} test', 'fullName': f'{family} {sub}', 'psName': f'{family.replace(" ", "")}-{sub}', 'version': 'Version 1.000'})
    fb.setupOS2(usWeightClass=weight, sTypoAscender=900, sTypoDescender=-200, usWinAscent=900, usWinDescent=200, fsSelection=0x20 if weight >= 700 else 0x40)
    fb.setupPost()
    if weight >= 700: fb.font['head'].macStyle = 1
    return fb.font

reg = build('Kadro Test', 'Regular', 400)
bold = build('Kadro Test', 'Bold', 700)
reg.save(os.path.join(HERE, 'KadroTest-Regular.ttf'))
bold.save(os.path.join(HERE, 'KadroTest-Bold.ttf'))
coll = TTCollection()
coll.fonts = [TTFont(os.path.join(HERE, 'KadroTest-Regular.ttf')), TTFont(os.path.join(HERE, 'KadroTest-Bold.ttf'))]
coll.save(os.path.join(HERE, 'KadroTestPair.ttc'))
duo = TTCollection()
duo.fonts = [build('Kadro Duo', 'Regular', 400), build('Kadro Duo', 'Bold', 700)]
duo.save(os.path.join(HERE, 'KadroDuo.ttc'))
build('Kadro Block', 'Regular', 400, cff=True).save(os.path.join(HERE, 'KadroBlock.otf'))
for flavor in ('woff', 'woff2'):
    f = build('Kadro Web', 'Regular', 400)
    f.flavor = flavor
    f.save(os.path.join(HERE, f'KadroWeb.{flavor}'))
print('ok')
