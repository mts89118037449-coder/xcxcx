import { useState } from 'react';
import { BUTTS } from '../../shared/content.ts';
import { ButtG, Place, ZoneScene } from '../art/Scenes.tsx';
import { ImageG, PoseG, useNpc } from '../art/sprites.tsx';
import { lookOf, timeLeft, useGame } from '../game.tsx';
import { useTalk } from '../Talk.tsx';
import { WeeklyCard } from '../Weekly.tsx';

/** Вся зона: здания ведут на экраны, по земле валяются бычки, барыга меняет их. */
export function Zone() {
  const { p, now, act, go, openPlace, visit } = useGame();
  const talk = useTalk();
  const baryga = useNpc('sheet/cast/sport');
  const [taken, setTaken] = useState<number[]>([]);
  const [pops, setPops] = useState<{ id: number; x: number; y: number; n: number }[]>([]);
  const field = p.field.filter((b) => !taken.includes(b.id));

  const pickUp = async (b: (typeof p.field)[number]) => {
    setTaken((t) => [...t, b.id]);
    setPops((a) => [...a, { id: b.id, x: b.x * 360, y: b.y * 280, n: b.pack ? BUTTS.packValue : 1 }]);
    setTimeout(() => setPops((a) => a.filter((x) => x.id !== b.id)), 900);
    await act('butt', { id: b.id });
  };

  return (
    <>
      <div className="scene-wrap">
        <ZoneScene
          onPlace={(pl) => {
            if (pl === 'barrack') go('home');
            else if (pl === 'kiosk') go('shop');
            else if (pl === 'work') go('work');
            else if (pl === 'yard') go('fight');
            else if (pl === 'church') openPlace('church');
            else if (pl === 'walk') visit(0);
            else if (pl === 'escape') openPlace('escape');
            else openPlace('medic');
          }}
        >
          <Place x={112} y={262} scale={0.7}>
            <PoseG name="crossed" look={lookOf(p)} />
          </Place>
          {baryga && (
            <g className="npc-click" onClick={() => talk('baryga')}>
              <Place x={196} y={250} scale={0.66}>
                <ImageG url={baryga.url} height={baryga.height} mirror className="char-breathe" />
              </Place>
              <g className="talk-bubble" transform="translate(205 102)">
                <rect x={-14} y={-10} width={28} height={16} rx={8} fill="#f2e6c8" />
                <path d="M-3,6 L0,11 L3,6 Z" fill="#f2e6c8" />
                <text x={0} y={2} fontSize={9} textAnchor="middle">🚬</text>
              </g>
            </g>
          )}
          {field.map((b) => (
            <ButtG key={b.id} x={b.x} y={b.y} pack={b.pack} onPick={() => pickUp(b)} />
          ))}
          {pops.map((pp) => (
            <text key={pp.id} className="butt-pop" x={pp.x} y={pp.y - 6} fontSize={12} textAnchor="middle" fill="#f2c14e">
              +{pp.n} 🚬
            </text>
          ))}
        </ZoneScene>
        <div className="scene-tag">🗺️ Зона · 🚬 {p.butts}</div>
      </div>
      {p.nextButtAt && !field.length && <div className="muted small center">🚬 через {timeLeft(p.nextButtAt - now)}</div>}
      <WeeklyCard />
    </>
  );
}
