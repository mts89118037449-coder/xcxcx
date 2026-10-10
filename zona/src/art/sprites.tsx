// Персонажи игры — куклы рига: герой, соперники, НПС и боссы в одном стиле.
// Имена поз остались от прежних спрайтов и переводятся в анимации рига.

import { type ReactNode } from 'react';
import type { Look } from '../../shared/types.ts';
import { Rig, RigHead, type FaceFx, type RigAnim } from './rig/Rig.tsx';
import { NPC_RIGS } from './rig/npcs.ts';

export type PoseName =
  | 'stand' | 'stand34' | 'crossed' | 'squat' | 'sit' | 'sit34' | 'lunge' | 'run'
  | 'guard' | 'guard34' | 'guard2' | 'guard3' | 'walk1' | 'walk2' | 'walk3' | 'walk4' | 'push' | 'lying' | 'floor';

export interface Npc {
  url: string;
  height: number;
}

function npcOf(name: string): Npc | null {
  return NPC_RIGS[name] ? { url: `rig:${name}`, height: 204 } : null;
}

const RIVALS = Object.keys(NPC_RIGS).filter((k) => k.startsWith('sheet/rival/'));

/** Соперник-зэк: один и тот же для одного имени. */
export function useRival(seed: string): Npc | null {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return npcOf(RIVALS[h % RIVALS.length]);
}

export function useBoss(id: string | undefined): Npc | null {
  return id ? npcOf(`sheet/boss/${id}`) : null;
}

/** Фоновые персонажи локаций. */
export function useNpc(name: string): Npc | null {
  return npcOf(name);
}

/** НПС в системе координат персонажа, ступнями на y=210, по центру x=60. */
export function ImageG({ url, mirror, tone }: { url: string; height?: number; mirror?: boolean; tone?: string; className?: string }) {
  const n = NPC_RIGS[url.replace(/^rig:/, '')];
  if (!n) return null;
  return (
    <g style={tone ? { filter: tone } : undefined}>
      <Rig look={n.look} anim={n.anim} mirror={mirror} />
    </g>
  );
}

/** Какая анимация рига у старых имён поз. */
const POSE_ANIM: Record<PoseName, RigAnim> = {
  stand: 'idle', stand34: 'idle', crossed: 'crossed', squat: 'sit', sit: 'sit', sit34: 'sit', lunge: 'punch', run: 'run',
  guard: 'guard', guard34: 'guard', guard2: 'guard', guard3: 'guard', walk1: 'walk', walk2: 'walk', walk3: 'walk', walk4: 'walk',
  push: 'work', lying: 'ko', floor: 'floor',
};

/** Персонаж игрока: кукла на скелете — одежда, наколки и внешность видны и двигаются вместе с телом. */
export function PoseG({ name, mirror, tone, look, noShadow, anim, bare, startKey, fx }: { name: PoseName; mirror?: boolean; tone?: string; look?: Look; noShadow?: boolean; anim?: RigAnim; bare?: boolean; startKey?: string | number; fx?: FaceFx }) {
  const l = look ?? { equipped: {}, tattoos: [], str: 5 };
  const a = anim ?? POSE_ANIM[name] ?? 'idle';
  return (
    <g style={tone ? { filter: tone } : undefined}>
      {a === 'sit' && <Stool />}
      <Rig look={l} anim={a} mirror={mirror} shadow={!noShadow} bare={bare} startKey={startKey} fx={fx} />
    </g>
  );
}

/** Круглый портрет — голова рига: та же внешность, что у персонажа. */
export function Face({ face, size = 36, className = '', skin, hat }: { face: number | null | undefined; size?: number; className?: string; skin?: number; hat?: string }) {
  if (face == null) return null;
  return (
    <span className={`face rig-face ${className}`} style={{ width: size, height: size }}>
      <RigHead look={{ equipped: hat ? { head: hat } : {}, tattoos: [], str: 5, face, skin }} size={size} />
    </span>
  );
}

/** Персонаж-«хозяин» экрана: поясной портрет с репликой. */
export function NpcBanner({ who, name, text, children }: { who: string; name: string; text: string; children?: ReactNode }) {
  return (
    <div className="npc-banner">
      <div className="npc-pic">
        <NpcPortrait who={`sheet/cast/${who}`} />
      </div>
      <div className="npc-say">
        <b>{name}</b>
        <span>«{text}»</span>
        {children}
      </div>
    </div>
  );
}

/** Поясной портрет НПС — тот же риг, крупно по пояс. */
export function NpcPortrait({ who, className, tight }: { who: string; className?: string; tight?: boolean }) {
  const n = NPC_RIGS[who];
  if (!n) return null;
  return (
    <svg className={`npc-portrait ${className ?? ''}`} viewBox={tight ? '20 22 80 80' : '10 18 100 110'} preserveAspectRatio="xMidYMin slice" aria-hidden>
      <Rig look={n.look} anim="idle" shadow={false} />
    </svg>
  );
}

/** Табурет под сидящим героем. */
function Stool() {
  // низкий табурет под мультяшные короткие ноги
  return (
    <g>
      <ellipse cx={58} cy={209} rx={22} ry={3.5} fill="#000" opacity={0.35} />
      <path d="M 40,200 L 37,209 M 76,200 L 79,209" stroke="#1b130d" strokeWidth={5} strokeLinecap="round" />
      <path d="M 40,200 L 37,209 M 76,200 L 79,209" stroke="#6a4a2e" strokeWidth={3} strokeLinecap="round" />
      <rect x={32} y={194} width={52} height={8} rx={2} fill="#7a5634" stroke="#1b130d" strokeWidth={1.6} />
      <rect x={34} y={195} width={48} height={2} fill="#9a7650" />
    </g>
  );
}
