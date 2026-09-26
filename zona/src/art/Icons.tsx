// Иконки вещей и наколок в той же манере, что персонаж.
// Вещи рисуются сами по себе (как на витрине), наколки — на участке кожи.

import { itemById } from '../../shared/content.ts';
import { CharacterG, ItemOnly } from './Character.tsx';

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

const TATTOO_CROP: Record<string, string> = {
  t_cat: '18 100 24 26',
  t_spider: '20 44 26 26',
  t_church: '44 48 32 28',
  t_stars: '36 44 48 20',
  t_rose: '78 98 24 30',
  t_tiger: '76 50 24 22',
  t_eagle: '42 80 36 26',
};

export function ItemIcon({ id, size = 44 }: { id: string; size?: number }) {
  const item = itemById.get(id);
  if (!item) return null;
  return (
    <svg className="icon" viewBox={cropFor(id, item.slot)} width={size} height={size} aria-label={item.name}>
      <ItemOnly id={id} slot={item.slot} />
    </svg>
  );
}

export function TattooIcon({ id, size = 44 }: { id: string; size?: number }) {
  return (
    <svg className="icon" viewBox={TATTOO_CROP[id] ?? '40 40 40 40'} width={size} height={size}>
      <CharacterG look={{ equipped: { legs: 'legs_pants' }, tattoos: [id], str: 10 }} />
    </svg>
  );
}
