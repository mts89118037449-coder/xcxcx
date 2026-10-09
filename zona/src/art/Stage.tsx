// Сцена локации: SVG-фон и кукла героя на риге, вокруг — сокамерники.

import { useEffect, useState } from 'react';
import type { TalkKind } from '../Talk.tsx';
import type { Look } from '../../shared/types.ts';
import { CellScene, Place, WorkScene, YardScene, type InteriorIds } from './Scenes.tsx';
import type { RigAnim } from './rig/Rig.tsx';
import { ImageG, PoseG, useNpc, type PoseName } from './sprites.tsx';

type Loc = 'cell' | 'work' | 'yard';
export type Mood = 'idle' | 'hurt' | 'win';

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
  /** раздет по пояс — показать наколки */
  bare?: boolean;
  furniture?: string[];
  interior?: InteriorIds;
  /** трофеи на стене хаты */
  wall?: string[];
  /** свой питомец в хате */
  pet?: string | null;
  anim: string;
  animKey: number;
  onClick?: () => void;
  /** Разговор с сокамерником по тапу — только в своих сценах, не в гостях. */
  onTalk?: (kind: TalkKind) => void;
}

const RIG_DRIVEN = new Set(['act-work', 'lunge-r', 'act-cheer', 'act-dress']);

export function Stage({ loc, look, mood, bare, furniture = [], interior, wall, pet, anim, animKey, onClick, onTalk }: Props) {
  // Короткая «рабочая» поза после действия, потом снова обычная.
  const [busyPose, setBusyPose] = useState<RigAnim | null>(null);
  const [face, setFace] = useState<'sweat' | 'smile' | null>(null);
  useEffect(() => {
    if (!animKey) return;
    const pose: RigAnim | null =
      anim === 'act-work' ? 'work' : anim === 'lunge-r' ? (Math.random() < 0.35 ? 'kick' : 'punch') : anim === 'act-cheer' ? 'cheer' : anim === 'act-dress' ? 'flex' : null;
    if (!pose) return;
    setBusyPose(pose);
    // после смены — пот, после радости — улыбка; держится несколько секунд
    setFace(pose === 'work' ? 'sweat' : pose === 'cheer' || pose === 'flex' ? 'smile' : null);
    const t = setTimeout(() => setBusyPose(null), pose === 'flex' ? 2100 : 1200);
    const t2 = setTimeout(() => setFace(null), pose === 'work' ? 6000 : 3500);
    return () => (clearTimeout(t), clearTimeout(t2));
  }, [animKey, anim, loc]);
  const walking = loc === 'yard' && !busyPose;

  const at = PLACE[loc];
  // раненый в хате сидит на полу
  const idle: PoseName = loc === 'cell' ? (mood === 'hurt' ? 'floor' : 'sit') : loc === 'work' ? 'stand34' : 'walk1';
  // движения, которые делает сам скелет, не пересоздают фигуру — поза перетекает плавно, без рывка
  const rigDriven = !!anim && RIG_DRIVEN.has(anim);
  const fig = (
    <Place x={at.x} y={at.y} scale={at.scale} key={rigDriven ? 'fig' : animKey} className={`pose ${rigDriven ? '' : anim}`}>
      <g className={walking ? 'yard-walk' : undefined}>
        <PoseG name={idle} anim={busyPose ?? undefined} look={look} bare={bare} startKey={animKey} fx={{ bruise: mood === 'hurt', sweat: face === 'sweat', smile: face === 'smile' }} />
      </g>
    </Place>
  );
  const crowd = (
    <>
      <Crowd loc={loc} onTalk={onTalk} />
      {loc === 'yard' && onTalk && (
        // турник во дворе — подтягивания без энергии
        <g className="npc-click" onClick={(e) => { e.stopPropagation(); onTalk('turnik'); }}>
          <rect x={16} y={124} width={74} height={126} fill="#fff" opacity={0.001} />
          <g className="talk-bubble" transform="translate(53 118)">
            <rect x={-12} y={-10} width={24} height={15} rx={7.5} fill="#f2e6c8" />
            <path d="M-3,5 L0,10 L3,5 Z" fill="#f2e6c8" />
            <text x={0} y={2} fontSize={9} textAnchor="middle">💪</text>
          </g>
        </g>
      )}
    </>
  );
  if (loc === 'cell') return <CellScene furniture={furniture} interior={interior} wall={wall} pet={pet} onClick={onClick}>{crowd}{fig}</CellScene>;
  if (loc === 'work') return <WorkScene>{crowd}{fig}</WorkScene>;
  return <YardScene>{crowd}{fig}</YardScene>;
}

/** Сокамерники на заднем плане: чуть мельче и темнее, чтобы не спорить с героем. */
const CROWD: Record<Loc, { name: string; x: number; y: number; scale: number; talk: TalkKind }[]> = {
  cell: [
    { name: 'sheet/rival/3', x: 92, y: 250, scale: 0.8, talk: 'lyoha' },
    { name: 'sheet/cast/ushanka', x: 318, y: 246, scale: 0.74, talk: 'ded' },
  ],
  work: [
    { name: 'sheet/rival/4', x: 300, y: 248, scale: 0.78, talk: 'coverall' },
    { name: 'sheet/cast/worker', x: 40, y: 246, scale: 0.74, talk: 'worker' },
  ],
  yard: [
    { name: 'sheet/rival/5', x: 58, y: 236, scale: 0.72, talk: 'smoker' },
    { name: 'sheet/rival/1', x: 292, y: 238, scale: 0.74, talk: 'amba' },
  ],
};

function Crowd({ loc, onTalk }: { loc: Loc; onTalk?: (k: TalkKind) => void }) {
  return (
    <>
      {CROWD[loc].map((c) => (
        <CrowdMember key={c.name} {...c} onTalk={onTalk ? () => onTalk(c.talk) : undefined} />
      ))}
    </>
  );
}

function CrowdMember({ name, x, y, scale, onTalk }: { name: string; x: number; y: number; scale: number; onTalk?: () => void }) {
  const npc = useNpc(name);
  if (!npc) return null;
  const headY = y - npc.height * scale - 6;
  return (
    <g
      className={onTalk ? 'npc-click' : undefined}
      onClick={(e) => {
        if (!onTalk) return;
        e.stopPropagation();
        onTalk();
      }}
    >
      <Place x={x} y={y} scale={scale}>
        <ImageG url={npc.url} height={npc.height} mirror={x > 180} tone="brightness(0.8) saturate(0.9)" className="char-breathe" />
      </Place>
      {onTalk && (
        <g className="talk-bubble" transform={`translate(${x} ${headY})`}>
          <rect x={-12} y={-10} width={24} height={15} rx={7.5} fill="#f2e6c8" />
          <path d="M-3,5 L0,10 L3,5 Z" fill="#f2e6c8" />
          <text x={0} y={1.5} fontSize={9} textAnchor="middle" fill="#2a1a10" fontWeight={900}>
            …
          </text>
        </g>
      )}
    </g>
  );
}
