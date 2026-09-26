# Нарезает листы «герой в одежде × позы» в public/art/sheet/outfit/<лист><ряд>/<колонка>.png
# Запуск: python3 scripts/cut-outfits.py   (листы: docs/outfits-a.jpg, docs/outfits-b.jpg)
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location('cp', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cut-poses.py'))
cp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cp)
from PIL import Image

DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs')

def sheet_b():
    src = Image.open(os.path.join(DOCS, 'outfits-b.jpg')).convert('RGB')
    xs = [475 + 142.9 * k for k in range(11)]
    ys = [79, 191, 303, 408, 515, 619, 725, 828, 933, 1036, 1144]
    for r in range(10):
        for c in range(10):
            box = (int(xs[c]) + 5, int(ys[r]) + 5, int(xs[c + 1]) - 5, int(ys[r + 1]) - 4)
            cp.cut(src, box, f'outfit/b{r + 1}/{c + 1}', scale=3, keep_share=0.3, grey_gaps=r != 1)  # тельняшка серая — не резать

def sheet_a(cells):
    src = Image.open(os.path.join(DOCS, 'outfits-a.jpg')).convert('RGB')
    for name, box in cells.items():
        cp.cut(src, box, f'outfit/{name}', scale=3, keep_share=0.3, grey_gaps=not name.startswith(('a_gown', 'a_apron')))

def sheet_c(cells):
    src = Image.open(os.path.join(DOCS, 'outfits-c.jpg')).convert('RGB')
    for name, box in cells.items():
        # тельняшка, роба и полосатая — серые, как фон: не вырезаем серые просветы
        grey = name.split('/')[0] in ('c_telnyashka', 'c_stripes', 'c_tank')
        cp.cut(src, tuple(box), f'outfit/{name}', scale=3, keep_share=0.3, grey_gaps=not grey, open_thin=True)


if __name__ == '__main__':
    import shutil
    shutil.rmtree(os.path.join(cp.OUT, 'outfit'), ignore_errors=True)
    from outfit_cells_a import CELLS_A, CELLS_C  # noqa: E402
    sheet_a(CELLS_A)
    sheet_c(CELLS_C)


def head_meta():
    """Где голова на каждой картинке (доли): для шапки."""
    import json
    import numpy as np
    root = os.path.join(cp.OUT, 'outfit')
    meta = {}
    for d in sorted(os.listdir(root)):
        if not os.path.isdir(os.path.join(root, d)):
            continue
        ref = os.path.join(root, d, 'stand.png')
        ref_h = Image.open(ref).size[1] if os.path.exists(ref) else None
        for f in sorted(os.listdir(os.path.join(root, d))):
            a = np.asarray(Image.open(os.path.join(root, d, f)))[..., 3] > 100
            H, W = a.shape
            rows = np.nonzero(a.any(1))[0]
            top = rows[0]
            hh = int((ref_h or H) * 0.12)
            band = a[top : top + max(3, hh // 4)]
            xs = np.nonzero(band.any(0))[0]
            cx = xs.mean()
            hw = (ref_h or H) * 0.062
            meta[f'{d}/{f[:-4]}'] = [round((cx - hw) / W, 4), round(top / H, 4), round((cx + hw) / W, 4), round((top + hh) / H, 4)]
    with open(os.path.join(root, 'meta.json'), 'w') as fh:
        json.dump(meta, fh)


if __name__ == '__main__':
    head_meta()
