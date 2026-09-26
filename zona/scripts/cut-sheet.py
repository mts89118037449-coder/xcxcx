# Вырезает героя, вещи, наколки и лица с листа ассетов в public/art.
# Запуск: python3 scripts/cut-sheet.py <лист.jpg>   (нужны pillow, numpy, scipy)
import numpy as np, os, sys
from PIL import Image, ImageFilter
from scipy import ndimage
SRC = Image.open(sys.argv[1]).convert('RGB')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'art', 'sheet')

def cut(box, name, scale=3, bright=188, sat=40, shadow=False, pad=2, holes=False):
    x0,y0,x1,y1 = box
    im = SRC.crop((x0-pad,y0-pad,x1+pad,y1+pad))
    a = np.asarray(im).astype(int)
    mn, mx = a.min(2), a.max(2)
    cand = (mn > bright) & ((mx-mn) < sat)
    if shadow:  # серая тень под ногами тоже фон
        cand |= ((mx-mn) < 22) & (mn > 105)
    # фон — то, что связано с краем кадра
    lab, _ = ndimage.label(cand)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:,0], lab[:,-1]]))) - {0}
    bg = np.isin(lab, list(edge))
    if holes:  # белые дырки внутри петель (чётки, кольцо ключей, просвет между рукой и телом)
        bg |= cand & (mn > (215 if holes == 'strict' else 200)) & ((mx-mn) < (18 if holes == 'strict' else 40))
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # убираем мелкие островки мусора
    fg = alpha > 0
    lab2, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab2, range(1, n+1))
        keep = np.isin(lab2, [i+1 for i,s in enumerate(sizes) if s >= max(30, sizes.max()*0.25)])
        alpha = np.where(keep, alpha, 0).astype(np.uint8)
    rgba = np.dstack([a.astype(np.uint8), alpha])
    img = Image.fromarray(rgba, 'RGBA')
    bb = img.getbbox()
    img = img.crop(bb)
    img = img.resize((img.width*scale, img.height*scale), Image.LANCZOS)
    # мягкий край альфы
    r,g,b,al = img.split()
    al = al.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))  # срезаем белую кайму от JPEG.point(lambda v: 0 if v < 40 else min(255, int(v*1.15)))
    img = Image.merge('RGBA', (r,g,b,al))
    path = os.path.join(OUT, name + '.png')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    return img.size

print('hero', cut((421, 40, 613, 550), 'hero', scale=2, shadow=True, holes='strict'))
ICONS = {
  'cap_knit': (812,297,848,329), 'cap_ushanka': (811,349,851,393), 'cap_bandana': (857,297,901,326),
  'cap_gold': (857,297,901,326),
  'body_tank': (806,55,852,113), 'body_telnyashka': (856,55,901,113),
  'body_robe': (959,55,1009,113), 'body_quilted': (907,121,955,182), 'body_leather': (805,121,853,182),
  'body_tracksuit': (805,197,853,255), 'drop_coat': (959,197,1009,255),
  'legs_pants': (622,56,669,158), 'legs_jeans': (682,56,726,158), 'legs_cargo': (737,56,783,158),
  'feet_slippers': (619,296,671,332), 'feet_sneakers': (681,288,736,327), 'feet_kirza': (734,340,788,392),
  'wpn_spoon': (685,419,698,457), 'wpn_rebar': (630,419,643,457), 'wpn_golden': (665,419,676,457),
}
for k,b in ICONS.items(): print(k, cut(b, 'icons/'+k))
for k,b in {'charm_beads': (977,296,1013,336), 'charm_cross': (869,349,896,392), 'drop_keys': (853,506,893,552)}.items():
    print(k, cut(b, 'icons/'+k, holes=True))
TAT = {'t_stars': (172,421,211,451), 't_church': (168,458,217,512)}
for k,b in TAT.items(): print(k, cut(b, 'tattoo/'+k))
FACES = {'b_rat': (340,270,370,322), 'b_guard': (171,270,207,322), 'b_chief': (376,270,408,322), 'b_warden': (303,334,346,386)}
for k,b in FACES.items(): print(k, cut(b, '../npc/'+k+'_face', scale=4, pad=1))
