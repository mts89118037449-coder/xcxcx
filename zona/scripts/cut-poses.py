# Вырезает позы и лица с листов ассетов на сером фоне в public/art/sheet.
# Запуск: python3 scripts/cut-poses.py <лист_поз.jpg> <лист_лиц.jpg>   (нужны pillow, numpy, scipy)
import os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'art', 'sheet')

def cut(src, box, path, scale=3, keep_share=0.04, tol=22):
    x0, y0, x1, y1 = box
    im = src.crop(box)
    a = np.asarray(im).astype(int)
    mn, mx = a.min(2), a.max(2)
    sat = mx - mn
    bgc = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)
    # фон — серый как у листа, плюс нейтральные тени под ногами; только связанное с краем кадра
    # тень — строго нейтральная и темнее фона, иначе съедается бледная кожа
    cand = (np.abs(a - bgc).sum(2) < tol) | ((sat < 6) & (mn > 70) & (mx < bgc.max() - 4))
    lab, _ = ndimage.label(cand)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fg = ~np.isin(lab, list(edge))
    # просветы внутри фигуры (между рукой и телом, под скамьёй) — тоже фон, если это заметное пятно цвета фона
    gap = np.abs(a - bgc).sum(2) < 16
    glab, gn = ndimage.label(gap)
    if gn:
        gsizes = ndimage.sum(gap, glab, range(1, gn + 1))
        fg &= ~np.isin(glab, [i + 1 for i, s in enumerate(gsizes) if s >= 25])
    lab2, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab2, range(1, n + 1))
        fg = np.isin(lab2, [i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * keep_share])
    rgba = np.dstack([a.astype(np.uint8), (fg * 255).astype(np.uint8)])
    img = Image.fromarray(rgba, 'RGBA')
    img = img.crop(img.getbbox())
    img = img.resize((img.width * scale, img.height * scale), Image.LANCZOS)
    r, g, b, al = img.split()
    al = al.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.9))
    img = Image.merge('RGBA', (r, g, b, al))
    full = os.path.join(OUT, path + '.png')
    os.makedirs(os.path.dirname(full), exist_ok=True)
    img.save(full, optimize=True)
    return img.size

POSES = {
    'stand': (30, 8, 125, 250),
    'stand34': (155, 8, 245, 250),
    'crossed': (650, 8, 740, 250),
    'squat': (765, 45, 885, 190),
    'sit': (35, 240, 130, 400),
    'sit34': (155, 240, 245, 398),
    'lunge': (265, 245, 370, 395),
    'run': (390, 250, 485, 395),
    'guard': (535, 232, 640, 400),
    'guard34': (645, 232, 745, 398),
    'guard2': (770, 230, 885, 392),
    'guard3': (910, 228, 1005, 398),
    'walk1': (35, 393, 115, 565),
    'walk2': (150, 393, 230, 565),
    'walk3': (275, 393, 360, 565),
    'walk4': (385, 393, 480, 565),
    'push': (870, 400, 1010, 565),
}

if __name__ == '__main__':
    poses = Image.open(sys.argv[1]).convert('RGB')
    for k, b in POSES.items():
        print(k, cut(poses, b, 'pose/' + k))
    if len(sys.argv) > 2:
        faces = Image.open(sys.argv[2]).convert('RGB')
        # сетка 8×4 под заголовком; линии сетки обрезаем отступом
        W, H = faces.size
        x_edges = np.linspace(8, W - 8, 9)
        y_edges = [22, 157, 290, 425, H - 4]
        i = 0
        for r in range(4):
            for c in range(8):
                box = (int(x_edges[c]) + 6, int(y_edges[r]) + 6, int(x_edges[c + 1]) - 6, int(y_edges[r + 1]) - 6)
                print('face', i, cut(faces, box, f'face/{i}', scale=2, keep_share=0.3, tol=26))
                i += 1
