import { ModalHead } from './Nav.tsx';
import { useEffect } from 'react';
import { UNLOCKS, unlockById, type Unlock } from '../shared/unlocks.ts';
import { play } from './sound.ts';
import { jumpSeg } from './Seg.tsx';
import { useGame } from './game.tsx';

/** Заглушка закрытого раздела: что это и с какого уровня. */
export function LockedCard({ id }: { id: string }) {
  const { p } = useGame();
  const u = unlockById.get(id);
  if (!u) return null;
  return (
    <div className="locked-card">
      <span className="locked-emoji">{u.emoji}</span>
      <b>
        🔒 {u.name} — с {u.level} уровня
      </b>
      <small className="muted">{u.desc}</small>
      <div className="locked-bar">
        <div style={{ width: `${Math.min(100, (p.level / u.level) * 100)}%` }} />
        <span>
          уровень {p.level} из {u.level}
        </span>
      </div>
    </div>
  );
}

/** Новое, что открылось и ещё не показано. */
export function freshUnlocks(level: number, seen: string[]): Unlock[] {
  return UNLOCKS.filter((u) => u.level <= level && !seen.includes(u.id));
}

/** Окно «Открыто новое»: по одной карточке на раздел, кнопка ведёт туда. */
export function UnlockModal({ list, onClose }: { list: Unlock[]; onClose(): void }) {
  const { act, go } = useGame();
  useEffect(() => play('unlock'), []);
  const done = async (to?: Unlock) => {
    await act('unlocksSeen', { ids: list.map((u) => u.id) });
    onClose();
    if (to) {
      if (to.go.seg) jumpSeg(to.go.seg[0], to.go.seg[1]);
      go(to.go.tab);
    }
  };
  return (
    <div className="modal" onClick={() => done()}>
      <div className="modal-body unlock-body" onClick={(e) => e.stopPropagation()}>
        <ModalHead onClose={() => done()} />
        <h2 className="center">🔓 Открыто новое</h2>
        <div className="unlock-list">
          {list.map((u) => (
            <button key={u.id} className="unlock-item" onClick={() => done(u)}>
              <span>{u.emoji}</span>
              <div className="grow">
                <b>{u.name}</b>
                <small>{u.desc}</small>
              </div>
              <i>▸</i>
            </button>
          ))}
        </div>
        <button className="btn btn-wide" onClick={() => done()}>
          Ясно
        </button>
      </div>
    </div>
  );
}
