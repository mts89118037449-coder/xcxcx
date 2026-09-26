# Вырезает позы и лица с листов ассетов на сером фоне в public/art/sheet.
# Запуск: python3 scripts/cut-poses.py <лист_поз.jpg> [<лист_лиц.jpg>] [<лист_персонажей.jpg>] [<лист_каста.jpg>]
# (нужны pillow, numpy, scipy)
import os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'art', 'sheet')

def cut(src, box, path, scale=3, keep_share=0.04, tol=22, open_thin=False):
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
    if open_thin:  # срезаем тонкие хвосты (остатки линий сетки), толщиной до 2 px
        fg = ndimage.binary_opening(fg, structure=np.ones((3, 3)))
    lab2, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab2, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * keep_share]
        if open_thin:  # обрезки соседних фигур прижаты к боковому краю кадра — выкидываем
            big = int(np.argmax(sizes)) + 1
            W = fg.shape[1]
            keep = [k for k in keep if k == big or not (np.any(lab2[:, :3] == k) or np.any(lab2[:, W - 3:] == k))]
        fg = np.isin(lab2, keep)
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

# Лист персонажей: боссы, зэки-соперники и состояния героя.
NPC = {
    'boss/b_rat': (640, 38, 740, 236),
    'boss/b_guard': (145, 315, 265, 569),
    'boss/b_chief': (280, 315, 385, 569),
    'boss/b_warden': (15, 302, 128, 569),
    'rival/0': (15, 28, 128, 287),
    'rival/1': (138, 20, 282, 285),
    'rival/2': (283, 38, 398, 287),
    'rival/3': (400, 28, 514, 283),
    'rival/4': (528, 32, 612, 264),
    'rival/5': (905, 30, 1004, 260),
    'pose/lying': (612, 506, 812, 562),
    'pose/floor': (892, 430, 1014, 568),
}

def erase_grid(img):
    # Линии сетки листа: длинные прямые тёмные отрезки. Заменяем их соседними пикселями,
    # иначе линия остаётся поперёк фигур.
    a = np.asarray(img).astype(np.int16)
    dark = a.max(2) < 90
    fixed = a.copy()
    run = 60
    # горизонтальные
    # линия тонкая: в 3 пикселях выше и ниже уже не тёмное (иначе это тёмная одежда)
    thin_h = dark & ~np.roll(dark, 3, 0) & ~np.roll(dark, -3, 0)
    thin_v = dark & ~np.roll(dark, 3, 1) & ~np.roll(dark, -3, 1)
    h = ndimage.uniform_filter1d(thin_h.astype(float), run, axis=1) > 0.9
    h = ndimage.binary_dilation(h, structure=np.ones((3, run)))
    ys, xs = np.nonzero(h & dark & ~np.roll(dark, 4, 0) | h & dark & ~np.roll(dark, -4, 0))
    for y, x in zip(ys, xs):
        up, dn = max(0, y - 3), min(a.shape[0] - 1, y + 3)
        fixed[y, x] = (a[up, x] + a[dn, x]) // 2
    # вертикальные
    v = ndimage.uniform_filter1d(thin_v.astype(float), run, axis=0) > 0.9
    v = ndimage.binary_dilation(v, structure=np.ones((run, 3)))
    ys, xs = np.nonzero(v & dark & ~np.roll(dark, 4, 1) | v & dark & ~np.roll(dark, -4, 1))
    for y, x in zip(ys, xs):
        lf, rt = max(0, x - 3), min(a.shape[1] - 1, x + 3)
        fixed[y, x] = (fixed[y, lf] + fixed[y, rt]) // 2
    return Image.fromarray(fixed.astype(np.uint8))

# Второй лист персонажей: зэки, обслуга, охрана. Имена — роли в игре.
R1, R2 = (14, 290), (305, 572)
CAST = {
    'avtoritet': (18, R1[0], 132, R1[1]), 'brute': (148, R1[0], 280, R1[1]), 'ushanka': (276, R1[0], 352, R1[1]),
    'coverall': (348, R1[0], 430, R1[1]), 'cook': (420, R1[0], 526, R1[1]), 'priest': (514, R1[0], 594, R1[1]),
    'writer': (586, R1[0], 662, R1[1]), 'lawyer': (650, R1[0], 742, R1[1]), 'omon': (732, R1[0], 848, R1[1]),
    'officer': (836, R1[0], 930, R1[1]), 'guardwoman': (924, R1[0], 1008, R1[1]),
    'youngster': (20, R2[0], 124, R2[1]), 'oldman': (148, R2[0], 248, R2[1]), 'worker': (240, R2[0], 342, R2[1]),
    'seller': (334, R2[0], 422, R2[1]), 'hermit': (410, R2[0], 492, R2[1]), 'doctor': (480, R2[0], 564, R2[1]),
    'sport': (558, R2[0], 622, R2[1]), 'blatnoy': (624, R2[0], 710, R2[1]), 'thin': (712, R2[0], 767, R2[1]),
    'bandaged': (768, R2[0], 840, R2[1]), 'spetsnaz': (838, R2[0], 916, R2[1]), 'kolshik': (916, R2[0], 1018, R2[1]),
}

def face_of(path, out):
    # Портрет босса — верх его же фигуры
    img = Image.open(os.path.join(OUT, path + '.png'))
    w, h = img.size
    side = int(w * 0.62)
    top = img.crop(((w - side) // 2, 0, (w + side) // 2, side))
    full = os.path.join(OUT, '..', out + '.png')
    top.save(full, optimize=True)

if __name__ == '__main__':
    if len(sys.argv) > 3:
        npc = erase_grid(Image.open(sys.argv[3]).convert('RGB'))
        for k, b in NPC.items():
            print(k, cut(npc, b, k, keep_share=0.2, open_thin=True))
        for k in ('b_rat', 'b_guard', 'b_chief', 'b_warden'):
            face_of('boss/' + k, 'npc/' + k + '_face')
    if len(sys.argv) > 4:
        cast = Image.open(sys.argv[4]).convert('RGB')
        for k, b in CAST.items():
            print(k, cut(cast, b, 'cast/' + k, keep_share=0.35, open_thin=k != 'lawyer'))
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
