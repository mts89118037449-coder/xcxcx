// Сцена локации. По приоритету:
//   1) полные слои по позам от художника (с одеждой) — см. raster.ts;
//   2) рисованные позы с листа (sheet/pose) — персонаж сидит, ходит, работает;
//   3) SVG-персонаж.

import { useEffect, useState, type ReactNode } from 'react';
import { BUILDS, FURNITURE, SKINS } from '../../shared/content.ts';
import type { Look } from '../../shared/types.ts';
import { CharacterG, type Mood } from './Character.tsx';
import { artUrl, characterLayers, useArt, type Pose } from './raster.ts';
import { CellScene, Place, WorkScene, YardScene, type InteriorIds } from './Scenes.tsx';
import { ImageG, PoseG, WALK, useFlipbook, useNpc, usePoses, type PoseName } from './sprites.tsx';

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
  interior?: InteriorIds;
  anim: string;
  animKey: number;
  onClick?: () => void;
}

export function Stage({ loc, look, mood, bare, furniture = [], interior, anim, animKey, onClick }: Props) {
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
    const idle: PoseName = loc === 'cell' ? (mood === 'hurt' ? 'floor' : 'sit') : loc === 'work' ? 'stand34' : walkFrame;
    figure = (
      <g className={walking ? 'yard-walk' : undefined}>
        <Body look={look}>
          <PoseG name={busyPose ?? idle} />
        </Body>
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
  const crowd = poses ? <Crowd loc={loc} /> : null;
  if (loc === 'cell') return <CellScene furniture={furniture} interior={interior} onClick={onClick}>{crowd}{fig}</CellScene>;
  if (loc === 'work') return <WorkScene>{crowd}{fig}</WorkScene>;
  return <YardScene>{crowd}{fig}</YardScene>;
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

/** Сокамерники на заднем плане: чуть мельче и темнее, чтобы не спорить с героем. */
const CROWD: Record<Loc, { name: string; x: number; y: number; scale: number }[]> = {
  cell: [
    { name: 'sheet/rival/3', x: 92, y: 250, scale: 0.8 },
    { name: 'sheet/cast/ushanka', x: 318, y: 246, scale: 0.74 },
  ],
  work: [
    { name: 'sheet/rival/4', x: 300, y: 248, scale: 0.78 },
    { name: 'sheet/cast/worker', x: 40, y: 246, scale: 0.74 },
  ],
  yard: [
    { name: 'sheet/rival/5', x: 58, y: 236, scale: 0.72 },
    { name: 'sheet/rival/1', x: 292, y: 238, scale: 0.74 },
  ],
};

function Crowd({ loc }: { loc: Loc }) {
  return (
    <>
      {CROWD[loc].map((c) => (
        <CrowdMember key={c.name} {...c} />
      ))}
    </>
  );
}

function CrowdMember({ name, x, y, scale }: { name: string; x: number; y: number; scale: number }) {
  const npc = useNpc(name);
  if (!npc) return null;
  return (
    <Place x={x} y={y} scale={scale}>
      <ImageG url={npc.url} height={npc.height} tone="brightness(0.72) saturate(0.85)" className="char-breathe" />
    </Place>
  );
}

/** Телосложение (ширина фигуры) и цвет кожи из редактора персонажа. */
export function Body({ look, children }: { look: Look; children: ReactNode }) {
  const scale = BUILDS.find((b) => b.id === look.build)?.scale ?? 1;
  const filter = SKINS.find((s) => s.id === look.skin)?.filter || undefined;
  return (
    <g transform={`translate(60 0) scale(${scale} 1) translate(-60 0)`} style={filter ? { filter } : undefined}>
      {children}
    </g>
  );
}
