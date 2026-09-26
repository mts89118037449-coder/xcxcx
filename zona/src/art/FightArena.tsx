import { useEffect, useState } from 'react';
import type { FightReplay, Look } from '../../shared/types.ts';
import { Bar, fmt } from '../game.tsx';
import { CharacterG } from './Character.tsx';
import { Place, YardScene } from './Scenes.tsx';

export interface Fighter {
  name: string;
  look: Look;
  build?: number;
}

const STEP_MS = 480;

/** Проигрывает бой, пришедший с сервера, удар за ударом. */
export function FightArena({ me, enemy, replay, onDone }: { me: Fighter; enemy: Fighter; replay: FightReplay; onDone(): void }) {
  const [i, setI] = useState(0);
  const total = replay.rounds.length;
  const done = i >= total;

  useEffect(() => {
    if (done) {
      onDone();
      return;
    }
    const t = setTimeout(() => setI(i + 1), i === 0 ? 350 : STEP_MS);
    return () => clearTimeout(t);
  }, [i, done, onDone]);

  const played = replay.rounds.slice(0, i);
  const myHp = Math.max(0, replay.startHp[0] - played.filter((r) => r.by === 1).reduce((s, r) => s + r.dmg, 0));
  const enemyHp = Math.max(0, replay.startHp[1] - played.filter((r) => r.by === 0).reduce((s, r) => s + r.dmg, 0));
  const last = played[played.length - 1];

  const meCls = done ? (replay.win ? 'act-cheer' : 'ko') : last?.by === 0 ? 'lunge-r' : last ? (last.crit ? 'got-crit' : 'got-hit') : '';
  const enemyCls = done ? (replay.win ? 'ko-r' : 'act-cheer') : last?.by === 1 ? 'lunge-l' : last ? (last.crit ? 'got-crit' : 'got-hit') : '';
  const popX = last?.by === 0 ? 256 : 104;

  return (
    <div className="arena">
      <YardScene tower={false}>
          <Place x={104} y={266} scale={0.98} key={`me${i}`} className={`pose ${meCls}`}>
            <CharacterG look={me.look} mood={done ? (replay.win ? 'win' : 'hurt') : myHp < replay.maxHp[0] * 0.3 ? 'hurt' : 'idle'} />
          </Place>
          <Place x={256} y={266} scale={0.98} key={`en${i}`} className={`pose ${enemyCls}`}>
            <CharacterG look={enemy.look} build={enemy.build} mood={done ? (replay.win ? 'hurt' : 'win') : 'idle'} />
          </Place>
          {last && !done && (
            <text key={`d${i}`} className="dmg-pop" x={popX} y={84} textAnchor="middle" fontSize={last.crit ? 26 : 18} fill={last.crit ? '#ffcf5a' : '#fff'}>
              −{last.dmg}
              {last.crit ? '!' : ''}
            </text>
          )}
      </YardScene>
      <div className="arena-hp">
        <div>
          {me.name}
          <Bar kind="hp" value={myHp} max={replay.maxHp[0]} label={fmt(myHp)} />
        </div>
        <div>
          {enemy.name}
          <Bar kind="hp" value={enemyHp} max={replay.maxHp[1]} label={fmt(enemyHp)} />
        </div>
      </div>
      {!done && (
        <button className="arena-skip" onClick={() => setI(total)}>
          Пропустить ⏭
        </button>
      )}
    </div>
  );
}
