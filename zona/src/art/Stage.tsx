// Сцена локации: растровая, если художник уже нарисовал нужные слои, иначе SVG.

import type { ReactNode } from 'react';
import { FURNITURE } from '../../shared/content.ts';
import type { Look } from '../../shared/types.ts';
import { CharacterG, type Mood } from './Character.tsx';
import { HeroG, useHero } from './hero.tsx';
import { artUrl, characterLayers, useArt, type Pose } from './raster.ts';
import { CellScene, Place, WorkScene, YardScene } from './Scenes.tsx';

type Loc = 'cell' | 'work' | 'yard';

const POSE: Record<Loc, Pose> = { cell: 'bunk', work: 'work', yard: 'yard' };

/** Где стоит SVG-персонаж в каждой локации. */
const SVG_PLACE: Record<Loc, { x: number; y: number; scale: number }> = {
  cell: { x: 194, y: 262, scale: 1.06 },
  work: { x: 172, y: 264, scale: 1.02 },
  yard: { x: 150, y: 266, scale: 1.02 },
};

interface Props {
  loc: Loc;
  look: Look;
  mood: Mood;
  bare?: boolean;
  furniture?: string[];
  anim: string;
  animKey: number;
  onClick?: () => void;
}

export function Stage({ loc, look, mood, bare, furniture = [], anim, animKey, onClick }: Props) {
  const art = useArt();
  const hero = useHero();
  const bg = artUrl(art, `bg/${loc}`);
  const opts = { bare, hurt: mood === 'hurt' };
  // Своя поза для локации, а если её ещё не нарисовали — общая стоячая поза, вставленная в сцену.
  const own = characterLayers(art, POSE[loc], look, opts);
  const standIn = own ? null : characterLayers(art, 'stand', look, opts);
  const layers = own ?? standIn;

  if (bg && layers) {
    const overlays = loc === 'cell' ? FURNITURE.filter((f) => furniture.includes(f.id)).map((f) => artUrl(art, `bg/cell/${f.id}`)) : [];
    return (
      <div className="scene raster" onClick={onClick}>
        <img className="raster-layer" src={bg} alt="" />
        {overlays.map((u, i) => u && <img key={i} className="raster-layer" src={u} alt="" />)}
        <RasterFigure layers={layers} className={`${standIn ? 'raster-standin' : ''} ${anim}`} key={animKey} />
        <div className="scene-fx" />
      </div>
    );
  }

  const at = SVG_PLACE[loc];
  const fig = (
    <Place x={at.x} y={at.y} scale={at.scale} key={animKey} className={`pose ${anim}`}>
      {hero ? <HeroG url={hero} /> : <CharacterG look={look} bare={bare} mood={mood} />}
    </Place>
  );
  if (loc === 'cell') return <CellScene furniture={furniture} onClick={onClick}>{fig}</CellScene>;
  if (loc === 'work') return <WorkScene>{fig}</WorkScene>;
  return <YardScene>{fig}</YardScene>;
}

/** Стопка слоёв одного размера — персонаж, нарисованный в позе. */
export function RasterFigure({ layers, className = '', mirror = false }: { layers: string[]; className?: string; mirror?: boolean }): ReactNode {
  return (
    <div className={`raster-figure ${className}`} style={mirror ? { transform: 'scaleX(-1)' } : undefined}>
      <div className="raster-breathe">
        {layers.map((u) => (
          <img key={u} className="raster-layer" src={u} alt="" />
        ))}
      </div>
    </div>
  );
}
