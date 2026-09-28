# Надевает шмотки и набивает наколки прямо на рисованные позы героя.
# Для каждой позы размечаем части тела (голова, торс, руки, трусы, ноги, ступни)
# и для каждой вещи генерируем слой строго по форме тела — с сохранением светотени
# исходного рисунка. Итог: public/art/sheet/dress/<поза>/<вещь>.png, того же размера,
# что и поза, накладываются стопкой.
# Запуск: python3 scripts/dress-poses.py [--debug]   (нужны pillow, numpy, scipy)
import os, sys, json
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'art', 'sheet')
POSES = ['stand', 'stand34', 'sit', 'crossed', 'push', 'lunge', 'guard34', 'walk1', 'walk2', 'walk3', 'walk4', 'floor']
# у сидячих ноги расходятся шире трусов
LEG_BAND = {'sit': 1.0, 'floor': 1.2}
# докуда свисают руки ниже пояса (доля роста): в стойках руки у груди
REACH = {'guard34': 0.0, 'lunge': 0.0, 'push': 0.0, 'crossed': 0.0}
DEBUG = '--debug' in sys.argv
ONLY_OUTFITS = '--outfits' in sys.argv  # перегенерировать только комплекты
ONLY_POSE = next((a[7:] for a in sys.argv if a.startswith('--pose=')), None)

STAND_H = np.asarray(Image.open(os.path.join(ROOT, 'pose', 'stand.png'))).shape[0]
HEAD_H = int(STAND_H * 0.135)   # голова с шеей
ARM_REACH = int(STAND_H * 0.30)  # докуда от пояса свисают кисти
FOOT_H = int(STAND_H * 0.055)
BOOT_H = int(STAND_H * 0.16)


def regions(pose):
    im = np.asarray(Image.open(os.path.join(ROOT, 'pose', pose + '.png'))).astype(np.int16)
    rgb, alpha = im[..., :3], im[..., 3]
    body = alpha > 90
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    H, W = body.shape
    shorts = body & (b > r + 6) & (b >= g)
    shorts = ndimage.binary_opening(shorts, iterations=2)
    lab, n = ndimage.label(shorts)
    if n:
        sizes = ndimage.sum(shorts, lab, range(1, n + 1))
        shorts = lab == (int(np.argmax(sizes)) + 1)
    shorts = ndimage.binary_closing(shorts, iterations=3) & body
    lum = rgb.mean(2)
    # кожа и тёмные контуры внутри фигуры; серый металл табуретки — нет
    skinlike = (r > b + 8) | (lum < 75)
    core = body & ~shorts & (r > b + 8)
    near_skin = ndimage.binary_dilation(core, iterations=3)
    skin = body & ~shorts & skinlike & near_skin
    skin = ndimage.binary_opening(skin, iterations=1)
    ys, xs = np.nonzero(shorts)
    sy0, sy1, sx0, sx1 = ys.min(), ys.max(), xs.min(), xs.max()
    Y, X = np.mgrid[0:H, 0:W]

    top = np.nonzero(body.any(1))[0][0]
    if pose == 'lying':
        # лежит головой вправо: голова — правый край, «верх» тела — справа от трусов
        right = np.nonzero(body.any(0))[0][-1]
        head = skin & (X > right - HEAD_H * 1.1)
        upper = skin & ~head & (X > sx1)
        legs = skin & (X < sx0)
        feet = legs & (X < np.nonzero(body.any(0))[0][0] + FOOT_H * 1.6)
        boots = legs & (X < np.nonzero(body.any(0))[0][0] + BOOT_H)
        cx0, cx1 = sx0, sx1
        torso = upper & (Y > sy0 - (sy1 - sy0) * 0.2) & (Y < sy1 + (sy1 - sy0) * 0.2)
    else:
        # голова — у самой верхней точки, по ширине не больше головы (кулак рядом не считается)
        hx = np.nonzero(body[top : top + 6].any(0))[0].mean()
        head_w = STAND_H * 0.075
        hc = top + HEAD_H * 0.5
        head = skin & ((((X - hx) / head_w) ** 2 + ((Y - hc) / (HEAD_H * 0.56)) ** 2) < 1)
        waist = sy0 + 3
        upper = skin & ~head & (Y < waist)
        # ниже пояса: у бёдер ногами считаем только то, что под трусами, кисти рук — нет
        pad = int((sx1 - sx0) * LEG_BAND.get(pose, 0.06))
        reach = int(STAND_H * REACH.get(pose, 0.30))
        near = (Y >= waist) & (Y < waist + reach)
        in_band = (X >= sx0 - pad) & (X <= sx1 + pad)
        legs = skin & (Y >= waist) & (~near | in_band)
        upper |= skin & near & ~in_band
        bottom = np.zeros(W, int)
        for x in range(W):
            col = np.nonzero(legs[:, x])[0]
            bottom[x] = col.max() if len(col) else -1
        low = np.nonzero(body.any(1))[0][-1]
        feet = legs & (Y > low - FOOT_H * 1.3)
        boots = legs & (Y > low - BOOT_H)
        # торс — полоса над трусами шириной с трусы, выше — сужается к плечам
        cx0, cx1 = sx0 + (sx1 - sx0) * 0.08, sx1 - (sx1 - sx0) * 0.08
        torso = upper & (X >= cx0) & (X <= cx1)
    arms = upper & ~torso
    return dict(im=im, body=body, shorts=shorts, head=head, upper=upper, torso=torso, arms=arms, legs=legs,
                feet=feet, boots=boots, box=(int(sy0), int(sy1), int(sx0), int(sx1)), top=int(top))


def paint(R, mask, color, pattern=None, gloss=0.0, grow=2, keep=None, detail=0.0):
    """Ткань поверх тела: без мышечного рельефа, с объёмом к краям и чуть шире силуэта.
    keep — части тела, которые должны остаться поверх ткани (голова, кисти)."""
    im = R['im']
    H, W = R['body'].shape
    m = mask & R['body']
    if not m.any():
        return None
    # силуэт шире тела, но не залезает на то, что должно остаться сверху
    grown = ndimage.binary_dilation(m, iterations=grow)
    # не залезаем на другие части тела, кроме тонких контуров и дырок внутри куска ткани
    others = R['body'] & ~m & ~ndimage.binary_fill_holes(ndimage.binary_closing(m, iterations=3))
    grown &= ~others
    grown = ndimage.binary_fill_holes(grown)
    if keep is not None:
        grown &= ~keep
    # закрываем щели между ногами только внутри штанины, не склеивая ноги
    grown = ndimage.binary_closing(grown, structure=np.ones((5, 1)), iterations=3) & (grown | ~R['body'])
    # объём: светлее в середине куска ткани, темнее к краям + мягкий общий свет рисунка
    dist = ndimage.distance_transform_edt(grown)
    vol = np.clip(dist / 7.0, 0, 1) ** 0.6
    lum = ndimage.gaussian_filter(im[..., :3].mean(2) / 255.0, 6)
    lm = lum[m].mean()
    s = 0.55 + 0.35 * vol + np.clip((lum - lm) * 0.5, -0.07, 0.07)
    # редкие складки ткани
    rng = np.random.default_rng(len(color) + int(sum(color)))
    folds = ndimage.gaussian_filter(rng.random((H, W)), (2, 5))
    folds = (folds - folds.mean()) / (folds.std() + 1e-6)
    s = s * (1 + 0.05 * folds)
    if detail:
        # линии и светотень исходного рисунка проступают сквозь ткань: складки, контуры рук
        base = im[..., :3].mean(2) / 255.0
        hp = base - ndimage.gaussian_filter(base, 3)
        # только настоящие тёмные линии рисунка (контуры рук, сгибы), без мышечного рельефа
        lines = ndimage.gaussian_filter(np.clip(-hp - 0.12, 0, 0.3), 0.8)
        s = s * (1 - detail * lines * 2.2)
    c = np.array(color, float)[None, None, :] * s[..., None]
    if pattern is not None:
        c = c * pattern[..., None]
    if gloss:
        c += (np.clip(vol - 0.7, 0, 1) * 110 * gloss)[..., None]
    # тонкий тёмный контур по краю одежды — как линия рисунка
    edge = grown & ~ndimage.binary_erosion(grown, iterations=1)
    c[edge] = c[edge] * 0.35
    out = np.zeros((H, W, 4), np.uint8)
    out[..., :3] = np.clip(c, 0, 255)
    out[..., 3] = np.where(grown, 255, 0)
    img = Image.fromarray(out, 'RGBA')
    r, g, b, a = img.split()
    a = a.filter(ImageFilter.GaussianBlur(0.6))
    return Image.merge('RGBA', (r, g, b, a))


def stripes(R, period=9, axis=0, lo=0.35):
    H, W = R['body'].shape
    Y, X = np.mgrid[0:H, 0:W]
    v = (Y if axis == 0 else X) % period < period / 2
    return np.where(v, 1.0, lo)


def camo(R, seed=3):
    rng = np.random.default_rng(seed)
    H, W = R['body'].shape
    n = ndimage.gaussian_filter(rng.random((H, W)), 7)
    n = (n - n.min()) / (n.max() - n.min())
    return np.select([n < 0.4, n < 0.6], [0.55, 0.85], 1.15)


def quilt(R):
    H, W = R['body'].shape
    Y, X = np.mgrid[0:H, 0:W]
    d = ((X + Y) % 22 < 2) | ((X - Y) % 22 < 2)
    return np.where(d, 0.55, 1.0)


# вещь → слой
def items(R):
    head, upper = R['head'], R['upper']
    legs_all = R['legs'] | R['shorts']
    H = R['body'].shape[0]
    Y = np.mgrid[0:H, 0:1][0]
    coat_low = Y < R['box'][1] + (R['box'][1] - R['box'][0]) * 1.6  # шинель до колен
    top_keep = head
    leg_keep = head | upper  # кисти рук поверх штанов
    boot_keep = head | upper
    out = {
        'body_tank': paint(R, R['torso'], (228, 224, 212), keep=top_keep, grow=1),
        'body_telnyashka': paint(R, R['torso'], (232, 232, 238), stripes(R, 10, 0, 0.3), keep=top_keep, grow=1),
        'body_robe': paint(R, upper, (50, 58, 76), keep=top_keep, grow=3),
        'body_quilted': paint(R, upper, (46, 48, 52), quilt(R), keep=top_keep, grow=5),
        'body_leather': paint(R, upper, (98, 58, 34), gloss=0.6, keep=top_keep, grow=3),
        'body_tracksuit': paint(R, upper, (58, 86, 140), quilt(R), keep=top_keep, grow=6),
        'drop_coat': paint(R, upper | ((R['legs'] | R['shorts']) & coat_low), (84, 90, 70), keep=top_keep, grow=5),
        'legs_pants': paint(R, legs_all & ~R['feet'], (58, 60, 66), keep=leg_keep, grow=6),
        'legs_cargo': paint(R, legs_all & ~R['feet'], (98, 106, 72), camo(R), keep=leg_keep, grow=7),
        'legs_jeans': paint(R, legs_all & ~R['feet'], (38, 40, 44), keep=leg_keep, grow=6),
        'feet_slippers': paint(R, R['feet'], (64, 48, 38), keep=boot_keep, grow=2),
        'feet_kirza': paint(R, R['boots'], (24, 24, 24), gloss=0.5, keep=boot_keep, grow=3),
        'feet_sneakers': paint(R, R['feet'] | (R['boots'] & ndimage.binary_dilation(R['feet'], iterations=8)), (70, 52, 36), keep=boot_keep, grow=3),
    }
    return {k: v for k, v in out.items() if v is not None}


# --- Комплекты: одежда с листа комплектов, перенесённая на позы, которых на листе нет ---

def _outfits():
    """item → set из shared/content.ts (OUTFITS)."""
    import re
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shared', 'content.ts'), encoding='utf-8').read()
    block = src[src.index('export const OUTFITS'):]
    block = block[: block.index('};')]
    return dict(re.findall(r"(\w+): \{ set: '(\w+)'", block))


OUTFIT_SETS = _outfits()
_outfit_cache = {}


def _sample(set_name):
    """Цвет и фактура верха, низа и обуви с картинки комплекта (стоя)."""
    if set_name in _outfit_cache:
        return _outfit_cache[set_name]
    path = os.path.join(ROOT, 'outfit', set_name, 'stand.png')
    a = np.asarray(Image.open(path).convert('RGBA')).astype(float)
    alpha = a[..., 3] > 200
    ys, xs = np.nonzero(alpha)
    y0, y1 = ys.min(), ys.max()
    h = y1 - y0

    def band(f0, f1, wf=0.34):
        r0, r1 = int(y0 + h * f0), int(y0 + h * f1)
        cols = np.nonzero(alpha[r0:r1].any(0))[0]
        cx = (cols.min() + cols.max()) / 2
        half = (cols.max() - cols.min()) * wf / 2
        c0, c1 = int(cx - half), int(cx + half)
        patch = a[r0:r1, c0:c1, :3]
        m = alpha[r0:r1, c0:c1]
        lum = patch.mean(2)
        # без контуров и кожи: только ткань
        ok = m & (lum > 30)
        col = np.median(patch[ok], axis=0) if ok.any() else np.array([80, 80, 80.0])
        # пятнистая ли ткань (камуфляж): разброс оттенков внутри куска
        spotty = False
        if ok.sum() > 50:
            px = patch[ok]
            hue = px - px.mean(1, keepdims=True)
            spotty = float(np.std(lum[ok]) / (lum[ok].mean() + 1e-6)) > 0.2 and float(np.abs(hue).mean()) > 6
        return col, spotty

    def skinlike(f0, f1):
        # рукава: смотрим по краям фигуры на уровне плеч/локтей — кожа или ткань
        r0, r1 = int(y0 + h * f0), int(y0 + h * f1)
        sl = a[r0:r1][alpha[r0:r1]]
        cols = np.nonzero(alpha[r0:r1].any(0))[0]
        edge = np.zeros_like(alpha[r0:r1])
        w = max(3, int((cols.max() - cols.min()) * 0.14))
        edge[:, cols.min(): cols.min() + w] = True
        edge[:, cols.max() - w: cols.max()] = True
        px = a[r0:r1][edge & alpha[r0:r1]]
        if not len(px):
            return False
        r, g, b = px[:, 0], px[:, 1], px[:, 2]
        return float(((r > b + 18) & (r > 110)).mean()) > 0.45

    top = band(0.2, 0.42)
    low = band(0.62, 0.84, 0.5)
    boot = band(0.94, 0.995, 0.8)
    res = dict(top=top, low=low, boot=boot, sleeveless=skinlike(0.24, 0.4))
    _outfit_cache[set_name] = res
    return res


def tile(tex, H, W):
    th, tw = tex.shape
    reps = (H // th + 1, W // tw + 1)
    return np.tile(tex, reps)[:H, :W]


def outfit_items(R):
    out = {}
    head, upper = R['head'], R['upper']
    legs_all = R['legs'] | R['shorts']
    H, W = R['body'].shape
    for item, set_name in OUTFIT_SETS.items():
        try:
            smp = _sample(set_name)
        except (FileNotFoundError, ValueError):
            continue
        tc, tsp = smp['top']
        lc, lsp = smp['low']
        bc, _ = smp['boot']
        top_mask = R['torso'] if smp['sleeveless'] else upper
        layers = [
            paint(R, legs_all & ~R['boots'], tuple(lc), camo(R, 5) if lsp else None, keep=head | upper, grow=6, detail=1.0),
            paint(R, R['boots'], tuple(bc), gloss=0.3, keep=head | upper, grow=3),
            paint(R, top_mask, tuple(tc), camo(R, 7) if tsp else None, keep=head, grow=1 if smp["sleeveless"] else 4, detail=0.5),
        ]
        img = None
        for l in layers:
            if l is None:
                continue
            img = l if img is None else Image.alpha_composite(img, l)
        if img is not None:
            out['outfit_' + item] = img
    return out


# наколки: где на теле и какой рисунок (иконка с листа или простой узор)
def tattoos(R):
    out = {}
    im = R['im']
    H, W = R['body'].shape
    torso, arms = R['torso'], R['arms']
    ink = np.array([38, 58, 92], float)

    def stamp(mask, art, box):
        # art: HxW маска 0..1 рисунка в прямоугольнике box (y0,x0,y1,x1) — только по коже
        y0, x0, y1, x1 = box
        a = np.zeros((H, W))
        hh, ww = max(1, y1 - y0), max(1, x1 - x0)
        pic = np.asarray(Image.fromarray((art * 255).astype(np.uint8)).resize((ww, hh), Image.LANCZOS)) / 255.0
        ya, xa = max(0, y0), max(0, x0)
        yb, xb = min(H, y1), min(W, x1)
        if yb <= ya or xb <= xa:
            return None
        a[ya:yb, xa:xb] = pic[ya - y0 : yb - y0, xa - x0 : xb - x0]
        a *= mask
        o = np.zeros((H, W, 4), np.uint8)
        base = im[..., :3].astype(float)
        col = base * 0.45 + ink * 0.55
        o[..., :3] = np.clip(col, 0, 255)
        o[..., 3] = np.clip(a * 0.72 * 255, 0, 255)
        return Image.fromarray(o, 'RGBA').filter(ImageFilter.GaussianBlur(0.5))

    def icon(name):
        p = os.path.join(ROOT, 'tattoo', name + '.png')
        if not os.path.exists(p):
            return None
        a = np.asarray(Image.open(p).convert('RGBA')).astype(float)
        dark = 1 - a[..., :3].mean(2) / 255.0
        pic = np.clip(dark * 1.8, 0, 1) * (a[..., 3] / 255.0)
        ys, xs = np.nonzero(pic > 0.1)  # обрезаем пустые поля
        return pic[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1] if len(ys) else None

    def shapes(kind, n=64):
        Y, X = np.mgrid[0:n, 0:n] / n
        if kind == 'star':
            ang = np.arctan2(Y - 0.5, X - 0.5)
            r = np.hypot(Y - 0.5, X - 0.5)
            return ((r < 0.12 + 0.3 * np.abs(np.cos(4 * ang)) ** 6) & (r < 0.45)).astype(float)
        if kind == 'web':
            r = np.hypot(Y - 1, X - 0.5)
            ang = np.arctan2(Y - 1, X - 0.5)
            return (((np.abs((r * 8) % 1 - 0.5) < 0.07) | (np.abs((ang * 5) % 1 - 0.5) < 0.05)) & (r < 0.9)).astype(float)
        if kind == 'blob':  # кот/тигр/роза — плотное пятно с просветами
            r = np.hypot(Y - 0.5, X - 0.5)
            return ((r < 0.42) & ~((np.abs(X - 0.35) < 0.06) & (np.abs(Y - 0.42) < 0.05)) & ~((np.abs(X - 0.65) < 0.06) & (np.abs(Y - 0.42) < 0.05))).astype(float)
        if kind == 'eagle':
            return (((np.abs(Y - 0.45 - 0.25 * np.abs(X - 0.5)) < 0.12) | ((np.abs(X - 0.5) < 0.07) & (Y > 0.35) & (Y < 0.85)))).astype(float)
        return np.ones((n, n))

    ty, tx = np.nonzero(torso)
    if len(ty):
        t0, t1, l0, l1 = ty.min(), ty.max(), tx.min(), tx.max()
        th, tw = t1 - t0, l1 - l0
        church = icon('t_church')
        stars = icon('t_stars')
        cy = t0 + th * 0.12
        if church is not None:
            out['t_church'] = stamp(torso, church, (int(cy), int(l0 + tw * 0.28), int(cy + th * 0.36), int(l1 - tw * 0.28)))
        if stars is not None:
            s = int(tw * 0.18)
            a1 = stamp(torso, stars, (int(t0), int(l0 + tw * 0.06), int(t0 + s), int(l0 + tw * 0.06 + s)))
            a2 = stamp(torso, stars, (int(t0), int(l1 - tw * 0.06 - s), int(t0 + s), int(l1 - tw * 0.06)))
            if a1 and a2:
                out['t_stars'] = Image.alpha_composite(a1, a2)
        eagle = icon('t_eagle')
        if eagle is not None:
            out['t_eagle'] = stamp(torso, eagle, (int(t0 + th * 0.56), int(l0 + tw * 0.22), int(t0 + th * 0.86), int(l1 - tw * 0.22)))
    # руки: две самые крупные компоненты
    lab, n = ndimage.label(arms)
    comps = sorted(range(1, n + 1), key=lambda i: -(lab == i).sum())[:2]
    comps = sorted(comps, key=lambda i: np.nonzero(lab == i)[1].mean())  # слева направо
    spots = {'t_spider': (0, 0.18), 't_cat': (0, 0.6), 't_tiger': (1, 0.18), 't_rose': (1, 0.6)}
    for tid, (side, where) in spots.items():
        art = icon(tid)
        if art is None:
            continue
        if len(comps) <= side:
            continue
        m = lab == comps[side]
        ys, xs = np.nonzero(m)
        y = int(ys.min() + (ys.max() - ys.min()) * where)
        row = xs[np.abs(ys - y) < 4]
        if not len(row):
            continue
        x = int(row.mean())
        w = int(max(10, (row.max() - row.min()) * 0.95))
        h = int(w * art.shape[0] / art.shape[1])
        out[tid] = stamp(m, art, (y - h // 2, x - w // 2, y + h // 2, x + w // 2))
    return {k: v for k, v in out.items() if v is not None}


def debug_map(R):
    H, W = R['body'].shape
    o = np.zeros((H, W, 3), np.uint8)
    for name, col in [('legs', (0, 180, 0)), ('shorts', (0, 0, 255)), ('arms', (255, 160, 0)), ('torso', (255, 0, 0)), ('head', (200, 0, 200)), ('boots', (0, 90, 0)), ('feet', (0, 255, 255))]:
        o[R[name]] = col
    return Image.fromarray(o)


def main():
    meta = {}
    for pose in POSES:
        if ONLY_POSE and pose != ONLY_POSE:
            continue
        R = regions(pose)
        d = os.path.join(ROOT, 'dress', pose)
        os.makedirs(d, exist_ok=True)
        if DEBUG:
            debug_map(R).save(os.path.join(d, '_map.png'))
        # перенос комплектов на позы — только по флагу: рисованные комплекты с листа смотрятся лучше
        layers = outfit_items(R) if ONLY_OUTFITS else {**items(R), **tattoos(R)}
        for k, img in layers.items():
            img.save(os.path.join(d, k + '.webp'), 'WEBP', quality=82, method=6)
        # голова (для шапки) и ступни (для тени) — доли картинки
        H, W = R['body'].shape
        hy, hx = np.nonzero(R['head'])
        fy, fx = np.nonzero(R['feet'] | R['boots'])
        meta[pose] = {
            'head': [round(hx.min() / W, 4), round(hy.min() / H, 4), round(hx.max() / W, 4), round(hy.max() / H, 4)],
            'feet': [round(fx.min() / W, 4), round(fx.max() / W, 4)] if len(fx) else [0.3, 0.7],
        }
        print(pose, 'ok')
    path = os.path.join(ROOT, 'dress', 'meta.json')
    if ONLY_POSE and os.path.exists(path):  # одна поза — дополняем старую разметку
        with open(path) as f:
            meta = {**json.load(f), **meta}
    with open(path, 'w') as f:
        json.dump(meta, f)


main()
