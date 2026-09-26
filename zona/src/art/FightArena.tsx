import { useEffect, useState } from 'react';
import type { FightReplay, Look } from '../../shared/types.ts';
import { Bar, fmt } from '../game.tsx';
import { CharacterG } from './Character.tsx';
import { Face, ImageG, PoseG, useBoss, usePoses, useRival } from './sprites.tsx';
import { artUrl, characterLayers, useArt } from './raster.ts';
import { Place, YardScene } from './Scenes.tsx';
import { Body, RasterFigure } from './Stage.tsx';

export interface Fighter {
  name: string;
  look: Look;
  build?: number;
  /** id босса — для растровой картинки npc/<id> */
  npc?: string;
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

  const poses = usePoses();
  const meCls = done ? (replay.win ? 'act-cheer' : poses ? '' : 'ko') : last?.by === 0 ? 'lunge-r' : last ? (last.crit ? 'got-crit' : 'got-hit') : '';
  const enemyCls = done ? (replay.win ? 'ko-r' : 'act-cheer') : last?.by === 1 ? 'lunge-l' : last ? (last.crit ? 'got-crit' : 'got-hit') : '';
  const popX = last?.by === 0 ? 256 : 104;

  const myMood = done ? (replay.win ? 'win' : 'hurt') : myHp < replay.maxHp[0] * 0.3 ? 'hurt' : 'idle';
  const art = useArt();
  const rival = useRival(enemy.name);
  const bossArt = useBoss(enemy.npc);
  const foe = enemy.npc ? bossArt : rival;
  const bg = artUrl(art, 'bg/arena');
  const enemyFace = enemy.npc ? artUrl(art, `npc/${enemy.npc}_face`) : null;
  const meLayers = characterLayers(art, 'fight', me.look, { hurt: myMood === 'hurt' });
  // Противник-босс — отдельная картинка; противник-игрок — те же слои, отражённые.
  const enemyNpc = enemy.npc ? artUrl(art, `npc/${enemy.npc}`) : null;
  const enemyLayers = enemy.npc ? (enemyNpc ? [enemyNpc] : null) : characterLayers(art, 'fight', enemy.look, { hurt: done && replay.win });
  const raster = bg && meLayers && enemyLayers;

  const hp = (
    <div className="arena-hp">
      <div>
        <Face face={me.look.face} size={22} className="arena-face" />
        {me.name}
        <Bar kind="hp" value={myHp} max={replay.maxHp[0]} label={fmt(myHp)} />
      </div>
      <div>
        {enemyFace ? <img className="arena-face" src={enemyFace} alt="" /> : <Face face={enemy.look.face} size={22} className="arena-face" />}
        {enemy.name}
        <Bar kind="hp" value={enemyHp} max={replay.maxHp[1]} label={fmt(enemyHp)} />
      </div>
    </div>
  );
  const skip = !done && (
    <button className="arena-skip" onClick={() => setI(total)}>
      Пропустить ⏭
    </button>
  );

  if (raster) {
    return (
      <div className="arena">
        <div className="scene raster">
          <img className="raster-layer" src={bg} alt="" />
          <RasterFigure layers={meLayers} className={meCls} key={`me${i}`} />
          <RasterFigure layers={enemyLayers} className={enemyCls} key={`en${i}`} mirror={!enemy.npc} />
          {last && !done && (
            <div key={`d${i}`} className={`dmg-html ${last.by === 0 ? 'right' : 'left'} ${last.crit ? 'crit' : ''}`}>
              −{last.dmg}
              {last.crit ? '!' : ''}
            </div>
          )}
          <div className="scene-fx" />
        </div>
        {hp}
        {skip}
      </div>
    );
  }

  return (
    <div className="arena">
      <YardScene tower={false}>
          <Place x={104} y={266} scale={0.98} key={`me${i}`} className={`pose ${meCls}`}>
            {poses ? (
              <Body look={me.look}>
                {done && !replay.win ? (
                  // лёжа — та же одетая фигура, опрокинутая на землю головой к сопернику
                  <g>
                    <ellipse cx={40} cy={209} rx={70} ry={6} fill="#000" opacity={0.4} />
                    <g transform="translate(-100 -34) rotate(90 60 208)">
                      <PoseG name="stand" look={me.look} noShadow />
                    </g>
                  </g>
                ) : (
                  <PoseG name={done ? 'crossed' : last?.by === 0 ? 'lunge' : 'guard34'} look={me.look} />
                )}
              </Body>
            ) : (
              <CharacterG look={me.look} mood={myMood} />
            )}
          </Place>
          <Place x={256} y={266} scale={0.98} key={`en${i}`} className={`pose ${enemyCls}`}>
            {foe ? (
              <ImageG url={foe.url} height={foe.height} mirror={foe.url.endsWith('hero.png')} className="char-breathe" />
            ) : (
              <CharacterG look={enemy.look} build={enemy.build} mood={done ? (replay.win ? 'hurt' : 'win') : 'idle'} />
            )}
          </Place>
          {last && !done && (
            <text key={`d${i}`} className="dmg-pop" x={popX} y={84} textAnchor="middle" fontSize={last.crit ? 26 : 18} fill={last.crit ? '#ffcf5a' : '#fff'}>
              −{last.dmg}
              {last.crit ? '!' : ''}
            </text>
          )}
      </YardScene>
      {hp}
      {skip}
    </div>
  );
}
