// Сцена локации: SVG-фон и кукла героя на риге, вокруг — сокамерники.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TalkKind } from '../Talk.tsx';
import type { Look } from '../../shared/types.ts';
import { CellScene, Place, WorkScene, YardScene, type InteriorIds } from './Scenes.tsx';
import type { RigAnim } from './rig/Rig.tsx';
import { ImageG, PoseG, useNpc, type PoseName } from './sprites.tsx';
import { YardCats, type CatsQuest } from './Critters.tsx';
import { idleFor, onWake } from '../feel.ts';

/** Что бормочет герой, когда игрок его бросил. Чёрный юмор — по месту. */
const IDLE_LINES: Record<Loc, string[]> = {
  cell: ['Эй. Ты там живой?', 'Срок сам себя не отсидит', 'Считаю трещины в потолке. Сорок две. Вчера было сорок одна', 'Если что, я не скучаю. Я жду', 'Тапни меня, а то Лёха опять начнёт про бывшую', 'Дед говорит, первые десять лет тяжело'],
  work: ['Смена сама не отработается', 'Мастер смотрит. Делаю вид, что работаю', 'Тут платят мало, зато стабильно мало', 'Норма выработки — как горизонт. Видно, но не дойти'],
  yard: ['Голубь опять смотрит на меня как на хлеб', 'Гуляю. По кругу. Как жизнь', 'Вышка видит всё. Даже как я скучаю', 'Свежий воздух. Ну, относительно'],
};

/** Простой: 0 — игрок тут, 1 — отвлёкся (герой смотрит и бормочет), 2 — бросил (герой спит). */
function useIdle(): number {
  const [lvl, setLvl] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.hidden) return;
      const ms = idleFor();
      setLvl(ms > 20000 ? 2 : ms > 4000 ? 1 : 0);
    }, 1000);
    const off = onWake(() => setLvl(0));
    return () => {
      clearInterval(iv);
      off();
    };
  }, []);
  return lvl;
}

type Loc = 'cell' | 'work' | 'yard';
export type Mood = 'idle' | 'hurt' | 'win' | 'tired' | 'rich' | 'cold';
const MOOD_EMOJI: Partial<Record<Mood, string>> = { hurt: '🤕', tired: '😴', rich: '🤑', cold: '🥶' };

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
  /** праздничное украшение хаты */
  deco?: string | null;
  anim: string;
  animKey: number;
  onClick?: () => void;
  /** Разговор с сокамерником по тапу — только в своих сценах, не в гостях. */
  onTalk?: (kind: TalkKind) => void;
  /** у кого есть что сказать — горит «!» */
  hot?: TalkKind | null;
  /** в хате идёт ремонт — бригада работает */
  workers?: boolean;
  /** что герой держит: телефон на стриме */
  hold?: 'phone';
  /** квест с котами во дворе */
  cats?: CatsQuest;
  /** что ещё положить в сцену (тыква на Хэллоуин и т. п.) */
  extra?: ReactNode;
}

const RIG_DRIVEN = new Set(['act-work', 'lunge-r', 'act-cheer', 'act-dress']);

export function Stage({ loc, look, mood, bare, furniture = [], interior, wall, pet, deco, anim, animKey, onClick, onTalk, hot, workers, hold, cats, extra }: Props) {
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
  const idleLvl = useIdle();
  // реплика на каждый новый «отвлёкся»; держится 4 секунды
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    if (idleLvl !== 1) return setLine(null);
    const all = IDLE_LINES[loc];
    setLine(all[Math.floor(Math.random() * all.length)]);
    const t = setTimeout(() => setLine(null), 4000);
    return () => clearTimeout(t);
  }, [idleLvl, loc]);
  const idleAnim: RigAnim | undefined = busyPose ? undefined : idleLvl === 2 ? 'sleep' : line ? (loc === 'cell' ? 'talk' : 'wave') : undefined;
  const walking = loc === 'yard' && !busyPose && !idleAnim && (mood === 'idle' || mood === 'win');

  const at = PLACE[loc];
  // раненый в хате сидит на полу
  const idle: PoseName = loc === 'cell' ? (mood === 'hurt' ? 'floor' : 'sit') : loc === 'work' ? 'stand34' : 'walk1';
  // настроение: побитый сутулится, уставший зевает, богатый — руки в боки, на морозе трясётся
  const moodAnim: RigAnim | undefined =
    loc === 'cell'
      ? mood === 'cold' ? 'cold' : undefined
      : mood === 'hurt' || mood === 'tired' ? 'sad' : mood === 'rich' ? 'proud' : mood === 'cold' ? 'cold' : undefined;
  const moodEmoji = MOOD_EMOJI[mood];
  // движения, которые делает сам скелет, не пересоздают фигуру — поза перетекает плавно, без рывка
  const rigDriven = !!anim && RIG_DRIVEN.has(anim);
  const fig = (
    <Place x={at.x} y={at.y} scale={at.scale} key={rigDriven ? 'fig' : animKey} className={`pose ${rigDriven ? '' : anim}`}>
      <g className={walking ? 'yard-walk' : undefined}>
        <PoseG name={idle} anim={busyPose ?? idleAnim ?? moodAnim} look={look} bare={bare} startKey={animKey} sfx={!walking} hold={hold} fx={{ bruise: mood === 'hurt', sweat: face === 'sweat', smile: face === 'smile' || (mood === 'rich' && !face) }} />
      </g>
      {line && !busyPose && (
        <g className="idle-line" transform={`translate(0 ${loc === 'cell' ? 40 : 0})`}>
          <foreignObject x={-70} y={-62} width={180} height={60}>
            <div className="idle-bubble">{line}</div>
          </foreignObject>
        </g>
      )}
      {moodEmoji && !busyPose && !line && (
        <g className="mood-bubble" transform={`translate(${loc === 'cell' ? 96 : 92} ${loc === 'cell' && mood === 'hurt' ? 150 : 34})`}>
          <circle r={13} fill="#f2e6c8" stroke="#2a1a10" strokeWidth={1.4} />
          <circle cx={-12} cy={14} r={3.4} fill="#f2e6c8" stroke="#2a1a10" strokeWidth={1.2} />
          <circle cx={-17} cy={21} r={2} fill="#f2e6c8" stroke="#2a1a10" strokeWidth={1} />
          <text y={5} fontSize={14} textAnchor="middle">{moodEmoji}</text>
        </g>
      )}
    </Place>
  );
  const crowd = (
    <>
      {workers && loc === 'cell' && <Workers />}
      <Crowd loc={loc} onTalk={onTalk} react={busyPose} reactKey={animKey} hot={hot} />
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
  if (loc === 'cell') return <CellScene furniture={furniture} interior={interior} wall={wall} pet={pet} deco={deco} onClick={onClick}>{crowd}{extra}{fig}</CellScene>;
  if (loc === 'work') return <WorkScene>{crowd}{extra}{fig}</WorkScene>;
  return <YardScene><YardCats quest={cats} />{crowd}{extra}{fig}</YardScene>;
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

/** Как сокамерники отзываются на то, что делает герой. */
const REACT: Partial<Record<RigAnim, RigAnim[]>> = {
  work: ['nod', 'idle'],
  cheer: ['wave', 'nod'],
  flex: ['nod', 'shrug'],
  punch: ['shrug', 'crossed'],
  kick: ['shrug', 'crossed'],
};

/** Бригада ремонтников: один красит стену, другой стучит молотком. */
function Workers() {
  const a = useNpc('sheet/cast/worker');
  const b = useNpc('sheet/cast/coverall');
  return (
    <g className="reno-workers">
      {a && (
        <Place x={262} y={228} scale={0.5}>
          <ImageG url={a.url} height={a.height} mirror anim="work" tone="brightness(0.85)" />
        </Place>
      )}
      {b && (
        <Place x={142} y={226} scale={0.48}>
          <ImageG url={b.url} height={b.height} anim="squat" tone="brightness(0.8)" />
        </Place>
      )}
      <g transform="translate(290 196) scale(0.8)">
        <rect x={-9} y={0} width={18} height={20} rx={2} fill="#8a9aa8" stroke="#222" strokeWidth={1.4} />
        <rect x={-9} y={0} width={18} height={5} fill="#d8c25a" />
        <text x={0} y={-4} fontSize={10} textAnchor="middle">🖌️</text>
      </g>
    </g>
  );
}

function Crowd({ loc, onTalk, react, reactKey, hot }: { loc: Loc; onTalk?: (k: TalkKind) => void; react: RigAnim | null; reactKey: number; hot?: TalkKind | null }) {
  return (
    <>
      {CROWD[loc].map((c, k) => (
        <CrowdMember key={c.name} {...c} idx={k} react={react} reactKey={reactKey} hot={hot === c.talk} onTalk={onTalk ? () => onTalk(c.talk) : undefined} />
      ))}
    </>
  );
}

/** Короткая реакция: проиграть движение и вернуться к своему. */
function useReaction() {
  const [r, setR] = useState<RigAnim | null>(null);
  const tm = useRef(0);
  const go = (a: RigAnim, delay = 0, ms = 1700) => {
    clearTimeout(tm.current);
    tm.current = window.setTimeout(() => {
      setR(a);
      tm.current = window.setTimeout(() => setR(null), ms);
    }, delay);
  };
  useEffect(() => () => clearTimeout(tm.current), []);
  return [r, go] as const;
}

function CrowdMember({ name, x, y, scale, onTalk, idx, react, reactKey, hot }: { name: string; x: number; y: number; scale: number; onTalk?: () => void; idx: number; react: RigAnim | null; reactKey: number; hot?: boolean }) {
  const npc = useNpc(name);
  const [r, go] = useReaction();
  // пришёл в локацию — кто-то кивнул, кто-то махнул
  useEffect(() => {
    go(idx % 2 ? 'wave' : 'nod', 500 + idx * 700);
  }, []);
  // герой что-то сделал — сокамерники отзываются
  useEffect(() => {
    const opts = react ? REACT[react] : undefined;
    if (opts) go(opts[idx % opts.length], 250 + idx * 250);
  }, [reactKey, react]);
  if (!npc) return null;
  const headY = y - npc.height * scale - 6;
  return (
    <g
      className={onTalk ? 'npc-click' : undefined}
      onClick={(e) => {
        if (!onTalk) return;
        e.stopPropagation();
        go('talk', 0, 1400);
        onTalk();
      }}
    >
      <Place x={x} y={y} scale={scale}>
        <ImageG url={npc.url} height={npc.height} mirror={x > 180} tone="brightness(0.8) saturate(0.9)" className="char-breathe" anim={r ?? undefined} />
      </Place>
      {onTalk && (
        <g className={`talk-bubble ${hot ? 'hot' : ''}`} transform={`translate(${x} ${headY})`}>
          <rect x={-12} y={-10} width={24} height={15} rx={7.5} fill={hot ? '#ffd24a' : '#f2e6c8'} />
          <path d="M-3,5 L0,10 L3,5 Z" fill={hot ? '#ffd24a' : '#f2e6c8'} />
          <text x={0} y={1.5} fontSize={hot ? 11 : 9} textAnchor="middle" fill="#2a1a10" fontWeight={900}>
            {hot ? '!' : '…'}
          </text>
        </g>
      )}
    </g>
  );
}
