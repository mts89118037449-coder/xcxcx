import { useEffect, useState } from 'react';
import { ITEMS } from '../../shared/content.ts';
import type { FightReplay, Look } from '../../shared/types.ts';
import { Bar, fmt } from '../game.tsx';
import { RigHead } from './rig/Rig.tsx';
import { NPC_RIGS } from './rig/npcs.ts';
import { PoseG } from './sprites.tsx';
import { play } from '../sound.ts';
import { Place, YardScene } from './Scenes.tsx';

export interface Fighter {
  name: string;
  look: Look;
  /** id босса — кукла sheet/boss/<id> */
  npc?: string;
}

const STEP_MS = 480;

const RIVAL_TOPS = ITEMS.filter((i) => i.slot === 'body' && !i.bossOnly).map((i) => i.id);

/** Сопернику без верха подбираем шмотку по имени — все разные, но постоянные. */
function rivalLook(enemy: Fighter): Look {
  if (enemy.look.equipped.body) return enemy.look;
  let h = 0;
  for (const ch of enemy.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { ...enemy.look, equipped: { ...enemy.look.equipped, body: RIVAL_TOPS[h % RIVAL_TOPS.length] } };
}

/** Проигрывает бой, пришедший с сервера, удар за ударом. */
/** Где стоят бойцы: близко, чтобы удар с выпадом доставал. */
const ME_X = 118;
const EN_X = 242;

export function FightArena({
  me,
  enemy,
  replay,
  onDone,
  final = true,
  startAt = 0,
}: {
  me: Fighter;
  enemy: Fighter;
  replay: FightReplay;
  onDone(): void;
  /** false — бой ещё идёт (пошаговый): без финальных поз, ждём следующих ходов */
  final?: boolean;
  /** с какого хода проигрывать (при возвращении в начатый бой) */
  startAt?: number;
}) {
  const [i, setI] = useState(startAt);
  const total = replay.rounds.length;
  const caught = i >= total;
  const done = caught && final;

  useEffect(() => {
    if (caught) {
      onDone();
      return;
    }
    // звук прошлого хода: удар, крит или промах
    const prev = replay.rounds[i - 1];
    if (prev && i > startAt) play(prev.miss ? 'miss' : prev.crit ? 'crit' : prev.dmg > 0 ? 'hit' : 'click');
    const next = replay.rounds[i];
    const t = setTimeout(() => setI(i + 1), i === 0 ? 350 : next && !next.dmg && !next.miss ? STEP_MS * 0.8 : STEP_MS);
    return () => clearTimeout(t);
  }, [i, caught, onDone]);

  const played = replay.rounds.slice(0, i);
  // здоровье — по записи: урон противнику того, кто действует, лечение — ему самому
  const hpNow: [number, number] = [replay.startHp[0], replay.startHp[1]];
  for (const r of played) {
    const o = r.by === 0 ? 1 : 0;
    hpNow[o] = Math.max(0, hpNow[o] - r.dmg);
    hpNow[r.by] = Math.min(replay.maxHp[r.by], hpNow[r.by] + (r.heal ?? 0));
  }
  const [myHp, enemyHp] = hpNow;
  const last = played[played.length - 1];
  // удар — с выпадом; кровотечение и перки без урона — без
  const strike = !!last && (last.miss || (last.dmg > 0 && last.note !== '🩸'));
  const hurt = !!last && last.dmg > 0;

  const hitCls = last?.crit ? 'got-crit' : 'got-hit';
  // победа и нокаут — анимации рига; здесь только толчки при ударах
  const meCls = done ? '' : !last ? '' : last.by === 0 ? (strike ? 'lunge-r' : '') : hurt ? hitCls : '';
  const enemyCls = done ? '' : !last ? '' : last.by === 1 ? (strike ? 'lunge-l' : '') : hurt ? hitCls : '';
  const popX = last?.by === 0 ? EN_X : ME_X;
  // фигуры не пересоздаются на каждый удар — поза перетекает; толчок перезапускаем сменой имени анимации
  const alt = i % 2 ? ' alt' : '';
  // всплывашки: урон — над целью, лечение и перк — над тем, кто действует
  const notes = last && !done && (
    <>
      {last.note && (
        <div key={`n${i}`} className="perk-note" style={{ left: last.by === 0 ? '29%' : '71%' }}>
          {last.note}
        </div>
      )}
      {!!last.heal && (
        <div key={`h${i}`} className={`dmg-html heal-pop ${last.by === 0 ? 'left' : 'right'}`}>
          +{last.heal}
        </div>
      )}
    </>
  );

  // противник — всегда кукла рига: босс в своём наряде, зэк — в своём шмоте
  const enemyLook = enemy.npc ? (NPC_RIGS[`sheet/boss/${enemy.npc}`]?.look ?? enemy.look) : rivalLook(enemy);
  const hp = (
    <div className="arena-hp">
      <div>
        <RigHead look={me.look} size={24} className="arena-face" />
        {me.name}
        <Bar kind="hp" value={myHp} max={replay.maxHp[0]} label={fmt(myHp)} />
      </div>
      <div>
        <RigHead look={enemyLook} size={24} className="arena-face flip" />
        {enemy.name}
        <Bar kind="hp" value={enemyHp} max={replay.maxHp[1]} label={fmt(enemyHp)} />
      </div>
    </div>
  );
  const skip = !caught && (
    <button className="arena-skip" onClick={() => setI(total)}>
      Пропустить ⏭
    </button>
  );

  return (
    <div className={`arena ${last && !done && last.crit && last.dmg > 0 ? `shake${alt}` : ''}`}>
      <YardScene tower={false}>
          <Place x={ME_X} y={266} scale={0.98} className={`pose ${meCls}${meCls ? alt : ''}`}>
            <PoseG
              startKey={i}
              name="guard34"
              anim={done ? (replay.win ? 'cheer' : 'ko') : !last ? 'guard' : last.by === 0 ? (strike ? (last.crit || i % 3 === 2 ? 'kick' : 'punch') : 'guard') : last.miss ? 'dodge' : last.dmg > 0 ? 'hit' : 'guard'}
              look={me.look}
            />
          </Place>
          <Place x={EN_X} y={266} scale={0.98} className={`pose ${enemyCls}${enemyCls ? alt : ''}`}>
            <PoseG
              startKey={i}
              name="guard34"
              anim={done ? (replay.win ? 'ko' : 'taunt') : !last ? 'guard' : last.by === 1 ? (strike ? (last.crit || i % 3 === 1 ? 'kick' : 'punch') : 'guard') : last.miss ? 'dodge' : last.dmg > 0 ? 'hit' : 'guard'}
              look={enemyLook}
              mirror
            />
          </Place>
          {/* вспышка удара — там, куда пришёлся кулак или нога */}
          {last && !done && strike && last.dmg > 0 && (
            <g key={`imp${i}`} transform={`translate(${last.by === 0 ? EN_X - 16 : ME_X + 16} ${i % 3 === (last.by === 0 ? 2 : 1) || last.crit ? 178 : 146})`}>
              <g className={`impact ${last.crit ? 'crit' : ''}`}>
                <path d="M0,-16 L4,-5 L15,-8 L7,1 L14,11 L2,6 L-3,16 L-5,5 L-16,7 L-7,-1 L-13,-12 L-3,-5 Z" fill={last.crit ? '#ffd24a' : '#fff4c8'} stroke="#ff7a2a" strokeWidth={1.4} strokeLinejoin="round" />
                <circle r={4} fill="#fff" />
              </g>
            </g>
          )}
          {last && !done && (last.dmg > 0 || last.miss) && (
            <text key={`d${i}`} className="dmg-pop" x={popX} y={84} textAnchor="middle" fontSize={last.crit ? 30 : 22} fill={last.miss ? '#9fd3ff' : last.crit ? '#ffcf5a' : '#fff'}>
              {last.miss ? 'мимо' : `−${last.dmg}${last.crit ? '!' : ''}`}
            </text>
          )}
      </YardScene>
      {notes}
      {hp}
      {skip}
    </div>
  );
}
