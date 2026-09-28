import { useEffect, useState } from 'react';
import { OUTFITS } from '../../shared/content.ts';
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

/** Боссы, нарисованные вполоборота вправо — отражаем, чтобы смотрели на героя. */
const BOSS_MIRROR = new Set<string>();

const RIVAL_OUTFITS = Object.keys(OUTFITS).filter((id) => OUTFITS[id].poses.includes('guard'));

/** Если у соперника нет комплекта — одеваем по имени, чтобы все были разные, но постоянные. */
function rivalLook(enemy: Fighter): Look {
  const body = enemy.look.equipped.body;
  if (body && OUTFITS[body]?.poses.includes('guard')) return enemy.look;
  let h = 0;
  for (const ch of enemy.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { ...enemy.look, equipped: { ...enemy.look.equipped, body: RIVAL_OUTFITS[h % RIVAL_OUTFITS.length] } };
}

/** Проигрывает бой, пришедший с сервера, удар за ударом. */
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

  const poses = usePoses();
  const hitCls = last?.crit ? 'got-crit' : 'got-hit';
  const meCls = done ? (replay.win ? 'act-cheer' : poses ? '' : 'ko') : !last ? '' : last.by === 0 ? (strike ? 'lunge-r' : '') : hurt ? hitCls : '';
  const enemyCls = done ? (replay.win ? 'ko-r' : 'act-cheer') : !last ? '' : last.by === 1 ? (strike ? 'lunge-l' : '') : hurt ? hitCls : '';
  const popX = last?.by === 0 ? 256 : 104;
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
  const skip = !caught && (
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
          {last && !done && (last.dmg > 0 || last.miss) && (
            <div key={`d${i}`} className={`dmg-html ${last.by === 0 ? 'right' : 'left'} ${last.crit ? 'crit' : ''}`}>
              {last.miss ? 'мимо' : `−${last.dmg}${last.crit ? '!' : ''}`}
            </div>
          )}
          {notes}
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
                  <PoseG name={done ? 'crossed' : last?.by === 0 && strike ? 'lunge' : 'guard34'} look={me.look} />
                )}
              </Body>
            ) : (
              <CharacterG look={me.look} mood={myMood} />
            )}
          </Place>
          <Place x={256} y={266} scale={0.98} key={`en${i}`} className={`pose ${enemyCls}`}>
            {!enemy.npc && poses ? (
              // соперник-зэк — такой же герой в своём комплекте, развёрнут лицом к нам
              <PoseG
                name={done ? (replay.win ? 'guard34' : 'crossed') : last?.by === 1 && strike ? 'lunge' : 'guard34'}
                look={rivalLook(enemy)}
                mirror
              />
            ) : foe ? (
              <ImageG url={foe.url} height={foe.height} mirror={BOSS_MIRROR.has(enemy.npc ?? '')} className="char-breathe" />
            ) : (
              <CharacterG look={enemy.look} build={enemy.build} mood={done ? (replay.win ? 'hurt' : 'win') : 'idle'} />
            )}
          </Place>
          {last && !done && (last.dmg > 0 || last.miss) && (
            <text key={`d${i}`} className="dmg-pop" x={popX} y={84} textAnchor="middle" fontSize={last.crit ? 26 : 18} fill={last.miss ? '#9fd3ff' : last.crit ? '#ffcf5a' : '#fff'}>
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
