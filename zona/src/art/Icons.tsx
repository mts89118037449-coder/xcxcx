// Иконки вещей и наколок в той же манере, что персонаж.
// Вещи рисуются сами по себе (как на витрине), наколки — на участке кожи.

import { itemById } from '../../shared/content.ts';
import { Rig, Weapon } from './rig/Rig.tsx';
import { TattooGlyph } from './rig/tattoos.tsx';

const RIG_CROP: Record<string, string> = { head: '10 -4 100 80', body: '18 86 84 100', legs: '24 160 72 54', feet: '24 186 72 28' };

export function ItemIcon({ id, size = 44 }: { id: string; size?: number }) {
  const item = itemById.get(id);
  if (!item) return null;
  // одежда — на той же кукле, что и персонаж, крупным планом
  if (RIG_CROP[item.slot]) {
    const crop = id === 'drop_coat' || id === 'body_parka' || id === 'body_gown' || id === 'drop_greatcoat' || id === 'body_sheepskin' ? '14 86 92 124' : RIG_CROP[item.slot];
    return (
      <svg className="icon rig-icon" viewBox={crop} width={size} height={size} aria-label={item.name}>
        <Rig look={{ equipped: { [item.slot]: id }, tattoos: [], str: 12, face: 16 }} anim="idle" still shadow={false} />
      </svg>
    );
  }
  if (item.slot === 'weapon') {
    // оружие рига: то же, что в руке у персонажа
    return (
      <svg className="icon" viewBox="-14 -18 28 28" width={size} height={size} aria-label={item.name}>
        <g transform="rotate(55) scale(0.95)">
          <Weapon id={id} />
        </g>
      </svg>
    );
  }
  // талисманы — эмодзи на подложке
  return (
    <span className="icon icon-emoji" style={{ width: size, height: size, fontSize: size * 0.6 }} aria-label={item.name}>
      {item.emoji}
    </span>
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
