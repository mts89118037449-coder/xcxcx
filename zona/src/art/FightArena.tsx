import { useEffect, useState } from 'react';
import { ITEMS } from '../../shared/content.ts';
import type { FightReplay, Look } from '../../shared/types.ts';
import { Bar, fmt } from '../game.tsx';
import { RigHead } from './rig/Rig.tsx';
import { NPC_RIGS } from './rig/npcs.ts';
import { PoseG } from './sprites.tsx';
import { babble, play } from '../sound.ts';
import { Place, YardScene } from './Scenes.tsx';
import { BOSS_MOVES, BossStrike } from './BossMoves.tsx';

export interface Fighter {
  name: string;
  look: Look;
  /** id босса — кукла sheet/boss/<id> */
  npc?: string;
}

const STEP_MS = 480;
const HIT_WORDS = ['БАЦ!', 'ХРЯСЬ!', 'ТЫЩ!', 'БУМ!', 'ШМЯК!'];
const CRIT_WORDS = ['БАБАХ!', 'КРИТ!', 'ХРЕНАК!', 'БДЫЩ!'];

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
  // представление босса — вслух (кум и начальство говорят голосом, остальные бормочут)
  useEffect(() => {
    const mv = enemy.npc ? BOSS_MOVES[enemy.npc] : undefined;
    if (mv && startAt === 0) babble(mv.intro, enemy.name);
  }, []);
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
    if (prev && i > startAt) {
      play(prev.miss ? 'miss' : prev.fin ? 'finisher' : prev.crit ? 'crit' : prev.dmg > 0 ? 'hit' : 'click');
      if ((prev.combo ?? 0) >= 2) play('combo');
    }
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
  // следы на лицах: кровь — после пропущенного крита, фингал — когда здоровья мало, улыбка — у победителя
  const critTaken = (side: 0 | 1) => played.some((r) => r.crit && r.dmg > 0 && r.by !== side);
  const fxOf = (side: 0 | 1) => ({
    blood: critTaken(side),
    bruise: hpNow[side] < replay.maxHp[side] * 0.3,
    smile: !!done && (side === 0 ? replay.win : !replay.win),
  });
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
  const move = enemy.npc ? BOSS_MOVES[enemy.npc] : undefined;
  const stance = move?.stance ?? 'guard';
  // серия ударов — счётчик над тем, кто бьёт; добивание — крупно на весь экран
  const combo = last && !done && (last.combo ?? 0) >= 2 && !last.fin ? last : null;
  const notes = last && !done && (
    <>
      {move && last.by === 1 && strike && (
        <div key={`mv${i}`} className="boss-move-name">
          {move.name}
        </div>
      )}
      {combo && (
        <div key={`c${i}`} className={`combo-pop ${combo.by === 0 ? 'left' : 'right'}`}>
          Серия ×{combo.combo}
          {combo.combo === 3 && <small>следующий — добивание!</small>}
        </div>
      )}
      {last.fin && (
        <div key={`f${i}`} className="fin-pop">
          ДОБИВАНИЕ!
        </div>
      )}
      {last.note && !last.fin && (
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
    <div className={`arena ${last && !done && (last.crit || last.fin) && last.dmg > 0 ? `shake${alt}` : ''}${last?.fin && !done ? ' fin-flash' : ''}`}>
      <YardScene tower={false}>
          <Place x={ME_X} y={266} scale={0.98} className={`pose ${meCls}${meCls ? alt : ''}`}>
            <PoseG
              startKey={i}
              name="guard34"
              anim={done ? (replay.win ? 'cheer' : 'ko') : !last ? 'guard' : last.by === 0 ? (strike ? (last.fin ? 'upper' : last.crit || i % 3 === 2 ? 'kick' : 'punch') : 'guard') : last.miss ? 'dodge' : last.dmg > 0 ? (last.fin ? 'koSpin' : 'hit') : 'guard'}
              look={me.look}
              fx={fxOf(0)}
              sfx
            />
          </Place>
          <Place x={EN_X} y={266} scale={0.98} className={`pose ${enemyCls}${enemyCls ? alt : ''}`}>
            <PoseG
              startKey={i}
              name="guard34"
              anim={done ? (replay.win ? (move?.ko ?? 'ko') : 'taunt') : !last ? stance : last.by === 1 ? (strike ? (last.fin ? 'upper' : last.crit || i % 3 === 1 ? 'kick' : 'punch') : stance) : last.miss ? 'dodge' : last.dmg > 0 ? (last.fin ? 'koSpin' : 'hit') : stance}
              look={enemyLook}
              fx={fxOf(1)}
              sfx
              mirror
            />
          </Place>
          {/* фирменный приём босса: бросок, пёс или росчерк */}
          {move && last && !done && last.by === 1 && strike && <BossStrike key={`bm${i}`} fx={move.fx} from={EN_X - 20} to={ME_X + 10} />}
          {/* вспышка удара — там, куда пришёлся кулак или нога */}
          {last && !done && strike && last.dmg > 0 && (
            <g key={`imp${i}`} transform={`translate(${last.by === 0 ? EN_X - 16 : ME_X + 16} ${i % 3 === (last.by === 0 ? 2 : 1) || last.crit ? 178 : 146})`}>
              <g className={`impact ${last.crit ? 'crit' : ''}`}>
                <path d="M0,-16 L4,-5 L15,-8 L7,1 L14,11 L2,6 L-3,16 L-5,5 L-16,7 L-7,-1 L-13,-12 L-3,-5 Z" fill={last.crit ? '#ffd24a' : '#fff4c8'} stroke="#ff7a2a" strokeWidth={1.4} strokeLinejoin="round" />
                <circle r={4} fill="#fff" />
              </g>
              {/* комиксное «БАЦ!» — как в мультике */}
              <text className={`comic-word ${last.crit ? 'crit' : ''}`} x={last.by === 0 ? 10 : -10} y={-22} textAnchor="middle" transform={`rotate(${last.by === 0 ? 12 : -12})`}>
                {last.fin ? 'НА!' : last.crit ? CRIT_WORDS[i % CRIT_WORDS.length] : HIT_WORDS[i % HIT_WORDS.length]}
              </text>
            </g>
          )}
          {/* линии движения за кулаком */}
          {last && !done && strike && (
            <g key={`ml${i}`} className="motion-lines" transform={`translate(${last.by === 0 ? ME_X + 20 : EN_X - 20} 146) scale(${last.by === 0 ? 1 : -1} 1)`}>
              <path d="M -26,-8 H -6 M -32,0 H -4 M -24,8 H -8" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
            </g>
          )}
          {last && !done && last.miss && (
            <text key={`wz${i}`} className="comic-word miss" x={last.by === 0 ? EN_X : ME_X} y={120} textAnchor="middle">
              ВЖУХ!
            </text>
          )}
          {last && !done && (last.dmg > 0 || last.miss) && (
            <text key={`d${i}`} className="dmg-pop" x={popX} y={84} textAnchor="middle" fontSize={last.crit ? 30 : 22} fill={last.miss ? '#9fd3ff' : last.crit ? '#ffcf5a' : '#fff'}>
              {last.miss ? 'мимо' : `−${last.dmg}${last.crit ? '!' : ''}`}
            </text>
          )}
      </YardScene>
      {notes}
      {move && !last && !done && (
        <div className="boss-intro">
          <b>{enemy.name}</b>
          <span>{move.intro}</span>
        </div>
      )}
      {hp}
      {skip}
    </div>
  );
}
