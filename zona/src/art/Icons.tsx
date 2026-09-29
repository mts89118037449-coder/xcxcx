// Иконки вещей и наколок в той же манере, что персонаж.
// Вещи рисуются сами по себе (как на витрине), наколки — на участке кожи.

import { itemById } from '../../shared/content.ts';
import { Rig, Weapon } from './rig/Rig.tsx';

/** Талисманы без нарисованной иконки — эмодзи. */
const EMOJI_ONLY = new Set(['charm_dogtag', 'charm_watch', 'charm_fiksa']);
import { TattooGlyph } from './rig/tattoos.tsx';

const RIG_CROP: Record<string, string> = { head: '36 4 50 50', body: '32 54 62 66', legs: '34 108 56 104', feet: '32 186 56 26' };
import { ItemOnly } from './Character.tsx';
import { artUrl, useArt } from './raster.ts';

/** Золотые версии вещей — тонируем рисунок с листа. */
const GOLD_TINT = 'sepia(1) saturate(3.2) hue-rotate(-8deg) brightness(1.15) contrast(1.1)';
const TINT: Record<string, string> = { cap_gold: GOLD_TINT, wpn_golden: GOLD_TINT, charm_cross: GOLD_TINT };

/** Кадр для каждой вещи: где она лежит в системе координат персонажа. */
function cropFor(id: string, slot: string): string {
  switch (slot) {
    case 'head':
      return '42 -3 36 36';
    case 'body':
      return id === 'drop_coat' ? '18 34 84 142' : '18 34 84 98';
    case 'legs':
      return '36 104 48 96';
    case 'feet':
      return id === 'feet_kirza' ? '34 164 52 48' : '34 188 52 24';
    case 'weapon':
      return (
        {
          wpn_spoon: '44 96 38 38',
          wpn_knuckles: '49 114 18 18',
          wpn_golden: '45 92 40 40',
          wpn_chain: '22 127 38 38',
          drop_baton: '44 80 52 52',
        }[id] ?? '42 80 56 56'
      );
    default:
      return (
        {
          charm_beads: '40 104 38 48',
          charm_ring: '50 112 20 20',
          charm_cross: '46 36 28 36',
          drop_keys: '32 108 22 22',
        }[id] ?? '40 40 40 40'
      );
  }
}


export function ItemIcon({ id, size = 44 }: { id: string; size?: number }) {
  const art = useArt();
  const item = itemById.get(id);
  if (!item) return null;
  // одежда — на той же кукле, что и персонаж, крупным планом
  if (RIG_CROP[item.slot]) {
    const crop = id === 'drop_coat' || id === 'body_parka' || id === 'body_gown' ? '26 54 74 110' : RIG_CROP[item.slot];
    return (
      <svg className="icon rig-icon" viewBox={id === 'feet_kirza' ? '30 168 60 44' : crop} width={size} height={size} aria-label={item.name}>
        <Rig look={{ equipped: { [item.slot]: id }, tattoos: [], str: 12, face: 16 }} anim="idle" still shadow={false} />
      </svg>
    );
  }
  const drawn = artUrl(art, `sheet/icons/${id}`);
  if (!drawn && item.slot === 'weapon') {
    // оружие рига: то же, что в руке у персонажа
    return (
      <svg className="icon" viewBox="-14 -18 28 28" width={size} height={size} aria-label={item.name}>
        <g transform="rotate(55) scale(0.95)">
          <Weapon id={id} />
        </g>
      </svg>
    );
  }
  if (!drawn && EMOJI_ONLY.has(id)) {
    return (
      <span className="icon" style={{ width: size, height: size, fontSize: size * 0.62, display: 'inline-grid', placeItems: 'center' }} aria-label={item.name}>
        {item.emoji}
      </span>
    );
  }
  if (drawn) {
    return (
      <span className="icon icon-img" style={{ width: size, height: size }}>
        <img src={drawn} alt={item.name} style={TINT[id] ? { filter: TINT[id] } : undefined} />
      </span>
    );
  }
  return (
    <svg className="icon" viewBox={cropFor(id, item.slot)} width={size} height={size} aria-label={item.name}>
      <ItemOnly id={id} slot={item.slot} />
    </svg>
  );
}

export function TattooIcon({ id, size = 44 }: { id: string; size?: number }) {
  // тот же рисунок, что набит на риге, — на участке кожи
  return (
    <svg className="icon" viewBox="-13 -13 26 26" width={size} height={size}>
      <circle r={12.4} fill="#d9a888" stroke="#1b130d" strokeWidth={0.8} />
      <circle r={12.4} fill="url(#tat-skin)" />
      <defs>
        <radialGradient id="tat-skin" cx="0.62" cy="0.36" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity={0.22} />
          <stop offset="1" stopColor="#000" stopOpacity={0.22} />
        </radialGradient>
      </defs>
      <g opacity={0.9}>
        <TattooGlyph id={id} />
      </g>
    </svg>
  );
}
