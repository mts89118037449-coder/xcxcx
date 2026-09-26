// Рисованный герой с листа ассетов (public/art/sheet/hero.png).
// Пока нет слоёв по позам, он заменяет SVG-персонажа во всех сценах.

import { artUrl, useArt } from './raster.ts';

/** Пропорции вырезанной картинки героя (ширина / высота). */
const ASPECT = 376 / 984;
const H = 214;

export function useHero(): string | null {
  return artUrl(useArt(), 'sheet/hero');
}

/** Герой в системе координат SVG-персонажа: ступни на y≈208, центр по x=60. */
export function HeroG({ url, mirror = false, tone }: { url: string; mirror?: boolean; tone?: string }) {
  const w = H * ASPECT;
  return (
    <g>
      <ellipse cx={60} cy={209} rx={34} ry={5} fill="#000" opacity={0.4} />
      <g className="char-breathe">
        <image
          href={url}
          x={60 - w / 2}
          y={210 - H}
          width={w}
          height={H}
          transform={mirror ? 'translate(120 0) scale(-1 1)' : undefined}
          style={tone ? { filter: tone } : undefined}
        />
      </g>
    </g>
  );
}
