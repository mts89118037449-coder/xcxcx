// Сцена локации. По приоритету:
//   1) полные слои по позам от художника (с одеждой) — см. raster.ts;
//   2) рисованные позы с листа (sheet/pose) — персонаж сидит, ходит, работает;
//   3) SVG-персонаж.

import { useEffect, useState, type ReactNode } from 'react';
import { FURNITURE } from '../../shared/content.ts';
import type { Look } from '../../shared/types.ts';
import { CharacterG, type Mood } from './Character.tsx';
import { artUrl, characterLayers, useArt, type Pose } from './raster.ts';
import { CellScene, Place, WorkScene, YardScene } from './Scenes.tsx';
import { PoseG, WALK, useFlipbook, usePoses, type PoseName } from './sprites.tsx';

type Loc = 'cell' | 'work' | 'yard';

const POSE: Record<Loc, Pose> = { cell: 'bunk', work: 'work', yard: 'yard' };

/** Где стоит персонаж в каждой локации (координаты SVG-сцены). */
const PLACE: Record<Loc, { x: number; y: number; scale: number }> = {
  cell: { x: 194, y: 262, scale: 1.06 },
  work: { x: 172, y: 264, scale: 1.02 },
  yard: { x: 170, y: 266, scale: 1.0 },
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
  const poses = usePoses();
  const bg = artUrl(art, `bg/${loc}`);
  const opts = { bare, hurt: mood === 'hurt' };
  const own = characterLayers(art, POSE[loc], look, opts);
  const standIn = own ? null : characterLayers(art, 'stand', look, opts);
  const layers = own ?? standIn;

  // Короткая «рабочая» поза после действия, потом снова обычная.
  const [busyPose, setBusyPose] = useState<PoseName | null>(null);
  useEffect(() => {
    if (!animKey) return;
    const pose: PoseName | null = anim === 'act-work' ? 'push' : anim === 'lunge-r' ? 'lunge' : anim === 'act-cheer' && loc !== 'cell' ? 'crossed' : null;
    if (!pose) return;
    setBusyPose(pose);
    const t = setTimeout(() => setBusyPose(null), 1100);
    return () => clearTimeout(t);
  }, [animKey, anim, loc]);
  const walking = loc === 'yard' && poses && !busyPose;
  const walkFrame = useFlipbook(WALK, 170, walking);

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

  const at = PLACE[loc];
  let figure: ReactNode;
  if (poses) {
    const idle: PoseName = loc === 'cell' ? 'sit' : loc === 'work' ? 'stand34' : walkFrame;
    figure = (
      <g className={walking ? 'yard-walk' : undefined}>
        <PoseG name={busyPose ?? idle} />
      </g>
    );
  } else {
    figure = <CharacterG look={look} bare={bare} mood={mood} />;
  }
  const fig = (
    <Place x={at.x} y={at.y} scale={at.scale} key={animKey} className={`pose ${poses && busyPose ? '' : anim}`}>
      {figure}
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
