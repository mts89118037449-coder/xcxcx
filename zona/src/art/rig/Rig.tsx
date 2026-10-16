// Общие типы фигурок, оружие в руке и точка входа: Rig/RigHead — мультяшные фигурки из Toon.tsx.
// Система координат: 120×210, ступни на y=210, центр x=60, лицом вправо.
import type { Look } from '../../../shared/types.ts';

const INK = '#1b130d';

export type RigAnim =
  | 'idle' | 'walk' | 'run' | 'sit' | 'floor' | 'guard' | 'punch' | 'hit' | 'ko' | 'cheer' | 'work' | 'crossed' | 'pullup'
  | 'smoke' | 'drink' | 'eat' | 'think' | 'stretch' | 'wave' | 'flex' | 'squat' | 'pushup' | 'sleep' | 'dance' | 'taunt' | 'kick' | 'dodge' | 'cold' | 'crouch' | 'talk' | 'scratch' | 'yawn'
  | 'upper' | 'nod' | 'shrug' | 'sad' | 'proud' | 'bob' | 'heavy' | 'koFwd' | 'koSpin';

/** Что персонаж держит в руках в этой анимации. */
export const ANIM_PROP: Partial<Record<RigAnim, 'cig' | 'mug' | 'bowl' | 'zzz' | 'hammer'>> = { smoke: 'cig', drink: 'mug', eat: 'bowl', sleep: 'zzz', work: 'hammer' };

/** Оружие в руке: заточки, дубинки, топор — рисуется в системе координат кисти. */
export function Weapon({ id }: { id?: string }) {
  switch (id) {
    case 'wpn_spoon':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1} y={-2} width={2} height={18} rx={1} fill="#b9bdc2" stroke={INK} strokeWidth={0.6} />
          <ellipse cx={0} cy={18} rx={2.6} ry={3.8} fill="#cfd3d8" stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'wpn_rebar':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1.6} y={-5} width={3.2} height={8} fill="#3a2a1e" stroke={INK} strokeWidth={0.6} />
          <path d="M -1.3,3 L 1.3,3 L 0,24 Z" fill="#9aa0a6" stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'wpn_knuckles':
      return <path d="M -5,1 C -4,-1 4,-1 5.5,1 L 5.5,5 C 3,4 -3,4 -5,5 Z" fill="#b8bcc0" stroke={INK} strokeWidth={0.7} />;
    case 'wpn_chain':
      return (
        <g>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <ellipse key={i} cx={1 + i * 0.6} cy={8 + i * 3.6} rx={1.5} ry={2.2} fill="none" stroke="#8a8e94" strokeWidth={1.1} />
          ))}
        </g>
      );
    case 'wpn_golden':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1.8} y={-5} width={3.6} height={8} rx={1} fill="#6a3a1a" stroke={INK} strokeWidth={0.6} />
          <rect x={-3} y={2.6} width={6} height={1.6} fill="#d9a53a" />
          <path d="M -1.6,4 C -2,12 -1,20 0,26 C 1.4,20 2,12 1.6,4 Z" fill="#e8c35a" stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'wpn_toothbrush':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1.1} y={-4} width={2.2} height={16} rx={1} fill="#3a8ad8" stroke={INK} strokeWidth={0.6} />
          <path d="M -1,12 L 0,20 L 1,12 Z" fill="#dfe3e8" stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'wpn_pipe':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-2.2} y={-6} width={4.4} height={30} rx={0.8} fill="#6e747a" stroke={INK} strokeWidth={0.7} />
          <rect x={-2.8} y={20} width={5.6} height={4} rx={0.6} fill="#555a60" stroke={INK} strokeWidth={0.6} />
          <path d="M -1.2,-4 V 18" stroke="#9aa0a6" strokeWidth={0.8} />
        </g>
      );
    case 'wpn_razor':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1.4} y={-5} width={2.8} height={10} rx={1} fill="#1e1c1c" stroke={INK} strokeWidth={0.6} />
          <path d="M -1.2,5 L 3.4,5 L 3,16 C 2,17 -1,17 -1.2,15 Z" fill="#d8dde2" stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'wpn_nunchaku':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1.6} y={-5} width={3.2} height={13} rx={1.4} fill="#8a5a32" stroke={INK} strokeWidth={0.6} />
          <path d="M 0,8 C 1,11 3,12 5,12" fill="none" stroke="#9aa0a6" strokeWidth={0.9} strokeDasharray="1 0.6" />
          <rect x={4} y={10} width={3.2} height={13} rx={1.4} transform="rotate(-30 5.6 11)" fill="#8a5a32" stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'drop_scalpel':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1.2} y={-4} width={2.4} height={12} rx={1} fill="#c8ccd2" stroke={INK} strokeWidth={0.6} />
          <path d="M -1.2,8 L 1.4,8 L 0.6,16 C 0,17 -1.2,16 -1.2,14 Z" fill="#eef2f6" stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'wpn_axe':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-1.6} y={-6} width={3.2} height={30} rx={1.2} fill="#8a5a32" stroke={INK} strokeWidth={0.6} />
          <path d="M -1.6,16 L -9,13 C -12,17 -12,24 -9,28 L -1.6,24 Z" fill="#9aa0a6" stroke={INK} strokeWidth={0.7} />
          <path d="M -9,13.6 C -11.2,17.6 -11.2,23.6 -9,27.4" fill="none" stroke="#e8ecf0" strokeWidth={0.8} />
        </g>
      );
    case 'drop_baton':
      return (
        <g transform="translate(0 6) rotate(-100)">
          <rect x={-2} y={-6} width={4} height={36} rx={2} fill="#1c1c1c" stroke={INK} strokeWidth={0.6} />
          <rect x={-2.4} y={-2} width={4.8} height={3} fill="#3a3a3a" />
        </g>
      );
    default:
      return null;
  }
}

export interface FaceFx {
  sweat?: boolean;
  blood?: boolean;
  bruise?: boolean;
  smile?: boolean;
  /** мороз: пар изо рта */
  breath?: boolean;
}

export interface RigProps {
  /** следы и эмоции на лице */
  fx?: FaceFx;
  look: Look;
  anim?: RigAnim;
  mirror?: boolean;
  /** не анимировать (иконки, портреты) */
  still?: boolean;
  shadow?: boolean;
  /** начало анимации — чтобы разовые (удар) шли с начала */
  startKey?: string | number;
  bare?: boolean;
  /** стоя без дела — иногда закурить, попить чаю, потянуться (по умолчанию да) */
  fidget?: boolean;
  /** озвучивать движения: шаги, взмахи, падения (только главные герои сцены) */
  sfx?: boolean;
  /** что держит в руке поверх анимации: подушка, телефон, бумаги, заточка */
  hold?: 'pillow' | 'phone' | 'papers' | 'spoon';
}

// Фигурки в духе «Южного парка» (Toon.tsx). Старая «реалистичная» кукла удалена — нигде не использовалась.
export { Toon as Rig, ToonHeadPortrait as RigHead } from './Toon.tsx';
