"""Subset the Jua font to the characters the game uses (+ ASCII + the 2,350 common KS X 1001 Hangul syllables for nicknames/chat).
usage: python3 tools/font.py /path/to/Jua-Regular.ttf   ->  fonts/jua.woff2"""
import sys, glob, pathlib
from fontTools import subset
root = pathlib.Path(__file__).resolve().parent.parent
text = ''.join(p.read_text(encoding='utf-8') for p in [root / 'index.html', root / 'style.css', *map(pathlib.Path, glob.glob(str(root / 'js' / '**' / '*.js'), recursive=True))])
chars = set(c for c in text if ord(c) > 0x7e) | set(chr(i) for i in range(0x20, 0x7f))
ks = bytes(range(0)).decode()
for hi in (range(0xB0, 0xC9) if "--full" in sys.argv else ()):
    for lo in range(0xA1, 0xFF):
        try: chars.add(bytes([hi, lo]).decode('euc-kr'))
        except UnicodeDecodeError: pass
chars.update('…·~“”‘’―–—')
opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']; opts.desubroutinize = True
f = subset.load_font(sys.argv[1], opts); s = subset.Subsetter(opts); s.populate(text=''.join(sorted(chars))); s.subset(f)
out = root / 'fonts' / 'jua.woff2'; subset.save_font(f, str(out), opts); print(out, out.stat().st_size, 'bytes', len(chars), 'chars')
