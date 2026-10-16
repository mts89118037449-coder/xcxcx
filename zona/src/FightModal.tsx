import { ModalHead } from './Nav.tsx';
import { useCallback, useState } from 'react';
import { haptic } from './feel.ts';
import { play } from './sound.ts';
import { FightArena, type Fighter } from './art/FightArena.tsx';
import type { FightLog } from './game.tsx';

/** Повтор боя: арена, потом итог и награды. */
export function FightModal({ fight, me, onClose }: { fight: FightLog; me: Fighter; onClose(): void }) {
  const [done, setDone] = useState(false);
  const finish = useCallback(() => {
    setDone(true);
    play(fight.replay.win ? 'win' : 'lose');
    haptic(fight.replay.win ? 'success' : 'error');
  }, [fight]);
  return (
    <div className="modal" onClick={() => done && onClose()}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={() => done && onClose()} />
        <FightArena me={me} enemy={fight.enemy} replay={fight.replay} onDone={finish} />
        <div className="muted center">{fight.title}</div>
        {done && (
          <div className="result-in">
            <h2 className={fight.verdict ? 'win' : fight.replay.win ? 'win' : 'lose'}>{fight.verdict ?? (fight.replay.win ? '🏆 Победа' : '💀 Поражение')}</h2>
            {fight.lines.length > 0 && (
              <div className="rewards">
                {fight.lines.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )}
            <button className="btn btn-wide" onClick={onClose}>
              Ясно
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
